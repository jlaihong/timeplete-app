import { FontSize, Radius } from "../../theme/tokens";
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Switch,
  ScrollView,
} from "react-native";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import type { TaskFilterMember } from "../../lib/taskFilters";
import {
  DialogOverlay,
  DialogCard,
  DialogHeader,
  DialogFooter,
} from "../ui/DialogScaffold";

export type TaskFilterModalProps = {
  visible: boolean;
  onClose: () => void;
  showCompleted: boolean;
  onPersistShowCompleted: (value: boolean) => void;
  filterUserIds: string[];
  onToggleUserFilter: (userId: string, checked: boolean) => void;
  assignableMembers: TaskFilterMember[];
  showCollaboratorFilter: boolean;
};

/**
 * Popover-style filter sheet (RN Modal) shared by List detail and Home task list.
 */
export function TaskFilterModal({
  visible,
  onClose,
  showCompleted,
  onPersistShowCompleted,
  filterUserIds,
  onToggleUserFilter,
  assignableMembers,
  showCollaboratorFilter,
}: TaskFilterModalProps) {
  const { width } = useWindowDimensions();
  if (!visible) return null;
  return (
    // Same shell as every other dialog: backdrop, Escape, close button.
    <DialogOverlay
      onBackdropPress={onClose}
      align={width >= 768 ? "center" : "bottom"}
    >
      <DialogCard desktopWidth={400}>
          <DialogHeader title="Filters" onClose={onClose} />
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Show completed</Text>
            <Switch
              value={showCompleted}
              onValueChange={(v) => {
                void onPersistShowCompleted(v);
              }}
              trackColor={{
                false: Colors.outlineVariant,
                true: Colors.primary + "60",
              }}
              thumbColor={showCompleted ? Colors.primary : Colors.textTertiary}
            />
          </View>
          {showCollaboratorFilter && (
            <>
              <Text style={styles.filterSectionLabel}>Filter by user</Text>
              <ScrollView style={styles.filterUserScroll}>
                {assignableMembers.map((m) => (
                  <View key={m.userId} style={styles.filterRow}>
                    <Text style={styles.filterLabel}>{m.name}</Text>
                    <Switch
                      value={filterUserIds.includes(String(m.userId))}
                      onValueChange={(v) =>
                        void onToggleUserFilter(String(m.userId), v)
                      }
                      trackColor={{
                        false: Colors.outlineVariant,
                        true: Colors.primary + "60",
                      }}
                      thumbColor={
                        filterUserIds.includes(String(m.userId))
                          ? Colors.primary
                          : Colors.textTertiary
                      }
                    />
                  </View>
                ))}
              </ScrollView>
            </>
          )}
          <DialogFooter>
            <Button title="Done" onPress={onClose} size="small" />
          </DialogFooter>
      </DialogCard>
    </DialogOverlay>
  );
}

const styles = StyleSheet.create({
  filterSectionLabel: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginTop: 12,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 12,
  },
  filterLabel: { fontSize: FontSize.body, color: Colors.text, flex: 1 },
  filterUserScroll: { maxHeight: 220 },
});
