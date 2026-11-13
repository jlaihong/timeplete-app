import React, { useEffect, useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SortableRowsProps } from "./SortableRows";

/**
 * A vertical list whose rows can be dragged into a new order (web).
 *
 * The whole row is the drag source; an 8px movement threshold keeps an
 * ordinary click on the row (open, edit) working. The dropped order shows
 * immediately and is replaced by the server's order once the move lands.
 */
export function SortableRows<T extends { _id: string; orderIndex: number }>({
  items,
  onMove,
  renderRow,
}: SortableRowsProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Order shown right after a drop, until the server's order arrives.
  const serverKey = items.map((item) => item._id).join(",");
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  useEffect(() => {
    setPendingIds(null);
  }, [serverKey]);

  const ordered = useMemo(() => {
    if (!pendingIds) return items;
    const byId = new Map(items.map((item) => [item._id as string, item]));
    const next = pendingIds
      .map((id) => byId.get(id))
      .filter((item): item is T => item != null);
    return next.length === items.length ? next : items;
  }, [items, pendingIds]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((item) => item._id as string);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    const target = items.find((item) => item._id === over.id);
    if (from < 0 || to < 0 || !target) return;
    setPendingIds(arrayMove(ids, from, to));
    onMove(active.id as T["_id"], target.orderIndex);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={ordered.map((item) => item._id)}
        strategy={verticalListSortingStrategy}
      >
        {ordered.map((item) => (
          <SortableRow key={item._id} id={item._id}>
            {renderRow(item)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    // Translate only: a scale would squash rows of different heights.
    transform: CSS.Translate.toString(transform),
    transition,
    // A flex column like an RN View, so the row inside stretches full width.
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    width: "100%",
    boxSizing: "border-box",
    position: "relative",
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.9 : 1,
    cursor: isDragging ? "grabbing" : "grab",
  };
  return (
    <div
      ref={setNodeRef as React.Ref<HTMLDivElement>}
      style={style}
      {...attributes}
      {...listeners}
      // The row holds its own buttons; the wrapper is not one.
      role={undefined}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

/** Whether rows can be dragged on this platform (for showing a grip). */
export const SORTABLE_ROWS_DRAGGABLE = true;
