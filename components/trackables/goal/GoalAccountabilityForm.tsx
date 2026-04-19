/**
 * Step 3 of every goal-onboarding dialog.
 *
 * Productivity-one source:
 * - components/goal-accountability-form/goal-accountability-form.{ts,html}
 *
 * Two stance buttons (must pick one) followed — when "Accept penalty" is
 * chosen — by a list of optional penalty checkboxes with their conditional
 * inputs and a draggable "Something else..." list.
 */
import React from "react";
import { View, Text, Pressable, StyleSheet, Platform, TextInput } from "react-native";
import { Colors } from "../../../constants/colors";
import { CheckboxRow, DraggableTextList } from "./atoms";

export interface GoalAccountabilityValue {
  willAcceptPenalty?: boolean;
  willDonateToCharity?: boolean;
  donateMoneyCharityAmount?: number;
  willSendMoneyToAFriend?: boolean;
  sendMoneyFriendAmount?: number;
  sendMoneyFriendName?: string;
  willPostOnSocialMedia?: boolean;
  willShaveHead?: boolean;
  otherPenaltySelected?: boolean;
  otherPenalties?: string[];
}

export function isAccountabilityValid(v: GoalAccountabilityValue): boolean {
  return v.willAcceptPenalty !== undefined;
}

export function GoalAccountabilityForm({
  value,
  onChange,
}: {
  value: GoalAccountabilityValue;
  onChange: (next: GoalAccountabilityValue) => void;
}) {
  const set = (patch: Partial<GoalAccountabilityValue>) =>
    onChange({ ...value, ...patch });

  return (
    <View style={styles.container}>
      <Text style={styles.copy}>
        You're more likely to accomplish your goal if there are stakes invoked.
      </Text>
      <Text style={styles.copy}>If I don't accomplish my goal I will:</Text>

      <Pressable
        onPress={() => set({ willAcceptPenalty: false })}
        style={[
          styles.stanceButton,
          value.willAcceptPenalty === false && styles.stanceButtonNo,
        ]}
      >
        <Text
          style={[
            styles.stanceButtonText,
            value.willAcceptPenalty === false && { color: "#EF5350" },
          ]}
        >
          Not have any penalty. I don't take my goals seriously
        </Text>
      </Pressable>

      <Pressable
        onPress={() => set({ willAcceptPenalty: true })}
        style={[
          styles.stanceButton,
          value.willAcceptPenalty === true && styles.stanceButtonYes,
        ]}
      >
        <Text
          style={[
            styles.stanceButtonText,
            value.willAcceptPenalty === true && { color: "#66BB6A" },
          ]}
        >
          Accept a penalty because I'm hardcore and committed
        </Text>
      </Pressable>

      {value.willAcceptPenalty === true && (
        <View style={styles.penaltyGroup}>
          <CheckboxRow
            label="Donate money to a charity I don't support"
            checked={!!value.willDonateToCharity}
            onToggle={() =>
              set({ willDonateToCharity: !value.willDonateToCharity })
            }
          />
          {value.willDonateToCharity && (
            <View style={styles.indented}>
              <Text style={styles.inlineLabel}>The amount I will donate is:</Text>
              <TextInput
                value={
                  value.donateMoneyCharityAmount === undefined
                    ? ""
                    : String(value.donateMoneyCharityAmount)
                }
                onChangeText={(s) => {
                  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
                  set({
                    donateMoneyCharityAmount: Number.isNaN(n) ? undefined : n,
                  });
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                style={styles.smallInput}
              />
            </View>
          )}

          <CheckboxRow
            label="Send money to a friend"
            checked={!!value.willSendMoneyToAFriend}
            onToggle={() =>
              set({ willSendMoneyToAFriend: !value.willSendMoneyToAFriend })
            }
          />
          {value.willSendMoneyToAFriend && (
            <>
              <View style={styles.indented}>
                <Text style={styles.inlineLabel}>The amount I will send is:</Text>
                <TextInput
                  value={
                    value.sendMoneyFriendAmount === undefined
                      ? ""
                      : String(value.sendMoneyFriendAmount)
                  }
                  onChangeText={(s) => {
                    const n = parseInt(s.replace(/[^\d]/g, ""), 10);
                    set({
                      sendMoneyFriendAmount: Number.isNaN(n) ? undefined : n,
                    });
                  }}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  style={styles.smallInput}
                />
              </View>
              <View style={styles.indented}>
                <Text style={styles.inlineLabel}>The friend's name is:</Text>
                <TextInput
                  value={value.sendMoneyFriendName ?? ""}
                  onChangeText={(s) => set({ sendMoneyFriendName: s })}
                  style={[styles.smallInput, { width: 160 }]}
                />
              </View>
            </>
          )}

          <CheckboxRow
            label="Make a post on social media, explaining my failure"
            checked={!!value.willPostOnSocialMedia}
            onToggle={() =>
              set({ willPostOnSocialMedia: !value.willPostOnSocialMedia })
            }
          />
          <CheckboxRow
            label="Shave my head"
            checked={!!value.willShaveHead}
            onToggle={() => set({ willShaveHead: !value.willShaveHead })}
          />
          <CheckboxRow
            label="Something else..."
            checked={!!value.otherPenaltySelected}
            onToggle={() =>
              set({ otherPenaltySelected: !value.otherPenaltySelected })
            }
          />

          {value.otherPenaltySelected && (
            <View style={{ marginTop: 8 }}>
              <DraggableTextList
                items={value.otherPenalties ?? []}
                onChange={(otherPenalties) => set({ otherPenalties })}
                onAdd={() =>
                  set({
                    otherPenalties: [...(value.otherPenalties ?? []), ""],
                  })
                }
                addLabel="Add penalty"
                placeholder="Penalty"
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  copy: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  stanceButton: {
    borderWidth: 1,
    borderColor: Colors.outline,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  stanceButtonNo: { borderColor: "#EF5350" },
  stanceButtonYes: { borderColor: "#66BB6A" },
  stanceButtonText: { fontSize: 14, color: Colors.text, textAlign: "center" },
  penaltyGroup: { gap: 4, marginTop: 4 },
  indented: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 56,
    marginVertical: 2,
  },
  inlineLabel: { fontSize: 14, color: Colors.text },
  smallInput: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: Colors.text,
    width: 80,
  },
});
