import React from "react";
import { Platform, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Colors } from "../../constants/colors";

/**
 * Header-right button on the phone's tab roots. Opens Settings, which is
 * also where Tags, Pages and "Shared with me" live on a phone.
 */
export function HeaderAccountButton() {
  return (
    <TouchableOpacity
      onPress={() => router.navigate("/(app)/settings")}
      style={{
        width: 44,
        height: 44,
        marginRight: Platform.OS === "ios" ? 0 : 6,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessibilityRole="button"
      accessibilityLabel="Account and more"
    >
      <Ionicons
        name="person-circle-outline"
        size={26}
        color={Colors.textSecondary}
      />
    </TouchableOpacity>
  );
}
