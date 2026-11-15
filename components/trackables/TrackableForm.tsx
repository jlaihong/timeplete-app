import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Colors, DEFAULT_ENTITY_COLOUR } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { DateField } from "../ui/DateField";
import {
  DialogCard,
  DialogHeader,
  SheetOverlay,
} from "../ui/DialogScaffold";
import { addDays, todayYYYYMMDD } from "../../lib/dates";
import {
  MEASURES,
  PERIODS,
  countsOf,
  shapeOf,
  unitLabel,
  type GoalDirection,
  type GoalPeriod,
  type TrackableMeasure,
} from "../../lib/trackableShape";
import { useTrackableTags } from "../../hooks/useTrackableTags";
import { useDiscardGuard } from "../../hooks/useDiscardGuard";
import { ColourSwatchPicker } from "./ColourSwatchPicker";
import { ParentTrackablePicker } from "./ParentTrackablePicker";
import {
  TrackableRulesEditor,
  TrackableRulesFields,
  type TrackableRulesValue,
} from "./TrackableRulesEditor";

interface TrackableFormProps {
  /** The trackable to edit; omit to create one. */
  trackableId?: Id<"trackables">;
  /** Where a new trackable starts in the tree. */
  defaultParentId?: Id<"trackables"> | null;
  onSaved?: (id: Id<"trackables">) => void;
  onCancel?: () => void;
  /** Tells the host whether closing now would lose edits. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The one form for a trackable, used to create it and to edit it:
 *
 *   name, colour, where it sits in the tree
 *   what counts   rules (allocating a task or event to it always counts)
 *   measure       time, times done, days active, or a number you log
 *   goal          optional: at least / at most an amount per period
 *
 * See `lib/trackableShape.ts` for what measure and goal mean.
 */
export function TrackableForm({
  trackableId,
  defaultParentId = null,
  onSaved,
  onCancel,
  onDirtyChange,
}: TrackableFormProps) {
  const tags = useTrackableTags();
  const existing = trackableId ? tags.byId.get(trackableId) : undefined;
  const upsert = useMutation(api.trackables.upsert);
  const setRules = useMutation(api.trackables.setRules);

  const [name, setName] = useState("");
  const [colour, setColour] = useState(DEFAULT_ENTITY_COLOUR);
  const [parentId, setParentId] = useState<Id<"trackables"> | null>(
    defaultParentId,
  );
  const [measure, setMeasure] = useState<TrackableMeasure>("time");
  const [hasGoal, setHasGoal] = useState(false);
  const [direction, setDirection] = useState<GoalDirection>("atLeast");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<GoalPeriod>("week");
  const [endDay, setEndDay] = useState("");
  /** "Of those, count": for times done and days active. */
  const [countEvents, setCountEvents] = useState(true);
  const [countTasks, setCountTasks] = useState(true);
  /** For a number: add the values up, or average them (a rating). */
  const [cumulative, setCumulative] = useState(true);
  /** Rules for a trackable that does not exist yet. */
  const [rules, setRulesDraft] = useState<TrackableRulesValue>({
    pageIds: [],
    listIds: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the trackable into the form once.
  const loadedFor = useRef<string | null>(null);
  const baseline = useRef<string | null>(null);
  useEffect(() => {
    if (!existing || loadedFor.current === existing._id) return;
    loadedFor.current = existing._id;
    baseline.current = null;
    const shape = shapeOf(existing);
    setName(existing.name);
    setColour(existing.colour);
    setParentId(existing.parentId ?? null);
    setMeasure(shape.measure);
    setHasGoal(shape.goal !== null);
    if (shape.goal) {
      setDirection(shape.goal.direction);
      setAmount(String(Math.round(shape.goal.amount * 100) / 100));
      setPeriod(shape.goal.period);
    }
    setEndDay(existing.endDayYYYYMMDD);
    setCumulative(existing.isCumulative !== false);
    const counts = countsOf(existing);
    setCountEvents(counts.events);
    setCountTasks(counts.tasks);
  }, [existing]);

  const snapshot = JSON.stringify([
    name,
    colour,
    parentId,
    measure,
    hasGoal,
    direction,
    amount,
    period,
    endDay,
    cumulative,
    countEvents,
    countTasks,
    rules,
  ]);
  if (baseline.current === null && (!trackableId || loadedFor.current)) {
    baseline.current = snapshot;
  }
  const dirty = baseline.current !== null && baseline.current !== snapshot;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give it a name.");
      return;
    }
    const parsed = Number(amount);
    if (hasGoal && !(parsed > 0)) {
      setError("Enter the goal's amount, or turn the goal off.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const today = todayYYYYMMDD();
      const id = (await upsert({
        id: trackableId,
        name: trimmed,
        colour,
        measure,
        goal: hasGoal ? { direction, amount: parsed, period } : null,
        countEvents,
        countTasks,
        isCumulative: measure === "number" ? cumulative : true,
        isRatingTracker: measure === "number" ? !cumulative : false,
        parentId:
          trackableId && parentId === (existing?.parentId ?? null)
            ? undefined
            : parentId,
        startDayYYYYMMDD: existing?.startDayYYYYMMDD ?? today,
        endDayYYYYMMDD:
          (hasGoal && period === "total" && endDay) ||
          existing?.endDayYYYYMMDD ||
          addDays(today, 365),
      })) as Id<"trackables">;
      if (!trackableId && (rules.pageIds.length || rules.listIds.length)) {
        await setRules({
          id,
          pageIds: rules.pageIds as Id<"pages">[],
          listIds: rules.listIds as Id<"lists">[],
        });
      }
      baseline.current = snapshot;
      onDirtyChange?.(false);
      onSaved?.(id);
    } catch (e) {
      console.error("[TrackableForm] save failed:", e);
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const unit = unitLabel(measure, Number(amount) || 2);

  return (
    <View style={styles.form}>
      <Input
        label="Name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (error) setError(null);
        }}
        placeholder="Family, Workout, MSA project"
        autoFocus={!trackableId}
      />

      <ColourSwatchPicker value={colour} onChange={setColour} label="Color" />

      <ParentTrackablePicker
        trackableId={trackableId}
        trackables={[...tags.byId.values()]}
        value={parentId}
        onChange={setParentId}
      />

      {trackableId ? (
        <TrackableRulesEditor trackableId={trackableId} />
      ) : (
        <TrackableRulesFields value={rules} onChange={setRulesDraft} />
      )}

      {measure === "count" || measure === "days" ? (
        <View>
          <Text style={styles.subheading}>Of those, count</Text>
          <View style={styles.checks}>
            <Check
              label="Events"
              checked={countEvents}
              onToggle={() => setCountEvents((v) => !v)}
            />
            <Check
              label="Completed tasks"
              checked={countTasks}
              onToggle={() => setCountTasks((v) => !v)}
            />
          </View>
          <Text style={styles.help}>
            Check-ins you add by hand always count.
          </Text>
        </View>
      ) : null}

      <View>
        <Text style={styles.heading}>Measure</Text>
        <View style={styles.chips}>
          {MEASURES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setMeasure(m.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: measure === m.key }}
              style={[styles.choice, measure === m.key && styles.choiceOn]}
            >
              <Text
                style={[
                  styles.choiceTitle,
                  measure === m.key && styles.choiceTitleOn,
                ]}
              >
                {m.label}
              </Text>
              <Text style={styles.choiceHint}>{m.hint}</Text>
            </Pressable>
          ))}
        </View>
        {measure === "number" ? (
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              Average the values instead of adding them up (a rating, a weight)
            </Text>
            <Switch
              value={!cumulative}
              onValueChange={(v) => setCumulative(!v)}
              accessibilityLabel="Average the values"
              trackColor={{
                false: Colors.surfaceContainerHighest,
                true: Colors.primary,
              }}
            />
          </View>
        ) : null}
      </View>

