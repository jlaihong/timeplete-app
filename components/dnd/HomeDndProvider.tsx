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
import { Platform } from "react-native";
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
  MeasuringStrategy,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  TaskRowDesktop,
  TaskRowTask,
  TaskRowMeta,
} from "../tasks/TaskRowDesktop";
import {
  pickPointerTaskCollisions,
  pointerWithinCalendar,
} from "../../lib/resolveDragDropTarget";

interface ActiveDragState {
  id: UniqueIdentifier;
  task: TaskRowTask;
  meta: TaskRowMeta;
}

interface Props {
  children: React.ReactNode;
}

/**
 * dnd-kit is a DOM-only library: `<DndContext>` / `<DragOverlay>` render
 * `<div>`s and crash on RN ("View config getter callback for component `div`..."").
 * On native we passthrough — native drag-and-drop, if/when added, would use
 * `react-native-gesture-handler` and live in a sibling provider.
 *
 * Split into two components (instead of `if (!isWeb) return children`) so
 * the hooks below aren't conditionally called.
 */
function HomeDndProviderNative({ children }: Props) {
  return <>{children}</>;
}

function HomeDndProviderWeb({ children }: Props) {
  // 5px PointerSensor matches the previous DesktopTaskList behaviour.
  // Keep distance non-zero so a click (no movement) still opens the task
  // detail without accidentally activating drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // pointerWithin first. Calendar hours win only when the pointer is
  // actually inside a cell. rectIntersection / closestCenter must not
  // promote hours: those algorithms see the tall calendar column even
  // when the cursor is still over the task list.
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const pw = pointerWithin(args);
    const pwCal = pointerWithinCalendar(pw);
    if (pwCal.length > 0) return pwCal;

    const pwTasks = pickPointerTaskCollisions(args, pw);
    // Active-only is valid: that is the original slot's placeholder.
    // Skipping it made the start position untargetable.
    if (pwTasks.length > 0) return pwTasks;

    const riTasks = pickPointerTaskCollisions(args, rectIntersection(args));
    if (riTasks.length > 0) return riTasks;

    return pickPointerTaskCollisions(args, closestCenter(args));
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
      // Rows move between day groups mid-drag; rects measured once at drag
      // start would leave collisions pointing at the old layout.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
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
      {/* pointer-events: none so wheel scrolling reaches the ScrollView below */}
      <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
        {activeDrag && !overCalendar ? (
          <TaskRowDesktop
            task={activeDrag.task}
            meta={activeDrag.meta}
            isTicking={false}
            timerStartTime={null}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export const HomeDndProvider =
  Platform.OS === "web" ? HomeDndProviderWeb : HomeDndProviderNative;
