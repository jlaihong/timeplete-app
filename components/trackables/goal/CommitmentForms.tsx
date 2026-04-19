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
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import {
  todayYYYYMMDD,
  weeksBetweenYYYYMMDD,
  hoursBetweenYYYYMMDD,
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

export function CommitmentForm({ variant, value, onChange }: FormProps) {
  const set = (patch: Partial<CommitmentValue>) =>
    onChange({ ...value, ...patch });

  const wks = value.endDayYYYYMMDD
    ? weeksBetweenYYYYMMDD(value.startDayYYYYMMDD, value.endDayYYYYMMDD)
    : 0;
  const hrs = value.endDayYYYYMMDD
    ? hoursBetweenYYYYMMDD(value.startDayYYYYMMDD, value.endDayYYYYMMDD)
    : 0;

  // Common fields: Name + variant-specific target on the same row.
  const renderTargetField = () => {
    switch (variant) {
      case "periodic":
      case "reading":
        return (
          <LabeledField label="Number of days per week" width={140}>
            <NumberField
              value={value.targetNumberOfDaysAWeek}
              onChange={(n) => set({ targetNumberOfDaysAWeek: n })}
              min={1}
              max={7}
              width={70}
            />
          </LabeledField>
        );
      case "minutes-weekly":
        return (
          <LabeledField label="Minutes per week" width={140}>
            <NumberField
              value={value.targetNumberOfMinutesAWeek}
              onChange={(n) => set({ targetNumberOfMinutesAWeek: n })}
              min={60}
              max={10080}
              width={100}
            />
          </LabeledField>
        );
      case "total-time":
        return (
          <LabeledField label="Total hours" width={120}>
            <NumberField
              value={value.targetNumberOfHours}
              onChange={(n) => set({ targetNumberOfHours: n })}
              min={10}
              max={10000}
              width={100}
            />
          </LabeledField>
        );
      case "count":
        return (
          <LabeledField label="Target count" width={120}>
            <NumberField
              value={value.targetCount}
              onChange={(n) => set({ targetCount: n })}
              min={1}
              max={10000}
              width={100}
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

      {/* Conditional helper / error copy ─ days, minutes, reading */}
      {(variant === "periodic" ||
        variant === "reading" ||
        variant === "minutes-weekly") &&
        value.endDayYYYYMMDD && (
          <View style={{ gap: 6 }}>
            <Text style={styles.helper}>
              You've given yourself {wks === 1 ? "1 week" : `${wks} weeks`} to
              complete your goal.
            </Text>
            {wks <= 0 && (
              <Text style={styles.helper}>
                We recommend choosing a duration of at least 1 week to give
                yourself a meaningful challenge!
              </Text>
            )}
            {wks > 1 && (
              <View style={{ alignSelf: "flex-start" }}>
                <LabeledField
                  label={`Required weeks (out of the ${wks === 1 ? "1 week" : `${wks} weeks`})`}
                  width={260}
                >
                  <NumberField
                    value={value.targetNumberOfWeeks}
                    onChange={(n) => set({ targetNumberOfWeeks: n })}
                    min={1}
                    width={70}
                  />
                </LabeledField>
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
          </View>
        )}

      {/* Conditional helper / error copy ─ total-time */}
      {variant === "total-time" && value.endDayYYYYMMDD && (
        <View style={{ gap: 4 }}>
          <Text style={styles.helper}>
            Between {value.startDayYYYYMMDD} and {value.endDayYYYYMMDD} there
            are {hrs} hour(s).
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
        </View>
      )}

      {/* Colour picker — gated on the same condition as angular */}
      {((variant === "count" && !!value.targetCount) ||
        (variant === "total-time" && !!value.targetNumberOfHours) ||
        ((variant === "periodic" ||
          variant === "reading" ||
          variant === "minutes-weekly") &&
          !!value.targetNumberOfWeeks)) && (
        <View style={{ marginTop: 4 }}>
          <ColourSwatchPicker
            label="Give your goal a colour"
            value={value.colour}
            onChange={(c) => set({ colour: c })}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  helper: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  error: { fontSize: 13, color: Colors.error, lineHeight: 18 },
});
