import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pageAncestors,
  pageChildren,
  pageDescendantIds,
  pageParentOptions,
  pageTreeRows,
  placePage,
  projectPageDrop,
} from "./pageTree";

const PAGES = [
  { _id: "wes", name: "Wesley", parentId: "fam" },
  { _id: "fam", name: "Family" },
  { _id: "ana", name: "Ana", parentId: "fam" },
  { _id: "toy", name: "Toys", parentId: "wes" },
  { _id: "work", name: "Work" },
  { _id: "lost", name: "Lost", parentId: "deleted" },
];

const names = (rows: { page: { name: string }; depth: number }[]) =>
  rows.map((r) => `${"  ".repeat(r.depth)}${r.page.name}`);

test("rows list parents before children, siblings by name", () => {
  assert.deepEqual(names(pageTreeRows(PAGES)), [
    "Family",
    "  Ana",
    "  Wesley",
    "    Toys",
    "Lost",
    "Work",
  ]);
});

test("pages with no parent field are all top level", () => {
  const flat = [
    { _id: "b", name: "B" },
    { _id: "a", name: "A" },
  ];
  assert.deepEqual(names(pageTreeRows(flat)), ["A", "B"]);
});

test("a collapsed page hides what is under it", () => {
  const rows = pageTreeRows(PAGES, new Set(["fam"]));
  assert.deepEqual(names(rows), ["Family", "Lost", "Work"]);
  assert.equal(rows[0].hasChildren, true);
});

test("a loop of parents still shows its pages", () => {
  const loop = [
    { _id: "a", name: "A", parentId: "b" },
    { _id: "b", name: "B", parentId: "a" },
  ];
  assert.deepEqual(names(pageTreeRows(loop)), ["A", "B"]);
});

test("ancestors run from the top down", () => {
  const byId = new Map(PAGES.map((p) => [p._id, p]));
  assert.deepEqual(
    pageAncestors(byId, "toy").map((p) => p.name),
    ["Family", "Wesley"],
  );
  assert.deepEqual(pageAncestors(byId, "fam"), []);
  assert.deepEqual(pageAncestors(byId, "lost"), []);
});

test("children and descendants", () => {
  assert.deepEqual(
    pageChildren(PAGES, "fam").map((p) => p.name),
    ["Ana", "Wesley"],
  );
  assert.deepEqual(
    [...pageDescendantIds(PAGES, "fam")].sort(),
    ["ana", "toy", "wes"],
  );
  assert.deepEqual([...pageDescendantIds(PAGES, "work")], []);
});

test("a page can go under anything that keeps the tree five levels deep", () => {
  const pages = [
    { _id: "l1", name: "L1" },
    { _id: "l2", name: "L2", parentId: "l1" },
    { _id: "l3", name: "L3", parentId: "l2" },
    { _id: "l4", name: "L4", parentId: "l3" },
    { _id: "l5", name: "L5", parentId: "l4" },
    { _id: "solo", name: "Solo" },
    { _id: "pair", name: "Pair" },
    { _id: "kid", name: "Kid", parentId: "pair" },
  ];
  // Nothing under it: anywhere but under the fifth level.
  assert.deepEqual(
    [...pageParentOptions(pages, "solo")].sort(),
    ["kid", "l1", "l2", "l3", "l4", "pair"],
  );
  // Carrying one level: its parent can be at the third level at most.
  assert.deepEqual(
    [...pageParentOptions(pages, "pair")].sort(),
    ["l1", "l2", "l3", "solo"],
  );
  // Already five levels: it fits nowhere.
  assert.deepEqual([...pageParentOptions(pages, "l1")], []);
  // Not under itself or anything below it; the pages above it are fine.
  assert.deepEqual(
    [...pageParentOptions(pages, "l3")].sort(),
    ["kid", "l1", "l2", "pair", "solo"],
  );
});

test("pages arranged by hand come first, the rest follow by name", () => {
  const pages = [
    { _id: "a", name: "Apple" },
    { _id: "z", name: "Zebra", orderIndex: 0 },
    { _id: "m", name: "Mango", orderIndex: 1 },
    { _id: "b", name: "Banana" },
  ];
  assert.deepEqual(names(pageTreeRows(pages)), [
    "Zebra",
    "Mango",
    "Apple",
    "Banana",
  ]);
});

test("placing a page numbers it and its siblings", () => {
  const siblings = [
    { _id: "a", name: "Apple" },
    { _id: "b", name: "Banana" },
    { _id: "c", name: "Cherry" },
  ];
  const order = (where: { beforeId?: string; afterId?: string }) =>
    placePage(siblings, "c", where).map((p) => p._id);
  assert.deepEqual(order({ beforeId: "a" }), ["c", "a", "b"]);
  assert.deepEqual(order({ afterId: "a" }), ["a", "c", "b"]);
  assert.deepEqual(order({}), ["a", "b", "c"]);
  assert.deepEqual(
    placePage(siblings, "x", { beforeId: "b" }),
    [
      { _id: "a", orderIndex: 0 },
      { _id: "x", orderIndex: 1 },
      { _id: "b", orderIndex: 2 },
      { _id: "c", orderIndex: 3 },
    ],
  );
});

// Family            (fam)
//   Ana             (ana)
//   Wesley          (wes)
// Work              (work)
const DRAG_ROWS = [
  { id: "fam", depth: 0, parentId: null },
  { id: "ana", depth: 1, parentId: "fam" },
  { id: "wes", depth: 1, parentId: "fam" },
  { id: "work", depth: 0, parentId: null },
];

test("dragging up or down rearranges at the level the spot has", () => {
  // Wesley above Ana, still under Family.
  assert.deepEqual(projectPageDrop(DRAG_ROWS, "wes", "ana", 0, 0), {
    depth: 1,
    parentId: "fam",
    place: { beforeId: "ana" },
  });
  // Work between Ana and Wesley has to join Family: Wesley follows it.
  assert.deepEqual(projectPageDrop(DRAG_ROWS, "work", "wes", 0, 0), {
    depth: 1,
    parentId: "fam",
    place: { afterId: "ana" },
  });
});

test("dragging right nests under the row above, left takes it out", () => {
  // Work, in place, pulled right: under Family, after Wesley.
  assert.deepEqual(projectPageDrop(DRAG_ROWS, "work", "work", 1, 0), {
    depth: 1,
    parentId: "fam",
    place: { afterId: "wes" },
  });
  // Pulled two levels right: under Wesley, its only page.
  assert.deepEqual(projectPageDrop(DRAG_ROWS, "work", "work", 2, 0), {
    depth: 2,
    parentId: "wes",
    place: {},
  });
  // Wesley, last under Family, pulled left: top level, after Family.
  assert.deepEqual(projectPageDrop(DRAG_ROWS, "wes", "wes", -1, 0), {
    depth: 0,
    parentId: null,
    place: { afterId: "fam" },
  });
  // Ana cannot leave in place: Wesley below it is still under Family.
  assert.equal(projectPageDrop(DRAG_ROWS, "ana", "ana", -1, 0)?.depth, 1);
});

test("a page with pages under it stops where the tree would get too deep", () => {
  // Work carrying four levels can only sit at the top level.
  assert.equal(projectPageDrop(DRAG_ROWS, "work", "work", 2, 4)?.depth, 0);
  // Carrying three, it can go one level in and no further.
  assert.equal(projectPageDrop(DRAG_ROWS, "work", "work", 2, 3)?.depth, 1);
  // Between Ana and Wesley it would have to be one level in: not allowed.
  assert.equal(projectPageDrop(DRAG_ROWS, "work", "wes", 0, 4), null);
});
