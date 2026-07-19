import React from "react";
import { Redirect, Stack, usePathname } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { Colors } from "../../constants/colors";

export default function AuthLayout() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading, isApproved } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const isPendingApproval =
    pathname === "/pending-approval" ||
    pathname.endsWith("/pending-approval");

  if (isAuthenticated && !isPendingApproval) {
    if (!isApproved) {
      return <Redirect href="/(auth)/pending-approval" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
});
