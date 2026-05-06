import React, { useEffect, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Id } from "../../convex/_generated/dataModel";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { DateField } from "../ui/DateField";
import { ColourSwatchPicker } from "./ColourSwatchPicker";
import {
  DialogOverlay,
  DialogCard,
  DialogFooter,
  DialogHeader,
} from "../ui/DialogScaffold";
import { GoalReasonsForm } from "./goal/GoalReasonsForm";
import {
  GoalAccountabilityForm,
  type GoalAccountabilityValue,
} from "./goal/GoalAccountabilityForm";
import { EditTrackableHistoryTab } from "./EditTrackableHistoryTab";
import { EditTrackableProgressTab } from "./EditTrackableProgressTab";
import { useAuth } from "../../hooks/useAuth";

interface EditTrackableDialogProps {
  trackableId: Id<"trackables">;
  onClose: () => void;
}

type TrackableType =
  | "NUMBER"
  | "TIME_TRACK"
  | "DAYS_A_WEEK"
  | "MINUTES_A_WEEK"
  | "TRACKER";

type GoalEditTab =
  | "progress"
  | "time_tracked"
  | "commitment"
  | "motivations"
  | "accountability";

type TrackerEditTab = "details" | "tracking_history";

const GOAL_TAB_DEFS: { key: GoalEditTab; label: string }[] = [
  { key: "progress", label: "Progress" },
  { key: "time_tracked", label: "Time Tracked" },
  { key: "commitment", label: "My Commitment" },
  { key: "motivations", label: "My Motivations" },
  { key: "accountability", label: "Accountability" },
];

const TRACKER_TAB_DEFS: { key: TrackerEditTab; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "tracking_history", label: "Tracking History" },
];

export function EditTrackableDialog({
  trackableId,
  onClose,
}: EditTrackableDialogProps) {
  const { profileReady } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const trackables = useQuery(
    api.trackables.search,
    profileReady ? {} : "skip",
  );
  const trackable = trackables?.find((t) => t._id === trackableId);
  const upsertTrackable = useMutation(api.trackables.upsert);
  const archiveTrackable = useMutation(api.trackables.archive);
  const deleteTrackable = useMutation(api.trackables.remove);

  const [goalTab, setGoalTab] = useState<GoalEditTab>("progress");
  const [trackerTab, setTrackerTab] = useState<TrackerEditTab>("details");
  const [name, setName] = useState("");
  const [colour, setColour] = useState("#4A90D9");
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
    setGoalTab("progress");
    setTrackerTab("details");
  }, [trackableId]);

  useEffect(() => {
    if (!trackable) return;
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

  /** Productivity-one: primary Save lives on the commitment/edit tab, not on history. */
  const showSaveFooter =
    isGoal ? goalTab === "commitment" : trackerTab === "details";

  const cardFlexStyle: ViewStyle[] = [
    Platform.OS === "web"
      ? ({
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        } as ViewStyle)
      : {},
    {
      maxHeight: Math.min(windowHeight * 0.9, 840),
    },
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

  const renderGoalTabContents = () => {
    switch (goalTab) {
      case "progress":
        return (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <EditTrackableProgressTab trackable={{
              _id: trackableId,
              trackableType: trackableType as
                | "NUMBER"
                | "TIME_TRACK"
                | "DAYS_A_WEEK"
                | "MINUTES_A_WEEK",
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
            }} />
          </ScrollView>
        );
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
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {renderMyCommitmentBody()}
          </ScrollView>
        );
      case "motivations":
        return (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.subsectionTitle}>
              Why is this important to me?
            </Text>
            <GoalReasonsForm
              value={{ reasons: goalReasons }}
              onChange={(v) => setGoalReasons(v.reasons)}
            />
          </ScrollView>
        );
      case "accountability":
        return (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <GoalAccountabilityForm
              value={accountability}
              onChange={setAccountability}
            />
          </ScrollView>
        );
      default:
        return null;
    }
  };

  const renderTrackerTabContents = () => {
    if (trackerTab === "details") {
      return (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {renderMyCommitmentBody()}
        </ScrollView>
      );
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

  const headerActions = (
    <>
      <Pressable
        style={styles.headerIconBtn}
        onPress={handleArchive}
        accessibilityRole="button"
        accessibilityLabel={
          trackable.archived ? "Unarchive trackable" : "Archive trackable"
        }
        hitSlop={6}
      >
        <Ionicons
          name="archive-outline"
          size={22}
          color={Colors.textSecondary}
        />
      </Pressable>
      <Pressable
        style={styles.headerIconBtn}
        onPress={confirmDelete}
        accessibilityRole="button"
        accessibilityLabel="Delete trackable"
        hitSlop={6}
      >
        <Ionicons name="trash-outline" size={22} color={Colors.textSecondary} />
      </Pressable>
    </>
  );

  return (
    <DialogOverlay onBackdropPress={onClose} align="center">
      <DialogCard desktopWidth={640} style={cardFlexStyle}>
        <View style={styles.dialogFill}>
          <DialogHeader
            title={trackable.name}
            onClose={onClose}
            headerActions={headerActions}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabBarScroll}
            contentContainerStyle={styles.tabBarContent}
            keyboardShouldPersistTaps="handled"
          >
            {isGoal
              ? GOAL_TAB_DEFS.map(({ key, label }) => (
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
                    style={[styles.tab, trackerTab === key && styles.tabActive]}
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

          <View
            style={[
              styles.dialogBody,
              { maxHeight: Math.min(windowHeight * 0.62, 520) },
            ]}
          >
            {isGoal ? renderGoalTabContents() : renderTrackerTabContents()}
          </View>

          <DialogFooter>
            <Button title="Cancel" variant="ghost" onPress={onClose} />
            {showSaveFooter ? (
              <Button title="Save" onPress={handleSave} loading={loading} />
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
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    paddingHorizontal: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  tabTextActive: { color: Colors.primary, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8, flexGrow: 1 },
  historyTabPane: {
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  fieldBlock: { marginBottom: 16 },
  row: { flexDirection: "row", gap: 12, marginBottom: 4 },
  flex1: { flex: 1 },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
  },
  trackerBlock: {
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    padding: 10,
    gap: 10,
    marginTop: 4,
  },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkboxLabel: { color: Colors.text, fontSize: 14, flex: 1 },
  indent: { marginLeft: 28, gap: 10 },
  groupLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600" },
  choiceRow: { flexDirection: "row", gap: 8 },
  choiceChip: {
    flex: 1,
    borderRadius: 8,
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
  choiceChipTitle: { color: Colors.text, fontWeight: "600", fontSize: 13 },
  choiceChipTitleSelected: { color: Colors.onPrimaryContainer },
  choiceChipSubtitle: { color: Colors.textSecondary, fontSize: 12 },
  choiceChipSubtitleSelected: { color: Colors.onPrimaryContainer },
});
