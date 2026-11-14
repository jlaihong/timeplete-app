import React from "react";
import { StyleSheet, View } from "react-native";

export interface PickerAnchor {
  left: number;
  top: number;
  bottom: number;
}

/**
 * Where the "@" picker is drawn. On phones it sits in the layout directly
 * under the field (see the `.web` file for the floating version).
 */
export function MentionPickerPortal({
  children,
}: {
  anchor: PickerAnchor | null;
  children: React.ReactNode;
}) {
  return <View style={styles.inline}>{children}</View>;
}

const styles = StyleSheet.create({
  inline: { marginTop: 6, alignSelf: "stretch" },
});
