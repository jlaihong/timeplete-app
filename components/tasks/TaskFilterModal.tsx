import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Switch,
  ScrollView,
} from "react-native";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import type { TaskFilterMember } from "../../lib/taskFilters";

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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.filterSheetTitle}>Filters</Text>
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
          <Button title="Done" onPress={onClose} style={{ marginTop: 12 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  filterSheet: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 12,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
  },
  filterSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 16,
  },
  filterSectionLabel: {
    fontSize: 12,
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
  filterLabel: { fontSize: 15, color: Colors.text, flex: 1 },
  filterUserScroll: { maxHeight: 220 },
});
