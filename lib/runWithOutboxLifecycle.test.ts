import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runWithOutboxLifecycle } from "./runWithOutboxLifecycle";

describe("runWithOutboxLifecycle", () => {
  it("calls mutate before persist finishes so optimistic UI is not blocked", async () => {
    const events: string[] = [];
    let finishPersist!: () => void;
    const persist = () =>
      new Promise<void>((resolve) => {
        events.push("persist-start");
        finishPersist = () => {
          events.push("persist-done");
          resolve();
        };
      });

    const pending = runWithOutboxLifecycle({
      persist,
      mutate: async () => {
        events.push("mutate");
        return "ok";
      },
      clear: async () => {
        events.push("clear");
      },
    });

    await Promise.resolve();
    assert.deepEqual(events, ["persist-start", "mutate"]);

    finishPersist();
    assert.equal(await pending, "ok");
    assert.deepEqual(events, [
      "persist-start",
      "mutate",
      "persist-done",
      "clear",
    ]);
  });

  it("keeps the outbox row when mutate throws", async () => {
    const events: string[] = [];
    await assert.rejects(
      () =>
        runWithOutboxLifecycle({
          persist: async () => {
            events.push("persist");
          },
          mutate: async () => {
            events.push("mutate");
            throw new Error("offline");
          },
          clear: async () => {
            events.push("clear");
          },
        }),
      /offline/,
    );
    assert.deepEqual(events, ["persist", "mutate"]);
  });
});
