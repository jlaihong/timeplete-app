import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useAuth } from "./useAuth";
import { useTaskUpsertMutation } from "./useTaskUpsertMutation";
import { type AddToListRequest } from "../lib/parseAddToListUrl";
import {
  consumePendingAddToList,
  subscribeAddToList,
} from "../lib/pendingAddToList";
import {
  defaultCreatedListName,
  resolveNamedList,
} from "../lib/resolveNamedList";

const DEFAULT_LIST_COLOUR = "#4A90D9";

export function useSiriAddToList() {
  const { profileReady, isApproved } = useAuth();
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const upsertTask = useTaskUpsertMutation();
  const upsertList = useMutation(api.lists.upsert);
  const [toast, setToast] = useState<string | null>(null);
  const pendingRef = useRef<AddToListRequest | null>(null);
  const lastKeyRef = useRef("");
  const listsReady = profileReady && isApproved && lists !== undefined;

  const apply = useCallback(
    async (req: AddToListRequest) => {
      if (!listsReady || !lists) {
        pendingRef.current = req;
        return;
      }
      try {
        const existing = resolveNamedList(lists, req.list);
        let listId = existing?._id as Id<"lists"> | undefined;
        const listName = existing?.name ?? defaultCreatedListName(req.list);
        if (!listId) {
          listId = await upsertList({
            name: listName,
            colour: DEFAULT_LIST_COLOUR,
            showInSidebar: true,
          });
        }
        await upsertTask({
          name: req.item,
          listId,
        });
        setToast(`Added ${req.item} to ${listName}`);
      } catch (err) {
        console.error("Siri add-to-list failed", err);
        setToast(`Could not add ${req.item}`);
      }
    },
    [lists, listsReady, upsertList, upsertTask],
  );

  const enqueue = useCallback(
    (req: AddToListRequest) => {
      const key = `${req.item}\0${req.list}`;
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;
      setTimeout(() => {
        if (lastKeyRef.current === key) lastKeyRef.current = "";
      }, 2500);
      void apply(req);
    },
    [apply],
  );

  useEffect(() => {
    if (!listsReady || !pendingRef.current) return;
    const req = pendingRef.current;
    pendingRef.current = null;
    void apply(req);
  }, [apply, listsReady]);

  useEffect(() => {
    const queued = consumePendingAddToList();
    if (queued) enqueue(queued);
    return subscribeAddToList(enqueue);
  }, [enqueue]);

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, dismissToast };
}
