import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Card } from "../../../components/ui/Card";
import { ColorPicker } from "../../../components/ui/ColorPicker";
import { Id } from "../../../convex/_generated/dataModel";

export default function EditTrackableScreen() {
  const { trackableId } = useLocalSearchParams<{ trackableId: string }>();

  const trackables = useQuery(api.trackables.search, {});
  const trackable = trackables?.find((t) => t._id === trackableId);
  const upsertTrackable = useMutation(api.trackables.upsert);
  const archiveTrackable = useMutation(api.trackables.archive);
  const deleteTrackable = useMutation(api.trackables.remove);

  const [name, setName] = useState("");
  const [colour, setColour] = useState("#4A90D9");
  const [targetCount, setTargetCount] = useState("");
  const [targetHours, setTargetHours] = useState("");
  const [targetDaysAWeek, setTargetDaysAWeek] = useState("");
  const [targetMinutesAWeek, setTargetMinutesAWeek] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (trackable) {
      setName(trackable.name);
      setColour(trackable.colour);
      setTargetCount(trackable.targetCount?.toString() ?? "");
      setTargetHours(trackable.targetNumberOfHours?.toString() ?? "");
      setTargetDaysAWeek(
        trackable.targetNumberOfDaysAWeek?.toString() ?? ""
      );
      setTargetMinutesAWeek(
        trackable.targetNumberOfMinutesAWeek?.toString() ?? ""
      );
    }
  }, [trackable]);

  if (!trackable) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ headerShown: true, title: "Edit Goal" }} />
        <Text>Loading...</Text>
      </View>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await upsertTrackable({
        id: trackableId as Id<"trackables">,
        name: name.trim(),
        colour,
        trackableType: trackable.trackableType,
        startDayYYYYMMDD: trackable.startDayYYYYMMDD,
        endDayYYYYMMDD: trackable.endDayYYYYMMDD,
        targetCount: targetCount ? parseInt(targetCount) : undefined,
        targetNumberOfHours: targetHours
          ? parseInt(targetHours)
          : undefined,
        targetNumberOfDaysAWeek: targetDaysAWeek
          ? parseInt(targetDaysAWeek)
          : undefined,
        targetNumberOfMinutesAWeek: targetMinutesAWeek
          ? parseInt(targetMinutesAWeek)
          : undefined,
      });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    await archiveTrackable({ id: trackableId as Id<"trackables"> });
    router.back();
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Goal",
      "This will permanently delete this goal and all its data.",
      [
        { text: "Cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteTrackable({ id: trackableId as Id<"trackables"> });
            router.back();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ headerShown: true, title: `Edit: ${trackable.name}` }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Input
            label="Goal Name"
            value={name}
            onChangeText={setName}
            placeholder="Goal name"
          />

          <Text style={styles.fieldLabel}>Color</Text>
          <ColorPicker selectedColor={colour} onColorSelect={setColour} />

          <View style={styles.spacer} />

          <Text style={styles.typeLabel}>
            Type: {trackable.trackableType.replace(/_/g, " ")}
          </Text>

          {(trackable.trackableType === "NUMBER" ||
            trackable.trackableType === "TRACKER") && (
            <Input
              label="Target Count"
              value={targetCount}
              onChangeText={setTargetCount}
              keyboardType="numeric"
              placeholder="e.g. 100"
            />
          )}

          {trackable.trackableType === "TIME_TRACK" && (
            <Input
              label="Target Hours"
              value={targetHours}
              onChangeText={setTargetHours}
              keyboardType="numeric"
              placeholder="e.g. 50"
            />
          )}

          {trackable.trackableType === "DAYS_A_WEEK" && (
            <Input
              label="Target Days per Week"
              value={targetDaysAWeek}
              onChangeText={setTargetDaysAWeek}
              keyboardType="numeric"
              placeholder="e.g. 5"
            />
          )}

          {trackable.trackableType === "MINUTES_A_WEEK" && (
            <Input
              label="Target Minutes per Week"
              value={targetMinutesAWeek}
              onChangeText={setTargetMinutesAWeek}
              keyboardType="numeric"
              placeholder="e.g. 300"
            />
          )}
        </Card>

        <View style={styles.actions}>
          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={loading}
          />
          <Button
            title={trackable.archived ? "Unarchive" : "Archive"}
            variant="secondary"
            onPress={handleArchive}
          />
          <Button title="Delete Goal" variant="danger" onPress={handleDelete} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingBottom: 40 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
    marginTop: 8,
  },
  spacer: { height: 16 },
  typeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 16,
    marginTop: 16,
  },
  actions: { marginTop: 24, gap: 12 },
});
