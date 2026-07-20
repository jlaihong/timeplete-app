import { useCallback } from "react";
import { View } from "react-native";
import {
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  useDndMonitor,
  useDroppable,
} from "@dnd-kit/core";
import { HOUR_DROPPABLE_PREFIX } from "./CalendarViewShared";
import { calendarViewStyles as styles } from "./CalendarViewStyles";

/* ────────────────────────────────────────────────────────────────────────
 *  CalendarDndMonitor — web-only wrapper around `useDndMonitor`.
 *
 *  `useDndMonitor` throws "must be used within a children of <DndContext>"
 *  when no provider exists above. On native we passthrough `HomeDndProvider`
 *  (dnd-kit is DOM-only), so we mount this child only on web — that way the
 *  hook is conditionally CALLED via mount/unmount, not conditionally LISTED
 *  inside CalendarView's body (which would break rules-of-hooks).
 * ──────────────────────────────────────────────────────────────────────── */
interface CalendarDndMonitorProps {
  onDragStart: (e: DragStartEvent) => void;
  onDragMove: (e: DragMoveEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
}

export function CalendarDndMonitor(props: CalendarDndMonitorProps) {
  useDndMonitor({
    onDragStart: props.onDragStart,
    onDragMove: props.onDragMove,
    onDragEnd: props.onDragEnd,
    onDragCancel: props.onDragCancel,
  });
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 *  HourSlot — fixed-height droppable backdrop row.
 *
 *  Renders the hour boundary line plus a lighter mid-hour (30 min) guide,
 *  the droppable backdrop for the row, and registers the DOM node for
 *  coordinate mapping. Events are painted above in `eventsLayer`.
 * ──────────────────────────────────────────────────────────────────────── */
interface HourSlotProps {
  hour: number;
  registerEl: (hour: number, node: HTMLElement | null) => void;
  isOverPreview: boolean;
}

export function HourSlot({ hour, registerEl, isOverPreview }: HourSlotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${HOUR_DROPPABLE_PREFIX}${hour}`,
  });

  const setRefs = useCallback(
    (node: any) => {
      setNodeRef(node ?? null);
      registerEl(hour, (node as HTMLElement) ?? null);
    },
    [setNodeRef, registerEl, hour]
  );

  return (
    <View
      ref={setRefs as any}
      style={[
        styles.hourSlot,
        (isOver || isOverPreview) && styles.hourSlotDropTarget,
      ]}
    >
      <View style={styles.hourLine} />
      <View style={styles.halfHourLine} />
    </View>
  );
}
