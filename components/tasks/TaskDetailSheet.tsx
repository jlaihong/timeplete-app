/**
 * TaskDetailSheet — controlled-form task editor.
 *
 * Architecture (productivity-one parity):
 *   - All editable fields (name, scheduled date, trackable, list) bind
 *     to a LOCAL form state. Nothing persists until the user clicks
 *     "Save".
 *   - "Cancel" and any close gesture (X, overlay click, Escape)
 *     discards local edits.
 *   - Form state is initialized ONCE when the dialog mounts (after the
 *     `task` query resolves). The dialog is conditionally rendered by
 *     its parent, so re-opening always picks up fresh persisted data.
 *   - Comments are an independent entity (not a task field): adding /
 *     deleting a comment is a discrete action and persists immediately,
 *     same as productivity-one.
 *
 * Time tracked single source of truth:
 *   Both the "Details" meta chip and the "Time Tracked" tab read from
 *   `getTimeTracked.totalSeconds` (the time-windows aggregate). The
 *   denormalized `task.timeSpentInSecondsUnallocated` field exists for
 *   list rendering perf but can drift from the windows total — using
 *   the windows total everywhere in this dialog guarantees the two
 *   tabs always agree.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  Pressable,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../ui/Button";
import { DateField } from "../ui/DateField";
import { TrackablePicker } from "./TrackablePicker";
import { ListPicker } from "./ListPicker";
import {
  RecurrenceSection,
  type RecurrenceFormValue,
  ruleToRecurrenceForm,
  recurrenceFormToRuleFields,
} from "./RecurrenceSection";
import { useTimer } from "../../hooks/useTimer";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { formatSecondsAsHM, formatDisplayDate, todayYYYYMMDD } from "../../lib/dates";
import { Id } from "../../convex/_generated/dataModel";
import { DialogOverlay } from "../ui/DialogScaffold";

type Tab = "details" | "time" | "comments";
type RecurringEditScope = "THIS_INSTANCE" | "THIS_AND_FUTURE" | "ALL_INSTANCES";

interface TaskDetailSheetProps {
  taskId: Id<"tasks">;
  onClose: () => void;
}

/** Local-state shape for the controlled Details-tab form.
 *
 *  Note: `name` is intentionally NOT part of this form. The header
 *  title is editable on every tab (it's not Details-specific UI), so
 *  it persists immediately on blur — mirroring the productivity-one
 *  "rename in place" behavior — instead of waiting for the Details
 *  tab's Save button. */
interface EditableForm {
  /** YYYYMMDD or "" when unset. */
  taskDay: string;
  trackableId: Id<"trackables"> | null;
  listId: Id<"lists"> | null;
  /**
   * Recurrence form snapshot. `null` = "Repeat" toggle is off.
   *
   * Save semantics (driven by the parent / `handleSave`):
   *   - Was null, now non-null  → CREATE a new `recurringTasks` rule and
   *                                link this task to it (sourceTaskId).
   *   - Was non-null, now null  → STOP the existing series effective today
   *                                (matches "Stop recurring" UX).
   *   - Both non-null + dirty   → UPDATE the existing rule and regenerate
   *                                future incomplete instances.
   */
  recurrence: RecurrenceFormValue | null;
}

