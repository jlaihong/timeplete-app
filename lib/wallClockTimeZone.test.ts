/**
 * B.C. stayed on Pacific time (UTC-7) after 2026-11-01. A runtime whose
 * tzdata still falls back would save a paused timer an hour early.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  wallClockGridToEpochMs,
  wallClockInTimeZone,
} from "./wallClockTimeZone";

describe("B.C. permanent Pacific time", () => {
  it("keeps Vancouver on UTC-7 after the cancelled November fallback", () => {
    assert.deepEqual(
      wallClockInTimeZone(Date.UTC(2026, 10, 1, 21, 5, 0), "America/Vancouver"),
      { startDayYYYYMMDD: "20261101", startTimeHHMM: "14:05" },
    );
  });

  it("does not shift the hour before the fallback, or last winter, or summer", () => {
    assert.deepEqual(
      wallClockInTimeZone(Date.UTC(2026, 10, 1, 8, 30, 0), "America/Vancouver"),
      { startDayYYYYMMDD: "20261101", startTimeHHMM: "01:30" },
    );
    assert.deepEqual(
      wallClockInTimeZone(Date.UTC(2026, 9, 31, 19, 0, 0), "America/Vancouver"),
      { startDayYYYYMMDD: "20261031", startTimeHHMM: "12:00" },
    );
    assert.deepEqual(
      wallClockInTimeZone(Date.UTC(2026, 0, 15, 20, 0, 0), "America/Vancouver"),
      { startDayYYYYMMDD: "20260115", startTimeHHMM: "12:00" },
    );
    assert.deepEqual(
      wallClockInTimeZone(Date.UTC(2026, 5, 15, 19, 0, 0), "America/Vancouver"),
      { startDayYYYYMMDD: "20260615", startTimeHHMM: "12:00" },
    );
  });

  it("still falls back in Los Angeles", () => {
    assert.deepEqual(
      wallClockInTimeZone(Date.UTC(2026, 10, 1, 21, 5, 0), "America/Los_Angeles"),
      { startDayYYYYMMDD: "20261101", startTimeHHMM: "13:05" },
    );
  });

  it("round-trips a Vancouver afternoon on the old fallback day to the UTC-7 instant", () => {
    const epoch = wallClockGridToEpochMs("20261101", 14 * 60 + 5, "America/Vancouver");
    assert.equal(epoch, Date.UTC(2026, 10, 1, 21, 5, 0));
    assert.deepEqual(wallClockInTimeZone(epoch, "America/Vancouver"), {
      startDayYYYYMMDD: "20261101",
      startTimeHHMM: "14:05",
    });
  });

  it("does not invent a repeated 1:30am", () => {
    const epoch = wallClockGridToEpochMs("20261101", 1 * 60 + 30, "America/Vancouver");
    assert.equal(epoch, Date.UTC(2026, 10, 1, 8, 30, 0));
  });
});