      <View>
        <View style={styles.switchRow}>
          <Text style={styles.heading}>Goal</Text>
          <Switch
            value={hasGoal}
            onValueChange={setHasGoal}
            accessibilityLabel="Set a goal"
            trackColor={{
              false: Colors.surfaceContainerHighest,
              true: Colors.primary,
            }}
          />
        </View>
        {hasGoal ? (
          <View style={styles.goal}>
            <View style={styles.goalRow}>
              <Segmented
                options={[
                  { key: "atLeast", label: "At least" },
                  { key: "atMost", label: "At most" },
                ]}
                value={direction}
                onChange={setDirection}
              />
              <TextInput
                value={amount}
                onChangeText={(v) => {
                  setAmount(v.replace(/[^0-9.]/g, ""));
                  if (error) setError(null);
                }}
                keyboardType="numeric"
                placeholder="3"
                placeholderTextColor={Colors.textTertiary}
                style={styles.amount}
                accessibilityLabel="Goal amount"
              />
              {unit ? <Text style={styles.unit}>{unit}</Text> : null}
            </View>
            <Segmented
              options={PERIODS.map((p) => ({ key: p.key, label: p.label }))}
              value={period}
              onChange={setPeriod}
            />
            {period === "total" ? (
              <DateField label="By" value={endDay} onChange={setEndDay} />
            ) : null}
          </View>
        ) : (
          <Text style={styles.help}>
            No goal: it just keeps count.
          </Text>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.footer}>
        {onCancel ? (
          <Button title="Cancel" variant="ghost" size="small" onPress={onCancel} />
        ) : null}
        <Button
          title={trackableId ? "Save" : "Create trackable"}
          size="small"
          onPress={() => void save()}
          loading={saving}
        />
      </View>
    </View>
  );
}

