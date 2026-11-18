import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  pageDescendantIds,
  pageLevelsBelow,
  projectPageDrop,
  type PageNode,
  type PageRow,
} from "../../lib/pageTree";
import { TaskDragPlaceholder } from "../tasks/TaskRowDesktop";
import {
  PAGE_INDENT,
  type PageDragListProps,
  type PageDragState,
} from "./pageDragTypes";

export * from "./pageDragTypes";

const IDLE: PageDragState = { overlay: false };
const OVERLAY: PageDragState = { overlay: true };

/**
 * The pages tree, rearranged by dragging (web). It behaves like dragging
 * tasks on Home and in a list: the rows slide apart, a striped
 * placeholder shows where the page will land, and the row itself floats
 * under the pointer.
 *
 * Up and down chooses the spot. Right and left chooses the level there:
 * pulling right puts the page under the row above it, pulling left takes
 * it back out. The placeholder's indent shows the level it will get. The
 * pages under a dragged page travel with it and are hidden meanwhile.
 *
 * The whole row is the drag source: with a mouse a 5px movement
 * threshold keeps an ordinary click (open, fold) working; on a touch
 * screen a press-and-hold starts the drag so the list still scrolls.
 */
export function PageDragList<T extends PageNode>({
  rows,
  pages,
  enabled,
  onMove,
  renderRow,
}: PageDragListProps<T>) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  // Letting go over the row the drag began on must not count as a click.
  const justDragged = useRef(false);

  // The pages under the dragged one travel with it.
  const { shown, levelsBelow } = useMemo(() => {
    if (!activeId) return { shown: rows, levelsBelow: 0 };
    const below = pageDescendantIds(pages, activeId);
    return {
      shown: rows.filter((r) => !below.has(r.page._id)),
      levelsBelow: pageLevelsBelow(pages, activeId),
    };
  }, [rows, pages, activeId]);

  const project = (over: string | null, left: number) =>
    activeId && over
      ? projectPageDrop(
          shown.map((r) => ({
            id: r.page._id,
            depth: r.depth,
            // A row drawn at the top level is one, whatever it stores.
            parentId: r.depth === 0 ? null : (r.page.parentId ?? null),
          })),
          activeId,
          over,
          Math.round(left / PAGE_INDENT),
          levelsBelow,
        )
      : null;
  const projected = project(overId, offsetLeft);

  const onDragStart = (event: DragStartEvent) => {
    justDragged.current = true;
    const id = String(event.active.id);
    setActiveId(id);
    setOverId(id);
    setOffsetLeft(0);
  };
  const onDragMove = (event: DragMoveEvent) => setOffsetLeft(event.delta.x);
  const onDragOver = (event: DragOverEvent) =>
    setOverId(event.over ? String(event.over.id) : null);
  const finish = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const id = activeId;
    const over = event.over ? String(event.over.id) : null;
    const drop = project(over, event.delta.x);
    const row = shown.find((r) => r.page._id === id);
    finish();
    if (!id || !drop || !row) return;
    // Put back where it was: leave the order alone.
    if (over === id && drop.depth === row.depth) return;
    onMove(id, drop.parentId, drop.place);
  };

  if (!enabled) {
    return (
      <div>
        {rows.map((row) => (
          <React.Fragment key={row.page._id}>{renderRow(row, IDLE)}</React.Fragment>
        ))}
      </div>
    );
  }

  const activeRow = activeId
    ? shown.find((r) => r.page._id === activeId)
    : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      <SortableContext
        items={shown.map((r) => r.page._id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          onClickCapture={(e) => {
            if (justDragged.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {shown.map((row) => (
            <SortableRow
              key={row.page._id}
              row={row}
              placeholderDepth={projected?.depth ?? row.depth}
              renderRow={renderRow}
            />
          ))}
        </div>
      </SortableContext>
      {/* In the document body: under the phone layout's screen container
          a fixed-position overlay is placed relative to that container,
          which puts it (and what it is judged to be over) a header's
          height too low.
          pointer-events: none so wheel scrolling reaches the list below. */}
      {createPortal(
        <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
          {activeRow ? renderRow({ ...activeRow, depth: 0 }, OVERLAY) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function SortableRow<T extends PageNode>({
  row,
  placeholderDepth,
  renderRow,
}: {
  row: PageRow<T>;
  placeholderDepth: number;
  renderRow: (row: PageRow<T>, state: PageDragState) => React.ReactNode;
}) {
  const { listeners, setNodeRef, transform, isDragging } = useSortable({
    id: row.page._id,
    animateLayoutChanges: () => false,
  });
  return (
    <div
      ref={setNodeRef as React.Ref<HTMLDivElement>}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        width: "100%",
        cursor: "grab",
        // Long-pressing a link on a phone would otherwise open its menu.
        WebkitTouchCallout: "none",
        userSelect: "none",
      }}
    >
      {isDragging ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            minHeight: 44,
            paddingLeft: placeholderDepth * PAGE_INDENT,
            transition: "padding-left 120ms ease",
          }}
        >
          <TaskDragPlaceholder />
        </div>
      ) : (
        renderRow(row, IDLE)
      )}
    </div>
  );
}

/** Whether pages can be dragged on this platform (for wording hints). */
export const PAGES_DRAGGABLE = true;
