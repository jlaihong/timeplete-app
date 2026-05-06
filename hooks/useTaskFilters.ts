import { useState, useEffect, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Id } from "../convex/_generated/dataModel";

export type TaskFilterScope =
  | { kind: "home" }
  | { kind: "list"; listId: Id<"lists"> };

function storageKeys(scope: TaskFilterScope) {
  if (scope.kind === "home") {
    return {
      showCompleted: "showCompleted:home",
      filterUsers: "homeFilterUsers",
    };
  }
  return {
    showCompleted: `showCompleted:list:${scope.listId}`,
    filterUsers: `listFilterUsers:${scope.listId}`,
  };
}

/**
 * Persisted task filters (completion visibility + multi-assignee) shared by
 * Home and List detail. Pass `null` to disable hydration (e.g. list id loading).
 */
export function useTaskFilters(scope: TaskFilterScope | null) {
  const [showCompleted, setShowCompletedState] = useState(true);
  const [filterUserIds, setFilterUserIdsState] = useState<string[]>([]);

  const scopeKey =
    scope == null ? null : scope.kind === "home" ? "home" : scope.listId;

  useEffect(() => {
    if (scope == null) return;
    let cancelled = false;
    const k = storageKeys(scope);
    (async () => {
      const sc = await AsyncStorage.getItem(k.showCompleted);
      const show = sc !== "false";
      const raw = await AsyncStorage.getItem(k.filterUsers);
      let users: string[] = [];
      if (raw) {
        try {
          users = JSON.parse(raw) as string[];
        } catch {
          users = [];
        }
      }
      if (!cancelled) {
        setShowCompletedState(show);
        setFilterUserIdsState(users);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeKey]);

  const persistShowCompleted = useCallback(
    async (checked: boolean) => {
      setShowCompletedState(checked);
      if (scope == null) return;
      await AsyncStorage.setItem(
        storageKeys(scope).showCompleted,
        String(checked),
      );
    },
    [scope],
  );

  const toggleUserFilter = useCallback(
    async (userId: string, checked: boolean) => {
      setFilterUserIdsState((prev) => {
        const next = checked
          ? [...prev, userId]
          : prev.filter((id) => id !== userId);
        if (scope != null) {
          void AsyncStorage.setItem(
            storageKeys(scope).filterUsers,
            JSON.stringify(next),
          );
        }
        return next;
      });
    },
    [scope],
  );

  const isFilterActive = useMemo(
    () => !showCompleted || filterUserIds.length > 0,
    [showCompleted, filterUserIds],
  );

  return {
    showCompleted,
    filterUserIds,
    persistShowCompleted,
    toggleUserFilter,
    isFilterActive,
  };
}