function Check({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.check}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={20}
        color={checked ? Colors.primary : Colors.textSecondary}
      />
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.key }}
          style={[styles.segment, value === o.key && styles.segmentOn]}
        >
          <Text
            style={[styles.segmentText, value === o.key && styles.segmentTextOn]}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

interface TrackableFormDialogProps {
  trackableId?: Id<"trackables">;
  defaultParentId?: Id<"trackables"> | null;
  onClose: () => void;
}

/** `TrackableForm` in a dialog: "New trackable", or "Edit <name>". */
export function TrackableFormDialog({
  trackableId,
  defaultParentId,
  onClose,
}: TrackableFormDialogProps) {
  const tags = useTrackableTags();
  const existing = trackableId ? tags.byId.get(trackableId) : undefined;
  const [dirty, setDirty] = useState(false);
  const requestClose = useDiscardGuard(dirty, onClose);

  return (
    <SheetOverlay onBackdropPress={requestClose} zIndex={2000}>
      <DialogCard desktopWidth={560} style={styles.card}>
        <DialogHeader
          title={existing ? `Edit ${existing.name}` : "New trackable"}
          colour={existing?.colour}
          onClose={requestClose}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TrackableForm
            trackableId={trackableId}
            defaultParentId={defaultParentId}
            onSaved={onClose}
            onCancel={requestClose}
            onDirtyChange={setDirty}
          />
        </ScrollView>
      </DialogCard>
    </SheetOverlay>
  );
}

const styles = StyleSheet.create({
  card: { maxHeight: "90%" },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 4 },
  form: { gap: 18 },
  heading: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  subheading: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  checks: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  check: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkLabel: { fontSize: FontSize.body, color: Colors.text },
  help: {
    marginTop: 4,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  choice: {
    flexGrow: 1,
    flexBasis: 150,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  choiceOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  choiceTitle: { fontSize: FontSize.body, color: Colors.textSecondary },
  choiceTitleOn: { color: Colors.text, fontWeight: "600" },
  choiceHint: {
    marginTop: 2,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
  },
  switchLabel: {
    flex: 1,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  goal: { gap: 10, marginTop: 10 },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  amount: {
    width: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    fontSize: FontSize.body,
    color: Colors.text,
    textAlign: "center",
  },
  unit: { fontSize: FontSize.body, color: Colors.textSecondary },
  segmented: {
    flexDirection: "row",
    alignSelf: "flex-start",
    flexWrap: "wrap",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    overflow: "hidden",
  },
  segment: { paddingHorizontal: 12, paddingVertical: 8 },
  segmentOn: { backgroundColor: Colors.surfaceContainerHighest },
  segmentText: { fontSize: FontSize.body, color: Colors.textSecondary },
  segmentTextOn: { color: Colors.text, fontWeight: "600" },
  error: { fontSize: FontSize.caption, color: Colors.error },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
});
