/**
 * Faithful reconstruction of the productivity-one **Add Trackable** flow.
 *
 * Productivity-one source files:
 *   - components/goal-tracker-selection-dialog/        (entry: "What would you like to do?")
 *   - components/goal-onboarding-initial/              (goal branch — picks a preset goal kind)
 *   - components/goal-onboarding-something-else/       (goal branch — custom goal kind)
 *   - components/goal-onboarding-{periodic,reading,minutes-weekly,total-time,count}/
 *                                                      (5 final goal forms; each is a 3-step stepper)
 *   - components/tracker-onboarding-initial/           (tracker branch — picks a preset)
 *   - components/new-tracker-dialog/                   (final tracker form)
 *   - services/dialog-close-button.service.ts          (top-right X close affordance)
 *
 * In angular each step is a separate `MatDialog` (closeAll + open). We
 * collapse the same UX into a single overlay with internal step state — same
 * visible behaviour, fewer mounts.
 *
 * Dialog chrome parity:
 *   - ESC dismisses (MatDialog default).
 *   - Backdrop click dismisses.
 *   - Top-right `×` close button (productivity-one's
 *     `app-dialog-close-button`).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useMutation } from "convex/react";
import { MaterialIcons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { todayYYYYMMDD } from "../../lib/dates";
import { CardOption, CardOptionButton } from "./CardOptionButton";
import { ColourSwatchPicker } from "./ColourSwatchPicker";
import { GoalForm } from "./goal/GoalForm";
import type { CommitmentVariant } from "./goal/CommitmentForms";

/* ------------------------------------------------------------------ *
 * Types                                                              *
 * ------------------------------------------------------------------ */

type Step =
  | { kind: "selection" }
  | { kind: "goal-onboarding-initial" }
  | { kind: "goal-onboarding-something-else" }
  | {
      kind: "goal-form";
      variant: CommitmentVariant;
      seed: { goalName?: string; goalColour?: string; goalReasons?: string[] };
    }
  | { kind: "tracker-onboarding" }
  | { kind: "new-tracker"; seed: TrackerSeed };

/**
 * Mirrors productivity-one's `TrackerDialogData` — the prefill payload
 * passed from the onboarding step into the final tracker form.
 */
interface TrackerSeed {
  name?: string;
  colour?: string;
  trackCount?: boolean;
  trackTime?: boolean;
  isCumulative?: boolean | undefined; // undefined = user must choose Cumulative/Rating
  autoCountFromCalendar?: boolean;
  isRatingTracker?: boolean;
}

interface AddTrackableFlowProps {
  onClose: () => void;
}

/* ------------------------------------------------------------------ *
 * Helpers                                                            *
 * ------------------------------------------------------------------ */

function generateRandomColour(): string {
  return (
    "#" +
    Math.floor(0x1000000 + Math.random() * 0xffffff)
      .toString(16)
      .substring(1, 7)
  );
}

/* Productivity-one's three reason presets per Workout / Reading / Skill. */
const WORKOUT_REASONS = [
  "I want to be healthy so that I can be around longer for my loved ones",
  "I don't want my loved ones to have to take care of me because I neglected my health",
  "I want to feel confident and attractive for the person I love (or will love)",
];
const READING_REASONS = [
  "Every book I read adds a new layer to who I am",
  "I want to grow my knowledge instead of scrolling endlessly",
  "Reading helps me empathize and connect more deeply with others",
];
const SKILL_REASONS = [
  "The skills I learn will compound massively in the long term and the best investment I can make is in myself",
  "I want to rebuild my confidence by doing hard things consistently",
  "Learning new skills is how I strengthen my self-belief",
];

/* ------------------------------------------------------------------ *
 * AddTrackableFlow — overlay + step state                            *
 * ------------------------------------------------------------------ */

