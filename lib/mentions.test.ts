import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTextChange,
  findMentionQuery,
  flattenMentions,
  insertMention,
  matchPages,
  mentionedPageIds,
  mentionSegments,
  parseMentions,
  refreshMentionNames,
  serializeMentions,
} from "./mentions";

const STORED = "Dinner with @[Wesley](page:abc123) and @[Ana](page:def456).";

test("parse shows names and remembers where the links are", () => {
  const doc = parseMentions(STORED);
  assert.equal(doc.text, "Dinner with @Wesley and @Ana.");
  assert.deepEqual(doc.mentions, [
    { start: 12, end: 19, pageId: "abc123" },
    { start: 24, end: 28, pageId: "def456" },
  ]);
});

test("parse then serialize gives back the stored text", () => {
  assert.equal(serializeMentions(parseMentions(STORED)), STORED);
});

test("a renamed page shows its current name, and saving writes it", () => {
  const doc = parseMentions(STORED, (id) =>
    id === "abc123" ? "Wesley K" : undefined,
  );
  assert.equal(doc.text, "Dinner with @Wesley K and @Ana.");
  assert.equal(
    serializeMentions(doc),
    "Dinner with @[Wesley K](page:abc123) and @[Ana](page:def456).",
  );
});

test("a deleted page leaves plain words", () => {
  const doc = parseMentions(STORED, (id) => (id === "abc123" ? null : undefined));
  assert.equal(doc.text, "Dinner with Wesley and @Ana.");
  assert.equal(doc.mentions.length, 1);
});

test("typing before a mention moves it; typing after leaves it", () => {
  const doc = parseMentions(STORED);
  const before = applyTextChange(doc, "Long dinner with @Wesley and @Ana.");
  assert.deepEqual(before.mentions[0], { start: 17, end: 24, pageId: "abc123" });
  const after = applyTextChange(doc, "Dinner with @Wesley and @Ana. Fun!");
  assert.deepEqual(after.mentions, doc.mentions);
});

test("typing straight after a mention does not extend it", () => {
  const doc = parseMentions("@[Wesley](page:abc123)");
  const next = applyTextChange(doc, "@Wesley's");
  assert.deepEqual(next.mentions, [{ start: 0, end: 7, pageId: "abc123" }]);
  assert.equal(serializeMentions(next), "@[Wesley](page:abc123)'s");
});

test("editing inside a mention turns it back into plain text", () => {
  const doc = parseMentions(STORED);
  const next = applyTextChange(doc, "Dinner with @Wesle and @Ana.");
  assert.deepEqual(
    next.mentions.map((m) => m.pageId),
    ["def456"],
  );
  assert.equal(
    serializeMentions(next),
    "Dinner with @Wesle and @[Ana](page:def456).",
  );
});

test("@ starts a mention at the start of a word", () => {
  assert.deepEqual(findMentionQuery("@wes", 4), { start: 0, query: "wes" });
  assert.deepEqual(findMentionQuery("Saw @", 5), { start: 4, query: "" });
  assert.deepEqual(findMentionQuery("(@we", 4), { start: 1, query: "we" });
  assert.deepEqual(findMentionQuery("a\n@we", 5), { start: 2, query: "we" });
});

test("an email address never starts a mention", () => {
  assert.equal(findMentionQuery("jeremy@gmail", 12), null);
  assert.equal(findMentionQuery("mail jeremy@gmail.com", 21), null);
  // …but a real mention after an email still works.
  assert.deepEqual(findMentionQuery("a@b.com @we", 11), {
    start: 8,
    query: "we",
  });
});

test("a mention query ends at a new line, a double space or a fourth word", () => {
  assert.equal(findMentionQuery("@wes\nmore", 9), null);
  assert.equal(findMentionQuery("@wes  ", 6), null);
  assert.deepEqual(findMentionQuery("@wesley k", 9), {
    start: 0,
    query: "wesley k",
  });
  assert.equal(findMentionQuery("@a b c d", 8), null);
});

test("the caret inside an existing mention does not reopen the picker", () => {
  const doc = parseMentions("@[Wesley](page:abc123)");
  assert.equal(findMentionQuery(doc.text, 4, doc.mentions), null);
});

test("choosing a page replaces what was typed and adds a space", () => {
  const doc = parseMentions("Lunch with @we and @[Ana](page:def456)");
  const { doc: next, caret } = insertMention(doc, 11, 14, {
    id: "abc123",
    name: "Wesley",
  });
  assert.equal(next.text, "Lunch with @Wesley and @Ana");
  assert.equal(caret, 19);
  assert.equal(
    serializeMentions(next),
    "Lunch with @[Wesley](page:abc123) and @[Ana](page:def456)",
  );
  const atEnd = insertMention({ text: "@we", mentions: [] }, 0, 3, {
    id: "abc123",
    name: "Wesley",
  });
  assert.equal(atEnd.doc.text, "@Wesley ");
  assert.equal(atEnd.caret, 8);
});

test("segments split text and links in order", () => {
  assert.deepEqual(mentionSegments(parseMentions("Hi @[Ana](page:def456)!")), [
    { text: "Hi " },
    { text: "@Ana", pageId: "def456" },
    { text: "!" },
  ]);
});

test("matching prefers names that start with the query", () => {
  const pages = [{ name: "Mark Wesley" }, { name: "Wesley" }, { name: "Jewes" }];
  assert.deepEqual(
    matchPages(pages, "wes").map((p) => p.name),
    ["Wesley", "Mark Wesley", "Jewes"],
  );
});

test("stored-text helpers", () => {
  assert.deepEqual(mentionedPageIds(`${STORED} @[Wesley](page:abc123)`), [
    "abc123",
    "def456",
  ]);
  assert.equal(
    refreshMentionNames(STORED, (id) =>
      id === "abc123" ? "Wesley K" : undefined,
    ),
    "Dinner with @[Wesley K](page:abc123) and @[Ana](page:def456).",
  );
  assert.equal(
    flattenMentions(STORED, "abc123", "Wesley K"),
    "Dinner with Wesley K and @[Ana](page:def456).",
  );
});
