import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Stack } from "expo-router";
import { Colors, stackHeaderChromeOptions } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { AgentAccessSection } from "../../components/settings/AgentAccessSection";
import { DrawerMenuButton } from "../../components/layout/DrawerMenuButton";
import {
  DesktopPageHeader,
  pageColumnStyle,
} from "../../components/layout/DesktopPageHeader";
import { useAuth } from "../../hooks/useAuth";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useSignOut } from "../../hooks/useSignOut";

/**
 * Account and app settings. Holds the things that are about you rather
 * than about your tasks: who is signed in, signing out, and the API keys
 * that give an AI agent access.
 */
export default function SettingsScreen() {
  const isDesktop = useIsDesktop();
  const { profile } = useAuth();
  const signOut = useSignOut();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          ...stackHeaderChromeOptions,
          headerShown: !isDesktop,
          title: "Settings",
          headerLeft: () => <DrawerMenuButton />,
        }}
      />
      <DesktopPageHeader title="Settings" column />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Account</Text>
        <Card style={styles.card}>
          <View style={styles.accountText}>
            {profile?.name ? (
              <Text style={styles.name} numberOfLines={1}>
                {profile.name}
              </Text>
            ) : null}
            <Text style={styles.email} numberOfLines={1} selectable>
              {profile?.email ?? "Loading…"}
            </Text>
          </View>
          <Button
            title="Sign out"
            variant="outline"
            size="small"
            onPress={signOut}
          />
        </Card>

        <Text style={styles.sectionLabel}>Agent access</Text>
        <AgentAccessSection />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    ...pageColumnStyle,
    gap: 8,
  },
  sectionLabel: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginTop: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: Radius.lg,
  },
  accountText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: FontSize.body, fontWeight: "600", color: Colors.text },
  email: { fontSize: FontSize.caption, color: Colors.textSecondary },
});
