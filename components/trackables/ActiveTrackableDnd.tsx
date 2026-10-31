/**
 * Drag-reorder for the active trackable list.
 *
 * productivity-one does this on the Trackables page (`cdkDropList` in
 * `goals-page.html`). Home does not have its own drag list there, but it
 * renders the same `orderIndex` order, so a drop on either surface changes
 * what sits at the top of home.
 *
 * Web only. dnd-kit needs DOM nodes. Native keeps the static list.
 */
import React, { useCallback } from "react";
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
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  applyTrackableMoveOptimisticUpdate,
  trackableDropToIndex,
} from "../../lib/trackableReorder";
import { TrackableWidgetFactory } from "./widgets/TrackableWidgetFactory";
import { suppressTrackablePress } from "./widgets/dragSafe";
import type { LogRequest, WidgetGoal } from "./widgets/types";

interface ActiveTrackableDndProps {
  goals: WidgetGoal[];
  today: string;
  onRequestLog: (req: LogRequest) => void;
  onRequestEditTrackable?: (trackableId: string) => void;
  /** Home column is a vertical list. The Trackables page is a wrapping grid. */
  layout: "vertical" | "grid";
  /** Tile width in px. Required for the grid so flex-wrap matches the page. */
  itemWidth?: number;
}

export function ActiveTrackableDnd({
  goals,
  today,
  onRequestLog,
  onRequestEditTrackable,
  layout,
  itemWidth,
}: ActiveTrackableDndProps) {
  const moveTrackable = useMutation(
    api.trackables.move,
  ).withOptimisticUpdate(applyTrackableMoveOptimisticUpdate);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const toIndex = trackableDropToIndex(
        goals,
        String(active.id),
        String(over.id),
      );
      if (toIndex == null) return;
      void moveTrackable({
        id: active.id as WidgetGoal["_id"],
        toIndex,
      });
    },
    [goals, moveTrackable],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={suppressTrackablePress}
      onDragCancel={suppressTrackablePress}
      onDragEnd={(event) => {
        suppressTrackablePress();
        onDragEnd(event);
      }}
    >
      <SortableContext
        items={goals.map((goal) => goal._id)}
        strategy={
          layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy
        }
      >
        {goals.map((goal) => (
          <SortableTrackable
            key={goal._id}
            goal={goal}
            today={today}
            onRequestLog={onRequestLog}
            onRequestEditTrackable={onRequestEditTrackable}
            itemWidth={layout === "grid" ? itemWidth : undefined}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableTrackable({
  goal,
  today,
  onRequestLog,
  onRequestEditTrackable,
  itemWidth,
}: {
  goal: WidgetGoal;
  today: string;
  onRequestLog: (req: LogRequest) => void;
  onRequestEditTrackable?: (trackableId: string) => void;
  itemWidth?: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: goal._id,
    animateLayoutChanges: () => false,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: itemWidth ?? "100%",
    boxSizing: "border-box",
    minWidth: 0,
    position: "relative",
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.92 : 1,
    cursor: isDragging ? "grabbing" : "grab",
  };

  return (
    <div
      ref={setNodeRef as React.Ref<HTMLDivElement>}
      style={style}
      {...attributes}
      {...listeners}
    >
      <TrackableWidgetFactory
        goal={goal}
        today={today}
        onRequestLog={onRequestLog}
        onRequestEditTrackable={onRequestEditTrackable}
      />
    </div>
  );
}
