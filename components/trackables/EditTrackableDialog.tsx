import { FontSize, Radius } from "../../theme/tokens";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { api } from "../../convex/_generated/api";
import { Colors, DEFAULT_ENTITY_COLOUR } from "../../constants/colors";
import { Id } from "../../convex/_generated/dataModel";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { DateField } from "../ui/DateField";
import { ColourSwatchPicker } from "./ColourSwatchPicker";
import {
  DialogOverlay,
  DialogCard,
  DialogHeader,
  DialogFooter,
  DialogMenu,
  type DialogMenuItem,
} from "../ui/DialogScaffold";
import { GoalReasonsForm } from "./goal/GoalReasonsForm";
import {
  GoalAccountabilityForm,
  type GoalAccountabilityValue,
} from "./goal/GoalAccountabilityForm";
import { EditTrackableHistoryTab } from "./EditTrackableHistoryTab";
import { EditTrackableProgressTab } from "./EditTrackableProgressTab";
import { EditTrackableTasksTab } from "./EditTrackableTasksTab";
import { useAuth } from "../../hooks/useAuth";
import { homeHiddenReason } from "../../lib/trackableHomeVisibility";
import { todayYYYYMMDD } from "../../lib/dates";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useDiscardGuard } from "../../hooks/useDiscardGuard";
import { useVisualViewportHeight } from "../../hooks/useVisualViewportHeight";

interface EditTrackableDialogProps {
  trackableId: Id<"trackables">;
  onClose: () => void;
  /**
   * - `dialog` (default): every tab in one popup. Phones use this.
   * - `page`: desktop full page. Progress, tasks and history sit side by
   *   side for looking; an Edit button opens the `settings` dialog.
   * - `settings`: a small dialog with only the editable tabs.
   */
  presentation?: "dialog" | "page" | "settings";
}

const GOAL_SETTINGS_TABS: GoalEditTab[] = [
  "commitment",
  "motivations",
  "accountability",
];

type TrackableType =
  | "NUMBER"
  | "TIME_TRACK"
  | "DAYS_A_WEEK"
  | "MINUTES_A_WEEK"
  | "TRACKER";

type GoalEditTab =
  | "progress"
  | "tasks"
  | "time_tracked"
  | "commitment"
  | "motivations"
  | "accountability";

type TrackerEditTab = "details" | "progress" | "tasks" | "tracking_history";

const GOAL_TAB_DEFS: { key: GoalEditTab; label: string }[] = [
  { key: "progress", label: "Progress" },
  { key: "tasks", label: "Tasks" },
  { key: "time_tracked", label: "Time Tracked" },
  { key: "commitment", label: "My Commitment" },
  { key: "motivations", label: "My Motivations" },
  { key: "accountability", label: "Accountability" },
];

const TRACKER_TAB_DEFS: { key: TrackerEditTab; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "progress", label: "Progress" },
  { key: "tasks", label: "Tasks" },
  { key: "tracking_history", label: "Tracking History" },
];

