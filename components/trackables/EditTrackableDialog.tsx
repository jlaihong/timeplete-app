import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
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

type EditTab = "details" | "tracking_history";

export function EditTrackableDialog({
  trackableId,
  onClose,
}: EditTrackableDialogProps) {
  const trackables = useQuery(api.trackables.search, {});
  const trackable = trackables?.find((t) => t._id === trackableId);
  const upsertTrackable = useMutation(api.trackables.upsert);
  const archiveTrackable = useMutation(api.trackables.archive);
  const deleteTrackable = useMutation(api.trackables.remove);

  const [activeTab, setActiveTab] = useState<EditTab>("details");
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
    setActiveTab("details");
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
    setTrackTime(trackable.trackTime);
    setTrackCount(trackable.trackCount);
    setAutoCountFromCalendar(trackable.autoCountFromCalendar);
    setIsCumulative(trackable.isCumulative);
    setIsRatingTracker(trackable.isRatingTracker);
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
  }, [trackable?._id]);

  if (!trackable) return null;

  const trackableType = trackable.trackableType as TrackableType;
  const isGoal = trackableType !== "TRACKER";

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trackableType === "TRACKER" && trackCount && isCumulative === undefined) {
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

  const renderDetailsForm = () => (
    <>
      <Input
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Trackable name"
        autoFocus
      />

      <View style={styles.fieldBlock}>
        <ColourSwatchPicker value={colour} onChange={setColour} label="Color" />
      </View>

      <Text style={styles.typeLabel}>
        Type: {trackableType.replace(/_/g, " ").toLowerCase()}
      </Text>

      {trackableType !== "TRACKER" ? (
        <View style={styles.row}>
          <View style={styles.flex1}>
            <DateField label="Start Date" value={startDay} onChange={setStartDay} />
          </View>
          <View style={styles.flex1}>
            <DateField label="End Date" value={endDay} onChange={setEndDay} />
          </View>
        </View>
      ) : null}

      {isGoal && trackableType === "NUMBER" && (
        <Input
          label="Target Count"
          value={targetCount}
          onChangeText={setTargetCount}
          keyboardType="numeric"
          placeholder="e.g. 100"
        />
      )}

      {isGoal && trackableType === "TIME_TRACK" && (
        <Input
          label="Target Hours"
          value={targetHours}
          onChangeText={setTargetHours}
          keyboardType="numeric"
          placeholder="e.g. 50"
        />
      )}

      {isGoal && trackableType === "DAYS_A_WEEK" && (
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
      )}

      {isGoal && trackableType === "MINUTES_A_WEEK" && (
        <Input
          label="Target Minutes per Week"
          value={targetMinutesAWeek}
          onChangeText={setTargetMinutesAWeek}
          keyboardType="numeric"
          placeholder="e.g. 300"
        />
      )}

      {trackableType === "TRACKER" && (
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
      )}

      {isGoal ? (
        <View style={styles.goalExtras}>
          <Text style={styles.subsectionTitle}>
            Why is this important to me?
          </Text>
          <GoalReasonsForm
            value={{ reasons: goalReasons }}
            onChange={(v) => setGoalReasons(v.reasons)}
          />

          <Text style={[styles.subsectionTitle, { marginTop: 20 }]}>
            Accountability
          </Text>
          <GoalAccountabilityForm
            value={accountability}
            onChange={setAccountability}
          />
        </View>
      ) : null}
    </>
  );

  return (
    <DialogOverlay onBackdropPress={onClose} align="center">
      <DialogCard desktopWidth={560}>
        <DialogHeader title="Edit Trackable" onClose={onClose} />

        <View style={styles.tabBar}>
          {(["details", "tracking_history"] as const).map((tab) => (
            <Pressable
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
                {tab === "details" ? "Details" : "Tracking History"}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === "details" ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {renderDetailsForm()}
          </ScrollView>
        ) : (
          <View style={styles.historyTabPane}>
            <EditTrackableHistoryTab
              trackableId={trackableId}
              trackableType={trackableType}
              startDayYYYYMMDD={startDay || trackable.startDayYYYYMMDD}
              endDayYYYYMMDD={endDay || trackable.endDayYYYYMMDD}
              trackTime={trackTime}
              trackCount={trackCount}
              autoCountFromCalendar={autoCountFromCalendar}
            />
          </View>
        )}

        <DialogFooter>
          <Button title="Delete" variant="outline" onPress={confirmDelete} />
          <Button
            title={trackable.archived ? "Unarchive" : "Archive"}
            variant="outline"
            onPress={handleArchive}
          />
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button title="Save" onPress={handleSave} loading={loading} />
        </DialogFooter>
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
      <Text style={[styles.choiceChipTitle, selected && styles.choiceChipTitleSelected]}>
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
  scroll: { maxHeight: 500 },
  scrollContent: { paddingBottom: 8 },
  historyTabPane: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingHorizontal: 8,
    minHeight: 200,
    overflow: "hidden",
  },
  fieldBlock: { marginBottom: 16 },
  row: { flexDirection: "row", gap: 12, marginBottom: 4 },
  flex1: { flex: 1 },
  typeLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    textTransform: "capitalize",
    marginBottom: 10,
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
  },
  goalExtras: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.outlineVariant },
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
