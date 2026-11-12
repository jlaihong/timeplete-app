import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextOverdueWeeksLoaded,
  overdueCutoffDay,
  splitOverdueByCutoff,
} from "./overdueWindow";
import { addDays, todayYYYYMMDD } from "./dates";

const today = todayYYYYMMDD();
const daysAgo = (n: number) => ({ taskDay: addDays(today, -n) });

test("shows the last 7 days and hides older tasks", () => {
  const cutoff = overdueCutoffDay(today, 1);
  const tasks = [daysAgo(1), daysAgo(7), daysAgo(8), daysAgo(30)];
  const { visible, hiddenCount, newestHiddenDay } = splitOverdueByCutoff(
    tasks,
    cutoff,
  );
  assert.equal(visible.length, 2);
  assert.equal(hiddenCount, 2);
  assert.equal(newestHiddenDay, addDays(today, -8));
});

test("nothing hidden when every task is recent", () => {
  const { hiddenCount, newestHiddenDay } = splitOverdueByCutoff(
    [daysAgo(1), daysAgo(3)],
    overdueCutoffDay(today, 1),
  );
  assert.equal(hiddenCount, 0);
  assert.equal(newestHiddenDay, null);
});

test("load previous week steps back one week", () => {
  assert.equal(nextOverdueWeeksLoaded(today, 1, addDays(today, -8)), 2);
});

test("load previous week skips empty weeks", () => {
  // Newest hidden task is 30 days old: weeks 2-4 are empty, week 5 has it.
  const next = nextOverdueWeeksLoaded(today, 1, addDays(today, -30));
  assert.equal(next, 5);
  const { hiddenCount } = splitOverdueByCutoff(
    [daysAgo(30)],
    overdueCutoffDay(today, next),
  );
  assert.equal(hiddenCount, 0);
});
