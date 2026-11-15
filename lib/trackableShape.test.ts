import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeGoal,
  formatMeasure,
  goalStatus,
  legacyFieldsFor,
  measureValue,
  periodRange,
  shapeOf,
  weekOf,
} from "./trackableShape";

test("old types read as a measure and a goal", () => {
  assert.deepEqual(
    shapeOf({ trackableType: "MINUTES_A_WEEK", targetNumberOfMinutesAWeek: 180 }),
    { measure: "time", goal: { direction: "atLeast", amount: 3, period: "week" } },
  );
  assert.deepEqual(
    shapeOf({ trackableType: "DAYS_A_WEEK", targetNumberOfDaysAWeek: 4 }),
    { measure: "days", goal: { direction: "atLeast", amount: 4, period: "week" } },
  );
  assert.deepEqual(shapeOf({ trackableType: "NUMBER", targetCount: 100 }), {
    measure: "count",
    goal: { direction: "atLeast", amount: 100, period: "total" },
  });
  assert.deepEqual(shapeOf({ trackableType: "TIME_TRACK" }), {
    measure: "time",
    goal: null,
  });
  assert.deepEqual(shapeOf({ trackableType: "TRACKER", trackCount: false }), {
    measure: "time",
    goal: null,
  });
  // A stored measure wins over the old type.
  assert.deepEqual(
    shapeOf({ trackableType: "TRACKER", measure: "days" }),
    { measure: "days", goal: null },
  );
});

test("a shape that an old type can express round-trips through it", () => {
  for (const shape of [
    { measure: "time", goal: { direction: "atLeast", amount: 3, period: "week" } },
    { measure: "time", goal: { direction: "atLeast", amount: 50, period: "total" } },
    { measure: "days", goal: { direction: "atLeast", amount: 4, period: "week" } },
    { measure: "count", goal: { direction: "atLeast", amount: 20, period: "total" } },
  ] as const) {
    assert.deepEqual(shapeOf(legacyFieldsFor(shape)), shape);
  }
});

test("a shape no old type can express falls back to a plain tracker", () => {
  const legacy = legacyFieldsFor({
    measure: "time",
    goal: { direction: "atMost", amount: 1, period: "day" },
  });
  assert.equal(legacy.trackableType, "TRACKER");
  assert.equal(legacy.trackTime, true);
  assert.equal(legacy.trackCount, false);
});

test("periods", () => {
  // 15 Nov 2026 is a Sunday.
  assert.deepEqual(weekOf("20261115"), { start: "20261109", end: "20261115" });
  assert.deepEqual(weekOf("20261116"), { start: "20261116", end: "20261122" });
  assert.deepEqual(periodRange("month", "20260215", "20250101"), {
    start: "20260201",
    end: "20260228",
  });
  assert.deepEqual(periodRange("total", "20261115", "20261101"), {
    start: "20261101",
    end: "20261115",
  });
  assert.deepEqual(periodRange("day", "20261115", "20261101"), {
    start: "20261115",
    end: "20261115",
  });
});

test("the same days give each measure its own value", () => {
  const days = [
    { seconds: 3600, count: 0, values: [] },
    { seconds: 0, count: 2, values: [7, 9] },
    { seconds: 0, count: 0, values: [] },
  ];
  assert.equal(measureValue("time", days), 3600);
  assert.equal(measureValue("count", days), 2);
  assert.equal(measureValue("days", days), 2);
  assert.equal(measureValue("number", days), 16);
  assert.equal(measureValue("number", days, false), 8);
});

test("goal status and wording", () => {
  const atLeast = { direction: "atLeast", amount: 3, period: "week" } as const;
  assert.equal(goalStatus("time", atLeast, 2 * 3600), "onTrack");
  assert.equal(goalStatus("time", atLeast, 3 * 3600), "met");
  const atMost = { direction: "atMost", amount: 1, period: "day" } as const;
  assert.equal(goalStatus("time", atMost, 3600), "onTrack");
  assert.equal(goalStatus("time", atMost, 3601), "over");
  assert.equal(describeGoal("time", atLeast), "At least 3 hours per week");
  assert.equal(describeGoal("days", { ...atMost, amount: 1 }), "At most 1 day per day");
  assert.equal(formatMeasure("time", 16200), "4.5h");
  assert.equal(formatMeasure("time", 2700), "45m");
  assert.equal(formatMeasure("count", 3), "3");
});
