import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  compactDay,
  daySpan,
  normalizeScopes,
  parseCompleteTaskInput,
  parseCreateEventInput,
  parseHHMM,
  parseListEventsInput,
  parseReadReviewsInput,
  parseRescheduleInput,
  parseAddToCalendarInput,
  parseWriteReviewsInput,
  resolveAgentList,
  resolveNamedTask,
  resolveReviewQuestion,
  taskDropDurationSeconds,
  todayInTimeZone,
} from "./agentActions";
import {
  agentKeyEnvironment,
  agentKeyStoreName,
  generateApiKey,
  hashApiKey,
} from "./agentCredentials";

describe("agent API keys", () => {
  it("hashes the same bytes node crypto uses", async () => {
    const expected = createHash("sha256").update("tp_test").digest("hex");
    assert.equal(await hashApiKey("tp_test"), expected);
  });

  it("mints a localhost key separately from a production key", () => {
    assert.equal(agentKeyEnvironment(undefined), "local");
    assert.equal(agentKeyEnvironment("local"), "local");
    assert.equal(agentKeyEnvironment("production"), "production");
    assert.equal(agentKeyStoreName("local"), "timeplete-agent-localhost");
    assert.equal(
      agentKeyStoreName("production"),
      "timeplete-agent-production",
    );

    const local = generateApiKey("local");
    const prod = generateApiKey("production");
    assert.equal(local.apiKey.startsWith("tp_local_"), true);
    assert.equal(prod.apiKey.startsWith("tp_prod_"), true);
    assert.equal(local.keyPrefix, local.apiKey.slice(0, "tp_local_".length + 4));
    assert.equal(prod.keyPrefix, prod.apiKey.slice(0, "tp_prod_".length + 4));
  });
});

