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

interface TrackablePickerProps {
  value: Id<"trackables"> | null | undefined;
  onChange: (id: Id<"trackables"> | null) => void;
  label?: string;
  /**
   * When false, render the field inline (full-width row). When true, render
   * a compact dropdown trigger that opens an overlay menu. Default: true.
   */
  compact?: boolean;
}

/**
 * Field for assigning a task to a trackable. Mirrors productivity-one's
 * `<mat-select>` in `task-details.html` (single select, "None" option,
 * shows the goal's colour swatch + name).
 */
export function TrackablePicker({
  value,
  onChange,
  label = "Trackable",
  compact = true,
}: TrackablePickerProps) {
  const { profileReady } = useAuth();
  const [open, setOpen] = useState(false);
  const trackables = useQuery(
    api.trackables.search,
    profileReady ? { archived: false } : "skip",
  );

  const selected = trackables?.find((t) => t._id === value);

  const renderTrigger = () => (
    <TouchableOpacity
      style={styles.trigger}
      onPress={() => setOpen((v) => !v)}
      accessibilityLabel={`${label} picker`}
    >
      <View style={styles.triggerInner}>
        {selected ? (
          <>
            <View
              style={[styles.colourDot, { backgroundColor: selected.colour }]}
            />
            <Text style={styles.triggerText} numberOfLines={1}>
              {selected.name}
            </Text>
          </>
        ) : (
          <Text style={styles.triggerPlaceholder}>None</Text>
        )}
      </View>
      <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
    </TouchableOpacity>
  );

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
                <Text style={styles.menuItemText}>None</Text>
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
                  No trackables yet — create one from the Goals tab.
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
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "500",
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainer,
    gap: 8,
  },
  triggerInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  triggerText: { fontSize: 14, color: Colors.text, flex: 1 },
  triggerPlaceholder: { fontSize: 14, color: Colors.textTertiary },
  colourDot: { width: 12, height: 12, borderRadius: 3 },
  colourDotEmpty: {
    width: 12,
    height: 12,
    borderRadius: 3,
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
    borderRadius: 10,
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
    borderRadius: 6,
  },
  menuItemText: { flex: 1, fontSize: 14, color: Colors.text },
  emptyText: {
    fontSize: 13,
    color: Colors.textTertiary,
    padding: 16,
    textAlign: "center",
  },
});
