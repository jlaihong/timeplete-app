/**
 * The 3-step `mat-vertical-stepper` goal-onboarding dialog.
 *
 * Productivity-one source files (one per variant):
 *   components/goal-onboarding-periodic/
 *   components/goal-onboarding-reading/
 *   components/goal-onboarding-minutes-weekly/
 *   components/goal-onboarding-total-time/
 *   components/goal-onboarding-count/
 *
 * All five share the same chrome:
 *   <h2>Create a new goal</h2>
 *   Step "Goal details"             — variant-specific commitment form
 *   Step "Why is this important..." — GoalReasonsForm (always valid)
 *   Step "Accountability"           — GoalAccountabilityForm
 *
 * Submit button on step 3 is "Let's do this!".
 */
import React, { useState, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from "react-native";
import { useMutation } from "convex/react";
import { Colors } from "../../../constants/colors";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../ui/Button";
import {
  CommitmentForm,
  CommitmentValue,
  CommitmentVariant,
  buildDefaultCommitment,
  isCommitmentValid,
} from "./CommitmentForms";
import { GoalReasonsForm } from "./GoalReasonsForm";
import {
  GoalAccountabilityForm,
  GoalAccountabilityValue,
  isAccountabilityValid,
} from "./GoalAccountabilityForm";

export interface GoalFormSeed {
  goalName?: string;
  goalColour?: string;
  goalReasons?: string[];
}

interface GoalFormProps {
  variant: CommitmentVariant;
  seed: GoalFormSeed;
  onSubmitted: () => void;
}

export function GoalForm({ variant, seed, onSubmitted }: GoalFormProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [commitment, setCommitment] = useState<CommitmentValue>(() =>
    buildDefaultCommitment(variant, {
      goalName: seed.goalName,
      goalColour: seed.goalColour,
    })
  );
  const [reasons, setReasons] = useState<string[]>(seed.goalReasons ?? []);
  const [accountability, setAccountability] = useState<GoalAccountabilityValue>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const upsertTrackable = useMutation(api.trackables.upsert);

  const stepValid = useMemo(() => {
    if (stepIndex === 0) return isCommitmentValid(variant, commitment);
    if (stepIndex === 1) return true;
    return isAccountabilityValid(accountability);
  }, [stepIndex, variant, commitment, accountability]);

  const goNext = () => {
    if (!stepValid) return;
    setStepIndex((s) => Math.min(2, s + 1));
  };
  const goPrev = () => setStepIndex((s) => Math.max(0, s - 1));

  const submit = async () => {
    if (submitting) return;
    if (!stepValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const cleanedReasons = reasons.map((r) => r.trim()).filter((r) => r.length > 0);
      const cleanedPenalties = (accountability.otherPenalties ?? [])
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      await upsertTrackable({
        name: commitment.name.trim(),
        colour: commitment.colour,
        trackableType: commitment.trackableType,
        targetNumberOfDaysAWeek: commitment.targetNumberOfDaysAWeek,
        targetNumberOfMinutesAWeek: commitment.targetNumberOfMinutesAWeek,
        targetNumberOfHours: commitment.targetNumberOfHours,
        targetCount: commitment.targetCount,
        targetNumberOfWeeks: commitment.targetNumberOfWeeks,
        startDayYYYYMMDD: commitment.startDayYYYYMMDD,
        endDayYYYYMMDD: commitment.endDayYYYYMMDD,
        goalReasons: cleanedReasons.length > 0 ? cleanedReasons : undefined,
        willAcceptPenalty: accountability.willAcceptPenalty,
        willDonateToCharity: accountability.willDonateToCharity,
        donateMoneyCharityAmount: accountability.donateMoneyCharityAmount,
        willSendMoneyToAFriend: accountability.willSendMoneyToAFriend,
        sendMoneyFriendAmount: accountability.sendMoneyFriendAmount,
        sendMoneyFriendName: accountability.sendMoneyFriendName,
        willPostOnSocialMedia: accountability.willPostOnSocialMedia,
        willShaveHead: accountability.willShaveHead,
        otherPenaltySelected: accountability.otherPenaltySelected,
        otherPenalties: cleanedPenalties.length > 0 ? cleanedPenalties : undefined,
      });
      onSubmitted();
    } catch (e: any) {
      setSubmitError(e?.message ?? "Failed to create goal");
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabels = ["Goal details", "Why is this important to me?", "Accountability"];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create a new goal</Text>

      {/* Vertical stepper — only the active step renders its content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {stepLabels.map((label, i) => {
          const isActive = i === stepIndex;
          const isCompleted = i < stepIndex;
          return (
            <View key={i} style={styles.stepBlock}>
              <Pressable
                onPress={() => {
                  // allow jumping back to a completed step
                  if (i < stepIndex) setStepIndex(i);
                }}
                style={styles.stepHeaderRow}
              >
                <View
                  style={[
                    styles.stepBadge,
                    isActive && styles.stepBadgeActive,
                    isCompleted && styles.stepBadgeDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepBadgeText,
                      (isActive || isCompleted) && { color: Colors.onPrimary },
                    ]}
                  >
                    {i + 1}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stepHeaderLabel,
                    isActive && { color: Colors.text, fontWeight: "600" },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>

              {isActive && (
                <View style={styles.stepBody}>
                  {i === 0 && (
                    <CommitmentForm
                      variant={variant}
                      value={commitment}
                      onChange={setCommitment}
                    />
                  )}
                  {i === 1 && (
                    <GoalReasonsForm
                      value={{ reasons }}
                      onChange={(v) => setReasons(v.reasons)}
                    />
                  )}
                  {i === 2 && (
                    <GoalAccountabilityForm
                      value={accountability}
                      onChange={setAccountability}
                    />
                  )}

                  {/* Step actions */}
                  <View style={styles.stepActions}>
                    {i > 0 && (
                      <Button
                        title="Previous"
                        variant="ghost"
                        onPress={goPrev}
                      />
                    )}
                    {i < 2 ? (
                      <Button
                        title="Next"
                        variant="primary"
                        onPress={goNext}
                        disabled={!stepValid}
                      />
                    ) : (
                      <Button
                        title="Let's do this!"
                        variant="primary"
                        onPress={submit}
                        disabled={!stepValid || submitting}
                        loading={submitting}
                      />
                    )}
                  </View>

                  {submitError && i === 2 && (
                    <Text style={styles.submitError}>{submitError}</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, flex: 1, minHeight: 0 },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: Colors.text,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24, gap: 4 },
  stepBlock: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.outlineVariant,
    paddingLeft: 16,
    marginLeft: 12,
  },
  stepHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginLeft: -28,
    paddingVertical: 8,
    ...Platform.select({
      web: { cursor: "pointer", userSelect: "none" } as any,
      default: {},
    }),
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeActive: { backgroundColor: Colors.primary },
  stepBadgeDone: { backgroundColor: Colors.primary },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text,
  },
  stepHeaderLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  stepBody: { paddingTop: 12, paddingBottom: 16, gap: 16 },
  stepActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 4,
  },
  submitError: {
    fontSize: 13,
    color: Colors.error,
    textAlign: "right",
  },
});