describe("agent action parsing", () => {
  it("rejects an empty scope list and unknown actions", () => {
    assert.equal(normalizeScopes([]).ok, false);
    assert.equal(normalizeScopes(["delete_everything"]).ok, false);
    const ok = normalizeScopes(["create_task", "create_task", "list_lists"]);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.deepEqual(ok.value, ["create_task", "list_lists"]);
  });

  it("parses dates and clock times", () => {
    assert.equal(compactDay("2026-11-03"), "20261103");
    assert.equal(compactDay("20261103"), "20261103");
    assert.equal(compactDay("2026-02-31"), null);
    assert.equal(parseHHMM("15:05"), "15:05");
    assert.equal(parseHHMM("3:00pm"), "15:00");
    assert.equal(parseHHMM("12:00am"), "00:00");
    assert.equal(parseHHMM("12:15 AM"), "00:15");
    assert.equal(parseHHMM("25:00"), null);
    assert.equal(daySpan("20261101", "20261103"), 2);
  });

  it("resolves a list by exact name, alias, or a single partial", () => {
    const lists = [
      { name: "Inbox", isInbox: true },
      { name: "Grocery" },
      { name: "Costco" },
      { name: "Old", archived: true },
    ];
    assert.equal(resolveAgentList(lists, "inbox").status, "match");
    assert.equal(resolveAgentList(lists, "groceries").status, "match");
    const cost = resolveAgentList(lists, "cost");
    assert.equal(cost.status, "match");
    if (cost.status === "match") assert.equal(cost.list.name, "Costco");
    assert.equal(resolveAgentList(lists, "o").status, "none");
  });

  it("flags two lists that share a partial name", () => {
    const lists = [{ name: "Work meetings" }, { name: "Home meetings" }];
    const result = resolveAgentList(lists, "meetings");
    assert.equal(result.status, "ambiguous");
  });

  it("caps the event range at 31 days", () => {
    const ok = parseListEventsInput({
      startDay: "2026-11-01",
      endDay: "2026-11-30",
    });
    assert.equal(ok.ok, true);
    const tooLong = parseListEventsInput({
      startDay: "2026-11-01",
      endDay: "2026-12-15",
    });
    assert.equal(tooLong.ok, false);
  });

  it("defaults a new event to 60 minutes in UTC", () => {
    const parsed = parseCreateEventInput({
      title: "Dentist",
      day: "2026-11-04",
      startTime: "3pm",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.startTime, "15:00");
      assert.equal(parsed.value.durationMinutes, 60);
      assert.equal(parsed.value.timeZone, "UTC");
      assert.equal(parsed.value.useTimeZone, false);
    }
  });

  it("requires a way to find an event and a change to make", () => {
    assert.equal(parseRescheduleInput({ title: "Dentist" }).ok, false);
    assert.equal(
      parseRescheduleInput({
        title: "Dentist",
        day: "2026-11-04",
        occurrence: "series",
        newDay: "2026-11-05",
      }).ok,
      false,
    );
    const ok = parseRescheduleInput({
      eventId: "abc",
      newStartTime: "16:30",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.occurrence, "this");
      assert.equal(ok.value.newStartTime, "16:30");
    }
  });

  it("snaps a review date to the period the app stores", () => {
    const daily = parseReadReviewsInput({
      frequency: "daily",
      day: "2026-11-05",
    });
    assert.equal(daily.ok, true);
    if (daily.ok) assert.equal(daily.value.day, "20261105");

    const weekly = parseReadReviewsInput({
      frequency: "WEEKLY",
      day: "20261105",
    });
    assert.equal(weekly.ok, true);
    if (weekly.ok) assert.equal(weekly.value.day, "20261102");

    const monthly = parseReadReviewsInput({
      frequency: "monthly",
      day: "2026-11-05",
    });
    assert.equal(monthly.ok, true);
    if (monthly.ok) assert.equal(monthly.value.day, "20261101");

    const yearly = parseReadReviewsInput({
      frequency: "yearly",
      day: "2026-11-05",
    });
    assert.equal(yearly.ok, true);
    if (yearly.ok) assert.equal(yearly.value.day, "20260101");
    assert.equal(parseReadReviewsInput({ frequency: "hourly", day: "2026-11-05" }).ok, false);
  });

  it("parses review answers and matches one question", () => {
    const parsed = parseWriteReviewsInput({
      frequency: "daily",
      day: "2026-11-05",
      answers: [{ question: "What went well?", answer: "Shipped the API." }],
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.answers[0]?.answer, "Shipped the API.");
    }
    assert.equal(
      parseWriteReviewsInput({
        frequency: "daily",
        day: "2026-11-05",
        answers: [],
      }).ok,
      false,
    );

    const questions = [
      { questionText: "What went well?" },
      { questionText: "What was hard?" },
    ];
    const match = resolveReviewQuestion(questions, "went well");
    assert.equal(match.status, "match");
    if (match.status === "match") {
      assert.equal(match.question.questionText, "What went well?");
    }
    assert.equal(resolveReviewQuestion(questions, "what").status, "ambiguous");
  });

  it("schedules a named task onto the calendar and completes it", () => {
    assert.equal(
      parseAddToCalendarInput({ name: "test", day: "2026-11-10" }).ok,
      false,
    );
    const scheduled = parseAddToCalendarInput({
      name: "test",
      day: "2026-11-10",
      startTime: "3pm",
      endTime: "4:30pm",
    });
    assert.equal(scheduled.ok, true);
    if (scheduled.ok) {
      assert.equal(scheduled.value.day, "20261110");
      assert.equal(scheduled.value.startTime, "15:00");
      assert.equal(scheduled.value.durationMinutes, 90);
    }
    assert.equal(
      parseAddToCalendarInput({
        name: "test",
        day: "2026-11-10",
        startTime: "15:00",
        endTime: "14:00",
      }).ok,
      false,
    );
    assert.equal(taskDropDurationSeconds(undefined), 1800);
    assert.equal(taskDropDurationSeconds(30), 1800);
    assert.equal(taskDropDurationSeconds(90), 300);
    assert.equal(taskDropDurationSeconds(5400), 5400);

    const completed = parseCompleteTaskInput({ name: "test" });
    assert.equal(completed.ok, true);
    if (completed.ok) {
      assert.equal(completed.value.completed, true);
      assert.equal(completed.value.timeZone, "UTC");
    }
    const cleared = parseCompleteTaskInput({
      taskId: "abc",
      completed: false,
      completedOn: "2026-11-10",
    });
    assert.equal(cleared.ok, true);
    if (cleared.ok) assert.equal(cleared.value.completed, false);

    const now = Date.parse("2026-11-11T04:00:00Z");
    assert.equal(todayInTimeZone("UTC", now), "20261111");
    assert.equal(todayInTimeZone("America/Vancouver", now), "20261110");

    const tasks = [{ name: "Test" }, { name: "Test the API" }];
    const match = resolveNamedTask(tasks, "test the");
    assert.equal(match.status, "match");
    assert.equal(resolveNamedTask(tasks, "test").status, "match");
    assert.equal(
      resolveNamedTask(
        [{ name: "Team meeting" }, { name: "Home meeting" }],
        "meeting",
      ).status,
      "ambiguous",
    );
  });
});
