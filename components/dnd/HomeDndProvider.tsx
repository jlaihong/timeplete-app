/**
 * HomeDndProvider — single dnd-kit context shared by the desktop home page.
 *
 * Hoisted out of `DesktopTaskList` so the calendar (a sibling) can register
 * its hour cells as `useDroppable` siblings of the sortable task rows. Both
 * the task list and the calendar attach their drag handlers via
 * `useDndMonitor` from inside this provider.
 *
 * Drag overlay rendering also lives here so the dragged card can leave the
 * task list cleanly (the overlay is `position: fixed` and follows the
 * cursor across containers — across the whole viewport, in fact).
 */
import React, { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  closestCenter,
  CollisionDetection,
  DragStartEvent,
  DragOverEvent,
  DragMoveEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  TaskRowDesktop,
  TaskRowTask,
  TaskRowMeta,
} from "../tasks/TaskRowDesktop";

interface ActiveDragState {
  id: UniqueIdentifier;
  task: TaskRowTask;
  meta: TaskRowMeta;
}

interface Props {
  children: React.ReactNode;
}

export function HomeDndProvider({ children }: Props) {
  // 5px PointerSensor matches the previous DesktopTaskList behaviour.
  // Keep distance non-zero so a click (no movement) still opens the task
  // detail without accidentally activating drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Same custom collision detection as the previous list-only DndContext:
  // pointerWithin > rectIntersection > closestCenter. Calendar hour cells
  // are full-width drop zones and rely on pointerWithin to win against
  // task-row droppables when the cursor is over the timeline.
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const pw = pointerWithin(args);
    if (pw.length > 0) return pw;
    const ri = rectIntersection(args);
    if (ri.length > 0) return ri;
    return closestCenter(args);
  }, []);

  // We need to know which task is being dragged so the DragOverlay can
  // render its visual. The overlay renders the row at full opacity while
  // the in-list copy renders the placeholder (see SortableRow).
  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);

  // While the cursor is over a calendar hour cell, the overlay is hidden
  // so it doesn't obscure the time-slot preview block. This matches
  // productivity-one's FullCalendar mirror UX (the FC mirror replaces the
  // dragged element while over the calendar; outside the calendar the
  // dragged element is visible). Detection is purely based on the active
  // droppable id — `cal-hour-*` is owned by `CalendarView`'s `<HourSlot>`,
  // so any non-cal droppable (sortable rows, group containers) restores
  // the overlay automatically.
  const [overCalendar, setOverCalendar] = useState(false);

  const onDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as
      | { type?: string; task?: TaskRowTask; meta?: TaskRowMeta }
      | undefined;
    if (data?.type === "task" && data.task && data.meta) {
      setActiveDrag({
        id: event.active.id,
        task: data.task,
        meta: data.meta,
      });
    }
    setOverCalendar(false);
  }, []);

  // `onDragOver` fires when the active droppable changes; `onDragMove`
  // fires on every pointer move. We track via both for two reasons:
  //   1. `onDragOver` alone misses the case where the cursor enters and
  //      leaves the same hour-slot droppable across rect boundaries
  //      without `over` strictly changing identity.
  //   2. `onDragMove` alone re-renders too aggressively. The setter is a
  //      no-op when the value hasn't changed, so React skips the render.
  const updateOverCalendar = useCallback(
    (event: DragOverEvent | DragMoveEvent) => {
      const overId = event.over?.id ? String(event.over.id) : "";
      const next = overId.startsWith("cal-hour-");
      setOverCalendar((prev) => (prev === next ? prev : next));
    },
    []
  );

  const clearActive = useCallback(() => {
    setActiveDrag(null);
    setOverCalendar(false);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={onDragStart}
      onDragOver={updateOverCalendar}
      onDragMove={updateOverCalendar}
      onDragEnd={clearActive}
      onDragCancel={clearActive}
    >
      {children}
      {/* Conditionally render the overlay's children: dnd-kit keeps the
          overlay surface mounted (no animation glitch, no flicker), but
          children=null hides the visible card while we're over the
          calendar so the time-slot preview is fully visible. */}
      <DragOverlay dropAnimation={null}>
        {activeDrag && !overCalendar ? (
          <TaskRowDesktop
            task={activeDrag.task}
            meta={activeDrag.meta}
            isTicking={false}
            timerElapsedSeconds={0}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
