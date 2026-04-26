/**
 * Calendar event creation / edit dialog.
 *
 * Dialog chrome (overlay press-out, ESC, top-right close X) follows the
 * same conventions as `AddTrackableFlow` so the app feels consistent.
 *
 * Fields (intentionally minimal — matches productivity-one's "new event"
 * dialog more closely than the previous, over-built form):
 *
 *  - Title (required)
 *  - Date (defaults to the calendar's currently-viewed day)
 *  - Start time (HH:MM, defaults from drag-prefill or 09:00)
 *  - Duration (minutes, defaults from drag-prefill or 60)
 *  - Trackable (optional; when set the row is persisted as
 *    `activityType: "TRACKABLE"`, otherwise `"EVENT"`)
 *  - Comments
 *
 * `budgetType` is hard-coded to `"ACTUAL"` — the "BUDGETED" branch is
 * legacy and no longer surfaced in the UI.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  useWindowDimensions,
  Switch,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { DateField } from "../ui/DateField";
import { TrackablePicker } from "../tasks/TrackablePicker";
import { Id } from "../../convex/_generated/dataModel";
import {
  RecurrenceSection,
  type RecurrenceFormValue,
  defaultRecurrence,
  recurrenceFormToRuleFields,
  ruleToRecurrenceForm,
} from "../tasks/RecurrenceSection";
import {
  DialogOverlay,
  DialogCard,
  DialogHeader,
  DialogFooter,
} from "../ui/DialogScaffold";

interface EventDialogProps {
  day: string;
  onClose: () => void;
  existingEvent?: {
    _id: string;
    /** Persisted explicit title; `undefined` → render derived. */
    title?: string;
    /**
     * Server-derived name from the linked list / trackable / task.
     * Used here as the input placeholder when no explicit title is
     * set, and to detect "user typed something identical to the
     * derived name" → save as derived (`title: undefined`).
     */
    derivedTitle?: string;
    startTimeHHMM: string;
    durationSeconds: number;
    activityType: string;
    budgetType: string;
    comments?: string;
    startDayYYYYMMDD?: string;
    trackableId?: string | null;
    listId?: string | null;
    taskId?: string | null;
    recurringEventId?: string | null;
    isRecurringInstance?: boolean;
  };
  /**
   * Pre-fill values when opening for a brand-new event (e.g. populated
   * from a click-and-drag gesture on the calendar). Ignored when
   * `existingEvent` is supplied.
   */
  defaultStartTimeHHMM?: string;
  defaultDurationMinutes?: number;
}
type RecurringEditScope = "THIS_INSTANCE" | "THIS_AND_FUTURE" | "ALL_INSTANCES";

/* ------------------------------------------------------------------ *
 * EventDialog                                                         *
 * ------------------------------------------------------------------ */
