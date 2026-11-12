import { test } from "node:test";
import assert from "node:assert/strict";
import type { Id } from "../convex/_generated/dataModel";
import {
  initialAssignmentStateFromAddTaskContext,
  normalizeTrackableOverride,
  resolveEffectiveListIdForTaskCreate,
} from "./addTaskDefaults";

const list = (s: string) => s as Id<"lists">;
const trackable = (s: string) => s as Id<"trackables">;

test("a new task always lands in a list, Inbox by default", () => {
  assert.equal(
    resolveEffectiveListIdForTaskCreate({
      lockListToContext: false,
      contextualListId: undefined,
      explicitListId: null,
      inboxListId: list("inbox"),
    }),
    "inbox",
  );
});

test("the picked list wins over Inbox, the pinned list over both", () => {
  assert.equal(
    resolveEffectiveListIdForTaskCreate({
      lockListToContext: false,
      contextualListId: undefined,
      explicitListId: list("work"),
      inboxListId: list("inbox"),
    }),
    "work",
  );
  assert.equal(
    resolveEffectiveListIdForTaskCreate({
      lockListToContext: true,
      contextualListId: list("groceries"),
      explicitListId: list("work"),
      inboxListId: list("inbox"),
    }),
    "groceries",
  );
});

test("a trackable matching the list's link is inherited, not stored", () => {
  assert.equal(
    normalizeTrackableOverride(trackable("fitness"), trackable("fitness")),
    null,
  );
  assert.equal(
    normalizeTrackableOverride(trackable("reading"), trackable("fitness")),
    "reading",
  );
});

test("opening from a linked list starts with no override", () => {
  assert.deepEqual(
    initialAssignmentStateFromAddTaskContext({
      contextualListId: list("gym"),
      defaultTrackableId: trackable("fitness"),
      contextualListTrackableId: trackable("fitness"),
    }),
    { listId: "gym", trackableId: null },
  );
});

test("opening from a trackable pre-selects it", () => {
  assert.deepEqual(
    initialAssignmentStateFromAddTaskContext({
      contextualListId: undefined,
      defaultTrackableId: trackable("fitness"),
    }),
    { listId: null, trackableId: "fitness" },
  );
});
