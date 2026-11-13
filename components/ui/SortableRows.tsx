import React from "react";
import { View } from "react-native";

export interface SortableRowsProps<T extends { _id: string; orderIndex: number }> {
  items: T[];
  /** Move `id` to the position currently held by the row it was dropped on. */
  onMove: (id: T["_id"], toIndex: number) => void;
  renderRow: (item: T) => React.ReactNode;
}

/**
 * A vertical list whose rows can be dragged into a new order.
 *
 * This is the native build: drag-to-reorder uses DOM-only dnd-kit, so on
 * iOS/Android the rows render in order and are not draggable. See
 * `SortableRows.web.tsx` for the draggable version.
 */
export function SortableRows<T extends { _id: string; orderIndex: number }>({
  items,
  renderRow,
}: SortableRowsProps<T>) {
  return (
    <View>
      {items.map((item) => (
        <React.Fragment key={item._id}>{renderRow(item)}</React.Fragment>
      ))}
    </View>
  );
}

/** Whether rows can be dragged on this platform (for showing a grip). */
export const SORTABLE_ROWS_DRAGGABLE = false;
