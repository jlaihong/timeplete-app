import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { Colors, stackHeaderChromeOptions } from "../../constants/colors";
import { AgentAccessSection } from "../../components/settings/AgentAccessSection";
import { DrawerMenuButton } from "../../components/layout/DrawerMenuButton";
import { pageColumnStyle } from "../../components/layout/DesktopPageHeader";
import { useIsDesktop } from "../../hooks/useIsDesktop";

/**
 * Agent access. On a phone it is its own page, reached from Settings, so
 * the long key form doesn't bury the account rows. On desktop it stays a
 * section of Settings, and this route redirects there.
 */
export default function AgentAccessScreen() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <Redirect href="/(app)/settings" />;
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          ...stackHeaderChromeOptions,
          headerShown: true,
          title: "Agent access",
          headerLeft: () => <DrawerMenuButton />,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AgentAccessSection />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 48,
    ...pageColumnStyle,
  },
});