export function EditTrackableDialog({
  trackableId,
  onClose,
  presentation = "dialog",
}: EditTrackableDialogProps) {
  const settingsOnly = presentation === "settings";
  const [showSettings, setShowSettings] = useState(false);
  const { profileReady } = useAuth();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isDesktop = useIsDesktop();
  // On mobile web the *visual* viewport shrinks when the software keyboard
  // opens; the *layout* viewport does not. Sizing our mobile bottom sheet
  // against the visible area keeps every input reachable while typing.
  // Native uses `KeyboardProvider` + `KeyboardAwareScrollView` for the same
  // effect, so this hook returns `undefined` there and we fall back to
  // `windowHeight`.
  const vvHeight = useVisualViewportHeight();
  const availableHeight = vvHeight ?? windowHeight;
  const trackables = useQuery(
    api.trackables.search,
    profileReady ? {} : "skip",
  );
  const trackable = trackables?.find((t) => t._id === trackableId);
  // The trackable's own task list. The sidebar no longer lists these (it
  // only shows hand-made lists), so this dialog is the way in.
  const allLists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const ownListId = allLists?.find(
    (l) => l.trackableId === trackableId && l.isGoalList && !l.archived,
  )?._id;
  const upsertTrackable = useMutation(api.trackables.upsert);
  const archiveTrackable = useMutation(api.trackables.archive);
  const setShowOnHome = useMutation(api.trackables.setShowOnHome);
  const deleteTrackable = useMutation(api.trackables.remove);

  const [goalTab, setGoalTab] = useState<GoalEditTab>(
    presentation === "settings" ? "commitment" : "progress",
  );
  const [trackerTab, setTrackerTab] = useState<TrackerEditTab>("details");
  const [name, setName] = useState("");
  const [colour, setColour] = useState(DEFAULT_ENTITY_COLOUR);
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [targetCount, setTargetCount] = useState("");
  const [targetHours, setTargetHours] = useState("");
  const [targetDaysAWeek, setTargetDaysAWeek] = useState("");
  const [targetWeeks, setTargetWeeks] = useState("");
  const [targetMinutesAWeek, setTargetMinutesAWeek] = useState("");
  const [trackTime, setTrackTime] = useState(true);
  const [trackCount, setTrackCount] = useState(true);
  const [autoCountFromCalendar, setAutoCountFromCalendar] = useState(true);
  const [isCumulative, setIsCumulative] = useState<boolean | undefined>(true);
  const [isRatingTracker, setIsRatingTracker] = useState(false);
  const [goalReasons, setGoalReasons] = useState<string[]>([]);
  const [accountability, setAccountability] = useState<GoalAccountabilityValue>(
    {}
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setGoalTab(settingsOnly ? "commitment" : "progress");
    setTrackerTab("details");
  }, [trackableId, settingsOnly]);

  // Unsaved-change guard for the accidental ways out (backdrop, Escape, ✕).
  // The baseline is the form as first rendered after loading from the
  // server (see the load effect below, which clears it on every reload).
  const formSnapshot = JSON.stringify([
    name,
    colour,
    startDay,
    endDay,
    targetCount,
    targetHours,
    targetDaysAWeek,
    targetWeeks,
    targetMinutesAWeek,
    trackTime,
    trackCount,
    autoCountFromCalendar,
    isCumulative,
    isRatingTracker,
    goalReasons,
    accountability,
  ]);
  const baselineRef = useRef<string | null>(null);
  const loadedForRef = useRef<unknown>(null);
  if (
    trackable &&
    loadedForRef.current === trackable &&
    baselineRef.current === null
  ) {
    baselineRef.current = formSnapshot;
  }
  const isDirty =
    baselineRef.current !== null && formSnapshot !== baselineRef.current;
  const requestClose = useDiscardGuard(isDirty, onClose);

  useEffect(() => {
    if (!trackable) return;
    loadedForRef.current = trackable;
    baselineRef.current = null;
    setName(trackable.name);
    setColour(trackable.colour);
    setStartDay(trackable.startDayYYYYMMDD);
    setEndDay(trackable.endDayYYYYMMDD);
    if (trackable.trackableType === "TRACKER") {
      setTargetCount("");
      setTargetHours("");
      setTargetDaysAWeek("");
      setTargetWeeks("");
      setTargetMinutesAWeek("");
    } else {
      setTargetCount(trackable.targetCount?.toString() ?? "");
      setTargetHours(trackable.targetNumberOfHours?.toString() ?? "");
      setTargetDaysAWeek(trackable.targetNumberOfDaysAWeek?.toString() ?? "");
      setTargetWeeks(trackable.targetNumberOfWeeks?.toString() ?? "");
      setTargetMinutesAWeek(
        trackable.targetNumberOfMinutesAWeek?.toString() ?? ""
      );
    }
    setTrackTime(trackable.trackTime ?? true);
    setTrackCount(trackable.trackCount ?? true);
    setAutoCountFromCalendar(trackable.autoCountFromCalendar ?? true);
    setIsCumulative(trackable.isCumulative);
    setIsRatingTracker(trackable.isRatingTracker ?? false);
    setGoalReasons(
      trackable.goalReasons?.length ? [...trackable.goalReasons] : []
    );
    setAccountability({
      willAcceptPenalty: trackable.willAcceptPenalty,
      willDonateToCharity: trackable.willDonateToCharity,
      donateMoneyCharityAmount: trackable.donateMoneyCharityAmount,
      willSendMoneyToAFriend: trackable.willSendMoneyToAFriend,
      sendMoneyFriendAmount: trackable.sendMoneyFriendAmount,
      sendMoneyFriendName: trackable.sendMoneyFriendName,
      willPostOnSocialMedia: trackable.willPostOnSocialMedia,
      willShaveHead: trackable.willShaveHead,
      otherPenaltySelected: trackable.otherPenaltySelected,
      otherPenalties: trackable.otherPenalties?.length
        ? [...trackable.otherPenalties]
        : [],
    });
  }, [trackable]);

  if (!trackable) return null;

  const trackableType = trackable.trackableType as TrackableType;
  const isGoal = trackableType !== "TRACKER";

  /**
   * Save shows on every tab that holds editable form state: commitment
   * (details), motivations and accountability. Accountability used to be
   * left out, so its changes were only saved if you happened to press Save
   * on another tab.
   */
  const showSaveFooter =
    isGoal
      ? goalTab === "commitment" ||
        goalTab === "motivations" ||
        goalTab === "accountability"
      : trackerTab === "details";

  const cardFlexStyle: ViewStyle[] = [
    Platform.OS === "web"
      ? ({
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        } as ViewStyle)
      : {},
    // Desktop: one fixed height for every tab. Sizing the card to its
    //   content made the dialog grow, shrink and re-centre on each tab
    //   change, moving the tab bar out from under the pointer. Short tabs
    //   leave space below; long ones scroll inside the body.
    // Mobile: use a **fixed** height (not maxHeight). Without a concrete
    //   height, the inner `dialogFill: flex:1` → `dialogBody: flex:1`
    //   chain collapses to zero on native, so the bottom sheet appears as
    //   just the header. This matches the pattern used in `TaskDetailSheet`.
    //   Use `availableHeight` (visual viewport) so the sheet also shrinks
    //   when the keyboard opens on mobile web.
    isDesktop
      ? { height: Math.min(availableHeight * 0.9, settingsOnly ? 600 : 700) }
      : { height: availableHeight * 0.92 },
  ];

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (
      trackableType === "TRACKER" &&
      trackCount &&
      isCumulative === undefined
    ) {
      return;
    }

    const cleanedReasons = goalReasons.map((r) => r.trim()).filter((r) => r);
    const cleanedPenalties = (accountability.otherPenalties ?? [])
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    setLoading(true);
    try {
      await upsertTrackable({
        id: trackableId,
        name: trimmed,
        colour,
        trackableType: trackable.trackableType,
        frequency: trackable.frequency,
        startDayYYYYMMDD: startDay || trackable.startDayYYYYMMDD,
        endDayYYYYMMDD: endDay || trackable.endDayYYYYMMDD,
        targetCount:
          trackableType === "TRACKER"
            ? undefined
            : targetCount
              ? parseInt(targetCount, 10)
              : undefined,
        targetNumberOfHours:
          trackableType === "TRACKER"
            ? undefined
            : targetHours
              ? parseInt(targetHours, 10)
              : undefined,
        targetNumberOfDaysAWeek:
          trackableType === "TRACKER"
            ? undefined
            : targetDaysAWeek
              ? parseInt(targetDaysAWeek, 10)
              : undefined,
        targetNumberOfWeeks:
          trackableType === "TRACKER"
            ? undefined
            : targetWeeks.trim()
              ? parseInt(targetWeeks, 10)
              : trackable.targetNumberOfWeeks,
        targetNumberOfMinutesAWeek:
          trackableType === "TRACKER"
            ? undefined
            : targetMinutesAWeek
              ? parseInt(targetMinutesAWeek, 10)
              : undefined,
        isCumulative,
        trackTime,
        trackCount,
        autoCountFromCalendar,
        isRatingTracker,
        ...(isGoal
          ? {
              goalReasons: cleanedReasons.length > 0 ? cleanedReasons : [],
              willAcceptPenalty: accountability.willAcceptPenalty,
              willDonateToCharity: accountability.willDonateToCharity,
              donateMoneyCharityAmount: accountability.donateMoneyCharityAmount,
              willSendMoneyToAFriend: accountability.willSendMoneyToAFriend,
              sendMoneyFriendAmount: accountability.sendMoneyFriendAmount,
              sendMoneyFriendName: accountability.sendMoneyFriendName,
              willPostOnSocialMedia: accountability.willPostOnSocialMedia,
              willShaveHead: accountability.willShaveHead,
              otherPenaltySelected: accountability.otherPenaltySelected,
              otherPenalties:
                cleanedPenalties.length > 0 ? cleanedPenalties : [],
            }
          : {}),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    await archiveTrackable({ id: trackableId });
    onClose();
  };

  const confirmDelete = () => {
    const doDelete = async () => {
      await deleteTrackable({ id: trackableId });
      onClose();
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${trackable.name}" permanently?`)) {
        void doDelete();
      }
      return;
    }
    Alert.alert(
      "Delete trackable",
      "This will permanently delete this trackable and all related data.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void doDelete() },
      ]
    );
  };

  /** `my-commitment-form-*` parity — trackers never show numeric targets/dates here. */
  const renderMyCommitmentBody = () => (
    <>
      <Input label="Name" value={name} onChangeText={setName} placeholder="Name" />

      <View style={styles.fieldBlock}>
        <ColourSwatchPicker value={colour} onChange={setColour} label="Color" />
      </View>

      {isGoal ? (
        <View style={styles.row}>
          <View style={styles.flex1}>
            <DateField label="Start Date" value={startDay} onChange={setStartDay} />
          </View>
          <View style={styles.flex1}>
            <DateField label="End Date" value={endDay} onChange={setEndDay} />
          </View>
        </View>
      ) : null}

      {isGoal && trackableType === "NUMBER" ? (
        <Input
          label="Target Count"
          value={targetCount}
          onChangeText={setTargetCount}
          keyboardType="numeric"
          placeholder="e.g. 100"
        />
      ) : null}

      {isGoal && trackableType === "TIME_TRACK" ? (
        <Input
          label="Target Hours"
          value={targetHours}
          onChangeText={setTargetHours}
          keyboardType="numeric"
          placeholder="e.g. 50"
        />
      ) : null}

      {isGoal && trackableType === "DAYS_A_WEEK" ? (
        <>
          <Input
            label="Target Days per Week"
            value={targetDaysAWeek}
            onChangeText={setTargetDaysAWeek}
            keyboardType="numeric"
            placeholder="e.g. 5"
          />
          <Input
            label="Target Number of Weeks"
            value={targetWeeks}
            onChangeText={setTargetWeeks}
            keyboardType="numeric"
            placeholder="e.g. 8"
          />
        </>
      ) : null}

      {isGoal && trackableType === "MINUTES_A_WEEK" ? (
        <Input
          label="Target Minutes per Week"
          value={targetMinutesAWeek}
          onChangeText={setTargetMinutesAWeek}
          keyboardType="numeric"
          placeholder="e.g. 300"
        />
      ) : null}

      {trackableType === "TRACKER" ? (
        <View style={styles.trackerBlock}>
          <CheckboxRow
            label="Track time"
            checked={trackTime}
            onToggle={() => setTrackTime((v) => !v)}
          />
          <CheckboxRow
            label="Track value"
            checked={trackCount}
            onToggle={() => setTrackCount((v) => !v)}
          />
          {trackCount ? (
            <View style={styles.indent}>
              <CheckboxRow
                label="Increase value by 1 for each calendar occurrence"
                checked={autoCountFromCalendar}
                onToggle={() => setAutoCountFromCalendar((v) => !v)}
              />
              <Text style={styles.groupLabel}>Value tracking type</Text>
              <View style={styles.choiceRow}>
                <ChoiceChip
                  title="Cumulative"
                  subtitle="Values add up over time"
                  selected={isCumulative === true}
                  onPress={() => {
                    setIsCumulative(true);
                    setIsRatingTracker(false);
                  }}
                />
                <ChoiceChip
                  title="Rating"
                  subtitle="Values recorded at a point in time"
                  selected={isCumulative === false}
                  onPress={() => {
                    setIsCumulative(false);
                    setIsRatingTracker(true);
                  }}
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const coercePreviewInt = (
    raw: string,
    fallback?: number
  ): number | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") return fallback;
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  /** Shared by the goal "Progress" tab and the tracker "Progress" tab. */
  const renderProgressTabPane = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <EditTrackableProgressTab
        trackable={{
          _id: trackableId,
          trackableType,
          name: trackable.name,
          colour: trackable.colour,
          startDayYYYYMMDD: trackable.startDayYYYYMMDD,
          endDayYYYYMMDD: trackable.endDayYYYYMMDD,
          targetCount: coercePreviewInt(targetCount, trackable.targetCount),
          targetNumberOfHours: coercePreviewInt(
            targetHours,
            trackable.targetNumberOfHours
          ),
          targetNumberOfDaysAWeek: coercePreviewInt(
            targetDaysAWeek,
            trackable.targetNumberOfDaysAWeek
          ),
          targetNumberOfMinutesAWeek: coercePreviewInt(
            targetMinutesAWeek,
            trackable.targetNumberOfMinutesAWeek
          ),
          targetNumberOfWeeks: coercePreviewInt(
            targetWeeks,
            trackable.targetNumberOfWeeks
          ),
          trackCount: trackable.trackCount ?? undefined,
          trackTime: trackable.trackTime ?? undefined,
          isRatingTracker: trackable.isRatingTracker ?? undefined,
        }}
      />
    </ScrollView>
  );

  const renderGoalTabContents = () => {
    switch (goalTab) {
      case "progress":
        return renderProgressTabPane();
      case "tasks":
        return <EditTrackableTasksTab trackableId={trackableId} />;
      case "time_tracked":
        return (
          <View style={styles.historyTabPane}>
            <EditTrackableHistoryTab
              trackableId={trackableId}
              trackTime={trackTime}
              trackCount={trackCount}
              autoCountFromCalendar={autoCountFromCalendar}
            />
          </View>
        );
      case "commitment":
        return (
          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            bottomOffset={120}
            // Hide the vertical scrollbar so it doesn't overlap inputs
            // below (RN draws the indicator inside the viewport).
            showsVerticalScrollIndicator={false}
          >
            {renderMyCommitmentBody()}
          </KeyboardAwareScrollView>
        );
      case "motivations":
        return (
          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            bottomOffset={120}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.subsectionTitle}>
              Why is this important to me?
            </Text>
            <GoalReasonsForm
              value={{ reasons: goalReasons }}
              onChange={(v) => setGoalReasons(v.reasons)}
            />
          </KeyboardAwareScrollView>
        );
      case "accountability":
        return (
          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            bottomOffset={120}
            showsVerticalScrollIndicator={false}
          >
            <GoalAccountabilityForm
              value={accountability}
              onChange={setAccountability}
            />
          </KeyboardAwareScrollView>
        );
      default:
        return null;
    }
  };

  const renderTrackerTabContents = () => {
    if (trackerTab === "details") {
      return (
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bottomOffset={120}
          // Hide the vertical scrollbar so it doesn't overlap inputs
          // below (RN draws the indicator inside the viewport).
          showsVerticalScrollIndicator={false}
        >
          {renderMyCommitmentBody()}
        </KeyboardAwareScrollView>
      );
    }
    if (trackerTab === "progress") {
      return renderProgressTabPane();
    }
    if (trackerTab === "tasks") {
      return <EditTrackableTasksTab trackableId={trackableId} />;
    }
    return (
      <View style={styles.historyTabPane}>
        <EditTrackableHistoryTab
          trackableId={trackableId}
          trackTime={trackTime}
          trackCount={trackCount}
          autoCountFromCalendar={autoCountFromCalendar}
        />
      </View>
    );
  };

  // Occasional and destructive actions live in one labelled menu, in the
  // dialog header and on the page alike. The footer keeps Cancel and Save.
  // Mirrors the home column's own rule, so a goal that dropped off home
  // because it ended reads as "not on home" and one tap brings it back.
  const isOnHome = homeHiddenReason(trackable, todayYYYYMMDD()) === null;
  const menuItems: DialogMenuItem[] = [
    ...(ownListId
      ? [
          {
            label: "Open task list",
            icon: "list-outline" as const,
            onPress: () => {
              onClose();
              router.push(`/(app)/lists/${ownListId}`);
            },
          },
        ]
      : []),
    ...(!trackable.archived
      ? [
          {
            label: isOnHome ? "Hide from Home" : "Show on Home",
            icon: (isOnHome ? "home" : "home-outline") as "home" | "home-outline",
            onPress: () =>
              void setShowOnHome({ id: trackableId, showOnHome: !isOnHome }),
          },
        ]
      : []),
    {
      label: trackable.archived ? "Unarchive" : "Archive",
      icon: "archive-outline",
      onPress: handleArchive,
    },
    {
      label: "Delete trackable",
      icon: "trash-outline",
      onPress: confirmDelete,
      destructive: true,
    },
  ];

  const historyPane = (
    <View style={styles.historyTabPane}>
      <EditTrackableHistoryTab
        trackableId={trackableId}
        trackTime={trackTime}
        trackCount={trackCount}
        autoCountFromCalendar={autoCountFromCalendar}
      />
    </View>
  );

  if (presentation === "page") {
    /** Too narrow for three readable columns beside the sidebar. */
    const pageStacked = windowWidth < 1180;
    const pageColStyle = pageStacked ? styles.pageColStacked : styles.pageCol;
    return (
      <View style={styles.page}>
        <View style={styles.pageHeader}>
          <Pressable
            onPress={onClose}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={6}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={Colors.textSecondary}
            />
          </Pressable>
          <View
            style={[styles.pageDot, { backgroundColor: trackable.colour }]}
          />
          <Text style={styles.pageTitle} numberOfLines={1}>
            {trackable.name}
          </Text>
          <Button
            title="Edit"
            variant="outline"
            size="small"
            onPress={() => setShowSettings(true)}
          />
          <DialogMenu items={menuItems} />
        </View>

        {/* Three things to look at, side by side, each scrolling on its
            own. On a narrow window they stack and the page scrolls. */}
        <ScrollView
          style={styles.pageColumnsScroll}
          contentContainerStyle={
            pageStacked ? styles.pageColumnsStacked : styles.pageColumns
          }
          scrollEnabled={pageStacked}
        >
          <View style={pageColStyle}>
            <Text style={styles.pageColTitle}>Progress</Text>
            {renderProgressTabPane()}
          </View>
          <View style={pageColStyle}>
            <Text style={styles.pageColTitle}>Tasks</Text>
            <EditTrackableTasksTab trackableId={trackableId} />
          </View>
          <View style={[pageColStyle, !pageStacked && styles.pageColWide]}>
            <Text style={styles.pageColTitle}>
              {isGoal ? "Time tracked" : "Tracking history"}
            </Text>
            {historyPane}
          </View>
        </ScrollView>

        {showSettings && (
          <EditTrackableDialog
            trackableId={trackableId}
            presentation="settings"
            onClose={() => setShowSettings(false)}
          />
        )}
      </View>
    );
  }

  const goalTabs = settingsOnly
    ? GOAL_TAB_DEFS.filter((t) => GOAL_SETTINGS_TABS.includes(t.key))
    : GOAL_TAB_DEFS;
  // A tracker's settings are a single form, so it needs no tab bar.
  const showTabBar = isGoal || !settingsOnly;

  return (
    <DialogOverlay
      onBackdropPress={requestClose}
      align={isDesktop ? "center" : "bottom"}
    >
      <DialogCard desktopWidth={settingsOnly ? 560 : 640} style={cardFlexStyle}>
        <View style={styles.dialogFill}>
          <DialogHeader
            title={settingsOnly ? `Edit ${trackable.name}` : trackable.name}
            colour={trackable.colour}
            onClose={requestClose}
            headerActions={
              settingsOnly ? undefined : <DialogMenu items={menuItems} />
            }
          />

          {showTabBar ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabBarScroll}
              contentContainerStyle={styles.tabBarContent}
              keyboardShouldPersistTaps="handled"
            >
              {isGoal
                ? goalTabs.map(({ key, label }) => (
                    <Pressable
                      key={key}
                      style={[styles.tab, goalTab === key && styles.tabActive]}
                      onPress={() => setGoalTab(key)}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          goalTab === key && styles.tabTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))
                : TRACKER_TAB_DEFS.map(({ key, label }) => (
                    <Pressable
                      key={key}
                      style={[
                        styles.tab,
                        trackerTab === key && styles.tabActive,
                      ]}
                      onPress={() => setTrackerTab(key)}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          trackerTab === key && styles.tabTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
            </ScrollView>
          ) : null}

          {/* Fills whatever the fixed-height card leaves between the tab
              bar and the footer, on desktop and mobile alike. */}
          <View style={styles.dialogBody}>
            {isGoal ? renderGoalTabContents() : renderTrackerTabContents()}
          </View>

          <DialogFooter>
            {/* "Cancel" only means something beside Save; tabs that save
                as you go (or are read-only) get "Close". */}
            <Button
              title={showSaveFooter ? "Cancel" : "Close"}
              variant="ghost"
              onPress={onClose}
              size="small"
            />
            {showSaveFooter ? (
              <Button
                title="Save"
                onPress={handleSave}
                loading={loading}
                size="small"
              />
            ) : null}
          </DialogFooter>
        </View>
      </DialogCard>
    </DialogOverlay>
  );
}

function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.checkboxRow}>
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={20}
        color={checked ? Colors.primary : Colors.textSecondary}
      />
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function ChoiceChip({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.choiceChip, selected && styles.choiceChipSelected]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.choiceChipTitle,
          selected && styles.choiceChipTitleSelected,
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.choiceChipSubtitle,
          selected && styles.choiceChipSubtitleSelected,
        ]}
      >
        {subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dialogFill: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: "100%",
    ...(Platform.OS === "web"
      ? ({ display: "flex", flexDirection: "column" } as ViewStyle)
      : {}),
  },
  dialogBody: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: "100%",
  },
  // Pushes the destructive footer button leftward and pins Cancel/Save to
  // the right — mirrors the pattern used by `ListDialog` and
  // `TaskDetailSheet` so every dialog's destructive action lives in
  // the same visual slot.
  footerSpacer: { flex: 1 },
  page: { flex: 1, minHeight: 0, backgroundColor: Colors.background },
  pageHeader: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 8,
    paddingRight: 16,
    // Above the columns, so the menu can drop over them.
    zIndex: 10,
  },
  pageDot: { width: 10, height: 10, borderRadius: Radius.pill },
  pageTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.title,
    fontWeight: "600",
    color: Colors.text,
  },
  pageColumnsScroll: { flex: 1, minHeight: 0 },
  // Side by side: the row is exactly as tall as the viewport, so each
  // column scrolls inside itself.
  pageColumns: {
    flex: 1,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  pageColumnsStacked: { gap: 16, paddingHorizontal: 16, paddingBottom: 16 },
  pageCol: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerLow,
  },
  // The history table has the most columns.
  pageColWide: { flex: 1.3 },
  pageColStacked: {
    height: 440,
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerLow,
  },
  pageColTitle: {
    fontSize: FontSize.bodyLarge,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 12,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  tabBarScroll: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  tabBarContent: {
    flexDirection: "row",
    alignItems: "stretch",
    minWidth: "100%",
  },
  tab: {
    flexGrow: 0,
    flexShrink: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  tabTextActive: { color: Colors.primary, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8, flexGrow: 1 },
  historyTabPane: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingHorizontal: 8,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? ({ direction: "ltr" } as ViewStyle)
      : ({} as ViewStyle)),
  },
  fieldBlock: { marginBottom: 16 },
  row: { flexDirection: "row", gap: 12, marginBottom: 4 },
  flex1: { flex: 1 },
  subsectionTitle: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
  },
  trackerBlock: {
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radius.md,
    padding: 10,
    gap: 10,
    marginTop: 4,
  },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkboxLabel: { color: Colors.text, fontSize: FontSize.body, flex: 1 },
  indent: { marginLeft: 24, gap: 10 },
  groupLabel: { color: Colors.textSecondary, fontSize: FontSize.body, fontWeight: "600" },
  choiceRow: { flexDirection: "row", gap: 8 },
  choiceChip: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainer,
    padding: 10,
    gap: 2,
  },
  choiceChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryContainer,
  },
  choiceChipTitle: { color: Colors.text, fontWeight: "600", fontSize: FontSize.body },
  choiceChipTitleSelected: { color: Colors.onPrimaryContainer },
  choiceChipSubtitle: { color: Colors.textSecondary, fontSize: FontSize.caption },
  choiceChipSubtitleSelected: { color: Colors.onPrimaryContainer },
});
