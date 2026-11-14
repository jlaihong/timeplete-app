import React from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import { Colors } from "../../constants/colors";

/** Screens that sit directly on a bottom tab: they have nothing to go back to. */
const TAB_ROOT_PATHS = new Set([
  "/",
  "/lists",
  "/calendar",
  "/goals",
  "/analytics",
  "/reviews",
]);

/**
 * Where "back" leads from a screen that is not a tab root. Fixed parents
 * rather than history, so back always lands somewhere predictable even
 * after a deep link or a refresh.
 */
export function mobileBackTarget(pathname: string): Href | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (TAB_ROOT_PATHS.has(path)) return null;
  if (path.startsWith("/lists/")) return "/(app)/lists";
  if (path.startsWith("/pages/")) return "/(app)/pages";
  if (path.startsWith("/edit-trackable/")) return "/(app)/(tabs)/goals";
  if (
    path === "/tags" ||
    path === "/pages" ||
    path === "/shared" ||
    path === "/agent"
  ) {
    return "/(app)/settings";
  }
  // Settings (the "More" hub) and anything unknown fall back to Home.
  return "/(app)/(tabs)";
}

/**
 * Header-left button for the phone layout. The phone has no drawer: the
 * bottom tab bar is always on screen, so tab roots show nothing here and
 * every other screen shows a back chevron to its parent.
 *
 * (The name is historical — this used to open the navigation drawer.)
 *
 * iOS renders native-stack `headerLeft` views inside a circular (liquid
 * glass) capsule, so the touchable must be SYMMETRIC or the icon sits
 * off-center in that circle. Android/web headers draw no capsule, so they
 * keep a left inset.
 */
export function DrawerMenuButton() {
  const pathname = usePathname();
  const target = mobileBackTarget(pathname);
  if (!target) {
    // A stack header with nothing on the left puts the title against the
    // screen edge on Android/web; pad it to the 16px the tab headers use.
    // (iOS insets the title itself, and would draw a capsule round a view.)
    return Platform.OS === "ios" ? null : <View style={{ width: 8 }} />;
  }
  return (
    <TouchableOpacity
      onPress={() => {
        // Settings is reached from any tab, so return to wherever it was
        // opened from when there is history to return to.
        if (pathname === "/settings" && router.canGoBack()) {
          router.back();
          return;
        }
        router.replace(target);
      }}
      style={
        Platform.OS === "ios"
          ? {
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            }
          : {
              width: 44,
              height: 44,
              marginLeft: 6,
              alignItems: "center",
              justifyContent: "center",
            }
      }
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Ionicons name="chevron-back" size={24} color={Colors.text} />
    </TouchableOpacity>
  );
}
