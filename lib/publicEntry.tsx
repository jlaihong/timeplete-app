import { Platform } from "react-native";
import { Redirect } from "expo-router";
import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Colors } from "../constants/colors";
import { LandingPage } from "../components/landing/LandingPage";

type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  isApproved: boolean;
};

export function PublicEntry({
  auth,
  mode,
}: {
  auth: AuthState;
  mode: "root" | "landing";
}) {
  const { isAuthenticated, isLoading, isApproved } = auth;

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (isAuthenticated) {
    if (!isApproved) {
      return <Redirect href="/(auth)/pending-approval" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  if (mode === "root" && Platform.OS === "web") {
    return <Redirect href="/landing" />;
  }

  if (Platform.OS === "web") {
    return <LandingPage />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
});
