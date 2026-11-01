/**
 * Deleting one day of a recurring calendar event must keep that day out of
 * the next generation. "Talk to mew" is weekly on every weekday, so a bare
 * window delete otherwise recreates the same tile.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deletedOccurrenceForRecurringInstance } from "./deletedRecurringEventOccurrence";
import { generateOccurrences } from "./recurrence";

const TALK_TO_MEW = {
  frequency: "WEEKLY" as const,
  interval: 1,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startDateYYYYMMDD: "20260323",
};

describe("deleted recurring calendar occurrence", () => {
  it("records a skip for a recurring instance and leaves one-off events alone", () => {
    assert.deepEqual(
      deletedOccurrenceForRecurringInstance({
        isRecurringInstance: true,
        recurringEventId: "rule-talk-to-mew",
        startDayYYYYMMDD: "20261101",
      }),
      {
        recurringEventId: "rule-talk-to-mew",
        deletedDateYYYYMMDD: "20261101",
      },
    );
    assert.equal(
      deletedOccurrenceForRecurringInstance({
        isRecurringInstance: false,
        recurringEventId: "rule-talk-to-mew",
        startDayYYYYMMDD: "20261101",
      }),
      null,
    );
    assert.equal(
      deletedOccurrenceForRecurringInstance({
        isRecurringInstance: true,
        startDayYYYYMMDD: "20261101",
      }),
      null,
    );
  });

  it("does not regenerate a day that was deleted from the series", () => {
    const skip = deletedOccurrenceForRecurringInstance({
      isRecurringInstance: true,
      recurringEventId: "rule-talk-to-mew",
      startDayYYYYMMDD: "20261101",
    });
    assert.ok(skip);

    const withoutSkip = generateOccurrences(
      TALK_TO_MEW,
      "20261101",
      "20261101",
      new Set(),
    );
    const withSkip = generateOccurrences(
      TALK_TO_MEW,
      "20261101",
      "20261101",
      new Set([skip.deletedDateYYYYMMDD]),
    );

    assert.deepEqual(withoutSkip, ["20261101"]);
    assert.deepEqual(withSkip, []);
  });
});
