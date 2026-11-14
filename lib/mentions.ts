/**
 * Mentions: links from any text to a page ("had dinner with @Wesley").
 *
 * Stored text stays a plain string. A mention is a token inside it:
 *
 *     @[Wesley](page:k17abc…)
 *
 * The page id is what the link means. The name inside the token is a copy,
 * kept so the raw text still reads properly (API, exports, search, a
 * deleted page). It can lag after a rename, so readers resolve the current
 * name from the page whenever they have it, and a background job rewrites
 * the copies (see `convex/pages.ts`).
 *
 * While editing, the token is shown as "@Wesley" and its position is
 * tracked beside the text (`MentionDoc`); it is turned back into a token
 * when the text is handed to the caller.
 *
 * Pure functions only: this file is shared by the app and the backend.
 */

const TOKEN_SOURCE = "@\\[([^\\]\\n]*)\\]\\(page:([A-Za-z0-9_-]+)\\)";
const tokenRegex = () => new RegExp(TOKEN_SOURCE, "g");

export interface MentionRange {
  /** Index of the "@" in the display text. */
  start: number;
  /** One past the last character of the name. */
  end: number;
  pageId: string;
}

/** Text as it is shown and edited, with where its mentions sit. */
export interface MentionDoc {
  text: string;
  mentions: MentionRange[];
}

/**
 * Looks up a page's current name. `undefined`: not known (pages still
 * loading), so the stored copy is used and the link kept. `null`: the page
 * no longer exists, so the mention is shown as plain text.
 */
export type PageNameLookup = (pageId: string) => string | null | undefined;