export function EventDialog({
  day,
  onClose,
  existingEvent,
  defaultStartTimeHHMM,
  defaultDurationMinutes,
}: EventDialogProps) {
  // Title state holds ONLY what the user has typed. On open, seed it
  // with:
  //   - the persisted explicit title, if one exists; otherwise
  //   - the server-derived name (task / trackable / list), so events
  //     created from a drag-task-to-calendar (which deliberately
  //     persist no title) still show the task name in the input field
  //     when the user opens the edit dialog. This matches "If
  //     event.title is null → pre-fill input with derived name".
  //
  // The Case-B save logic below ensures that if the user leaves the
  // pre-filled value unchanged, we still persist `title: undefined` —
  // the row stays dynamic and follows future task/trackable renames.
  const [title, setTitle] = useState(
    existingEvent?.title ?? existingEvent?.derivedTitle ?? ""
  );
  const [eventDay, setEventDay] = useState(
    existingEvent?.startDayYYYYMMDD ?? day
  );
  const [startTime, setStartTime] = useState(
    existingEvent?.startTimeHHMM ?? defaultStartTimeHHMM ?? "09:00"
  );
  const [durationMinutes, setDurationMinutes] = useState(
    existingEvent
      ? String(Math.round(existingEvent.durationSeconds / 60))
      : defaultDurationMinutes !== undefined
        ? String(defaultDurationMinutes)
        : "60"
  );
  const [trackableId, setTrackableId] = useState<Id<"trackables"> | null>(
    (existingEvent?.trackableId as Id<"trackables"> | null | undefined) ?? null
  );
  const [comments, setComments] = useState(existingEvent?.comments ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRecurringScopeModal, setShowRecurringScopeModal] = useState(false);
  const [pendingScopeSave, setPendingScopeSave] = useState<{
    titleToPersist: string | undefined;
    activityType: "TASK" | "EVENT" | "TRACKABLE";
  } | null>(null);

  const upsertTimeWindow = useMutation(api.timeWindows.upsert);
  const recurringRules = useQuery((api as any).recurringEvents.list, {});
  const existingRule = useMemo(
    () =>
      existingEvent?.recurringEventId
        ? recurringRules?.find((r: any) => r._id === existingEvent.recurringEventId) ?? null
        : null,
    [existingEvent?.recurringEventId, recurringRules]
  );
  const createRecurringRule = useMutation((api as any).recurringEvents.create);
  const updateRecurringRule = useMutation((api as any).recurringEvents.updateRule);
  const stopRecurringRule = useMutation((api as any).recurringEvents.stop);
  const applyRecurringOverride = useMutation(
    (api as any).recurringEvents.applyInstanceOverride
  );
  const recordDeletedRecurringOcc = useMutation(
    (api as any).recurringEvents.recordDeletedOccurrence
  );
  const [recurrence, setRecurrence] = useState<RecurrenceFormValue | null>(null);

  // Look up the currently-selected trackable so we can compute the LIVE
  // derived name (changes as the user picks a different trackable for
  // non-TASK events). This feeds both the placeholder and the Case-B
  // "matches derived → save as undefined" detection in `handleSave`.
  const trackables = useQuery(
    api.trackables.search,
    trackableId ? { archived: false } : "skip"
  );
  const liveDerivedName = useMemo(() => {
    // TASK events derive from `task.name` on the server (canonical, not
    // the trackable picker — the picker only attaches a snapshot
    // trackable for analytics attribution). Mirror that here so Case-B
    // detection agrees with the server.
    const isTaskEvent = existingEvent?.activityType === "TASK";
    if (isTaskEvent) return existingEvent?.derivedTitle;

    // Non-TASK events: follow the trackable picker reactively so
    // changing the picker updates the placeholder + Case-B comparison
    // immediately.
    if (trackableId && trackables) {
      const t = trackables.find((row) => row._id === trackableId);
      if (t?.name) return t.name;
    }
    // Final fallback: whatever the server originally derived (e.g.
    // list name for a non-TASK row with a direct listId).
    return existingEvent?.derivedTitle;
  }, [
    existingEvent?.activityType,
    existingEvent?.derivedTitle,
    trackableId,
    trackables,
  ]);

  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  useEffect(() => {
    if (existingRule) {
      setRecurrence(ruleToRecurrenceForm(existingRule));
      return;
    }
    setRecurrence(null);
  }, [existingRule?._id]);

  /* ESC dismisses the dialog (parity with MatDialog / AddTrackableFlow). */
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  const persistRecurringRule = async (
    scope: RecurringEditScope,
    payload: {
      titleToPersist: string | undefined;
      activityType: "TASK" | "EVENT" | "TRACKABLE";
    },
    sourceTimeWindowId?: Id<"timeWindows">
  ) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!recurrence) {
      if (existingRule) {
        if (scope === "THIS_AND_FUTURE") {
          await applyRecurringOverride({
            timeWindowId: existingEvent!._id as Id<"timeWindows">,
            detachFromSeries: true,
          });
          await updateRecurringRule({
            id: existingRule._id,
            endDateYYYYMMDD: previousDay(eventDay),
            regenerateFromYYYYMMDD: eventDay,
          });
        } else {
          await stopRecurringRule({
            id: existingRule._id,
            effectiveFromYYYYMMDD:
              scope === "ALL_INSTANCES" ? existingRule.startDateYYYYMMDD : eventDay,
          });
        }
      }
      return;
    }

    const durationSeconds = parseInt(durationMinutes, 10) * 60;
    const ruleFields = recurrenceFormToRuleFields(recurrence);
    const sharedFields = {
      ...ruleFields,
      title: payload.titleToPersist,
      startTimeHHMM: startTime,
      durationSeconds,
      comments: comments || undefined,
      trackableId: trackableId ?? undefined,
      tagIds: undefined as Id<"tags">[] | undefined,
      timeZone: tz,
      budgetType: "ACTUAL" as const,
      activityType: payload.activityType,
      startDateYYYYMMDD: recurrence.startDateYYYYMMDD || eventDay,
      endDateYYYYMMDD: recurrence.endDateYYYYMMDD || undefined,
    };

    if (!existingRule) {
      await createRecurringRule({
        ...sharedFields,
        sourceTimeWindowId:
          sourceTimeWindowId ??
          (existingEvent?._id ? (existingEvent._id as Id<"timeWindows">) : undefined),
      });
      return;
    }

    if (scope === "THIS_AND_FUTURE") {
      const splitFrom = eventDay;
      await createRecurringRule({
        ...sharedFields,
        startDateYYYYMMDD: splitFrom,
        sourceTimeWindowId:
          sourceTimeWindowId ??
          (existingEvent?._id ? (existingEvent._id as Id<"timeWindows">) : undefined),
      });
      if (existingEvent?.startDayYYYYMMDD && splitFrom > existingEvent.startDayYYYYMMDD) {
        await recordDeletedRecurringOcc({
          recurringEventId: existingRule._id,
          deletedDateYYYYMMDD: existingEvent.startDayYYYYMMDD,
        });
      }
      await updateRecurringRule({
        id: existingRule._id,
        endDateYYYYMMDD: previousDay(splitFrom),
        regenerateFromYYYYMMDD: splitFrom,
      });
      return;
    }

    await updateRecurringRule({
      id: existingRule._id,
      ...sharedFields,
      endDateYYYYMMDD: recurrence.endDateYYYYMMDD || null,
      regenerateFromYYYYMMDD:
        scope === "ALL_INSTANCES" ? existingRule.startDateYYYYMMDD : eventDay,
    });
  };

  const executeSaveWithScope = async (
    scope: RecurringEditScope,
    payload: {
      titleToPersist: string | undefined;
      activityType: "TASK" | "EVENT" | "TRACKABLE";
    }
  ) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const upsertedId = (await upsertTimeWindow({
      id: existingEvent?._id as Id<"timeWindows"> | undefined,
      startTimeHHMM: startTime,
      startDayYYYYMMDD: eventDay,
      durationSeconds: parseInt(durationMinutes, 10) * 60,
      budgetType: "ACTUAL",
      activityType: payload.activityType,
      taskId:
        (existingEvent?.taskId as Id<"tasks"> | null | undefined) ?? undefined,
      trackableId: trackableId ?? undefined,
      listId:
        (existingEvent?.listId as Id<"lists"> | null | undefined) ?? undefined,
      title: payload.titleToPersist,
      comments: comments || undefined,
      timeZone: tz,
    })) as Id<"timeWindows">;

    const dateMoved =
      !!existingEvent?.recurringEventId &&
      !!existingEvent?.startDayYYYYMMDD &&
      existingEvent.startDayYYYYMMDD !== eventDay;

    if (scope === "THIS_INSTANCE" || (existingEvent?.isRecurringInstance && !existingRule)) {
      if (dateMoved && existingEvent?.recurringEventId) {
        await recordDeletedRecurringOcc({
          recurringEventId: existingEvent.recurringEventId as Id<"recurringEvents">,
          deletedDateYYYYMMDD: existingEvent.startDayYYYYMMDD!,
        });
      }
      if (existingEvent?.recurringEventId && existingEvent?._id) {
        await applyRecurringOverride({
          timeWindowId: existingEvent._id as Id<"timeWindows">,
          detachFromSeries: true,
        });
      }
      return;
    }

    await persistRecurringRule(scope, payload, upsertedId);
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const derived = (liveDerivedName ?? "").trim();
    const hasDerived = derived.length > 0;

    // Title is required ONLY when there's no derivable name — i.e. the
    // event isn't linked to any list / trackable / task and would
    // otherwise render as "Untitled". When a derived name exists, the
    // user is allowed to clear the input to revert to derived
    // behaviour.
    if (!trimmedTitle && !hasDerived) {
      setTitleError("Title is required");
      return;
    }

    // Decide what to persist:
    //  - Case C (cleared)        → trimmed === ""        → persist undefined
    //  - Case B (matches derived)→ trimmed === derived   → persist undefined
    //  - Case A (custom title)   → otherwise             → persist trimmed
    let titleToPersist: string | undefined;
    if (!trimmedTitle) {
      titleToPersist = undefined;
    } else if (hasDerived && trimmedTitle === derived) {
      titleToPersist = undefined;
    } else {
      titleToPersist = trimmedTitle;
    }

    setLoading(true);
    try {
      // Preserve the original activityType for TASK events being
      // edited — the dialog has no task picker, so flipping a task
      // event to TRACKABLE/EVENT here would silently sever the task
      // link. For non-TASK events, derive activityType from the
      // trackable picker as before.
      const isExistingTask = existingEvent?.activityType === "TASK";
      const activityType: "TASK" | "EVENT" | "TRACKABLE" = isExistingTask
        ? "TASK"
        : trackableId
          ? "TRACKABLE"
          : "EVENT";
      const isRecurringInstance =
        !!existingEvent?.isRecurringInstance && !!existingEvent?.recurringEventId;
      const recurrenceChanged = JSON.stringify(recurrence) !== JSON.stringify(existingRule ? ruleToRecurrenceForm(existingRule) : null);
      const fieldsChanged =
        !!existingEvent &&
        (existingEvent.startTimeHHMM !== startTime ||
          existingEvent.startDayYYYYMMDD !== eventDay ||
          Math.round(existingEvent.durationSeconds / 60) !== parseInt(durationMinutes, 10) ||
          (existingEvent.title ?? "") !== (titleToPersist ?? "") ||
          (existingEvent.comments ?? "") !== (comments || "") ||
          (existingEvent.trackableId ?? null) !== (trackableId ?? null));
      if (isRecurringInstance && (fieldsChanged || recurrenceChanged)) {
        setPendingScopeSave({ titleToPersist, activityType });
        setShowRecurringScopeModal(true);
        return;
      }

      await executeSaveWithScope("ALL_INSTANCES", { titleToPersist, activityType });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogOverlay onBackdropPress={onClose} align={isWide ? "center" : "bottom"}>
      <DialogCard desktopWidth={520}>
        <DialogHeader
          title={existingEvent ? "Edit Event" : "New Event"}
          onClose={onClose}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Input
            // Title is only strictly required when there's no derived
            // name to fall back to. When a trackable / list is linked,
            // clearing the field is valid and reverts to derived
            // behaviour (the placeholder shows what will render).
            label={liveDerivedName ? "Title" : "Title *"}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (titleError) setTitleError(null);
            }}
            placeholder={liveDerivedName ?? "Event title"}
            autoFocus
            error={titleError ?? undefined}
          />

          <DateField label="Date" value={eventDay} onChange={setEventDay} />

          <View style={styles.row}>
            <View style={styles.flex1}>
              <Input
                label="Start Time (HH:MM)"
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                autoCapitalize="none"
                containerStyle={{ marginBottom: 0 }}
              />
            </View>
            <View style={styles.flex1}>
              <Input
                label="Duration (minutes)"
                value={durationMinutes}
                onChangeText={setDurationMinutes}
                keyboardType="numeric"
                placeholder="60"
                containerStyle={{ marginBottom: 0 }}
              />
            </View>
          </View>

          <TrackablePicker
            label="Trackable"
            value={trackableId}
            onChange={setTrackableId}
          />

          <Input
            label="Comments"
            value={comments}
            onChangeText={setComments}
            placeholder="Optional comments"
            multiline
          />

          <View style={styles.recurringToggleRow}>
            <Text style={styles.recurringToggleLabel}>Recurring event</Text>
            <Switch
              value={!!recurrence}
              onValueChange={(enabled) => {
                if (!enabled) {
                  setRecurrence(null);
                  return;
                }
                setRecurrence(
                  existingRule ? ruleToRecurrenceForm(existingRule) : defaultRecurrence(eventDay)
                );
              }}
            />
          </View>

          {existingEvent?.isRecurringInstance && existingEvent?.recurringEventId ? (
            <View style={styles.recurringBadge}>
              <Text style={styles.recurringBadgeText}>
                This is a recurring event. Save changes with scope options.
              </Text>
              <Button
                title="Stop recurring from this date"
                variant="outline"
                onPress={async () => {
                  if (!existingRule) return;
                  setLoading(true);
                  try {
                    await stopRecurringRule({
                      id: existingRule._id,
                      effectiveFromYYYYMMDD: eventDay,
                    });
                    onClose();
                  } finally {
                    setLoading(false);
                  }
                }}
              />
            </View>
          ) : null}

          {recurrence ? (
            <RecurrenceSection
              value={recurrence}
              onChange={setRecurrence}
              hideToggle
              hideTimeWindowControls
            />
          ) : null}
        </ScrollView>

        <DialogFooter>
          <Button title="Cancel" variant="outline" onPress={onClose} />
          <Button
            title={existingEvent ? "Save" : "Create"}
            onPress={handleSave}
            loading={loading}
          />
        </DialogFooter>

      {showRecurringScopeModal && pendingScopeSave ? (
        <Pressable
          style={styles.scopeOverlay}
          onPress={(e) => {
            e.stopPropagation?.();
            setShowRecurringScopeModal(false);
            setPendingScopeSave(null);
          }}
        >
          <Pressable
            style={styles.scopeDialog}
            onPress={(e) => e.stopPropagation?.()}
          >
            <Text style={styles.scopeTitle}>Apply changes to recurring event</Text>
            <Text style={styles.scopeBody}>
              Choose how broadly to apply your edits.
            </Text>
            <Button
              title="This instance only"
              variant="outline"
              onPress={async () => {
                setLoading(true);
                try {
                  await executeSaveWithScope("THIS_INSTANCE", pendingScopeSave);
                  setShowRecurringScopeModal(false);
                  onClose();
                } finally {
                  setLoading(false);
                }
              }}
            />
            <Button
              title="This and future instances"
              variant="outline"
              onPress={async () => {
                setLoading(true);
                try {
                  await executeSaveWithScope("THIS_AND_FUTURE", pendingScopeSave);
                  setShowRecurringScopeModal(false);
                  onClose();
                } finally {
                  setLoading(false);
                }
              }}
            />
            <Button
              title="All instances"
              onPress={async () => {
                setLoading(true);
                try {
                  await executeSaveWithScope("ALL_INSTANCES", pendingScopeSave);
                  setShowRecurringScopeModal(false);
                  onClose();
                } finally {
                  setLoading(false);
                }
              }}
            />
          </Pressable>
        </Pressable>
      ) : null}
      </DialogCard>
    </DialogOverlay>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 480 },
  scrollContent: { paddingBottom: 8 },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  flex1: { flex: 1 },
  recurringToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  recurringToggleLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  recurringBadge: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  recurringBadgeText: {
    color: Colors.onPrimaryContainer,
    fontSize: 12,
  },
  scopeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
  },
  scopeDialog: {
    width: 380,
    maxWidth: "92%",
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  scopeTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  scopeBody: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 4,
  },
});
