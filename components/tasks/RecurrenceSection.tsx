/**
 * RecurrenceSection — controlled-form UI for configuring a recurring
 * task series.
 *
 * Productivity-one parity (option set):
 *   The five `RecurrencePatternType` flows match P1 exactly —
 *   COUPLE_DAYS_A_WEEK, EVERY_FEW_WEEKS, WEEK_OF_MONTH,
 *   EVERY_FEW_MONTHS, EVERY_YEAR. Same labels, same logical grouping,
 *   same backend mapping (frequency / interval / monthlyPattern).
 *
 * Timeplete improvements over P1's UI (behaviour-preserving):
 *   - Native `<select>` dropdowns instead of pill rows for any
 *     option set with > 4 entries (interval pickers, week-of-month,
 *     month-of-year, day-of-month, weekday). Pill rows remain for
 *     the day-of-week multi-select — chips communicate "pick any
 *     subset" better than a dropdown can.
 *   - "Every 1 week" / "Every 1 month" added to the interval
 *     dropdowns so the user doesn't have to switch top-level pattern
 *     to express the simplest case (the schema state matches what
 *     COUPLE_DAYS_A_WEEK would emit, so re-opening still rounds to
 *     COUPLE_DAYS_A_WEEK — same backend, just two UI on-ramps).
 *   - Months-interval expanded from 1..6 to 1..12 (P1's range was
 *     arbitrary; semantically nothing prevents 7-12 months).
 *   - Every-year matches P1 exactly: Month + Day only. No interval
 *     selector and no pattern sub-selector.
 *   - Time inputs use the shared `TimeField` (HTML5 `<input
 *     type="time" step="300">`) — 5-min snap matches the calendar
 *     drag granularity, locale-aware 12h/24h rendering, no free-text
 *     invalid states.
 *
 * Day-of-week storage convention:
 *   `daysOfWeek` and `dayOfWeek` use JavaScript's `Date.getDay()`
 *   convention (Sun=0..Sat=6) so they match what our recurrence
 *   matcher expects without re-mapping. The chips simply *render*
 *   in Mon→Sun order to match P1's visual convention; the
 *   underlying integer is the JS day number.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { DateField } from "../ui/DateField";
import { TimeField } from "../ui/TimeField";

export type RecurrencePatternType =
  | "COUPLE_DAYS_A_WEEK"
  | "EVERY_FEW_WEEKS"
  | "WEEK_OF_MONTH"
  | "EVERY_FEW_MONTHS"
  | "EVERY_YEAR";

/** Mirrors the Convex schema's `monthlyPattern` literal union. */
export type MonthlyPatternType = "DAY_OF_MONTH" | "DAY_OF_WEEK";

/**
 * UI form shape — the user-facing primitive is `patternType`. Each
 * sub-field is only meaningful for the patterns that show its
 * control; non-applicable fields keep their last-set value so
 * toggling between patterns doesn't silently lose state.
 */
export interface RecurrenceFormValue {
  patternType: RecurrencePatternType;

  // Used by COUPLE_DAYS_A_WEEK and EVERY_FEW_WEEKS (multi-select).
  daysOfWeek: number[]; // Sun=0..Sat=6 (JS getDay)

  weeksInterval: number; // EVERY_FEW_WEEKS    (1..5)
  weekOfMonth: number; // WEEK_OF_MONTH + EVERY_FEW_MONTHS/NTH +
  // EVERY_YEAR/NTH (1..4 or -1=Last)
  dayOfWeek: number; // WEEK_OF_MONTH + EVERY_FEW_MONTHS/NTH +
  // EVERY_YEAR/NTH (single, Sun=0..Sat=6)

  monthsInterval: number; // EVERY_FEW_MONTHS   (1..12)
  monthlyPattern: MonthlyPatternType; // EVERY_FEW_MONTHS sub-pattern
  dayOfMonth: number; // EVERY_FEW_MONTHS/DAY_OF_MONTH (1..31)

  monthOfYear: number; // EVERY_YEAR (0..11 — JS getMonth convention)
  dayOfYear: number; // EVERY_YEAR (1..31; stored as dayOfMonth in
  // schema)