export function TaskDetailSheet({ taskId, onClose }: TaskDetailSheetProps) {
  const isDesktop = useIsDesktop();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const tasks = useQuery(api.tasks.search, { includeCompleted: true });
  const task = tasks?.find((t) => t._id === taskId);
  const timeTracked = useQuery(api.tasks.getTimeTracked, { taskId });
  const comments = useQuery(api.taskComments.search, { taskId, limit: 50 });
  const tags = useQuery(api.tags.search, {});
  const lists = useQuery(api.lists.search, {});
  // The full recurringTasks list is small (one row per series) and is
  // already subscribed by DesktopTaskList — Convex de-dupes the
  // subscription so this is essentially free.
  const recurringRules = useQuery(api.recurringTasks.list, {});
  const existingRule =
    task?.recurringTaskId
      ? recurringRules?.find((r) => r._id === task.recurringTaskId) ?? null
      : null;

  const upsertTask = useMutation(api.tasks.upsert);
  const upsertComment = useMutation(api.taskComments.upsert);
  const removeComment = useMutation(api.taskComments.remove);
  // Recurring-series mutations — `handleSave` routes to these based on
  // the diff between the current rule and `form.recurrence`.
  const createRule = useMutation(api.recurringTasks.create);
  const updateRule = useMutation(api.recurringTasks.updateRule);
  const stopRule = useMutation(api.recurringTasks.stop);
  const applyInstanceOverride = useMutation(
    (api as any).recurringTasks.applyInstanceOverride
  );
  const recordDeletedOccurrence = useMutation(
    (api as any).recurringTasks.recordDeletedOccurrence
  );
  const timer = useTimer();

  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [newComment, setNewComment] = useState("");
  const [editingName, setEditingName] = useState(false);
  // Local buffer for the rename-in-place text input. Persisted on blur
  // / submit, independent of the Details tab's Save button.
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [showRecurringScopeModal, setShowRecurringScopeModal] = useState(false);
  const [pendingNameChange, setPendingNameChange] = useState<string | null>(null);
  const [showStopRecurringModal, setShowStopRecurringModal] = useState(false);
  const [stopAfterDay, setStopAfterDay] = useState("");
  // Prevent the click that triggers name-blur from also closing the sheet.
  const suppressNextBackdropCloseRef = useRef(false);

  /**
   * Form state. `null` until the task query resolves, after which it
   * is initialized ONCE — subsequent reactive updates from the server
   * are intentionally ignored so the user's in-flight edits aren't
   * clobbered. The dialog re-opens on a fresh mount, so closing and
   * reopening always reflects the latest persisted values.
   */
  const [form, setForm] = useState<EditableForm | null>(null);

  useEffect(() => {
    if (task && form === null) {
      // Wait for the rule subscription to resolve before initializing —
      // otherwise we'd seed the form with `recurrence: null` and then
      // a microsecond later the rule would arrive but we'd ignore it
      // (form-init runs once per dialog open).
      if (task.recurringTaskId && recurringRules === undefined) return;

      setForm({
        taskDay: task.taskDay ?? "",
        trackableId: (task.trackableId as Id<"trackables"> | undefined) ?? null,
        listId: (task.listId as Id<"lists"> | undefined) ?? null,
        // Translation lives in `ruleToRecurrenceForm` so this file is
        // agnostic to the patternType ↔ (frequency, interval,
        // monthlyPattern) mapping. Mirrors P1's `loadRecurringTaskDetails`.
        recurrence: existingRule ? ruleToRecurrenceForm(existingRule) : null,
      });
    }
  }, [task, form, recurringRules, existingRule]);

  // Stable callback so the document-level keydown listener below
  // doesn't re-attach on every render.
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Escape closes the dialog and discards unsaved edits — listener
  // attached at document level so it works even when focus is inside
  // an input field.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  /** Single source of truth for total time on this task — used by both
   *  the Details meta chip AND the Time Tracked tab summary, so the two
   *  numbers can never disagree. */
  const totalTrackedSeconds = timeTracked?.totalSeconds ?? 0;

  // Dirty check — drives the Save button's disabled state. We compare
  // against the persisted task, not against the initial form snapshot,
  // so reverting a field manually correctly returns the form to clean.
  // Compare both sides via the *same* translator so noise from
  // pattern-irrelevant sub-fields (e.g. `dayOfMonth` while the user
  // is on a weekly pattern) doesn't falsely register as dirty.
  const recurrenceDirty = useMemo(() => {
    const a = form?.recurrence ?? null;
    const b = existingRule ? ruleToRecurrenceForm(existingRule) : null;
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [form?.recurrence, existingRule]);

  const hasNonRecurrenceChanges = useMemo(() => {
    if (!task || !form) return false;
    return (
      (form.taskDay || "") !== (task.taskDay ?? "") ||
      (form.trackableId ?? null) !==
        ((task.trackableId as Id<"trackables"> | undefined) ?? null) ||
      (form.listId ?? null) !==
        ((task.listId as Id<"lists"> | undefined) ?? null)
    );
  }, [task, form]);

  const isDirty = useMemo(() => {
    if (!task || !form) return false;
    return (
      hasNonRecurrenceChanges || recurrenceDirty
    );
  }, [task, hasNonRecurrenceChanges, recurrenceDirty]);

  const hasFutureInstances = useMemo(() => {
    if (!task?.recurringTaskId || !task.taskDay || !tasks) return false;
    return tasks.some(
      (t) =>
        t.recurringTaskId === task.recurringTaskId &&
        t._id !== task._id &&
        !!t.taskDay &&
        t.taskDay > task.taskDay!
    );
  }, [task, tasks]);

  if (!task || !form) return null;

  const taskTags = (task.tagIds ?? [])
    .map((id: string) => tags?.find((t) => t._id === id))
    .filter(Boolean);

  const isTimerActive = timer.isRunning && timer.taskId === taskId;

  /** Sparse upsert — only fields that actually changed are sent, so we
   *  never accidentally overwrite a field with a stale value. */
  const buildTaskPatch = (nameToPersist: string): Parameters<typeof upsertTask>[0] => {
    const patch: Parameters<typeof upsertTask>[0] = {
      id: taskId,
      // `name` is required by the validator but isn't part of this
      // form (it persists instantly via `commitNameDraft`).
      name: nameToPersist,
    };

    if ((form.taskDay || "") !== (task.taskDay ?? "")) {
      if (form.taskDay) patch.taskDay = form.taskDay;
    }

    const persistedTrackable =
      (task.trackableId as Id<"trackables"> | undefined) ?? null;
    if ((form.trackableId ?? null) !== persistedTrackable) {
      patch.trackableId = form.trackableId ?? null;
    }

    const persistedList = (task.listId as Id<"lists"> | undefined) ?? null;
    if ((form.listId ?? null) !== persistedList && !form.trackableId) {
      const inboxId = lists?.find((l) => l.isInbox)?._id as
        | Id<"lists">
        | undefined;
      const next = form.listId ?? inboxId;
      if (next) patch.listId = next;
    }

    return patch;
  };

  const previousDay = (yyyymmdd: string) => {
    const y = parseInt(yyyymmdd.slice(0, 4), 10);
    const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
    const d = parseInt(yyyymmdd.slice(6, 8), 10);
    const dt = new Date(y, m, d);
    dt.setDate(dt.getDate() - 1);
    return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(
      dt.getDate()
    ).padStart(2, "0")}`;
  };

  const persistRecurrence = async (
    scope: RecurringEditScope,
    nameForSave: string
  ) => {
    const next = form.recurrence;
    const toRuleFields = (r: RecurrenceFormValue) => ({
      ...recurrenceFormToRuleFields(r),
      startTimeHHMM: r.hasTimeWindow ? r.startTimeHHMM : undefined,
      endTimeHHMM: r.hasTimeWindow ? r.endTimeHHMM : undefined,
    });
    const currentTaskDay = task.taskDay ?? todayYYYYMMDD();
    const nextTaskDay = form.taskDay || currentTaskDay;

    if (!existingRule && next) {
      await createRule({
        ...toRuleFields(next),
        startDateYYYYMMDD: next.startDateYYYYMMDD || nextTaskDay,
        endDateYYYYMMDD: next.endDateYYYYMMDD || undefined,
        name: nameForSave,
        listId:
          (form.listId ?? (task.listId as Id<"lists"> | undefined)) ?? undefined,
        trackableId:
          (form.trackableId ??
            (task.trackableId as Id<"trackables"> | undefined)) ?? undefined,
        timeEstimatedInSeconds: task.timeEstimatedInSecondsUnallocated ?? 0,
        sourceTaskId: taskId,
      });
      return;
    }

    if (existingRule && !next) {
      // Recurrence turned off: for scoped recurring-instance edits we keep the
      // selected task as a detached one-off and stop the series from that day.
      if (scope === "THIS_AND_FUTURE") {
        await applyInstanceOverride({
          taskId,
          originalTaskDay: task.taskDay ?? undefined,
          detachFromSeries: true,
        });
        await updateRule({
          id: existingRule._id,
          endDateYYYYMMDD: previousDay(nextTaskDay),
          regenerateFromYYYYMMDD: nextTaskDay,
        });
        return;
      }
      await stopRule({
        id: existingRule._id,
        effectiveFromYYYYMMDD:
          scope === "ALL_INSTANCES"
            ? existingRule.startDateYYYYMMDD
            : todayYYYYMMDD(),
      });
      return;
    }

    if (existingRule && next) {
      const nextListId =
        (form.listId ?? (task.listId as Id<"lists"> | undefined) ?? null);
      const nextTrackableId =
        (form.trackableId ??
          (task.trackableId as Id<"trackables"> | undefined) ??
          null);

      if (scope === "THIS_AND_FUTURE") {
        const splitFrom = nextTaskDay;
        if (
          !hasFutureInstances ||
          splitFrom <= existingRule.startDateYYYYMMDD
        ) {
          await updateRule({
            id: existingRule._id,
            ...toRuleFields(next),
            startDateYYYYMMDD: next.startDateYYYYMMDD || existingRule.startDateYYYYMMDD,
            endDateYYYYMMDD: next.endDateYYYYMMDD || null,
            name: nameForSave,
            listId: nextListId,
            trackableId: nextTrackableId,
            regenerateFromYYYYMMDD: existingRule.startDateYYYYMMDD,
          });
          return;
        }

        await createRule({
          ...toRuleFields(next),
          startDateYYYYMMDD: splitFrom,
          endDateYYYYMMDD: next.endDateYYYYMMDD || undefined,
          name: nameForSave,
          listId: nextListId ?? undefined,
          trackableId: nextTrackableId ?? undefined,
          timeEstimatedInSeconds: task.timeEstimatedInSecondsUnallocated ?? 0,
          sourceTaskId: taskId,
        });

        if (task.taskDay && splitFrom > task.taskDay) {
          await recordDeletedOccurrence({
            recurringTaskId: existingRule._id,
            deletedDateYYYYMMDD: task.taskDay,
          });
        }

        await updateRule({
          id: existingRule._id,
          endDateYYYYMMDD: previousDay(splitFrom),
          regenerateFromYYYYMMDD: splitFrom,
        });
        return;
      }

      await updateRule({
        id: existingRule._id,
        ...toRuleFields(next),
        startDateYYYYMMDD: next.startDateYYYYMMDD,
        endDateYYYYMMDD: next.endDateYYYYMMDD || null,
        name: nameForSave,
        listId: nextListId,
        trackableId: nextTrackableId,
        regenerateFromYYYYMMDD:
          scope === "ALL_INSTANCES"
            ? existingRule.startDateYYYYMMDD
            : todayYYYYMMDD(),
      });
    }
  };

  const executeSave = async (
    scope: RecurringEditScope,
    nameOverride?: string
  ) => {
    const nameToPersist = nameOverride ?? task.name;
    const patch = buildTaskPatch(nameToPersist);
    await upsertTask(patch);

    const taskDayMoved =
      !!task.recurringTaskId &&
      !!task.taskDay &&
      !!form.taskDay &&
      task.taskDay !== form.taskDay;

    if (scope === "THIS_INSTANCE" || (task as any).isException) {
      if (taskDayMoved && task.recurringTaskId) {
        await recordDeletedOccurrence({
          recurringTaskId: task.recurringTaskId,
          deletedDateYYYYMMDD: task.taskDay!,
        });
      }
      if (task.recurringTaskId) {
        await applyInstanceOverride({
          taskId,
          originalTaskDay: task.taskDay ?? undefined,
        });
      }
      return;
    }

    if (
      recurrenceDirty ||
      (!!existingRule && task.isRecurringInstance) ||
      (!existingRule && !!form.recurrence)
    ) {
      await persistRecurrence(scope, nameToPersist);
    }
  };

  const handleSave = async () => {
    if (!isDirty || saving) return;
    const shouldPromptForRecurringScope =
      task.isRecurringInstance &&
      !!task.recurringTaskId &&
      (hasNonRecurrenceChanges || recurrenceDirty) &&
      !(task as any).isException;
    if (shouldPromptForRecurringScope) {
      setPendingNameChange(null);
      setShowRecurringScopeModal(true);
      return;
    }
    setSaving(true);
    try {
      await executeSave(
        (task as any).isException ? "THIS_INSTANCE" : "ALL_INSTANCES"
      );
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSelectRecurringScope = async (scope: RecurringEditScope) => {
    if (saving) return;
    const openedFromNameOnly = pendingNameChange !== null && !isDirty;
    setShowRecurringScopeModal(false);
    setSaving(true);
    try {
      await executeSave(scope, pendingNameChange ?? undefined);
      setPendingNameChange(null);
      if (!openedFromNameOnly) handleClose();
    } finally {
      setSaving(false);
    }
  };

  const nextDay = (yyyymmdd: string) => {
    const y = parseInt(yyyymmdd.slice(0, 4), 10);
    const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
    const d = parseInt(yyyymmdd.slice(6, 8), 10);
    const dt = new Date(y, m, d);
    dt.setDate(dt.getDate() + 1);
    return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(
      dt.getDate()
    ).padStart(2, "0")}`;
  };

  const handleOpenStopRecurring = () => {
    setStopAfterDay(task.taskDay ?? todayYYYYMMDD());
    setShowStopRecurringModal(true);
  };

  const handleConfirmStopRecurring = async () => {
    if (!existingRule || !stopAfterDay || saving) return;
    setShowStopRecurringModal(false);
    setSaving(true);
    try {
      // UX parity with P1: "stop after this date" means we keep selected date
      // and stop from the following day.
      await stopRule({
        id: existingRule._id,
        effectiveFromYYYYMMDD: nextDay(stopAfterDay),
      });
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  // Rename-in-place: persists immediately on blur / submit, matching
  // the original click-to-edit behavior. Independent of the Details
  // tab's controlled form so the rename works from any tab.
  const commitNameDraft = async () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === task.name) return;
    const shouldPromptForRecurringScope =
      task.isRecurringInstance &&
      !!task.recurringTaskId &&
      !(task as any).isException;
    if (shouldPromptForRecurringScope) {
      suppressNextBackdropCloseRef.current = true;
      setPendingNameChange(trimmed);
      setShowRecurringScopeModal(true);
      setTimeout(() => {
        suppressNextBackdropCloseRef.current = false;
      }, 0);
      return;
    }
    setSaving(true);
    try {
      await executeSave((task as any).isException ? "THIS_INSTANCE" : "ALL_INSTANCES", trimmed);
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await upsertComment({ taskId, commentText: newComment.trim() });
    setNewComment("");
  };

  const formatLive = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const dialogWidth = isDesktop
    ? Math.min(640, windowWidth * 0.5)
    : windowWidth;
  // Fixed height (not maxHeight) so the dialog never resizes when the
  // user switches tabs. Tab content scrolls internally instead.
  const dialogHeight = isDesktop ? windowHeight * 0.85 : windowHeight * 0.9;

  const renderDetailsTab = () => (
    <>
      {/* Read-only chips for derived metadata (estimated / due). The
          tracked chip lives in the dialog header so it's visible from
          every tab; the scheduled day moved into the editable
          DateField below. */}
      <View style={styles.metaRow}>
        {(task.timeEstimatedInSecondsUnallocated ?? 0) > 0 && (
          <View style={styles.metaChip}>
            <Ionicons name="hourglass-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaChipText}>
              Est: {formatSecondsAsHM(task.timeEstimatedInSecondsUnallocated)}
            </Text>
          </View>
        )}
        {task.dueDateYYYYMMDD && (
          <View style={styles.metaChip}>
            <Ionicons name="flag-outline" size={14} color={Colors.warning} />
            <Text style={styles.metaChipText}>
              Due: {formatDisplayDate(task.dueDateYYYYMMDD)}
            </Text>
          </View>
        )}
      </View>

      {/* Scheduled day — controlled form input. Nothing is sent to the
          server until the user clicks Save. */}
      <View style={styles.fieldBlock}>
        <DateField
          label="Scheduled date"
          value={form.taskDay}
          onChange={(yyyymmdd) =>
            setForm((f) => (f ? { ...f, taskDay: yyyymmdd } : f))
          }
        />
      </View>

      {/* Trackable assignment — productivity-one's `<mat-select>`
          parity. Selecting a trackable hides the manual list picker
          but leaves the list value alone in form state until save. */}
      <TrackablePicker
        value={form.trackableId}
        onChange={(id) =>
          setForm((f) =>
            f ? { ...f, trackableId: id as Id<"trackables"> | null } : f,
          )
        }
      />

      {/* List assignment — only shown when no trackable is selected,
          mirroring P1 `task-details.html`:
            @if (!hasGoalSelected()) { <mat-form-field>List</mat-form-field> } */}
      {!form.trackableId && (
        <ListPicker
          mode="edit"
          value={form.listId}
          onChange={(id) =>
            setForm((f) =>
              f ? { ...f, listId: id as Id<"lists"> | null } : f,
            )
          }
        />
      )}

      {task.isRecurringInstance && !!task.recurringTaskId && (
        <View style={styles.stopRecurringBadge}>
          <View style={styles.stopRecurringBadgeHeader}>
            <Ionicons name="repeat" size={16} color={Colors.primary} />
            <Text style={styles.stopRecurringBadgeText}>
              This is a recurring task.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.stopRecurringButton}
            onPress={handleOpenStopRecurring}
            activeOpacity={0.85}
          >
            <Ionicons name="repeat-outline" size={16} color={Colors.error} />
            <Text style={styles.stopRecurringButtonText}>Stop recurring</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tags */}
      {taskTags.length > 0 && (
        <View style={styles.tagsRow}>
          {taskTags.map((tag: any) => (
            <View
              key={tag._id}
              style={[styles.tagChip, { borderColor: tag.colour ?? Colors.outline }]}
            >
              <View
                style={[styles.tagDot, { backgroundColor: tag.colour ?? Colors.outline }]}
              />
              <Text style={styles.tagText}>{tag.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recurrence configuration. Hidden until the rule subscription
          resolves so we don't briefly render "Repeat: off" for an
          actually-recurring task. */}
      {recurringRules !== undefined && (
        <RecurrenceSection
          value={form.recurrence}
          onChange={(next) =>
            setForm((f) => (f ? { ...f, recurrence: next } : f))
          }
        />
      )}
    </>
  );

  const renderTimeTab = () => (
    <>
      <View style={styles.timeSummary}>
        <Text style={styles.timeSummaryLabel}>Total tracked</Text>
        <Text style={styles.timeSummaryValue}>
          {formatSecondsAsHM(totalTrackedSeconds)}
        </Text>
      </View>

      {isTimerActive && (
        <View style={[styles.sessionRow, styles.sessionRowActive]}>
          <View style={styles.sessionDot} />
          <Text style={[styles.sessionTime, styles.sessionTimeActive]}>
            Active now
          </Text>
          <Text style={[styles.sessionDuration, styles.sessionTimeActive]}>
            {formatLive(timer.elapsed)}
          </Text>
        </View>
      )}

      {timeTracked?.sessions.map((session) => (
        <View key={session.day} style={styles.sessionGroup}>
          <Text style={styles.sessionDayHeader}>
            {formatDisplayDate(session.day)}
            <Text style={styles.sessionDayTotal}>
              {" "}
              — {formatSecondsAsHM(session.totalSeconds)}
            </Text>
          </Text>
          {session.windows.map((w) => (
            <View key={w.id} style={styles.sessionRow}>
              <Text style={styles.sessionTime}>{w.startTime}</Text>
              <Text style={styles.sessionDuration}>
                {formatSecondsAsHM(w.durationSeconds)}
              </Text>
            </View>
          ))}
        </View>
      ))}

      {(!timeTracked || timeTracked.sessions.length === 0) &&
        !isTimerActive && (
          <Text style={styles.emptyText}>No time tracked yet</Text>
        )}
    </>
  );

  const renderCommentsTab = () => (
    <>
      <View style={styles.commentInput}>
        <TextInput
          style={styles.commentField}
          value={newComment}
          onChangeText={setNewComment}
          placeholder="Add a comment..."
          placeholderTextColor={Colors.textTertiary}
          onSubmitEditing={handleAddComment}
        />
        <TouchableOpacity onPress={handleAddComment}>
          <Ionicons name="send" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {comments?.map((c) => (
        <View key={c._id} style={styles.comment}>
          <View style={styles.commentRow}>
            <Text style={styles.commentText}>{c.commentText}</Text>
            <TouchableOpacity
              onPress={() => removeComment({ id: c._id })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {(!comments || comments.length === 0) && (
        <Text style={styles.emptyText}>No comments yet</Text>
      )}
    </>
  );

  const content = (
    <View
      style={[
        isDesktop ? styles.dialogPanel : styles.sheet,
        // Use fixed `height` (not maxHeight) so the dialog never
        // resizes when switching tabs — eliminates layout shift.
        { width: dialogWidth, height: dialogHeight },
      ]}
    >
      {/* Header — title row + a tracked-time chip directly underneath
          so total time is visible from every tab, not just Details. */}
      <View style={styles.header}>
        <View style={styles.headerMain}>
          {editingName ? (
            <TextInput
              style={styles.nameInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              onBlur={commitNameDraft}
              onSubmitEditing={commitNameDraft}
              autoFocus
            />
          ) : (
            <TouchableOpacity
              onPress={() => {
                setNameDraft(task.name);
                setEditingName(true);
              }}
            >
              <Text
                style={[
                  styles.taskName,
                  task.dateCompleted && styles.taskNameCompleted,
                ]}
              >
                {task.name}
              </Text>
            </TouchableOpacity>
          )}
          {totalTrackedSeconds > 0 && (
            <View style={styles.headerChipRow}>
              <View style={styles.metaChip}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={Colors.textSecondary}
                />
                <Text style={styles.metaChipText}>
                  {formatSecondsAsHM(totalTrackedSeconds)} tracked
                </Text>
              </View>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleClose}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {(["details", "time", "comments"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === "details"
                ? "Details"
                : tab === "time"
                  ? `Time Tracked`
                  : `Comments${comments?.length ? ` (${comments.length})` : ""}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content — `flex: 1` makes the scroll region absorb all
          remaining vertical space inside the fixed-height dialog,
          guaranteeing the panel itself never resizes per tab. */}
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.content}
      >
        {activeTab === "details" && renderDetailsTab()}
        {activeTab === "time" && renderTimeTab()}
        {activeTab === "comments" && renderCommentsTab()}
      </ScrollView>

      {/* Footer — only on the Details tab, since it's the only tab
          with controlled-form fields. Pinned outside the scroll
          region so the buttons are always reachable. Cancel discards;
          Save commits the sparse upsert and closes. */}
      {activeTab === "details" && (
        <View style={styles.footer}>
          <Button title="Cancel" variant="ghost" onPress={handleClose} />
          <Button
            title="Save"
            onPress={handleSave}
            disabled={!isDirty}
            loading={saving}
          />
        </View>
      )}
    </View>
  );

  return (
    <DialogOverlay
      align={isDesktop ? "center" : "bottom"}
      onBackdropPress={() => {
        if (
          showRecurringScopeModal ||
          showStopRecurringModal ||
          suppressNextBackdropCloseRef.current
        ) {
          return;
        }
        handleClose();
      }}
    >
      {content}
      {showRecurringScopeModal && (
        <Pressable
          style={styles.scopeModalOverlay}
          onPress={(e) => {
            e.stopPropagation?.();
            setPendingNameChange(null);
            setShowRecurringScopeModal(false);
          }}
        >
          <Pressable
            style={styles.scopeModalCard}
            onPress={(e) => e.stopPropagation?.()}
          >
            <Text style={styles.scopeModalTitle}>Edit recurring task</Text>
            <Text style={styles.scopeModalSubtitle}>
              Choose how to apply these changes.
            </Text>
            <TouchableOpacity
              style={styles.scopeOption}
              onPress={() => handleSelectRecurringScope("THIS_INSTANCE")}
            >
              <Ionicons name="calendar-outline" size={18} color={Colors.text} />
              <View style={styles.scopeOptionText}>
                <Text style={styles.scopeOptionTitle}>This instance only</Text>
                <Text style={styles.scopeOptionDescription}>
                  Update only this occurrence and save it as an exception.
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.scopeOption,
                !hasFutureInstances && styles.scopeOptionDisabled,
              ]}
              disabled={!hasFutureInstances}
              onPress={() => handleSelectRecurringScope("THIS_AND_FUTURE")}
            >
              <Ionicons name="git-branch-outline" size={18} color={Colors.text} />
              <View style={styles.scopeOptionText}>
                <Text style={styles.scopeOptionTitle}>
                  This and future instances
                </Text>
                <Text style={styles.scopeOptionDescription}>
                  Split the series here. Past stays unchanged; this and future use
                  new values.
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.scopeOption}
              onPress={() => handleSelectRecurringScope("ALL_INSTANCES")}
            >
              <Ionicons name="repeat-outline" size={18} color={Colors.text} />
              <View style={styles.scopeOptionText}>
                <Text style={styles.scopeOptionTitle}>All instances</Text>
                <Text style={styles.scopeOptionDescription}>
                  Update the recurrence rule for the full series.
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.scopeModalFooter}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => {
                  setPendingNameChange(null);
                  setShowRecurringScopeModal(false);
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      )}
      {showStopRecurringModal && (
        <Pressable
          style={styles.scopeModalOverlay}
          onPress={(e) => {
            e.stopPropagation?.();
            setShowStopRecurringModal(false);
          }}
        >
          <Pressable
            style={styles.scopeModalCard}
            onPress={(e) => e.stopPropagation?.()}
          >
            <Text style={styles.scopeModalTitle}>Stop recurring</Text>
            <Text style={styles.scopeModalSubtitle}>
              Stop this task from recurring after the selected date. Instances on
              or before that date are kept.
            </Text>
            <View style={styles.fieldBlock}>
              <DateField
                label="Stop after this date"
                value={stopAfterDay}
                onChange={setStopAfterDay}
              />
            </View>
            <View style={styles.scopeModalFooter}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setShowStopRecurringModal(false)}
              />
              <Button
                title="Stop recurring"
                variant="outline"
                onPress={handleConfirmStopRecurring}
                disabled={!stopAfterDay}
                loading={saving}
              />
            </View>
          </Pressable>
        </Pressable>
      )}
    </DialogOverlay>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  dialogPanel: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 12,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 8px 32px rgba(0,0,0,0.5)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 32,
        elevation: 12,
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 16,
    // Tighter bottom padding so the tracked chip sits closer to the
    // divider; the title↔chip gap below provides the breathing room
    // above the chip instead.
    paddingBottom: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  // Wraps the title and the tracked chip vertically so the close X on
  // the right stays vertically anchored to the title row.
  headerMain: { flex: 1, flexDirection: "column", gap: 10 },
  headerChipRow: { flexDirection: "row" },
  taskName: { fontSize: 18, fontWeight: "600", color: Colors.text },
  taskNameCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  nameInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingBottom: 4,
  },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: "500", color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontWeight: "600" },

  contentScroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  fieldBlock: { marginBottom: 16 },

  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  stopRecurringBadge: {
    marginTop: 12,
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    gap: 8,
    backgroundColor: Colors.primary + "1A",
    borderWidth: 1,
    borderColor: Colors.primary + "33",
  },
  stopRecurringBadgeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stopRecurringBadgeText: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text,
    flex: 1,
  },
  stopRecurringButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error + "AA",
    backgroundColor: Colors.errorContainer + "33",
  },
  stopRecurringButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.error,
  },
  scopeModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  scopeModalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerHigh,
    gap: 10,
  },
  scopeModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  scopeModalSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  scopeOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
  },
  scopeOptionDisabled: {
    opacity: 0.45,
  },
  scopeOptionText: { flex: 1, gap: 2 },
  scopeOptionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  scopeOptionDescription: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textSecondary,
  },
  scopeModalFooter: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "flex-end",
  },

  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 6,
  },
  metaChipText: { fontSize: 12, color: Colors.textSecondary },

  tagsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  instanceBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    marginTop: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary + "15",
  },
  instanceBadgeText: {
    flex: 1,
    fontSize: 12,
    color: Colors.text,
    lineHeight: 18,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagText: { fontSize: 12, color: Colors.text },

  timeSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  timeSummaryLabel: { fontSize: 14, color: Colors.textSecondary },
  timeSummaryValue: { fontSize: 18, fontWeight: "700", color: Colors.text },

  sessionGroup: { marginBottom: 16 },
  sessionDayHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  sessionDayTotal: { fontWeight: "400" },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 2,
  },
  sessionRowActive: { backgroundColor: Colors.success + "15" },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  sessionTime: { fontSize: 13, color: Colors.textSecondary },
  sessionTimeActive: { color: Colors.success, fontWeight: "600" },
  sessionDuration: {
    fontSize: 13,
    color: Colors.text,
    fontVariant: ["tabular-nums"] as any,
  },

  commentInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  commentField: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.text,
  },
  comment: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  commentText: { fontSize: 14, color: Colors.text, flex: 1 },

  emptyText: {
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: "center",
    paddingVertical: 24,
  },
});
