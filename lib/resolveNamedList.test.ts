import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultCreatedListName,
  resolveNamedList,
} from "./resolveNamedList";

describe("resolveNamedList", () => {
  const lists = [
    { name: "Inbox", archived: false },
    { name: "Grocery", archived: false },
    { name: "Costco", archived: false },
    { name: "Old groceries", archived: true },
  ];

  it("matches grocery aliases to Grocery", () => {
    assert.equal(resolveNamedList(lists, "grocery")?.name, "Grocery");
    assert.equal(resolveNamedList(lists, "grocery list")?.name, "Grocery");
    assert.equal(resolveNamedList(lists, "GROCERIES")?.name, "Grocery");
  });

  it("matches another list by name", () => {
    assert.equal(resolveNamedList(lists, "costco")?.name, "Costco");
  });

  it("skips archived lists", () => {
    const onlyArchived = [{ name: "Grocery", archived: true }];
    assert.equal(resolveNamedList(onlyArchived, "grocery"), undefined);
  });
});

describe("defaultCreatedListName", () => {
  it("uses Grocery for grocery aliases", () => {
    assert.equal(defaultCreatedListName("grocery list"), "Grocery");
  });

  it("keeps a custom spoken name", () => {
    assert.equal(defaultCreatedListName("Costco"), "Costco");
  });
});
