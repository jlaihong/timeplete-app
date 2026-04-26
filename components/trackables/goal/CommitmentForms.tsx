/**
 * Step 1 of every goal-onboarding dialog — five variants matching the
 * angular `MyCommitmentForm*` components.
 *
 * Each variant exports:
 *   - the `value` shape it stores into `CommitmentValue`
 *   - default seed builder
 *   - `isValid(value)` for stepper Next gating
 *   - render component
 *
 * Productivity-one source files:
 *   components/my-commitment-form-days-a-week/
 *   components/my-commitment-form-reading/
 *   components/my-commitment-form-minutes-a-week/
 *   components/my-commitment-form-total-time/
 *   components/my-commitment-form-count/
 */
import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import {
  todayYYYYMMDD,
  weeksBetweenYYYYMMDD,
  hoursBetweenYYYYMMDD,
  formatYYYYMMDDtoDDMMM,
} from "../../../lib/dates";
import { ColourSwatchPicker } from "../ColourSwatchPicker";
import { LabeledField, TextField, NumberField, DateField } from "./atoms";

/* ──────────────────────────────────────────────────────────────────── */
/* Types                                                                 */
/* ──────────────────────────────────────────────────────────────────── */

/** Convex-side trackable type (matches `convex/schema.ts`). */
export type CommitmentTrackableType =
  | "DAYS_A_WEEK"
  | "MINUTES_A_WEEK"
  | "TIME_TRACK"
  | "NUMBER";

export type CommitmentVariant =
  | "periodic" // PERIODIC + days
  | "reading" // READING (uses days form, but maps to DAYS_A_WEEK on backend)
  | "minutes-weekly" // PERIODIC + minutes
  | "total-time" // TIME_TRACK
  | "count"; // COUNT (NUMBER on backend)

export interface CommitmentValue {
  /** stable id; client generates */
  id: string;
  name: string;
  colour: string;
  trackableType: CommitmentTrackableType;
  /** present for periodic-days / reading */
  targetNumberOfDaysAWeek?: number;
  /** present for periodic-minutes */
  targetNumberOfMinutesAWeek?: number;
  /** present for total-time */
  targetNumberOfHours?: number;
  /** present for count */
  targetCount?: number;
  /** weeks across the start/end window, applies to days/minutes/reading */
  targetNumberOfWeeks?: number;
  startDayYYYYMMDD: string;
  endDayYYYYMMDD: string;
}

/* ──────────────────────────────────────────────────────────────────── */
/* Helpers                                                               */
/* ──────────────────────────────────────────────────────────────────── */

