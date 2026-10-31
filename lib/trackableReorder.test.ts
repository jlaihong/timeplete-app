import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyTrackableOrderMove,
  sortTrackablesByOrder,
  trackableDropToIndex,
} from "./trackableReorder";

const items = [
  { _id: "a", orderIndex: 0, archived: false, name: "A" },
  { _id: "x", orderIndex: 1, archived: true, name: "X" },
  { _id: "b", orderIndex: 2, archived: false, name: "B" },
  { _id: "c", orderIndex: 3, archived: false, name: "C" },
];

function activeNames(next: typeof items) {
  return sortTrackablesByOrder(next.filter((item) => !item.archived)).map(
    (item) => item.name,
  );
}

describe("applyTrackableOrderMove", () => {
  it("moves an active trackable to the front, shifting the range", () => {
    const next = applyTrackableOrderMove(items, "c", 0);
    assert.deepEqual(activeNames(next), ["C", "A", "B"]);
    assert.equal(next.find((item) => item._id === "c")?.orderIndex, 0);
    assert.equal(next.find((item) => item._id === "x")?.orderIndex, 2);
  });

  it("moves an active trackable down onto a later card", () => {
    const next = applyTrackableOrderMove(items, "a", 2);
    assert.deepEqual(activeNames(next), ["B", "A", "C"]);
  });

  it("leaves the list alone when the index does not change", () => {
    assert.deepEqual(applyTrackableOrderMove(items, "a", 0), items);
    assert.deepEqual(applyTrackableOrderMove(items, "missing", 2), items);
  });
});

describe("trackableDropToIndex", () => {
  it("uses the card under the pointer", () => {
    assert.equal(trackableDropToIndex(items, "c", "a"), 0);
    assert.equal(trackableDropToIndex(items, "a", "b"), 2);
  });

  it("ignores a drop on the same card or the same index", () => {
    assert.equal(trackableDropToIndex(items, "a", "a"), null);
    assert.equal(
      trackableDropToIndex(
        [
          { _id: "a", orderIndex: 0, archived: false },
          { _id: "b", orderIndex: 0, archived: false },
        ],
        "a",
        "b",
      ),
      null,
    );
  });
});
