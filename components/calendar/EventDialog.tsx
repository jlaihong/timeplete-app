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
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { MaterialIcons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { DateField } from "../ui/DateField";
import { TrackablePicker } from "../tasks/TrackablePicker";
import { Id } from "../../convex/_generated/dataModel";

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
  };
  /**
   * Pre-fill values when opening for a brand-new event (e.g. populated
   * from a click-and-drag gesture on the calendar). Ignored when
   * `existingEvent` is supplied.
   */
  defaultStartTimeHHMM?: string;
  defaultDurationMinutes?: number;
}

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

  const upsertTimeWindow = useMutation(api.timeWindows.upsert);

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
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

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

      await upsertTimeWindow({
        id: existingEvent?._id as Id<"timeWindows"> | undefined,
        startTimeHHMM: startTime,
        startDayYYYYMMDD: eventDay,
        durationSeconds: parseInt(durationMinutes, 10) * 60,
        // BudgetType is fixed — the BUDGETED branch is legacy and not
        // exposed in the UI.
        budgetType: "ACTUAL",
        activityType,
        // Preserve task / list links across edits (the dialog only
        // exposes the trackable picker today; the other links flow
        // through unchanged so we don't accidentally drop them).
        taskId:
          (existingEvent?.taskId as Id<"tasks"> | null | undefined) ??
          undefined,
        trackableId: trackableId ?? undefined,
        listId:
          (existingEvent?.listId as Id<"lists"> | null | undefined) ??
          undefined,
        title: titleToPersist,
        comments: comments || undefined,
        timeZone: tz,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      style={[
        styles.overlay,
        isWide ? styles.overlayDesktop : styles.overlayMobile,
      ]}
      onPress={onClose}
    >
      <Pressable
        // Stop the inner card from bubbling clicks to the backdrop —
        // otherwise typing in the inputs would dismiss the dialog.
        onPress={(e) => e.stopPropagation?.()}
        style={[
          styles.dialog,
          isWide ? styles.dialogDesktop : styles.dialogMobile,
        ]}
      >
        {/* Top-right close X — same pattern as AddTrackableFlow. */}
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityLabel="Close dialog"
          hitSlop={8}
        >
          <MaterialIcons name="close" size={20} color={Colors.text} />
        </Pressable>

        <Text style={styles.title}>
          {existingEvent ? "Edit Event" : "New Event"}
        </Text>

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
        </ScrollView>

        <View style={styles.actions}>
          <Button title="Cancel" variant="outline" onPress={onClose} />
          <Button
            title={existingEvent ? "Save" : "Create"}
            onPress={handleSave}
            loading={loading}
          />
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 1000,
    // On web, escape any positioned ancestor (e.g. the narrow side
    // column on DesktopHome) so the overlay always covers the full
    // viewport — matches AddTrackableFlow's overlay strategy.
    ...Platform.select({
      web: { position: "fixed" as any },
      default: {},
    }),
  },
  overlayMobile: { justifyContent: "flex-end" },
  overlayDesktop: { justifyContent: "center", alignItems: "center" },
  dialog: {
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 8px 32px rgba(0,0,0,0.5)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 32,
        elevation: 12,
      },
    }),
  },
  dialogMobile: {
    width: "100%",
    maxHeight: "92%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  dialogDesktop: {
    width: 520,
    maxWidth: "94%",
    maxHeight: "90%",
    borderRadius: 12,
    padding: 24,
  },
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 16,
    paddingRight: 24, // leave room for close X
  },
  scroll: { maxHeight: 480 },
  scrollContent: { paddingBottom: 8 },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  flex1: { flex: 1 },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
});
