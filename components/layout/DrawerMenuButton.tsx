import React from "react";
import { Platform, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import { Colors } from "../../constants/colors";

/**
 * iOS renders native-stack `headerLeft` views inside a circular (liquid
 * glass) capsule, so the touchable must be SYMMETRIC or the icon sits
 * off-center in that circle. The left inset the old `paddingLeft: 16`
 * provided is instead supplied by the header itself on iOS (the capsule
 * has its own system margin; the JS tab header adds
 * `headerLeftContainerStyle` padding — see `(tabs)/_layout.tsx`).
 * Android/web headers draw no capsule, so they keep the padding.
 */
export function DrawerMenuButton() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
      style={
        Platform.OS === "ios"
          ? {
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            }
          : { paddingLeft: 16 }
      }
      accessibilityRole="button"
      accessibilityLabel="Open navigation menu"
    >
      <Ionicons name="menu" size={24} color={Colors.text} />
    </TouchableOpacity>
  );
}
