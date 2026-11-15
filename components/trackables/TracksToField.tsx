import React, { useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { matchPages } from "../../lib/mentions";
import { useTrackableTags } from "../../hooks/useTrackableTags";

interface TracksToFieldProps {
  /** Trackables the task or event is allocated to, in the order picked. */
  value: Id<"trackables">[];
  onChange: (ids: Id<"trackables">[]) => void;
  /**
   * Everything the saved item counts toward (its stamp). Whatever is in
   * here but not in `value` got there by a rule or as a parent, and is
   * listed underneath as "Also counts toward".
   */
  countsToward?: readonly string[] | null;
  label?: string;
  editable?: boolean;
}

const MAX_OPTIONS = 8;

/**
 * "Tracks to": the trackables a task or event is allocated to. Type to
 * search, pick to add, as many as apply. Typing "#" in the item's title
 * is a shortcut into this same field.
 *
 * Allocation is one way something counts toward a trackable; rules on the
 * trackable (a list, a mentioned page) and its place in the tree are the
 * others, and those show underneath, read-only.
 */
export function TracksToField({
  value,
  onChange,
  countsToward,
  label = "Tracks to",
  editable = true,
}: TracksToFieldProps) {
  const tags = useTrackableTags();
  const inputRef = useRef<TextInput | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = useMemo(() => {
    const chosen = new Set<string>(value);
    return matchPages(
      tags.options.filter((o) => !chosen.has(o.trackable._id)),
      query,
      MAX_OPTIONS,
    );
  }, [tags.options, value, query]);

  const derived = useMemo(() => {
    const chosen = new Set<string>(value);
    return (countsToward ?? [])
      .filter((id) => !chosen.has(id))
      .map((id) => tags.byId.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t);
  }, [countsToward, value, tags.byId]);

  const add = (id: Id<"trackables">) => {
    if (!value.includes(id)) onChange([...value, id]);
    setQuery("");
    setActiveIndex(0);
  };
  const remove = (id: Id<"trackables">) =>
    onChange(value.filter((v) => v !== id));

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    const key = e.nativeEvent.key;
    const stop = () => {
      e.preventDefault?.();
      e.stopPropagation?.();
    };
    if (key === "Backspace" && query === "" && value.length > 0) {
      remove(value[value.length - 1]);
      return;
    }
    if (options.length === 0) return;
    if (key === "ArrowDown" || key === "ArrowUp") {
      stop();
      setActiveIndex(
        (i) =>
          (i + (key === "ArrowDown" ? 1 : options.length - 1)) % options.length,
      );
    } else if (key === "Enter" && (query !== "" || activeIndex > 0)) {
      stop();
      add(options[Math.min(activeIndex, options.length - 1)].trackable._id);
    } else if (key === "Escape" && query !== "") {
      stop();
      setQuery("");
    }
  };

  const open = editable && focused && options.length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.box, focused && styles.boxFocused]}
        onPress={() => inputRef.current?.focus()}
        accessibilityLabel={label}
      >
        {value.map((id) => {
          const t = tags.byId.get(id);
          return (
            <View key={id} style={styles.chip}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: t?.colour ?? Colors.outlineVariant },
                ]}
              />
              <Text style={styles.chipText} numberOfLines={1}>
                {t?.name ?? "Deleted trackable"}
              </Text>
              {editable ? (
                <Pressable
                  onPress={() => remove(id)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Stop tracking to ${t?.name ?? "this trackable"}`}
                >
                  <Ionicons name="close" size={14} color={Colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {editable ? (
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setActiveIndex(0);
            }}
            onKeyPress={handleKeyPress}
            onFocus={() => {
              if (blurTimer.current) clearTimeout(blurTimer.current);
              setFocused(true);
            }}
            // A press on an option blurs the field first; wait for the
            // press to land before closing the list.
            onBlur={() => {
              blurTimer.current = setTimeout(() => {
                setFocused(false);
                setQuery("");
              }, 150);
            }}
            placeholder={value.length === 0 ? "Nothing — type to add a trackable" : "Add"}
            placeholderTextColor={Colors.textTertiary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={`Add a trackable to ${label}`}
          />
        ) : value.length === 0 ? (
          <Text style={styles.empty}>Nothing</Text>
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.menu} accessibilityRole="menu">
          {options.map((o, i) => (
            <Pressable
              key={o.trackable._id}
              onPress={() => {
                add(o.trackable._id);
                inputRef.current?.focus();
              }}
              onHoverIn={() => setActiveIndex(i)}
              accessibilityRole="menuitem"
              style={[styles.option, i === activeIndex && styles.optionActive]}
            >
              <View
                style={[styles.dot, { backgroundColor: o.trackable.colour }]}
              />
              <Text style={styles.optionText} numberOfLines={1}>
                {o.path}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {derived.length > 0 ? (
        <View style={styles.derivedRow}>
          <Text style={styles.derivedLabel}>Also counts toward</Text>
          {derived.map((t) => (
            <View key={t._id} style={[styles.chip, styles.chipDerived]}>
              <View style={[styles.dot, { backgroundColor: t.colour }]} />
              <Text style={styles.chipTextDerived} numberOfLines={1}>
                {t.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "600",
  },
  box: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  boxFocused: { borderColor: Colors.primary },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  chipDerived: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  chipText: { fontSize: FontSize.body, color: Colors.text, flexShrink: 1 },
  chipTextDerived: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 80,
    paddingVertical: 4,
    fontSize: FontSize.body,
    color: Colors.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  empty: { fontSize: FontSize.body, color: Colors.textTertiary },
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
  derivedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  derivedLabel: { fontSize: FontSize.caption, color: Colors.textTertiary },
});
