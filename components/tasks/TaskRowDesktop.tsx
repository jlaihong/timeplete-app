import React, { forwardRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  GestureResponderEvent,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { panelStyle } from "../../theme/panels";
import {
  todayYYYYMMDD,
  addDays,
  formatYYYYMMDDtoDDMMM,
  secondsToDurationString,
} from "../../lib/dates";
import { Id } from "../../convex/_generated/dataModel";
import { DurationPickerDesktop } from "./DurationPickerDesktop";

const isWeb = Platform.OS === "web";

export interface TaskRowTask {
  _id: Id<"tasks">;
  name: string;
  dateCompleted?: string;
  taskDay?: string;
  timeSpentInSecondsUnallocated?: number;
  trackableId?: string;
  listId?: string;
  tagIds?: string[];
  assignedToUserName?: string;
  taskDayOrderIndex?: number;
  /**
   * True when this task is a materialized occurrence of a `recurringTasks`
   * series. Surfaced visually with a small "repeat" icon next to the
   * title so the user can distinguish series-instances from one-off
   * tasks at a glance — same affordance as productivity-one's row.
   */
  isRecurringInstance?: boolean;
}

export interface TaskRowMeta {
  trackable?: { name: string; colour: string } | null;
  list?: { name: string; colour: string; isGoalList?: boolean; isInbox?: boolean } | null;
  tags?: { name: string; colour: string }[];
}

export interface TaskRowDesktopProps {
  task: TaskRowTask;
  meta: TaskRowMeta;
  isTicking: boolean;
  timerElapsedSeconds: number;
  showDate?: boolean;
  isDragging?: boolean;
  isOverlay?: boolean;
  onSelect?: (taskId: Id<"tasks">) => void;
  onToggleComplete?: (taskId: Id<"tasks">) => void;
  onToggleTimer?: (taskId: Id<"tasks">) => void;
  /** Persist a manually-entered time-spent value (in seconds). Web-desktop only. */
  onSetTimeSpent?: (taskId: Id<"tasks">, newSeconds: number) => void;
  /** Called on right-click (web). Receives task id and the (clientX, clientY) of the event. */
  onRequestContextMenu?: (taskId: Id<"tasks">, x: number, y: number) => void;
  /**
   * dnd-kit drag activator props (`{...attributes, ...listeners}`) spread
   * onto the outer `<View>`. Whole-card drag — no separate handle.
   *
   * RN-Web's prop allowlist forwards `onPointerDown`, `onKeyDown`, `role`,
   * `tabIndex`, and all `aria-*`, which is exactly what dnd-kit returns,
   * so spreading these on a `<View>` works at runtime.
   */
  dragHandleProps?: Record<string, unknown>;
}

function getInitials(name?: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "").toUpperCase();
}

function getDateDisplay(day?: string): string | null {
  if (!day) return null;
  const today = todayYYYYMMDD();
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return formatYYYYMMDDtoDDMMM(day);
}

