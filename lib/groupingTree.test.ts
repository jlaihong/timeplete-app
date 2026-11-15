import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTimeWindows, type GroupingLookups } from "./grouping";

const lookups: GroupingLookups = {
  trackables: {
    social: { name: "Social", colour: "#1" },
    family: { name: "Family", colour: "#2", ancestorIds: ["social"] },
    friends: { name: "Friends", colour: "#3", ancestorIds: ["social"] },
    work: { name: "Work", colour: "#4" },
    amazon: { name: "Amazon", colour: "#5", ancestorIds: ["work"] },
    msa: { name: "MSA project", colour: "#6", ancestorIds: ["work", "amazon"] },
  },
};
const hour = 3600;
const w = (id: string, hours: number, stamp: string[] | null) => ({
  _id: id,
  startDayYYYYMMDD: "20261115",
  durationSeconds: hours * hour,
  activityType: "EVENT",
  attributedTrackableIds: stamp,
});
const windows = [
  w("christmas", 3, ["family", "friends", "social"]),
  w("lunch", 1, ["family", "social"]),
  w("coffee", 0.5, ["friends", "social"]),
  w("party", 2, ["social"]),
  w("design", 1, ["msa", "amazon", "work"]),
  w("offsite", 4, ["friends", "work", "social"]),
  w("nap", 1, []),
];
const hoursBy = (mode: "trackable" | "trackable_2" | "trackable_3") =>
  Object.fromEntries(
    groupTimeWindows(windows, mode, lookups).map((g) => [
      g.label,
      g.totalSeconds / hour,
    ]),
  );
const total = (o: Record<string, number>) =>
  Object.values(o).reduce((s, n) => s + n, 0);

test("top level: one slice per top-level trackable, shared time on its own", () => {
  const top = hoursBy("trackable");
  assert.deepEqual(top, {
    Social: 6.5,
    "Social + Work": 4,
    Work: 1,
    "No trackable": 1,
  });
  // Every hour is in exactly one slice.
  assert.equal(total(top), 12.5);
});

test("second level: shared, single and direct slices add up to the same total", () => {
  const second = hoursBy("trackable_2");
  assert.deepEqual(second, {
    "Family + Friends": 3,
    Family: 1,
    Friends: 0.5,
    "Social directly": 2,
    Amazon: 1,
    "Friends + Work directly": 4,
    "No trackable": 1,
  });
  assert.equal(total(second), 12.5);
});

test("third level", () => {
  const third = hoursBy("trackable_3");
  assert.equal(third["MSA project"], 1);
  assert.equal(third["Family + Friends directly"], 3);
  assert.equal(total(third), 12.5);
});

test("a window saved before stamps existed uses its single trackable", () => {
  const legacy = groupTimeWindows(
    [{ ...w("old", 2, null), trackableId: "family" }],
    "trackable",
    lookups,
  );
  assert.deepEqual(
    legacy.map((g) => [g.label, g.totalSeconds / hour]),
    [["Social", 2]],
  );
});