export function AddTrackableFlow({ onClose }: AddTrackableFlowProps) {
  const [step, setStep] = useState<Step>({ kind: "selection" });
  const upsertTrackable = useMutation(api.trackables.upsert);

  const { width } = useWindowDimensions();
  const isWide = width >= 768; // matches Tailwind's `md:` breakpoint

  /* ESC closes the dialog — matches MatDialog's default keyboard handling. */
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

  const renderStep = useCallback(() => {
    switch (step.kind) {
      case "selection":
        return (
          <GoalTrackerSelection
            isWide={isWide}
            onPickGoal={() => setStep({ kind: "goal-onboarding-initial" })}
            onPickTracker={() => setStep({ kind: "tracker-onboarding" })}
          />
        );

      case "goal-onboarding-initial":
        return (
          <GoalOnboardingInitial
            isWide={isWide}
            onPick={(variant, seed) => setStep({ kind: "goal-form", variant, seed })}
            onPickSomethingElse={() =>
              setStep({ kind: "goal-onboarding-something-else" })
            }
          />
        );

      case "goal-onboarding-something-else":
        return (
          <GoalOnboardingSomethingElse
            isWide={isWide}
            onPick={(variant) =>
              setStep({ kind: "goal-form", variant, seed: { goalReasons: [] } })
            }
          />
        );

      case "goal-form":
        return (
          <GoalForm
            variant={step.variant}
            seed={step.seed}
            onSubmitted={onClose}
          />
        );

      case "tracker-onboarding":
        return (
          <TrackerOnboardingStep
            isWide={isWide}
            onPickTemplate={(seed) => setStep({ kind: "new-tracker", seed })}
          />
        );

      case "new-tracker":
        return (
          <NewTrackerForm
            seed={step.seed}
            onCancel={onClose}
            onSubmit={async (payload) => {
              await upsertTrackable(payload);
              onClose();
            }}
          />
        );
    }
  }, [step, isWide, onClose, upsertTrackable]);

  /* The goal-form step manages its own scrolling internally; for every
   * other step we mount the close button + content in a flex column. */
  const isGoalForm = step.kind === "goal-form";

  // The dialog is mounted at `DesktopHome` root (a viewport-sized View) on
  // desktop. We deliberately do **not** use react-native's `Modal` here:
  // RN-Web's `ModalPortal` creates its portal `<div>` during render and
  // tears it down in a `useEffect` cleanup, which under `StrictMode`
  // (Expo's default) leaves the portal as `null` until the next re-render
  // — manifesting as "the dialog only appears after another sibling
  // dialog opens".
  return (
    <Pressable
      style={[
        styles.overlay,
        isWide ? styles.overlayDesktop : styles.overlayMobile,
      ]}
      onPress={onClose}
    >
      <Pressable
        onPress={(e) => e.stopPropagation?.()}
        style={[
          styles.dialog,
          isWide ? styles.dialogDesktop : styles.dialogMobile,
          isGoalForm && { padding: 0 },
        ]}
      >
        {/* Top-right close X — port of `app-dialog-close-button`. */}
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityLabel="Close dialog"
          hitSlop={8}
        >
          <MaterialIcons name="close" size={20} color={Colors.text} />
        </Pressable>

        {renderStep()}
      </Pressable>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Step — GoalTrackerSelection                                        *
 * ------------------------------------------------------------------ */

function GoalTrackerSelection({
  isWide,
  onPickGoal,
  onPickTracker,
}: {
  isWide: boolean;
  onPickGoal: () => void;
  onPickTracker: () => void;
}) {
  const options: CardOption[] = [
    {
      name: "I want to set a goal",
      caption: "Create a goal with targets and commitments",
      icon: "flag",
      onPress: onPickGoal,
    },
    {
      name: "I want to track something without a goal",
      caption: "Just track values and times without targets",
      icon: "track-changes",
      onPress: onPickTracker,
    },
  ];

  return (
    <View>
      <Text style={styles.headingCentered}>What would you like to do?</Text>
      <View style={[styles.cardGrid, isWide && styles.cardGridTwoCol]}>
        {options.map((option) => (
          <CardOptionButton key={option.name} option={option} />
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Step — GoalOnboardingInitial                                       *
 * ------------------------------------------------------------------ */

function GoalOnboardingInitial({
  isWide,
  onPick,
  onPickSomethingElse,
}: {
  isWide: boolean;
  onPick: (
    variant: CommitmentVariant,
    seed: { goalName?: string; goalColour?: string; goalReasons?: string[] }
  ) => void;
  onPickSomethingElse: () => void;
}) {
  const options: CardOption[] = [
    {
      name: "Workout",
      caption: "Get into shape",
      icon: "fitness-center",
      onPress: () =>
        onPick("periodic", {
          goalName: "Workout",
          goalColour: "#2ad10d",
          goalReasons: WORKOUT_REASONS,
        }),
    },
    {
      name: "Read more",
      caption: "Become smarter",
      icon: "library-books",
      onPress: () =>
        onPick("reading", {
          goalName: "Reading",
          goalColour: "#0dd1c4",
          goalReasons: READING_REASONS,
        }),
    },
    {
      name: "Learn a new skill",
      caption: "Invest time weekly",
      icon: "sports-baseball",
      onPress: () => onPick("minutes-weekly", { goalReasons: SKILL_REASONS }),
    },
    {
      name: "Something else",
      caption: "Create a custom goal",
      icon: "category",
      onPress: onPickSomethingElse,
    },
  ];

  return (
    <View>
      <Text style={styles.headingCentered}>New Goal</Text>
      <Text style={styles.subheading}>I want to...</Text>
      <View style={[styles.cardGrid, isWide && styles.cardGridTwoCol]}>
        {options.map((option) => (
          <CardOptionButton key={option.name} option={option} />
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Step — GoalOnboardingSomethingElse                                 *
 * ------------------------------------------------------------------ */

function GoalOnboardingSomethingElse({
  isWide,
  onPick,
}: {
  isWide: boolean;
  onPick: (variant: CommitmentVariant) => void;
}) {
  const options: CardOption[] = [
    {
      name: "Days a week",
      caption: "Do something a few days a week. e.g. meal prep",
      icon: "calendar-view-week",
      onPress: () => onPick("periodic"),
    },
    {
      name: "Minutes a week",
      caption: "Do something a few minutes a week. e.g. clean my place",
      icon: "view-timeline",
      onPress: () => onPick("minutes-weekly"),
    },
    {
      name: "Total time target",
      caption: "e.g. work on my side hustle for 100 hours",
      icon: "access-time",
      onPress: () => onPick("total-time"),
    },
    {
      name: "Count Target",
      caption: "e.g. meet 100 new people",
      icon: "plus-one",
      onPress: () => onPick("count"),
    },
  ];

  return (
    <View>
      <Text style={styles.headingCentered}>New Goal</Text>
      <Text style={styles.subheading}>I want to...</Text>
      <View style={[styles.cardGrid, isWide && styles.cardGridTwoCol]}>
        {options.map((option) => (
          <CardOptionButton key={option.name} option={option} />
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Step — TrackerOnboardingStep                                       *
 * ------------------------------------------------------------------ */

function TrackerOnboardingStep({
  isWide,
  onPickTemplate,
}: {
  isWide: boolean;
  onPickTemplate: (seed: TrackerSeed) => void;
}) {
  const trackers: CardOption[] = [
    {
      name: "Mood tracker",
      caption: "Keep track of your mood over time",
      icon: "mood",
      onPress: () =>
        onPickTemplate({
          name: "Mood",
          colour: "#FFB6C1",
          trackCount: true,
          trackTime: false,
          isCumulative: false,
          autoCountFromCalendar: false,
          isRatingTracker: true,
        }),
    },
    {
      name: "Poop tracker",
      caption: "Log your logs",
      icon: "wc",
      onPress: () =>
        onPickTemplate({
          name: "Poop",
          colour: "#8B4513",
          trackCount: true,
          trackTime: false,
          isCumulative: true,
          autoCountFromCalendar: false,
        }),
    },
    {
      name: "Leisure tracker",
      caption: "Track relaxation time",
      icon: "self-improvement",
      onPress: () =>
        onPickTemplate({
          name: "Leisure",
          colour: "#87CEEB",
          trackCount: false,
          trackTime: true,
          isCumulative: false,
          autoCountFromCalendar: false,
        }),
    },
    {
      name: "Something else",
      caption: "Create a custom tracker",
      icon: "category",
      onPress: () =>
        onPickTemplate({
          name: "",
          trackCount: true,
          trackTime: true,
          isCumulative: true,
          autoCountFromCalendar: true,
        }),
    },
  ];

  return (
    <View>
      <Text style={styles.headingCentered}>New Tracker</Text>
      <Text style={styles.subheading}>I want to track...</Text>
      <View style={[styles.cardGrid, isWide && styles.cardGridTwoCol]}>
        {trackers.map((option) => (
          <CardOptionButton key={option.name} option={option} />
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Step — NewTrackerForm                                              *
 * ------------------------------------------------------------------ */

interface NewTrackerFormProps {
  seed: TrackerSeed;
  onCancel: () => void;
  onSubmit: (payload: TrackerUpsertPayload) => Promise<void>;
}

interface TrackerUpsertPayload {
  name: string;
  colour: string;
  trackableType: "TRACKER";
  startDayYYYYMMDD: string;
  endDayYYYYMMDD: string;
  isCumulative?: boolean;
  trackTime: boolean;
  trackCount: boolean;
  autoCountFromCalendar: boolean;
  isRatingTracker: boolean;
}

function NewTrackerForm({ seed, onCancel, onSubmit }: NewTrackerFormProps) {
  // Defaults mirror productivity-one's `NewTrackerDialog` constructor.
  const initial = useMemo(
    () => ({
      name: seed.name ?? "",
      colour: seed.colour ?? generateRandomColour(),
      trackTime: seed.trackTime ?? true,
      trackCount: seed.trackCount ?? true,
      autoCountFromCalendar: seed.autoCountFromCalendar ?? true,
      isCumulative:
        seed.isCumulative ?? (seed.trackCount !== false ? true : undefined),
      isRatingTracker: seed.isRatingTracker ?? false,
    }),
    [seed]
  );

  const [name, setName] = useState(initial.name);
  const [colour, setColour] = useState(initial.colour);
  const [trackTime, setTrackTime] = useState(initial.trackTime);
  const [trackCount, setTrackCount] = useState(initial.trackCount);
  const [autoCountFromCalendar, setAutoCountFromCalendar] = useState(
    initial.autoCountFromCalendar
  );
  const [isCumulative, setIsCumulative] = useState<boolean | undefined>(
    initial.isCumulative
  );
  const [isRatingTracker, setIsRatingTracker] = useState(initial.isRatingTracker);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const selectCumulative = () => {
    setIsCumulative(true);
    setIsRatingTracker(false);
  };
  const selectRating = () => {
    setIsCumulative(false);
    setIsRatingTracker(true);
  };

  // Mirrors angular's gate: `trackCount && isCumulative === undefined`.
  // Angular leaves Create enabled when name is empty (validated in handler).
  const isCreateDisabled =
    submitting || (trackCount && isCumulative === undefined);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Tracker name is required");
      return;
    }
    if (trackCount && isCumulative === undefined) return;

    setSubmitting(true);
    try {
      const today = todayYYYYMMDD();
      await onSubmit({
        name: trimmed,
        colour,
        trackableType: "TRACKER",
        startDayYYYYMMDD: today,
        endDayYYYYMMDD: today,
        isCumulative,
        trackTime,
        trackCount,
        autoCountFromCalendar,
        isRatingTracker,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
      <Text style={styles.dialogTitle}>Create Tracker</Text>

      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Name</Text>
          <Input
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (nameError) setNameError(null);
            }}
            placeholder="Tracker name"
            autoFocus
            containerStyle={{ marginBottom: 0 }}
          />
          {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        </View>

        <View style={styles.field}>
          <ColourSwatchPicker value={colour} onChange={setColour} label="Color" />
        </View>

        <View style={styles.checkboxStack}>
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

          {trackCount && (
            <View style={styles.indent}>
              <CheckboxRow
                label="Increase value by 1 for each calendar occurrence"
                checked={autoCountFromCalendar}
                onToggle={() => setAutoCountFromCalendar((v) => !v)}
              />

              <View style={styles.valueTypeBlock}>
                <Text style={styles.fieldLabel}>Value tracking type</Text>
                <View style={styles.valueTypeRow}>
                  <ValueTypeButton
                    title="Cumulative"
                    subtitle="Values add up over time"
                    detail="e.g., push-ups, steps"
                    selected={isCumulative === true}
                    onPress={selectCumulative}
                  />
                  <ValueTypeButton
                    title="Rating"
                    subtitle="Values recorded at a point in time"
                    detail="e.g., mood, energy level"
                    selected={isCumulative === false}
                    onPress={selectRating}
                  />
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {/* Cancel mirrors angular's text-only `mat-button` */}
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
        <Button
          title="Create"
          onPress={handleCreate}
          disabled={isCreateDisabled}
          loading={submitting}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Small UI primitives — kept local since they're dialog-specific     *
 * ------------------------------------------------------------------ */

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
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
        {checked && (
          <MaterialIcons name="check" size={16} color={Colors.onPrimary} />
        )}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function ValueTypeButton({
  title,
  subtitle,
  detail,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  const [isHovering, setIsHovering] = useState(false);
  /* Angular CSS uses `filter: brightness(1.2)` on hover (1.15 when selected).
   * Web supports `filter` natively; on native we fall back to a subtle
   * background change to stay readable. */
  const webHoverStyle =
    Platform.OS === "web" && isHovering
      ? ({
          filter: selected ? "brightness(1.15)" : "brightness(1.2)",
        } as any)
      : undefined;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setIsHovering(true)}
      onHoverOut={() => setIsHovering(false)}
      style={[
        styles.valueTypeButton,
        selected && styles.valueTypeButtonSelected,
        webHoverStyle,
        Platform.OS !== "web" && isHovering && !selected && styles.valueTypeButtonHoverNative,
      ]}
    >
      <Text
        style={[
          styles.valueTypeTitle,
          selected && styles.valueTypeTitleSelected,
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.valueTypeSubtitle,
          selected && styles.valueTypeSubtitleSelected,
        ]}
      >
        {subtitle}
      </Text>
      <Text
        style={[
          styles.valueTypeDetail,
          selected && styles.valueTypeDetailSelected,
        ]}
      >
        {detail}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Styles                                                             *
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 1000,
    // On web we must escape any absolutely-positioned ancestor (e.g. the
    // narrow side column on DesktopHome) so the overlay always covers the
    // full viewport — same trick we use for TrackablePicker and the
    // per-trackable widget dialogs.
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
    width: 640,
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
  headingCentered: {
    fontSize: 22,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
    paddingRight: 24, // leave room for close X
  },
  dialogTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 16,
    paddingRight: 24,
  },
  subheading: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  cardGrid: {
    flexDirection: "column",
    gap: 24,
  },
  cardGridTwoCol: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 24,
  },
  formScroll: { maxHeight: 480 },
  formContent: { paddingBottom: 8, gap: 16 },
  field: { gap: 6 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
  errorText: { fontSize: 12, color: Colors.error, marginTop: 2 },
  checkboxStack: { gap: 12 },
  indent: { marginLeft: 32, gap: 12 },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...Platform.select({
      web: { cursor: "pointer", userSelect: "none" } as any,
      default: {},
    }),
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.outline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  checkboxBoxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxLabel: { flex: 1, fontSize: 14, color: Colors.text },
  valueTypeBlock: { gap: 6 },
  valueTypeRow: { flexDirection: "row", gap: 8 },
  valueTypeButton: {
    flex: 1,
    minHeight: 80,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 2,
    borderColor: "transparent",
    ...Platform.select({
      web: { cursor: "pointer", transition: "all 150ms ease" } as any,
      default: {},
    }),
  },
  valueTypeButtonSelected: {
    backgroundColor: Colors.primaryContainer,
    borderColor: Colors.primary,
  },
  valueTypeButtonHoverNative: {
    backgroundColor: Colors.surfaceContainerHighest,
  },
  valueTypeTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.text,
    marginBottom: 4,
  },
  valueTypeTitleSelected: { color: Colors.onPrimaryContainer },
  valueTypeSubtitle: { fontSize: 12, color: Colors.textSecondary, opacity: 0.85 },
  valueTypeSubtitleSelected: { color: Colors.onPrimaryContainer, opacity: 0.9 },
  valueTypeDetail: {
    fontSize: 12,
    color: Colors.textTertiary,
    opacity: 0.7,
    marginTop: 2,
  },
  valueTypeDetailSelected: { color: Colors.onPrimaryContainer, opacity: 0.75 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
});
