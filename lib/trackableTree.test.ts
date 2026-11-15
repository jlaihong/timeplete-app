import { test } from "node:test";
import assert from "node:assert/strict";
import { exceedsMaxDepth, groupTrackablesByTree } from "./trackableTree";

const paths: Record<string, string[]> = {
  social: [],
  family: ["social"],
  friends: ["social"],
  work: [],
  amazon: ["work"],
  msa: ["work", "amazon"],
};
const node = (id: string, orderIndex: number) => ({ _id: id, orderIndex });
const shape = (groups: ReturnType<typeof groupTrackablesByTree<ReturnType<typeof node>>>) =>
  groups.map((g) => [
    g.root._id,
    g.descendants.map((d) => `${"  ".repeat(d.depth)}${d.item._id}`),
  ]);

test("one group per top-level trackable, children in tree order", () => {
  const groups = groupTrackablesByTree(
    [
      node("social", 0),
      node("friends", 2),
      node("family", 1),
      node("work", 3),
      node("msa", 5),
      node("amazon", 4),
    ],
    (id) => paths[id],
  );
  assert.deepEqual(shape(groups), [
    ["social", ["family", "friends"]],
    ["work", ["amazon", "  msa"]],
  ]);
});

test("a sub-trackable whose parents are not shown leads its own group", () => {
  const groups = groupTrackablesByTree(
    [node("family", 1), node("msa", 5), node("work", 3)],
    (id) => paths[id],
  );
  // Amazon is not in the list, so MSA hangs off Work directly.
  assert.deepEqual(shape(groups), [
    ["family", []],
    ["work", ["msa"]],
  ]);
});

test("the tree is three levels deep at most", () => {
  // Under a top-level trackable: fine, also with one level below.
  assert.equal(exceedsMaxDepth(0, 0), false);
  assert.equal(exceedsMaxDepth(0, 1), false);
  // Under a second-level one: fine only without sub-trackables.
  assert.equal(exceedsMaxDepth(1, 0), false);
  assert.equal(exceedsMaxDepth(1, 1), true);
  // Under a third-level one: never.
  assert.equal(exceedsMaxDepth(2, 0), true);
  // A two-level subtree cannot go under anything.
  assert.equal(exceedsMaxDepth(0, 2), true);
});