/** A page name that is safe inside a token: one line, no square brackets. */
export function sanitizePageName(name: string): string {
  return name
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mentionToken(name: string, pageId: string): string {
  return `@[${sanitizePageName(name)}](page:${pageId})`;
}

/** Stored text → what is shown, using current page names where known. */
export function parseMentions(
  stored: string,
  nameFor?: PageNameLookup,
): MentionDoc {
  const mentions: MentionRange[] = [];
  let text = "";
  let last = 0;
  for (const m of stored.matchAll(tokenRegex())) {
    const index = m.index ?? 0;
    text += stored.slice(last, index);
    last = index + m[0].length;
    const pageId = m[2];
    const current = nameFor?.(pageId);
    if (current === null) {
      // Deleted page: keep the words, drop the link.
      text += m[1];
      continue;
    }
    const start = text.length;
    text += `@${current ?? m[1]}`;
    mentions.push({ start, end: text.length, pageId });
  }
  text += stored.slice(last);
  return { text, mentions };
}

/** What is shown → stored text. The name written is the one on screen. */
export function serializeMentions(doc: MentionDoc): string {
  let out = "";
  let last = 0;
  for (const m of [...doc.mentions].sort((a, b) => a.start - b.start)) {
    out += doc.text.slice(last, m.start);
    out += mentionToken(doc.text.slice(m.start + 1, m.end), m.pageId);
    last = m.end;
  }
  return out + doc.text.slice(last);
}

/** The pieces of a text in order, for drawing mentions as links. */
export function mentionSegments(
  doc: MentionDoc,
): { text: string; pageId?: string }[] {
  const out: { text: string; pageId?: string }[] = [];
  let last = 0;
  for (const m of [...doc.mentions].sort((a, b) => a.start - b.start)) {
    if (m.start > last) out.push({ text: doc.text.slice(last, m.start) });
    out.push({ text: doc.text.slice(m.start, m.end), pageId: m.pageId });
    last = m.end;
  }
  if (last < doc.text.length) out.push({ text: doc.text.slice(last) });
  return out;
}

/**
 * The text was edited to `nextText`. Mentions before the edit stay, those
 * after it move with the text, and one the edit cut into stops being a
 * link (its remaining letters stay as ordinary text).
 */
export function applyTextChange(doc: MentionDoc, nextText: string): MentionDoc {
  const prev = doc.text;
  if (prev === nextText) return doc;
  const max = Math.min(prev.length, nextText.length);
  let prefix = 0;
  while (prefix < max && prev[prefix] === nextText[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    prev[prev.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
  ) {
    suffix++;
  }
  const changedEnd = prev.length - suffix;
  const delta = nextText.length - prev.length;
  const mentions: MentionRange[] = [];
  for (const m of doc.mentions) {
    if (m.end <= prefix) mentions.push(m);
    else if (m.start >= changedEnd) {
      mentions.push({ ...m, start: m.start + delta, end: m.end + delta });
    }
  }
  return { text: nextText, mentions };
}

/** Characters an "@" may follow and still start a mention. */
const BEFORE_TRIGGER = /[\s([{"'“‘>—–-]/;
const MAX_QUERY_LENGTH = 40;
const MAX_QUERY_WORDS = 3;

/**
 * Is the caret inside an "@name" being typed? Returns where the "@" is and
 * what follows it, or `null`.
 *
 * The "@" only counts at the start of a word, so an email address
 * ("jeremy@gmail.com") never triggers: there the "@" follows a letter.
 */
export function findMentionQuery(
  text: string,
  caret: number,
  mentions: readonly MentionRange[] = [],
): { start: number; query: string } | null {
  const floor = Math.max(0, caret - MAX_QUERY_LENGTH - 1);
  for (let i = caret - 1; i >= floor; i--) {
    const ch = text[i];
    if (ch === "\n") return null;
    if (ch !== "@") continue;
    // Only the nearest "@" is considered.
    if (i > 0 && !BEFORE_TRIGGER.test(text[i - 1])) return null;
    if (mentions.some((m) => i >= m.start && i < m.end)) return null;
    const query = text.slice(i + 1, caret);
    if (query.startsWith(" ") || query.includes("  ")) return null;
    if (query.split(" ").length > MAX_QUERY_WORDS) return null;
    return { start: i, query };
  }
  return null;
}

/**
 * Replace the "@query" being typed (from `start` to `caret`) with a link
 * to `page`. Returns the new text and where the caret goes.
 */
export function insertMention(
  doc: MentionDoc,
  start: number,
  caret: number,
  page: { id: string; name: string },
): { doc: MentionDoc; caret: number } {
  const label = `@${sanitizePageName(page.name)}`;
  const after = doc.text.slice(caret);
  const spacer = /^\s/.test(after) ? "" : " ";
  const text = doc.text.slice(0, start) + label + spacer + after;
  const moved = applyTextChange(doc, text).mentions;
  const end = start + label.length;
  return {
    doc: { text, mentions: [...moved, { start, end, pageId: page.id }] },
    caret: end + 1,
  };
}

/** Pages whose name matches what was typed after "@", best first. */
export function matchPages<T extends { name: string }>(
  pages: readonly T[],
  query: string,
  limit = 6,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages.slice(0, limit);
  const starts: T[] = [];
  const wordStarts: T[] = [];
  const contains: T[] = [];
  for (const p of pages) {
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) starts.push(p);
    else if (name.split(" ").some((w) => w.startsWith(q))) wordStarts.push(p);
    else if (name.includes(q)) contains.push(p);
  }
  return [...starts, ...wordStarts, ...contains].slice(0, limit);
}

/* ── Working on stored text (used by the backend) ─────────────────────── */

/** Ids of every page a stored text links to, without repeats. */
export function mentionedPageIds(stored: string): string[] {
  const ids = new Set<string>();
  for (const m of stored.matchAll(tokenRegex())) ids.add(m[2]);
  return [...ids];
}

/** Rewrite the name copied into each token, where `nameFor` knows better. */
export function refreshMentionNames(
  stored: string,
  nameFor: (pageId: string) => string | undefined,
): string {
  return stored.replace(tokenRegex(), (token, _name: string, pageId: string) => {
    const name = nameFor(pageId);
    return name === undefined ? token : mentionToken(name, pageId);
  });
}

/** Turn every link to `pageId` back into plain words (its page is gone). */
export function flattenMentions(
  stored: string,
  pageId: string,
  name?: string,
): string {
  return stored.replace(tokenRegex(), (token, copy: string, id: string) =>
    id === pageId ? (name ?? copy) : token,
  );
}

/** Stored text as plain words, e.g. for a notification or an export. */
export function mentionsToPlainText(
  stored: string,
  nameFor?: PageNameLookup,
): string {
  return parseMentions(stored, nameFor).text;
}
