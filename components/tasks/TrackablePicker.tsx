import { FontSize, Radius } from "../../theme/tokens";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  Platform,
} from "react-native";
import { useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { useAuth } from "../../hooks/useAuth";
import { useRegisterEscapeClose } from "../../hooks/useRegisterEscapeClose";

interface TrackablePickerProps {
  value: Id<"trackables"> | null | undefined;
  onChange: (id: Id<"trackables"> | null) => void;
  label?: string;
  /**
   * Trackable the task already counts toward through its list. Shown as
   * the default when `value` is empty, so picking a trackable here is an
   * override rather than a competing assignment.
   */
  inheritedTrackableId?: Id<"trackables"> | null;
  /**
   * When false, list-detail / locked goal UX (productivity-one): show the
   * swatch + label with no menu.
   */
  editable?: boolean;
  /**
   * When false, render the field inline (full-width row). When true, render
   * a compact dropdown trigger that opens an overlay menu. Default: true.
   */
  compact?: boolean;
}

/**
 * "Counts toward" field: which trackable a task's time and completion feed.
 *
 * A task always lives in a list; the trackable is a separate question. By
 * default it follows the list (when the list is linked to a trackable) and
 * this field only stores an explicit per-task override.
 */
export function TrackablePicker({
  value,
  onChange,
  label = "Counts toward",
  inheritedTrackableId,
  editable = true,
  compact = true,
}: TrackablePickerProps) {
  const { profileReady } = useAuth();
  const [open, setOpen] = useState(false);
  useRegisterEscapeClose(() => setOpen(false), open);
  const trackables = useQuery(
    api.trackables.search,
    profileReady ? { archived: false } : "skip",
  );

  const selected = trackables?.find((t) => t._id === value);
  const inherited =
    !value && inheritedTrackableId
      ? trackables?.find((t) => t._id === inheritedTrackableId)
      : undefined;
  /** What the task effectively counts toward: the override, else the list's. */
  const shown = selected ?? inherited;

  const triggerBody = shown ? (
    <>
      <View style={[styles.colourDot, { backgroundColor: shown.colour }]} />
      <Text style={styles.triggerText} numberOfLines={1}>
        {shown.name}
        {inherited ? (
          <Text style={styles.triggerHint}> · from list</Text>
        ) : null}
      </Text>
    </>
  ) : (
    <Text style={styles.triggerPlaceholder}>Nothing</Text>
  );

  const readonlyBody = (
    <View
      style={[styles.trigger, styles.triggerReadonly]}
      accessibilityRole="text"
      accessibilityLabel={
        shown ? `${label}: ${shown.name}` : `${label}: nothing`
      }
    >
      <View style={styles.triggerInner}>
        {triggerBody}
      </View>
    </View>
  );

  const renderTrigger = () => (
    <TouchableOpacity
      style={styles.trigger}
      onPress={() => setOpen((v) => !v)}
      accessibilityLabel={`${label} picker`}
      accessibilityRole="button"
    >
      <View style={styles.triggerInner}>
        {triggerBody}
      </View>
      <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
    </TouchableOpacity>
  );

  if (!editable) {
    return (
      <View style={styles.container}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {readonlyBody}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {renderTrigger()}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.menu, compact && styles.menuCompact]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <ScrollView style={styles.menuScroll}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <View style={styles.colourDotEmpty} />
                <Text style={styles.menuItemText} numberOfLines={1}>
                  {inheritedTrackableId
                    ? `Same as list${
                        trackables?.find((t) => t._id === inheritedTrackableId)
                          ? ` (${trackables.find((t) => t._id === inheritedTrackableId)!.name})`
                          : ""
                      }`
                    : "Nothing"}
                </Text>
                {!value && (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={Colors.primary}
                  />
                )}
              </TouchableOpacity>
              {trackables?.map((t) => {
                const isSelected = value === t._id;
                return (
                  <TouchableOpacity
                    key={t._id}
                    style={styles.menuItem}
                    onPress={() => {
                      onChange(t._id);
                      setOpen(false);
                    }}
                  >
                    <View
                      style={[styles.colourDot, { backgroundColor: t.colour }]}
                    />
                    <Text style={styles.menuItemText} numberOfLines={1}>
                      {t.name}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={Colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
              {trackables && trackables.length === 0 && (
                <Text style={styles.emptyText}>
                  No trackables yet — create one from the Trackables tab.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainer,
    gap: 8,
  },
  triggerReadonly: {
    justifyContent: "flex-start",
    opacity: 0.92,
  },
  triggerInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  triggerText: { fontSize: FontSize.body, color: Colors.text, flex: 1 },
  triggerHint: { color: Colors.textTertiary },
  triggerPlaceholder: { fontSize: FontSize.body, color: Colors.textTertiary },
  colourDot: { width: 12, height: 12, borderRadius: Radius.sm },
  colourDotEmpty: {
    width: 12,
    height: 12,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.outline,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  menu: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    width: "100%",
    maxWidth: 360,
    maxHeight: 400,
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.4)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  menuCompact: { width: "100%", maxWidth: 360 },
  menuScroll: { padding: 8 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  menuItemText: { flex: 1, fontSize: FontSize.body, color: Colors.text },
  emptyText: {
    fontSize: FontSize.body,
    color: Colors.textTertiary,
    padding: 16,
    textAlign: "center",
  },
});
