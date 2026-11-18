import type React from "react";
import type { PageNode, PageRow } from "../../lib/pageTree";

/*
 * Shared by the native and web builds of `PageDragList`. It lives in its
 * own file because, on the web, "./PageDragList" resolves to the web
 * build itself.
 */

/** How far each level of the tree is indented. */
export const PAGE_INDENT = 22;

export interface PageDragState {
  /** This is the copy of the row that floats under the pointer. */
  overlay: boolean;
}

/** The place among its new siblings; neither: last. */
export interface PagePlace {
  beforeId?: string;
  afterId?: string;
}

export interface PageDragListProps<T extends PageNode> {
  rows: PageRow<T>[];
  /** Every page, folded-away ones included: decides where a page may go. */
  pages: readonly T[];
  /** Off while searching, when the rows are not the tree. */
  enabled: boolean;
  /** `parentId` `null`: the top level. */
  onMove: (id: T["_id"], parentId: T["_id"] | null, place: PagePlace) => void;
  renderRow: (row: PageRow<T>, state: PageDragState) => React.ReactNode;
}