  startDateYYYYMMDD: string;
  endDateYYYYMMDD: string; // "" = no end
  startTimeHHMM: string; // "" when hasTimeWindow=false
  endTimeHHMM: string;
  hasTimeWindow: boolean;
}

/**
 * Default form value for a brand-new recurring rule. Defaults pin
 * weekly recurrence to the start date's weekday, all other
 * sub-controls to their first sensible value so switching patterns
 * shows usable defaults without forcing the user to fill anything.
 */
export function defaultRecurrence(
  startDateYYYYMMDD: string
): RecurrenceFormValue {
  const start = parseYYYYMMDD(startDateYYYYMMDD);
  const dow = start.getDay();
  return {
    patternType: "COUPLE_DAYS_A_WEEK",
    daysOfWeek: [dow],
    weeksInterval: 1,
    weekOfMonth: 1,
    dayOfWeek: dow,
    monthsInterval: 1,
    monthlyPattern: "DAY_OF_WEEK",
    dayOfMonth: start.getDate(),
    monthOfYear: start.getMonth(),
    dayOfYear: start.getDate(),
    startDateYYYYMMDD,
    endDateYYYYMMDD: "",
    startTimeHHMM: "",
    endTimeHHMM: "",
    hasTimeWindow: false,
  };
}

interface RecurrenceSectionProps {
  /** `null` = "Repeat" toggle is off; non-null = on. */
  value: RecurrenceFormValue | null;
  onChange: (next: RecurrenceFormValue | null) => void;
  /**
   * Hide the "Repeat" toggle in instance-edit mode (where toggling
   * off has different semantics — handled by a separate "Stop
   * recurring" button in the parent).
   */
  hideToggle?: boolean;
  /** Hide recurrence-specific time-window controls (event forms use their own start/end). */
  hideTimeWindowControls?: boolean;
}

