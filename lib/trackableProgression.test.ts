import { test } from "node:test";
import assert from "node:assert/strict";
import { goalOutcome, progressionBars } from "./trackableProgression";

const h = 3600;
// Mon 9 Nov – Sun 15 Nov 2026.
const week = [
  { dayYYYYMMDD: "20261109", value: 1 * h },
  { dayYYYYMMDD: "20261111", value: 2 * h },
  { dayYYYYMMDD: "20261115", value: 0.5 * h },
];

test("a week or month draws a bar per day; a day draws none", () => {
  const bars = progressionBars("WEEKLY", "20261109", "20261115", week);
  assert.deepEqual(
    bars.map((b) => [b.label, b.value / h]),
    [["9", 1], ["10", 0], ["11", 2], ["12", 0], ["13", 0], ["14", 0], ["15", 0.5]],
  );
  assert.deepEqual(progressionBars("DAILY", "20261115", "20261115", week), []);
});

test("a year draws a bar per month, up to the last one reached", () => {
  const bars = progressionBars("YEARLY", "20260101", "20260310", [
    { dayYYYYMMDD: "20260105", value: 2 },
    { dayYYYYMMDD: "20260120", value: 3 },
    { dayYYYYMMDD: "20260302", value: 4 },
  ]);
  assert.deepEqual(
    bars.map((b) => [b.label, b.value]),
    [["Jan", 5], ["Feb", 0], ["Mar", 4]],
  );
});

test("a goal whose period is the one on screen shows value against target", () => {
  const out = goalOutcome(
    "time",
    { direction: "atLeast", amount: 3, period: "week" },
    "20261109",
    "20261115",
    week,
    "20261115",
  );
  assert.deepEqual(out, { period: "week", of: 1, met: 1, value: 3.5 * h, target: 3 * h });
});

test("a daily limit over a week counts the days that kept to it", () => {
  const out = goalOutcome(
    "time",
    { direction: "atMost", amount: 1, period: "day" },
    "20261109",
    "20261115",
    week,
    "20261113", // Friday: the weekend has not happened yet
  );
  // Mon (1h, at the limit), Tue, Thu, Fri kept to it; Wed (2h) did not.
  assert.equal(out?.of, 5);
  assert.equal(out?.met, 4);
  assert.equal(out?.value, null);
});

test("weekly goal over a month counts weeks that start in it", () => {
  const out = goalOutcome(
    "days",
    { direction: "atLeast", amount: 2, period: "week" },
    "20261101", // a Sunday: the week of 26 Oct is not November's
    "20261130",
    [
      { dayYYYYMMDD: "20261103", value: 1 },
      { dayYYYYMMDD: "20261105", value: 1 },
      { dayYYYYMMDD: "20261110", value: 1 },
    ],
    "20261130",
  );
  // Weeks of 2, 9, 16, 23 and 30 Nov; only the first reached 2 days.
  assert.equal(out?.of, 5);
  assert.equal(out?.met, 1);
});

test("a goal in total has no per-period outcome", () => {
  assert.equal(
    goalOutcome("time", { direction: "atLeast", amount: 50, period: "total" }, "20261101", "20261130", [], "20261115"),
    null,
  );
});