export const TaskRowDesktop = forwardRef<View, TaskRowDesktopProps>(
  function TaskRowDesktop(props, ref) {
    const {
      task,
      meta,
      isTicking,
      timerElapsedSeconds,
      showDate,
      isDragging,
      isOverlay,
      onSelect,
      onToggleComplete,
      onToggleTimer,
      onSetTimeSpent,
      onRequestContextMenu,
      dragHandleProps,
    } = props;

    const isCompleted = !!task.dateCompleted;
    const baseSeconds = task.timeSpentInSecondsUnallocated ?? 0;
    const totalSeconds = baseSeconds + (isTicking ? timerElapsedSeconds : 0);

    const initials = getInitials(task.assignedToUserName);
    const dateLabel = showDate ? getDateDisplay(task.taskDay) : null;

    const showTrackableTag = !!meta.trackable;
    const showListTag =
      !showTrackableTag &&
      !!meta.list &&
      !meta.list.isGoalList &&
      !meta.list.isInbox;

    const handleContextMenu = useCallback(
      (e: GestureResponderEvent | any) => {
        if (!isWeb || !onRequestContextMenu) return;
        e?.preventDefault?.();
        e?.stopPropagation?.();
        const x = e?.clientX ?? e?.nativeEvent?.clientX ?? 0;
        const y = e?.clientY ?? e?.nativeEvent?.clientY ?? 0;
        onRequestContextMenu(task._id, x, y);
      },
      [onRequestContextMenu, task._id]
    );

    const stopAndCall = (cb?: () => void) => (e: any) => {
      e?.stopPropagation?.();
      cb?.();
    };

    /* ─── Whole-card drag ─────────────────────────────────────────────────
     * Drag is handled entirely by dnd-kit (PointerSensor) via `dragHandleProps`
     * spread onto the outer `<View>`. There is NO grip and NO HTML5 native
     * drag — the previous HTML5 hybrid was removed because:
     *   1. RN-Web's `View` strips `draggable` / `onDragStart` (prop allowlist),
     *      so HTML5 drag only worked when we wrapped in a raw `<div>`.
     *   2. With both systems live on the same node the browser's HTML5 drag
     *      always wins the activation race against `PointerSensor`, silently
     *      breaking sortable reorder.
     * One drag system, one DndContext (lifted to DesktopHome) → reorder and
     * calendar drop both work via the same gesture.
     */
    // RN-Web forwards `onContextMenu` to the DOM at runtime (see
    // `react-native-web/dist/modules/forwardedProps`), but the TS types
    // don't expose it. Bundle it with `dragHandleProps` via a single
    // spread cast through `any`.
    const webOnlyProps = isWeb
      ? ({ onContextMenu: handleContextMenu } as Record<string, unknown>)
      : null;

    return (
      <View
        ref={ref as any}
        style={[
          styles.cardWrap,
          isDragging && styles.cardWrapDragging,
          isOverlay && styles.cardWrapOverlay,
          isWeb && (styles.cardWrapWebGrab as any),
        ]}
        {...(webOnlyProps ?? {})}
        {...(dragHandleProps ?? {})}
      >
        <Pressable
          onPress={() => onSelect?.(task._id)}
          style={[
            styles.card,
            isTicking && styles.cardTicking,
            isCompleted && styles.cardCompleted,
          ]}
        >
          <View style={styles.grid}>
            {/* Col 1: complete toggle */}
            <Pressable
              onPress={stopAndCall(() => onToggleComplete?.(task._id))}
              hitSlop={8}
              style={({ hovered }: any) => [
                styles.iconBtn,
                hovered && styles.iconBtnHover,
              ]}
            >
              <MaterialIcons
                name={isCompleted ? "check-circle" : "radio-button-unchecked"}
                size={22}
                color={isCompleted ? Colors.tertiary : Colors.text}
              />
            </Pressable>

            {/* Col 2: title (with optional recurring-instance badge) */}
            <View style={styles.titleRow}>
              {task.isRecurringInstance && (
                <Ionicons
                  name="repeat"
                  size={14}
                  color={Colors.textSecondary}
                  style={styles.recurringIcon}
                />
              )}
              <Text
                numberOfLines={1}
                style={[
                  styles.title,
                  isCompleted && styles.titleCompleted,
                  styles.titleFlex,
                ]}
              >
                {task.name}
              </Text>
            </View>

            {/* Col 3: time area */}
            <View style={styles.timeCol}>
              <Pressable
                onPress={stopAndCall(() => onToggleTimer?.(task._id))}
                hitSlop={6}
                style={({ hovered }: any) => [
                  styles.iconBtn,
                  hovered && styles.iconBtnHover,
                ]}
              >
                <MaterialIcons
                  name={isTicking ? "pause" : "play-arrow"}
                  size={20}
                  color={Colors.text}
                />
              </Pressable>
              {isWeb ? (
                <DurationPickerDesktop
                  durationSeconds={totalSeconds}
                  showSeconds={isTicking}
                  /* While the timer is ticking, the value is live-driven —
                     don't let the user edit a moving target. */
                  readonly={isTicking || !onSetTimeSpent}
                  active={isTicking}
                  onDurationChanged={(secs) =>
                    onSetTimeSpent?.(task._id, secs)
                  }
                />
              ) : (
                <Text
                  style={[
                    styles.duration,
                    isTicking && styles.durationActive,
                  ]}
                >
                  {secondsToDurationString(totalSeconds, isTicking)}
                </Text>
              )}
            </View>

            {/* Optional col-3 row-2: assignee + date */}
            {(initials || dateLabel) && (
              <View style={styles.metaRow}>
                {initials && (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                )}
                {dateLabel && <Text style={styles.dateText}>{dateLabel}</Text>}
              </View>
            )}
          </View>

          {/* Tags row */}
          {(showTrackableTag || showListTag || (meta.tags?.length ?? 0) > 0) && (
            <View style={styles.tagsRow}>
              {showTrackableTag && meta.trackable && (
                <View style={styles.tagChip}>
                  <MaterialIcons
                    name="track-changes"
                    size={16}
                    color={meta.trackable.colour || Colors.text}
                  />
                  <Text
                    style={styles.tagName}
                    numberOfLines={1}
                  >
                    {meta.trackable.name}
                  </Text>
                </View>
              )}
              {showListTag && meta.list && (
                <View style={styles.tagChip}>
                  <Ionicons
                    name="list"
                    size={16}
                    color={meta.list.colour || Colors.text}
                  />
                  <Text style={styles.tagName} numberOfLines={1}>
                    {meta.list.name}
                  </Text>
                </View>
              )}
              {meta.tags?.map((tag, i) => (
                <View key={i} style={styles.tagChip}>
                  <MaterialIcons
                    name="label"
                    size={16}
                    color={tag.colour || Colors.text}
                  />
                  <Text style={styles.tagName} numberOfLines={1}>
                    {tag.name}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Pressable>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  cardWrap: {
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 8,
    ...Platform.select({
      web: {
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      } as any,
      default: {},
    }),
  },
  // Visual affordance: the whole card is the drag source. Cursor flips to
  // `grabbing` while dnd-kit's PointerSensor is active (handled globally
  // by dnd-kit's overlay); `grab` here is the resting hint.
  cardWrapWebGrab: {
    cursor: "grab",
  } as any,
  cardWrapDragging: {
    opacity: 0.4,
  },
  cardWrapOverlay: {
    ...Platform.select({
      web: {
        cursor: "grabbing",
        boxShadow: "0 12px 24px rgba(0,0,0,0.5)",
      } as any,
      default: {},
    }),
  },
  card: panelStyle,
  cardTicking: {
    borderColor: Colors.success,
    borderWidth: 2,
  },
  cardCompleted: {
    opacity: 0.5,
  },
  grid: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    columnGap: 8,
    flexWrap: "wrap",
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "background-color 120ms ease",
      } as any,
      default: {},
    }),
  },
  iconBtnHover: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: Colors.text,
    fontSize: 15,
    fontWeight: "400",
  },
  titleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  titleFlex: { flex: 1 },
  recurringIcon: { flexShrink: 0 },
  titleCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  timeCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  duration: {
    color: Colors.text,
    fontSize: 14,
    fontVariant: ["tabular-nums"] as any,
    minWidth: 48,
    textAlign: "right",
    ...Platform.select({
      web: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as any,
      default: {},
    }),
  },
  durationActive: {
    color: Colors.success,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    paddingRight: 12,
    width: "100%",
    marginTop: 2,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primaryContainer,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.onPrimaryContainer,
    lineHeight: 10,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tagName: {
    fontSize: 12,
    color: Colors.text,
    maxWidth: 140,
  },
});

/** Standalone placeholder used while a card is being dragged (matches angular `task-drag-placeholder`). */
export function TaskDragPlaceholder() {
  return (
    <View style={placeholderStyles.placeholder}>
      <View style={placeholderStyles.stripes} />
    </View>
  );
}

const placeholderStyles = StyleSheet.create({
  placeholder: {
    width: "100%",
    alignSelf: "stretch",
    height: 100,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  stripes: {
    flex: 1,
    ...Platform.select({
      web: {
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.02) 8px, rgba(255,255,255,0.02) 16px)",
      } as any,
      default: {
        backgroundColor: "rgba(255,255,255,0.05)",
      },
    }),
  },
});
