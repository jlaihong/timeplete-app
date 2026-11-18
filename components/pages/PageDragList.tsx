import React from "react";
import { View } from "react-native";
import type { PageNode } from "../../lib/pageTree";

import {
  type PageDragListProps,
  type PageDragState,
} from "./pageDragTypes";

export * from "./pageDragTypes";

const IDLE: PageDragState = { overlay: false };

/**
 * The pages tree, rearranged by dragging rows up and down, and right or
 * left to put a page under the one above it or take it back out.
 *
 * This is the native build: dragging uses DOM-only dnd-kit, so on
 * iOS/Android the rows are not draggable and a page is moved from its own
 * screen instead. See `PageDragList.web.tsx` for the draggable version.
 */
export function PageDragList<T extends PageNode>({
  rows,
  renderRow,
}: PageDragListProps<T>) {
  return (
    <View>
      {rows.map((row) => (
        <React.Fragment key={row.page._id}>{renderRow(row, IDLE)}</React.Fragment>
      ))}
    </View>
  );
}

/** Whether pages can be dragged on this platform (for wording hints). */
export const PAGES_DRAGGABLE = false;
