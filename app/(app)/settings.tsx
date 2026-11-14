import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Stack, router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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

        {isDesktop ? (
          <>
            <Text style={styles.sectionLabel}>Agent access</Text>
            <AgentAccessSection />
          </>
        ) : (
          // Phones have no sidebar: the pages that aren't on the tab bar
          // are reached from here.
          <>
            <Text style={styles.sectionLabel}>Organise</Text>
            <View style={styles.linkGroup}>
              <LinkRow icon="pricetag-outline" label="Tags" href="/(app)/tags" />
              <LinkRow icon="at-outline" label="Pages" href="/(app)/pages" />
              <LinkRow
                icon="people-outline"
                label="Shared with me"
                href="/(app)/shared"
                last
              />
            </View>
            <Text style={styles.sectionLabel}>Advanced</Text>
            <View style={styles.linkGroup}>
              <LinkRow
                icon="key-outline"
                label="Agent access"
                note="API keys for AI agents"
                href="/(app)/agent"
                last
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  note,
  href,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  note?: string;
  href: Href;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.navigate(href)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => [
        styles.linkRow,
        !last && styles.linkRowDivider,
        state.pressed && styles.linkRowPressed,
      ]}
    >
      <Ionicons name={icon} size={20} color={Colors.textSecondary} />
      <View style={styles.linkText}>
        <Text style={styles.linkLabel}>{label}</Text>
        {note ? <Text style={styles.linkNote}>{note}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linkGroup: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerLow,
    overflow: "hidden",
  },
  linkRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
  },
  linkRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
  },
  linkRowPressed: { backgroundColor: Colors.surfaceContainerHigh },
  linkText: { flex: 1, minWidth: 0 },
  linkLabel: { fontSize: FontSize.bodyLarge, color: Colors.text },
  linkNote: { fontSize: FontSize.caption, color: Colors.textTertiary },
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
