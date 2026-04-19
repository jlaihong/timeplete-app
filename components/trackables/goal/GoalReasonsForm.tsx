/**
 * Step 2 of every goal-onboarding dialog.
 *
 * Productivity-one source:
 * - components/goal-reasons-form/goal-reasons-form.{ts,html}
 *
 * Two paragraphs of copy + a draggable list of textarea rows + an
 * "Add reason" button. Always considered valid (so the stepper's Next
 * button is never blocked here).
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { DraggableTextList } from "./atoms";

export interface GoalReasonsValue {
  reasons: string[];
}

export function GoalReasonsForm({
  value,
  onChange,
}: {
  value: GoalReasonsValue;
  onChange: (next: GoalReasonsValue) => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.copy}>
        Studies show that thinking about why a goal is important to you makes
        it more likely that you'll succeed.
      </Text>
      <Text style={styles.copy}>
        List some reasons why this goal is important to you. Make sure they
        are personal to YOU
      </Text>

      <DraggableTextList
        items={value.reasons}
        onChange={(reasons) => onChange({ reasons })}
        onAdd={() => onChange({ reasons: [...value.reasons, ""] })}
        addLabel="Add reason"
        placeholder="Reason"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  copy: { fontSize: 14, color: Colors.text, lineHeight: 20 },
});
