import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Colors } from "../../../constants/colors";
import { FontSize, Radius } from "../../../theme/tokens";
import { pageColumnStyle } from "../../../components/layout/DesktopPageHeader";
import { AutoGrowTextInput } from "../../../components/ui/AutoGrowTextInput";
import { MentionText } from "../../../components/mentions/MentionText";
import {
  PAGE_KINDS,
  PAGE_KIND_LABEL,
  type PageKind,
} from "../../../components/mentions/pageKinds";
import { reviewPeriodLabel } from "../../../lib/reviewPeriod";
import { useAuth } from "../../../hooks/useAuth";
import { useIsDesktop } from "../../../hooks/useIsDesktop";

const FREQUENCY_NAME = {
  DAILY: "Daily review",
  WEEKLY: "Weekly review",
  MONTHLY: "Monthly review",
  YEARLY: "Yearly review",
} as const;

const NOTES_SAVE_DELAY_MS = 800;

/**
 * One page: its name, what you know about it, and every text that
 * mentions it. Name, kind and notes save as you go.
 */
export default function PageScreen() {
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  const id = pageId as Id<"pages">;
  const { profileReady } = useAuth();
  const isDesktop = useIsDesktop();
  const page = useQuery(api.pages.get, profileReady ? { id } : "skip");
  const backlinks = useQuery(
    api.pages.backlinks,
    profileReady ? { pageId: id } : "skip",
  );
  const updatePage = useMutation(api.pages.update);
  const removePage = useMutation(api.pages.remove);

  /* Name and notes: what is typed is kept here until the server has it. */
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    setName(null);
    setNotes(null);
    setError(null);
  }, [id]);

  const save = (patch: { name?: string; kind?: PageKind; notes?: string }) => {
    setError(null);
    return updatePage({ id, ...patch }).catch((e) => {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    });
  };

  const commitName = () => {
    if (name === null || !page) return;
    const trimmed = name.trim();
    if (trimmed && trimmed !== page.name) {
      void save({ name: trimmed }).then(() => setName(null));
    } else {
      setName(null);
    }
  };

  const flushNotes = () => {
    if (notesTimer.current) {
      clearTimeout(notesTimer.current);
      notesTimer.current = null;
    }
    const text = notesRef.current;
    if (text === null) return;
    void save({ notes: text }).then(() => {
      if (notesRef.current === text) setNotes(null);
    });
  };
  // Leaving the page saves notes still waiting.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flushNotes(), [id]);

  const back = () => router.replace("/(app)/pages" as never);

  const confirmDelete = () => {
    if (!page) return;
    const run = async () => {
      await removePage({ id });
      back();
    };
    const message = `Delete the page "${page.name}"? Texts that mention it keep the name as plain words. This cannot be undone.`;
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) void run();
      return;
    }
    Alert.alert("Delete page", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  };

  if (page === undefined) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={styles.quiet}>Loading…</Text>
      </View>
    );
  }
  if (page === null) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Page" }} />
        <Text style={styles.quiet}>This page no longer exists.</Text>
        <Pressable onPress={back} accessibilityRole="link">
          <Text style={styles.link}>All pages</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: page.name }} />
      <ScrollView
        contentContainerStyle={[styles.content, pageColumnStyle]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          {isDesktop ? (
            <Pressable
              onPress={back}
              accessibilityRole="button"
              accessibilityLabel="All pages"
              hitSlop={8}
              style={styles.back}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={Colors.textSecondary}
              />
            </Pressable>
          ) : null}
          <TextInput
            value={name ?? page.name}
            onChangeText={setName}
            onBlur={commitName}
            onSubmitEditing={commitName}
            placeholder="Page name"
            placeholderTextColor={Colors.textTertiary}
            accessibilityLabel="Name"
            returnKeyType="done"
            style={[
              styles.name,
              Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
            ]}
          />
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete page"
            hitSlop={6}
            style={(state) => [
              styles.iconBtn,
              ((state as { hovered?: boolean }).hovered || state.pressed) &&
                styles.iconBtnHover,
            ]}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.kinds} accessibilityRole="radiogroup">
          {PAGE_KINDS.map((kind) => {
            const active = page.kind === kind;
            return (
              <Pressable
                key={kind}
                onPress={() => void save({ kind })}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.kind, active && styles.kindActive]}
              >
                <Text style={[styles.kindLabel, active && styles.kindLabelActive]}>
                  {PAGE_KIND_LABEL[kind]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>Notes</Text>
        <AutoGrowTextInput
          value={notes ?? page.notes ?? ""}
          onChangeText={(text) => {
            setNotes(text);
            notesRef.current = text;
            if (notesTimer.current) clearTimeout(notesTimer.current);
            notesTimer.current = setTimeout(flushNotes, NOTES_SAVE_DELAY_MS);
          }}
          onBlur={flushNotes}
          placeholder="What you know about them"
          placeholderTextColor={Colors.textTertiary}
          accessibilityLabel="Notes"
          style={styles.notes}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.section}>Mentioned in</Text>
        {backlinks === undefined ? (
          <Text style={styles.quietInline}>Loading…</Text>
        ) : backlinks.length === 0 ? (
          <Text style={styles.quietInline}>
            Nothing yet. Type @{page.name} in a review to link it here.
          </Text>
        ) : (
          backlinks.map((b) => (
            <View key={b.mentionId} style={styles.mention}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(app)/(tabs)/reviews",
                    params: { frequency: b.frequency ?? "DAILY", day: b.day },
                  } as never)
                }
                accessibilityRole="link"
                style={styles.mentionHead}
              >
                <Text style={styles.mentionWhen}>
                  {b.frequency ? reviewPeriodLabel(b.frequency, b.day) : b.day}
                </Text>
                <Text style={styles.mentionWhere} numberOfLines={1}>
                  {b.frequency ? FREQUENCY_NAME[b.frequency] : "Review"} ·{" "}
                  {b.title}
                </Text>
              </Pressable>
              <MentionText text={b.text} style={styles.mentionText} />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 96 },
  quiet: {
    textAlign: "center",
    marginTop: 40,
    fontSize: FontSize.body,
    color: Colors.textSecondary,
  },
  quietInline: { fontSize: FontSize.body, color: Colors.textTertiary },
  link: {
    textAlign: "center",
    marginTop: 12,
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.primary,
  },

  header: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  back: { marginLeft: -6, padding: 4 },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.title,
    fontWeight: "600",
    color: Colors.text,
    paddingVertical: 4,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnHover: { backgroundColor: Colors.surfaceContainerHigh },

  kinds: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 3,
    gap: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceContainer,
  },
  kind: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: Radius.pill },
  kindActive: { backgroundColor: Colors.surfaceContainerHighest },
  kindLabel: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  kindLabelActive: { color: Colors.text },

  section: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Colors.textTertiary,
    marginTop: 28,
    marginBottom: 8,
  },
  notes: {
    minHeight: 96,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: FontSize.body,
    lineHeight: 22,
    color: Colors.text,
    backgroundColor: Colors.surfaceContainerLow,
  },
  error: { fontSize: FontSize.caption, color: Colors.error, marginTop: 8 },

  mention: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
    gap: 4,
  },
  mentionHead: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  mentionWhen: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
  },
  mentionWhere: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
  mentionText: {
    fontSize: FontSize.body,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
});