export function RecurrenceSection({
  value,
  onChange,
  hideToggle = false,
  hideTimeWindowControls = false,
}: RecurrenceSectionProps) {
  const enabled = value !== null;

  return (
    <View style={styles.container}>
      {!hideToggle && (
        <Pressable
          style={styles.toggleRow}
          onPress={() =>
            onChange(
              enabled ? null : defaultRecurrence(todayYYYYMMDDLocal())
            )
          }
        >
          <Ionicons
            name={enabled ? "checkbox" : "square-outline"}
            size={22}
            color={enabled ? Colors.primary : Colors.textSecondary}
          />
          <Text style={styles.toggleLabel}>Make this a recurring task</Text>
        </Pressable>
      )}

      {enabled && value && (
        <View style={styles.controls}>
          <Text style={styles.sectionTitle}>Recurrence Settings</Text>

          {/* Top-level pattern chooser. Label "Recurrence Pattern"
              copied verbatim from P1 task-details.html line 113. */}
          <View style={styles.field}>
            <FieldLabel>Recurrence Pattern</FieldLabel>
            <Dropdown
              value={value.patternType}
              onChange={(p) =>
                onChange({ ...value, patternType: p as RecurrencePatternType })
              }
              options={PATTERN_OPTIONS}
            />
          </View>

          {/* Couple days a week — section label "Select days" copied
              verbatim from P1 task-details.html line 130. Chip row
              instead of a dropdown because user is picking a subset. */}
          {value.patternType === "COUPLE_DAYS_A_WEEK" && (
            <View style={styles.field}>
              <FieldLabel>Select days</FieldLabel>
              <DayChipRow
                selected={value.daysOfWeek}
                onToggle={(idx) =>
                  onChange({
                    ...value,
                    daysOfWeek: toggleMulti(value.daysOfWeek, idx),
                  })
                }
              />
            </View>
          )}

          {/* Every few weeks — interval label "Every" + section label
              "Select days" copied from P1 task-details.html lines
              167, 182. */}
          {value.patternType === "EVERY_FEW_WEEKS" && (
            <>
              <View style={styles.field}>
                <FieldLabel>Every</FieldLabel>
                <Dropdown
                  value={String(value.weeksInterval)}
                  onChange={(s) =>
                    onChange({ ...value, weeksInterval: parseInt(s, 10) })
                  }
                  options={WEEKS_INTERVAL_OPTIONS}
                />
              </View>
              <View style={styles.field}>
                <FieldLabel>Select days</FieldLabel>
                <DayChipRow
                  selected={value.daysOfWeek}
                  onToggle={(idx) =>
                    onChange({
                      ...value,
                      daysOfWeek: toggleMulti(value.daysOfWeek, idx),
                    })
                  }
                />
              </View>
            </>
          )}

          {/* Week of the month — labels "Week" / "Day of week" copied
              from P1 task-details.html lines 219, 232. */}
          {value.patternType === "WEEK_OF_MONTH" && (
            <View style={styles.row}>
              <View style={[styles.field, styles.flex1]}>
                <FieldLabel>Week</FieldLabel>
                <Dropdown
                  value={String(value.weekOfMonth)}
                  onChange={(s) =>
                    onChange({ ...value, weekOfMonth: parseInt(s, 10) })
                  }
                  options={WEEK_OF_MONTH_OPTIONS}
                />
              </View>
              <View style={[styles.field, styles.flex1]}>
                <FieldLabel>Day of week</FieldLabel>
                <Dropdown
                  value={String(value.dayOfWeek)}
                  onChange={(s) =>
                    onChange({ ...value, dayOfWeek: parseInt(s, 10) })
                  }
                  options={DAY_DROPDOWN_OPTIONS}
                />
              </View>
            </View>
          )}

          {/* Every few months — labels "Every" / "Pattern" /
              "Day of month" / "Week" / "Day of week" copied from P1
              task-details.html lines 249, 265, 280, 296, 309.
              Pattern option labels "On certain day of month" /
              "Week of the month" copied from lines 271, 273. */}
          {value.patternType === "EVERY_FEW_MONTHS" && (
            <>
              <View style={styles.field}>
                <FieldLabel>Every</FieldLabel>
                <Dropdown
                  value={String(value.monthsInterval)}
                  onChange={(s) =>
                    onChange({ ...value, monthsInterval: parseInt(s, 10) })
                  }
                  options={MONTHS_INTERVAL_OPTIONS}
                />
              </View>
              <View style={styles.field}>
                <FieldLabel>Pattern</FieldLabel>
                <Dropdown
                  value={value.monthlyPattern}
                  onChange={(s) =>
                    onChange({
                      ...value,
                      monthlyPattern: s as MonthlyPatternType,
                    })
                  }
                  options={MONTHLY_PATTERN_OPTIONS}
                />
              </View>

              {value.monthlyPattern === "DAY_OF_MONTH" ? (
                <View style={styles.field}>
                  <FieldLabel>Day of month</FieldLabel>
                  <Dropdown
                    value={String(value.dayOfMonth)}
                    onChange={(s) =>
                      onChange({ ...value, dayOfMonth: parseInt(s, 10) })
                    }
                    options={DAY_OF_MONTH_OPTIONS}
                  />
                </View>
              ) : (
                <View style={styles.row}>
                  <View style={[styles.field, styles.flex1]}>
                    <FieldLabel>Week</FieldLabel>
                    <Dropdown
                      value={String(value.weekOfMonth)}
                      onChange={(s) =>
                        onChange({ ...value, weekOfMonth: parseInt(s, 10) })
                      }
                      options={WEEK_OF_MONTH_OPTIONS}
                    />
                  </View>
                  <View style={[styles.field, styles.flex1]}>
                    <FieldLabel>Day of week</FieldLabel>
                    <Dropdown
                      value={String(value.dayOfWeek)}
                      onChange={(s) =>
                        onChange({ ...value, dayOfWeek: parseInt(s, 10) })
                      }
                      options={DAY_DROPDOWN_OPTIONS}
                    />
                  </View>
                </View>
              )}
            </>
          )}

          {/* Every year — Month + Day only, matching P1
              task-details.html lines 324-349 exactly. No interval
              selector and no pattern sub-selector. Labels "Month" /
              "Day" copied verbatim from lines 327, 338. */}
          {value.patternType === "EVERY_YEAR" && (
            <View style={styles.row}>
              <View style={[styles.field, styles.flex1]}>
                <FieldLabel>Month</FieldLabel>
                <Dropdown
                  value={String(value.monthOfYear)}
                  onChange={(s) =>
                    onChange({ ...value, monthOfYear: parseInt(s, 10) })
                  }
                  options={MONTH_OPTIONS}
                />
              </View>
              <View style={[styles.field, styles.flex1]}>
                <FieldLabel>Day</FieldLabel>
                <Dropdown
                  value={String(value.dayOfYear)}
                  onChange={(s) =>
                    onChange({ ...value, dayOfYear: parseInt(s, 10) })
                  }
                  options={DAY_OF_MONTH_OPTIONS}
                />
              </View>
            </View>
          )}

          {/* Date range — labels "Start Date" / "End Date (optional)"
              copied verbatim from P1 task-details.html lines 354, 366. */}
          <View style={styles.row}>
            <View style={[styles.field, styles.flex1]}>
              <DateField
                label="Start Date"
                value={value.startDateYYYYMMDD}
                onChange={(yyyymmdd) =>
                  onChange({ ...value, startDateYYYYMMDD: yyyymmdd })
                }
              />
            </View>
            <View style={[styles.field, styles.flex1]}>
              <DateField
                label="End Date (optional)"
                value={value.endDateYYYYMMDD}
                onChange={(yyyymmdd) =>
                  onChange({ ...value, endDateYYYYMMDD: yyyymmdd })
                }
              />
            </View>
          </View>

          {!hideTimeWindowControls && (
            <>
              {/* Time-window checkbox label
                  "Set start and end time (appears on calendar)" copied
                  verbatim from P1 task-details.html line 387. */}
              <Pressable
                style={styles.toggleRow}
                onPress={() => {
                  const next = !value.hasTimeWindow;
                  onChange({
                    ...value,
                    hasTimeWindow: next,
                    startTimeHHMM: next
                      ? value.startTimeHHMM || "09:00"
                      : value.startTimeHHMM,
                    endTimeHHMM: next
                      ? value.endTimeHHMM || "10:00"
                      : value.endTimeHHMM,
                  });
                }}
              >
                <Ionicons
                  name={value.hasTimeWindow ? "checkbox" : "square-outline"}
                  size={20}
                  color={value.hasTimeWindow ? Colors.primary : Colors.textSecondary}
                />
                <Text style={styles.toggleLabel}>
                  Set start and end time (appears on calendar)
                </Text>
              </Pressable>

              {/* Time labels "Start Time" / "End Time" copied verbatim
                  from P1 task-details.html lines 394, 403. */}
              {value.hasTimeWindow && (
                <View style={styles.row}>
                  <View style={[styles.field, styles.flex1]}>
                    <TimeField
                      label="Start Time"
                      value={value.startTimeHHMM}
                      onChange={(s) =>
                        onChange({ ...value, startTimeHHMM: s })
                      }
                    />
                  </View>
                  <View style={[styles.field, styles.flex1]}>
                    <TimeField
                      label="End Time"
                      value={value.endTimeHHMM}
                      onChange={(s) => onChange({ ...value, endTimeHHMM: s })}
                    />
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

/* ─────────────  Backend ↔ form translation  ─────────────
 *
 * The Convex schema stores (frequency, interval, monthlyPattern,
 * day-fields). The UI patternType is reconstructed on load and
 * collapsed to schema fields on save — there's no patternType column.
 *
 * Rules of the mapping:
 *   - WEEKLY,  interval=1            → COUPLE_DAYS_A_WEEK
 *   - WEEKLY,  interval>1            → EVERY_FEW_WEEKS
 *   - MONTHLY, interval=1, NTH       → WEEK_OF_MONTH
 *   - MONTHLY, anything else         → EVERY_FEW_MONTHS
 *   - YEARLY                         → EVERY_YEAR
 *     (yearlyPattern derived from `monthlyPattern` field)
 *
 * Edge case: if the user explicitly picks "Every 1 week" inside the
 * EVERY_FEW_WEEKS dropdown, the rule round-trips to COUPLE_DAYS_A_WEEK
 * on next open. Same backend state, both UI on-ramps are valid.
 */

export function ruleToRecurrenceForm(rule: {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval?: number;
  daysOfWeek?: number[];
  monthlyPattern?: MonthlyPatternType;
  dayOfMonth?: number;
  weekOfMonth?: number;
  dayOfWeekMonthly?: number;
  monthOfYear?: number;
  startDateYYYYMMDD: string;
  endDateYYYYMMDD?: string;
  startTimeHHMM?: string;
  endTimeHHMM?: string;
}): RecurrenceFormValue {
  const interval = rule.interval ?? 1;
  let patternType: RecurrencePatternType = "COUPLE_DAYS_A_WEEK";
  if (rule.frequency === "WEEKLY") {
    patternType = interval === 1 ? "COUPLE_DAYS_A_WEEK" : "EVERY_FEW_WEEKS";
  } else if (rule.frequency === "MONTHLY") {
    patternType =
      interval === 1 && rule.monthlyPattern === "DAY_OF_WEEK"
        ? "WEEK_OF_MONTH"
        : "EVERY_FEW_MONTHS";
  } else if (rule.frequency === "YEARLY") {
    patternType = "EVERY_YEAR";
  }

  const start = parseYYYYMMDD(rule.startDateYYYYMMDD);
  return {
    patternType,
    daysOfWeek: rule.daysOfWeek ?? [start.getDay()],
    weeksInterval: patternType === "EVERY_FEW_WEEKS" ? interval : 1,
    weekOfMonth: rule.weekOfMonth ?? 1,
    dayOfWeek: rule.dayOfWeekMonthly ?? start.getDay(),
    monthsInterval: patternType === "EVERY_FEW_MONTHS" ? interval : 1,
    monthlyPattern: rule.monthlyPattern ?? "DAY_OF_WEEK",
    dayOfMonth: rule.dayOfMonth ?? start.getDate(),
    monthOfYear: rule.monthOfYear ?? start.getMonth(),
    dayOfYear: rule.dayOfMonth ?? start.getDate(),
    startDateYYYYMMDD: rule.startDateYYYYMMDD,
    endDateYYYYMMDD: rule.endDateYYYYMMDD ?? "",
    startTimeHHMM: rule.startTimeHHMM ?? "",
    endTimeHHMM: rule.endTimeHHMM ?? "",
    hasTimeWindow: !!rule.startTimeHHMM && !!rule.endTimeHHMM,
  };
}

export function recurrenceFormToRuleFields(v: RecurrenceFormValue) {
  switch (v.patternType) {
    case "COUPLE_DAYS_A_WEEK":
      return {
        frequency: "WEEKLY" as const,
        interval: 1,
        daysOfWeek: v.daysOfWeek,
        monthlyPattern: undefined,
        dayOfMonth: undefined,
        weekOfMonth: undefined,
        dayOfWeekMonthly: undefined,
        monthOfYear: undefined,
      };
    case "EVERY_FEW_WEEKS":
      return {
        frequency: "WEEKLY" as const,
        interval: v.weeksInterval,
        daysOfWeek: v.daysOfWeek,
        monthlyPattern: undefined,
        dayOfMonth: undefined,
        weekOfMonth: undefined,
        dayOfWeekMonthly: undefined,
        monthOfYear: undefined,
      };
    case "WEEK_OF_MONTH":
      return {
        frequency: "MONTHLY" as const,
        interval: 1,
        daysOfWeek: undefined,
        monthlyPattern: "DAY_OF_WEEK" as const,
        dayOfMonth: undefined,
        weekOfMonth: v.weekOfMonth,
        dayOfWeekMonthly: v.dayOfWeek,
        monthOfYear: undefined,
      };
    case "EVERY_FEW_MONTHS":
      if (v.monthlyPattern === "DAY_OF_MONTH") {
        return {
          frequency: "MONTHLY" as const,
          interval: v.monthsInterval,
          daysOfWeek: undefined,
          monthlyPattern: "DAY_OF_MONTH" as const,
          dayOfMonth: v.dayOfMonth,
          weekOfMonth: undefined,
          dayOfWeekMonthly: undefined,
          monthOfYear: undefined,
        };
      }
      return {
        frequency: "MONTHLY" as const,
        interval: v.monthsInterval,
        daysOfWeek: undefined,
        monthlyPattern: "DAY_OF_WEEK" as const,
        dayOfMonth: undefined,
        weekOfMonth: v.weekOfMonth,
        dayOfWeekMonthly: v.dayOfWeek,
        monthOfYear: undefined,
      };
    case "EVERY_YEAR":
      // P1's yearly is Month + Day only — interval is always 1 and
      // there's no week-based sub-pattern to choose. We still emit
      // an explicit `monthlyPattern: "DAY_OF_MONTH"` so the matcher
      // in `_helpers/recurrence.ts` takes the day-of-month branch.
      return {
        frequency: "YEARLY" as const,
        interval: 1,
        daysOfWeek: undefined,
        monthlyPattern: "DAY_OF_MONTH" as const,
        dayOfMonth: v.dayOfYear,
        weekOfMonth: undefined,
        dayOfWeekMonthly: undefined,
        monthOfYear: v.monthOfYear,
      };
  }
}

/* ─────────────  Small UI primitives  ───────────── */

interface DropdownOption {
  value: string;
  label: string;
}

/**
 * Cross-platform dropdown.
 *   - Web  : native `<select>` (real OS dropdown, keyboard nav,
 *            scroll-on-overflow, accessible). Locale-aware styling
 *            via colorScheme=dark to match the app theme.
 *   - Native: pill row fallback (mobile parity isn't part of this
 *            task; the UX still works for small option sets).
 */
function Dropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: DropdownOption[];
}) {
  if (Platform.OS === "web") {
    return React.createElement(
      "select",
      {
        value,
        onChange: (e: { target: { value: string } }) => onChange(e.target.value),
        style: webSelectStyle,
      },
      options.map((opt) =>
        React.createElement("option", { key: opt.value, value: opt.value }, opt.label)
      )
    );
  }
  return (
    <View style={styles.pillRow}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Mon–Sun chip row used by both weekly patterns. Always multi-select
 * — single-day variants (WEEK_OF_MONTH, EVERY_FEW_MONTHS/NTH,
 * EVERY_YEAR/NTH) use the Dropdown above instead.
 */
function DayChipRow({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (idx: number) => void;
}) {
  return (
    <View style={styles.dayChipRow}>
      {DISPLAY_WEEKDAYS.map(({ idx, label }) => {
        const isActive = selected.includes(idx);
        return (
          <Pressable
            key={idx}
            style={[styles.dayChip, isActive && styles.dayChipActive]}
            onPress={() => onToggle(idx)}
            accessibilityLabel={`Toggle ${label}`}
            accessibilityRole="checkbox"
          >
            <Text
              style={[
                styles.dayChipText,
                isActive && styles.dayChipTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

/* ─────────────  Static option lists  ───────────── */

const PATTERN_OPTIONS: DropdownOption[] = [
  { value: "COUPLE_DAYS_A_WEEK", label: "Couple days a week" },
  { value: "EVERY_FEW_WEEKS", label: "Every few weeks" },
  { value: "WEEK_OF_MONTH", label: "Week of the month" },
  { value: "EVERY_FEW_MONTHS", label: "Every few months" },
  { value: "EVERY_YEAR", label: "Every year" },
];

// Option text "1 week" / "N weeks" copied verbatim from P1
// task-details.html lines 174-175 ("{{ week }} {{ week === 1 ?
// 'week' : 'weeks' }}"). Range 1..5 also matches P1 exactly.
const WEEKS_INTERVAL_OPTIONS: DropdownOption[] = [
  { value: "1", label: "1 week" },
  { value: "2", label: "2 weeks" },
  { value: "3", label: "3 weeks" },
  { value: "4", label: "4 weeks" },
  { value: "5", label: "5 weeks" },
];

// Option text "1 month" / "N months" copied verbatim from P1
// task-details.html lines 256-257. P1's range is 1..6; we extended
// to 1..12 per a prior explicit user request — wording stays
// faithful, only the range is a superset.
const MONTHS_INTERVAL_OPTIONS: DropdownOption[] = Array.from(
  { length: 12 },
  (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} ${i + 1 === 1 ? "month" : "months"}`,
  })
);


const WEEK_OF_MONTH_OPTIONS: DropdownOption[] = [
  { value: "1", label: "First" },
  { value: "2", label: "Second" },
  { value: "3", label: "Third" },
  { value: "4", label: "Fourth" },
  { value: "-1", label: "Last" },
];

// Option labels copied verbatim from P1 task-details.html lines
// 271, 273 ("On certain day of month" / "Week of the month").
// The schema literal "DAY_OF_WEEK" maps to P1's "NTH_WEEKDAY"
// internal id — we keep the schema literal but the user-visible
// label is identical to P1.
const MONTHLY_PATTERN_OPTIONS: DropdownOption[] = [
  { value: "DAY_OF_MONTH", label: "On certain day of month" },
  { value: "DAY_OF_WEEK", label: "Week of the month" },
];

const MONTH_OPTIONS: DropdownOption[] = [
  { value: "0", label: "January" },
  { value: "1", label: "February" },
  { value: "2", label: "March" },
  { value: "3", label: "April" },
  { value: "4", label: "May" },
  { value: "5", label: "June" },
  { value: "6", label: "July" },
  { value: "7", label: "August" },
  { value: "8", label: "September" },
  { value: "9", label: "October" },
  { value: "10", label: "November" },
  { value: "11", label: "December" },
];

const DAY_DROPDOWN_OPTIONS: DropdownOption[] = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

const DAY_OF_MONTH_OPTIONS: DropdownOption[] = Array.from(
  { length: 31 },
  (_, i) => ({ value: String(i + 1), label: String(i + 1) })
);

/**
 * Display order for the chip row — Mon→Sun (P1 visual convention).
 * The `idx` is the JS `Date.getDay()` integer (Sun=0..Sat=6) so the
 * stored values stay JS-native.
 */
const DISPLAY_WEEKDAYS: { idx: number; label: string }[] = [
  { idx: 1, label: "Mon" },
  { idx: 2, label: "Tue" },
  { idx: 3, label: "Wed" },
  { idx: 4, label: "Thu" },
  { idx: 5, label: "Fri" },
  { idx: 6, label: "Sat" },
  { idx: 0, label: "Sun" },
];

/* ─────────────  Misc helpers  ───────────── */

function toggleMulti(arr: number[], idx: number): number[] {
  return arr.includes(idx)
    ? arr.filter((d) => d !== idx).sort((a, b) => a - b)
    : [...arr, idx].sort((a, b) => a - b);
}

function parseYYYYMMDD(s: string): Date {
  if (!s || s.length < 8) return new Date();
  const y = parseInt(s.substring(0, 4));
  const m = parseInt(s.substring(4, 6)) - 1;
  const d = parseInt(s.substring(6, 8));
  return new Date(y, m, d);
}

function todayYYYYMMDDLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const webSelectStyle = {
  backgroundColor: Colors.surfaceContainer,
  border: `1px solid ${Colors.outlineVariant}`,
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 14,
  color: Colors.text,
  width: "100%",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
  colorScheme: "dark" as const,
  cursor: "pointer",
} as const;

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  toggleLabel: { fontSize: 14, color: Colors.text, fontWeight: "500" },
  controls: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLow,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 4,
  },
  field: { gap: 6 },
  flex1: { flex: 1, minWidth: 140 },
  row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  label: { fontSize: 12, color: Colors.textSecondary, fontWeight: "500" },

  // Native fallback for Dropdown
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surface,
  },
  pillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "22",
  },
  pillText: { fontSize: 13, color: Colors.text },
  pillTextActive: { color: Colors.primary, fontWeight: "600" },

  dayChipRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  dayChip: {
    minWidth: 38,
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surface,
  },
  dayChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  dayChipText: { fontSize: 12, color: Colors.text, fontWeight: "500" },
  dayChipTextActive: { color: Colors.onPrimary ?? "#fff", fontWeight: "700" },
});