function generateRandomColour(): string {
  // 12 fixed swatches inspired by the trackable palette to give pleasant defaults.
  const palette = [
    "#6750A4",
    "#E91E63",
    "#00DAF5",
    "#02E600",
    "#F59E0B",
    "#FF6B6B",
    "#8B5CF6",
    "#14B8A6",
    "#F97316",
    "#06B6D4",
    "#84CC16",
    "#EF4444",
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

function generateId(): string {
  // Mirrors angular's `generateId()` (uuid-ish without the dashes is fine for client ids).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function buildDefaultCommitment(
  variant: CommitmentVariant,
  seed: { goalName?: string; goalColour?: string }
): CommitmentValue {
  const base: CommitmentValue = {
    id: generateId(),
    name: seed.goalName ?? "",
    colour: seed.goalColour && seed.goalColour.length > 0 ? seed.goalColour : generateRandomColour(),
    trackableType: "DAYS_A_WEEK",
    startDayYYYYMMDD: todayYYYYMMDD(),
    endDayYYYYMMDD: "",
  };
  switch (variant) {
    case "periodic":
    case "reading":
      return {
        ...base,
        trackableType: "DAYS_A_WEEK",
        targetNumberOfDaysAWeek: 3,
        targetNumberOfWeeks: 1,
      };
    case "minutes-weekly":
      return {
        ...base,
        trackableType: "MINUTES_A_WEEK",
        targetNumberOfMinutesAWeek: 120,
        targetNumberOfWeeks: 1,
      };
    case "total-time":
      return {
        ...base,
        trackableType: "TIME_TRACK",
        targetNumberOfHours: 1,
      };
    case "count":
      return {
        ...base,
        trackableType: "NUMBER",
        targetCount: 10,
      };
  }
}

export function isCommitmentValid(
  variant: CommitmentVariant,
  v: CommitmentValue
): boolean {
  if (!v.name.trim()) return false;
  switch (variant) {
    case "periodic":
    case "reading": {
      if (!v.targetNumberOfDaysAWeek || v.targetNumberOfDaysAWeek < 1 || v.targetNumberOfDaysAWeek > 7) return false;
      if (!v.endDayYYYYMMDD) return false;
      const wk = weeksBetweenYYYYMMDD(v.startDayYYYYMMDD, v.endDayYYYYMMDD);
      if (wk <= 0) return false;
      if (!v.targetNumberOfWeeks || v.targetNumberOfWeeks < 1 || v.targetNumberOfWeeks > wk) return false;
      return true;
    }
    case "minutes-weekly": {
      if (
        !v.targetNumberOfMinutesAWeek ||
        v.targetNumberOfMinutesAWeek < 60 ||
        v.targetNumberOfMinutesAWeek > 10080
      )
        return false;
      if (!v.endDayYYYYMMDD) return false;
      const wk = weeksBetweenYYYYMMDD(v.startDayYYYYMMDD, v.endDayYYYYMMDD);
      if (wk <= 0) return false;
      if (!v.targetNumberOfWeeks || v.targetNumberOfWeeks < 1 || v.targetNumberOfWeeks > wk) return false;
      return true;
    }
    case "total-time": {
      if (
        !v.targetNumberOfHours ||
        v.targetNumberOfHours < 10 ||
        v.targetNumberOfHours > 10000
      )
        return false;
      if (!v.endDayYYYYMMDD) return false;
      const hours = hoursBetweenYYYYMMDD(v.startDayYYYYMMDD, v.endDayYYYYMMDD);
      if (hours < v.targetNumberOfHours) return false;
      return true;
    }
    case "count": {
      if (!v.targetCount || v.targetCount < 1 || v.targetCount > 10000) return false;
      if (!v.endDayYYYYMMDD) return false;
      return true;
    }
  }
}

/* ──────────────────────────────────────────────────────────────────── */
/* Render                                                                */
/* ──────────────────────────────────────────────────────────────────── */

interface FormProps {
  variant: CommitmentVariant;
  value: CommitmentValue;
  onChange: (next: CommitmentValue) => void;
}

/**
 * Productivity-one's "suggested weeks" rule (`my-commitment-form-*.ts`):
 *
 *   suggestedGracePeriod = weeksBetween <= 4 ? 0 : round(weeksBetween * 0.2)
 *   suggestedWeeksWithGrace = weeksBetween - suggestedGracePeriod
 *
 * The form runs an `effect()` that always sets `targetNumberOfWeeks`
 * to `suggestedWeeksWithGrace` whenever the date range changes, with
 * a special-case forcing `targetNumberOfWeeks = 1` when the user
 * picks a 1-week range (otherwise grace would zero it out and the
 * form would be invalid). We mirror that here.
 */
function suggestedGracePeriod(weeksBetween: number): number {
  if (weeksBetween <= 4) return 0;
  return Math.round(weeksBetween * 0.2);
}

function suggestedWeeksWithGrace(weeksBetween: number): number {
  if (weeksBetween <= 0) return 0;
  if (weeksBetween === 1) return 1;
  return Math.max(1, weeksBetween - suggestedGracePeriod(weeksBetween));
}

const WEEKS_BASED_VARIANTS = new Set<CommitmentVariant>([
  "periodic",
  "reading",
  "minutes-weekly",
]);

export function CommitmentForm({ variant, value, onChange }: FormProps) {
  const set = (patch: Partial<CommitmentValue>) =>
    onChange({ ...value, ...patch });

  const wks = value.endDayYYYYMMDD
    ? weeksBetweenYYYYMMDD(value.startDayYYYYMMDD, value.endDayYYYYMMDD)
    : 0;
  const hrs = value.endDayYYYYMMDD
    ? hoursBetweenYYYYMMDD(value.startDayYYYYMMDD, value.endDayYYYYMMDD)
    : 0;

  // Mirror productivity-one's effect: every time the date range
  // changes, recompute `targetNumberOfWeeks = suggestedWeeksWithGrace`
  // for variants that use a weekly target. Manual edits to
  // `targetNumberOfWeeks` persist until the user changes a date again.
  // Only re-runs when start/end date or variant changes — the value's
  // other fields are intentionally not in deps so this never overrides
  // a manually-typed week count.
  useEffect(() => {
    if (!WEEKS_BASED_VARIANTS.has(variant)) return;
    if (!value.endDayYYYYMMDD) return;
    const next = suggestedWeeksWithGrace(wks);
    if (next > 0 && value.targetNumberOfWeeks !== next) {
      onChange({ ...value, targetNumberOfWeeks: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, value.startDayYYYYMMDD, value.endDayYYYYMMDD]);

  // The grace period that's actually being granted, given the user's
  // current target. Mirrors P1's `actualGracePeriod` and drives the
  // "(N weeks grace period...)" helper below the required-weeks input.
  const actualGrace = Math.max(0, wks - (value.targetNumberOfWeeks ?? 0));

  // Common fields: Name + variant-specific target on the same row.
  // Input widths mirror productivity-one's tailwind sizes:
  //   `class="w-12"` (48px) for numeric inputs,
  //   `class="w-40"` (160px) for the goal name.
  // The outer field auto-expands beyond these to fit the label.
  const renderTargetField = () => {
    switch (variant) {
      case "periodic":
      case "reading":
        return (
          <LabeledField label="Number of days per week">
            <NumberField
              value={value.targetNumberOfDaysAWeek}
              onChange={(n) => set({ targetNumberOfDaysAWeek: n })}
              min={1}
              max={7}
              width={48}
            />
          </LabeledField>
        );
      case "minutes-weekly":
        return (
          <LabeledField label="Minutes per week">
            <NumberField
              value={value.targetNumberOfMinutesAWeek}
              onChange={(n) => set({ targetNumberOfMinutesAWeek: n })}
              min={60}
              max={10080}
              width={64}
            />
          </LabeledField>
        );
      case "total-time":
        return (
          <LabeledField label="Total hours">
            <NumberField
              value={value.targetNumberOfHours}
              onChange={(n) => set({ targetNumberOfHours: n })}
              min={10}
              max={10000}
              width={64}
            />
          </LabeledField>
        );
      case "count":
        return (
          <LabeledField label="Target count">
            <NumberField
              value={value.targetCount}
              onChange={(n) => set({ targetCount: n })}
              min={1}
              max={10000}
              width={64}
            />
          </LabeledField>
        );
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.row}>
        <LabeledField label="Name of your goal">
          <TextField
            value={value.name}
            onChangeText={(s) => set({ name: s })}
            autoFocus
            placeholder=""
          />
        </LabeledField>
        {renderTargetField()}
      </View>

      <View style={styles.row}>
        <LabeledField label="Start date">
          <DateField
            value={value.startDayYYYYMMDD}
            onChange={(d) => set({ startDayYYYYMMDD: d })}
          />
        </LabeledField>
        <LabeledField label="End date">
          <DateField
            value={value.endDayYYYYMMDD}
            onChange={(d) => set({ endDayYYYYMMDD: d })}
          />
        </LabeledField>
      </View>

      {/* Conditional helper / error copy ─ days, minutes, reading.
          The grace-period note and the colour picker live INSIDE
          this same tight column (`gap: 8`) so the whole "you've got
          X weeks → pick how many → grace info → choose a colour"
          sequence reads as one block, instead of crossing the
          form's larger 16-px section rhythm in the middle. */}
      {(variant === "periodic" ||
        variant === "reading" ||
        variant === "minutes-weekly") &&
        value.endDayYYYYMMDD && (
          <View style={styles.weeksSection}>
            <Text style={styles.helper}>
              Between {formatYYYYMMDDtoDDMMM(value.startDayYYYYMMDD)} and{" "}
              {formatYYYYMMDDtoDDMMM(value.endDayYYYYMMDD)} there are {wks} weeks.
            </Text>
            {wks <= 0 && (
              <Text style={styles.helper}>
                We recommend choosing a duration of at least 1 week to give
                yourself a meaningful challenge!
              </Text>
            )}
            {wks > 1 && (
              // NOTE: we render `NumberField` directly here instead of
              // wrapping it in `LabeledField`. `LabeledField` is sized
              // for the responsive 2-up grid (`flexBasis: 220`,
              // `flexGrow: 1`), which inside a column-flex parent
              // resolves to 220 px *tall* — that was inflating this
              // cell to ~220px and leaving a huge void between the
              // input and the grace-period text. `NumberField`
              // already accepts `label`, so the wrapper is
              // unnecessary here.
              <View style={styles.weeksGroup}>
                <Text style={styles.helper}>
                  {variant === "reading"
                    ? "How many weeks do you think you'll need to accomplish this goal?"
                    : "How many weeks will you commit to hitting the target?"}
                </Text>
                <NumberField
                  label={`Required weeks (out of the ${wks === 1 ? "1 week" : `${wks} weeks`})`}
                  value={value.targetNumberOfWeeks}
                  onChange={(n) => set({ targetNumberOfWeeks: n })}
                  min={1}
                  width={48}
                />
                {actualGrace > 0 && (
                  <Text style={styles.helperSmall}>
                    ({actualGrace === 1 ? "1 week" : `${actualGrace} weeks`}{" "}
                    grace period. Grace periods help to account for sickness,
                    travel or unforeseen events.)
                  </Text>
                )}
              </View>
            )}
            {value.targetNumberOfWeeks !== undefined &&
              value.targetNumberOfWeeks > wks && (
                <Text style={styles.error}>
                  There aren't enough weeks between the start and end date for
                  you to accomplish your goal...{"\n"}
                  Even if you're David Goggins
                </Text>
              )}
            {!!value.targetNumberOfWeeks && (
              <ColourSwatchPicker
                label="Give your goal a colour"
                value={value.colour}
                onChange={(c) => set({ colour: c })}
              />
            )}
          </View>
        )}

      {/* Conditional helper / error copy ─ total-time. Same single-
          column treatment as periodic so the colour picker rides
          inline with the helper copy instead of jumping a section. */}
      {variant === "total-time" && value.endDayYYYYMMDD && (
        <View style={styles.weeksSection}>
          <Text style={styles.helper}>
            Between {formatYYYYMMDDtoDDMMM(value.startDayYYYYMMDD)} and{" "}
            {formatYYYYMMDDtoDDMMM(value.endDayYYYYMMDD)} there are {hrs} hour(s).
          </Text>
          <Text style={styles.helper}>
            Assuming 8 hours of sleep a night, the number of waking hours is:{" "}
            {Math.max(0, Math.floor((hrs * 16) / 24))}
          </Text>
          {hrs <= 0 && (
            <Text style={styles.helper}>Try to do this for at least 10 hours :)</Text>
          )}
          {value.targetNumberOfHours !== undefined &&
            hrs > 0 &&
            hrs < value.targetNumberOfHours && (
              <Text style={styles.error}>
                There aren't enough hours for you to complete your goal in time
              </Text>
            )}
          {!!value.targetNumberOfHours && (
            <ColourSwatchPicker
              label="Give your goal a colour"
              value={value.colour}
              onChange={(c) => set({ colour: c })}
            />
          )}
        </View>
      )}

      {/* Colour picker for `count` — kept as its own section because
          the count form has no "between X and Y" helper block to
          piggy-back on. Other variants render the picker inline
          (above) so they don't cross the 16-px form gap. */}
      {variant === "count" && !!value.targetCount && (
        <ColourSwatchPicker
          label="Give your goal a colour"
          value={value.colour}
          onChange={(c) => set({ colour: c })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  helper: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  helperSmall: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  /**
   * The whole "between X and Y → required weeks → grace text →
   * colour picker" sequence flows inside this single column with a
   * tight `gap` so the colour picker doesn't jump the form-level
   * 16-px section gap (which the user reads as a wasted vertical
   * void after the grace-period note).
   */
  weeksSection: { gap: 8 },
  /**
   * Inner stack: prompt → field → grace note. Sized to the field
   * (not full width) so the narrow input doesn't get stretched, and
   * `alignSelf: flex-start` keeps it from inheriting the parent
   * column's full width.
   */
  weeksGroup: { alignSelf: "flex-start", gap: 4 },
  error: { fontSize: 13, color: Colors.error, lineHeight: 18 },
});
