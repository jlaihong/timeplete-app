export type AddToListRequest = {
  item: string;
  list: string;
};

/** Parse `timeplete://add-to-list?item=apples&list=grocery`. */
export function parseAddToListUrl(url: string): AddToListRequest | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const hostPath = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
  if (hostPath !== "add-to-list" && parsed.pathname !== "/add-to-list") {
    return null;
  }
  const item = (parsed.searchParams.get("item") ?? "").trim();
  if (!item) return null;
  const list = (parsed.searchParams.get("list") ?? "grocery").trim() || "grocery";
  return { item, list };
}
