import React, { useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { matchPages } from "../../lib/mentions";
import { useAuth } from "../../hooks/useAuth";
import { usePages } from "../../hooks/usePages";

interface Props {
  trackableId: Id<"trackables">;
}

/**
 * "What counts": the rules that make tasks and events count toward a
 * trackable without allocating each one. Something counts when it is
 * allocated to the trackable ("Tracks to") OR matches any rule here.
 *
 * Changes are saved as they are made; what a changed rule matches is
 * re-counted in the background, past items included.
 */
export function TrackableRulesEditor({ trackableId }: Props) {
  const { profileReady } = useAuth();
  const rules = useQuery(
    api.trackables.getRules,
    profileReady ? { id: trackableId } : "skip",
  );
  const setRules = useMutation(api.trackables.setRules);
  if (!rules) return null;
  return (
    <TrackableRulesFields
      value={rules}
      onChange={(next) =>
        void setRules({
          id: trackableId,
          pageIds: next.pageIds as Id<"pages">[],
          listIds: next.listIds as Id<"lists">[],
        })
      }
    />
  );
}

export interface TrackableRulesValue {
  pageIds: string[];
  listIds: string[];
}

/**
 * The rule pickers on their own, for a trackable that does not exist yet:
 * the form holds the rules and saves them once the trackable is created.
 */
export function TrackableRulesFields({
  value,
  onChange,
}: {
  value: TrackableRulesValue;
  onChange: (next: TrackableRulesValue) => void;
}) {
  const { profileReady } = useAuth();
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const { pages } = usePages();

  const pageOptions = useMemo(
    () => pages.map((p) => ({ id: p._id as string, name: p.name })),
    [pages],
  );
  const listOptions = useMemo(
    () =>
      (lists ?? [])
        .filter((l) => !l.archived)
        .map((l) => ({ id: l._id as string, name: l.name, colour: l.colour }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lists],
  );

  return (
    <View>
      <Text style={styles.heading}>What counts</Text>
      <Text style={styles.help}>
        Anything you allocate to this trackable counts. These rules add more,
        without allocating each one.
      </Text>

      <RulePicker
        label="Anything that mentions"
        prefix="@"
        placeholder="Add a page"
        options={pageOptions}
        value={value.pageIds}
        onChange={(pageIds) => onChange({ ...value, pageIds })}
      />
      <RulePicker
        label="Tasks on the list"
        placeholder="Add a list"
        options={listOptions}
        value={value.listIds}
        onChange={(listIds) => onChange({ ...value, listIds })}
      />
    </View>
  );
}

type Option = { id: string; name: string; colour?: string };

function RulePicker({
  label,
  prefix = "",
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  prefix?: string;
  placeholder: string;
  options: Option[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const matches = useMemo(
    () => matchPages(options.filter((o) => !value.includes(o.id)), query, 6),
    [options, value, query],
  );

  return (
    <View style={styles.rule}>
      <Text style={styles.ruleLabel}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused]}>
        {value.map((id) => (
          <View key={id} style={styles.chip}>
            {byId.get(id)?.colour ? (
              <View
                style={[styles.dot, { backgroundColor: byId.get(id)!.colour }]}
              />
            ) : null}
            <Text style={styles.chipText} numberOfLines={1}>
              {prefix}
              {byId.get(id)?.name ?? "…"}
            </Text>
            <Pressable
              onPress={() => onChange(value.filter((v) => v !== id))}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${byId.get(id)?.name ?? "rule"}`}
            >
              <Ionicons name="close" size={14} color={Colors.textSecondary} />
            </Pressable>
          </View>
        ))}
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setFocused(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => {
              setFocused(false);
              setQuery("");
            }, 150);
          }}
          onSubmitEditing={() => {
            if (query && matches[0]) {
              onChange([...value, matches[0].id]);
              setQuery("");
            }
          }}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={`${label}: ${placeholder}`}
        />
      </View>
      {focused && matches.length > 0 ? (
        <View style={styles.menu} accessibilityRole="menu">
          {matches.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => {
                onChange([...value, o.id]);
                setQuery("");
              }}
              accessibilityRole="menuitem"
              style={styles.option}
            >
              {o.colour ? (
                <View style={[styles.dot, { backgroundColor: o.colour }]} />
              ) : null}
              <Text style={styles.optionText} numberOfLines={1}>
                {prefix}
                {o.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  help: {
    marginTop: 4,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
  rule: { marginTop: 12 },
  ruleLabel: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  box: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  boxFocused: { borderColor: Colors.primary },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  chipText: { fontSize: FontSize.body, color: Colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  input: {
    flexGrow: 1,
    minWidth: 90,
    paddingVertical: 4,
    fontSize: FontSize.body,
    color: Colors.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  menu: {
    marginTop: 4,
    padding: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHighest,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  optionActive: { backgroundColor: Colors.surfaceContainerHigh },
  optionText: { flex: 1, fontSize: FontSize.body, color: Colors.text },
});
