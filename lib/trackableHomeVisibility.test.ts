import { test } from "node:test";
import assert from "node:assert/strict";
import {
  homeHiddenReason,
  splitTrackablesForHome,
} from "./trackableHomeVisibility";
import { addDays, todayYYYYMMDD } from "./dates";

const today = todayYYYYMMDD();
const goal = (endOffset: number, showOnHome?: boolean) => ({
  trackableType: "NUMBER",
  endDayYYYYMMDD: addDays(today, endOffset),
  showOnHome,
});

test("running goals and legacy rows are shown", () => {
  assert.equal(homeHiddenReason(goal(30), today), null);
});

test("unpinned trackables are hidden", () => {
  assert.equal(homeHiddenReason(goal(30, false), today), "unpinned");
});

test("a goal that just ended stays through the grace period", () => {
  assert.equal(homeHiddenReason(goal(-3), today), null);
  assert.equal(homeHiddenReason(goal(-8), today), "ended");
});

test("an explicit pin keeps an ended goal on home", () => {
  assert.equal(homeHiddenReason(goal(-60, true), today), null);
});

test("trackers never expire", () => {
  assert.equal(
    homeHiddenReason(
      { trackableType: "TRACKER", endDayYYYYMMDD: addDays(today, -400) },
      today,
    ),
    null,
  );
});

test("split reports how many were left off", () => {
  const { shown, hiddenCount } = splitTrackablesForHome(
    [goal(10), goal(-30), goal(5, false)],
    today,
  );
  assert.equal(shown.length, 1);
  assert.equal(hiddenCount, 2);
});
