import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeIncomingTaskFields } from "./mergeIncomingTaskFields";

describe("mergeIncomingTaskFields", () => {
  it("applies incoming dateCompleted while keeping local drag order", () => {
    const local = [
      {
        id: "produce",
        headerCompletedCount: 0,
        headerTotalCount: 2,
        tasks: [
          { _id: "milk" },
          { _id: "eggs" },
        ],
      },
    ];
    const incoming = [
      {
        id: "produce",
        headerCompletedCount: 1,
        headerTotalCount: 2,
        tasks: [
          { _id: "eggs" },
          { _id: "milk", dateCompleted: "2026-09-21" },
        ],
      },
    ];

    const next = mergeIncomingTaskFields(local, incoming, (inc) => ({
      headerCompletedCount: inc.headerCompletedCount,
      headerTotalCount: inc.headerTotalCount,
    }));

    assert.deepEqual(
      next[0]?.tasks.map((t) => t._id),
      ["milk", "eggs"],
    );
    assert.equal(next[0]?.tasks[0]?.dateCompleted, "2026-09-21");
    assert.equal(next[0]?.headerCompletedCount, 1);
  });

  it("leaves a local row unchanged when incoming omitted it", () => {
    const local = [
      { id: "s", tasks: [{ _id: "keep" }, { _id: "gone" }] },
    ];
    const incoming = [{ id: "s", tasks: [{ _id: "keep", name: "Keep" }] }];

    const next = mergeIncomingTaskFields(local, incoming);
    assert.equal(next[0]?.tasks.length, 2);
    assert.equal(next[0]?.tasks[1]?._id, "gone");
    assert.equal(next[0]?.tasks[0]?.name, "Keep");
  });
});
