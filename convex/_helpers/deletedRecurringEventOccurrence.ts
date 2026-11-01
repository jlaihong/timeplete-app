import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * A calendar delete of one recurring occurrence must remember the date.
 * `recurringEvents.generateInstances` rebuilds any missing day that is not
 * in this set, which is how a deleted "Talk to mew" tile came back.
 */
export function deletedOccurrenceForRecurringInstance(tw: {
  isRecurringInstance?: boolean;
  recurringEventId?: Id<"recurringEvents"> | string | null;
  startDayYYYYMMDD?: string | null;
}): {
  recurringEventId: Id<"recurringEvents">;
  deletedDateYYYYMMDD: string;
} | null {
  if (!tw.isRecurringInstance || !tw.recurringEventId || !tw.startDayYYYYMMDD) {
    return null;
  }
  return {
    recurringEventId: tw.recurringEventId as Id<"recurringEvents">,
    deletedDateYYYYMMDD: tw.startDayYYYYMMDD,
  };
}

export async function recordDeletedRecurringEventOccurrence(
  ctx: MutationCtx,
  args: {
    recurringEventId: Id<"recurringEvents">;
    deletedDateYYYYMMDD: string;
    userId: Id<"users">;
  },
): Promise<Id<"deletedRecurringEventOccurrences">> {
  const existing = await ctx.db
    .query("deletedRecurringEventOccurrences")
    .withIndex("by_recurring_date", (q) =>
      q
        .eq("recurringEventId", args.recurringEventId)
        .eq("deletedDateYYYYMMDD", args.deletedDateYYYYMMDD),
    )
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("deletedRecurringEventOccurrences", {
    recurringEventId: args.recurringEventId,
    deletedDateYYYYMMDD: args.deletedDateYYYYMMDD,
    userId: args.userId,
  });
}

export async function clearDeletedRecurringEventOccurrence(
  ctx: MutationCtx,
  args: {
    recurringEventId: Id<"recurringEvents">;
    deletedDateYYYYMMDD: string;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("deletedRecurringEventOccurrences")
    .withIndex("by_recurring_date", (q) =>
      q
        .eq("recurringEventId", args.recurringEventId)
        .eq("deletedDateYYYYMMDD", args.deletedDateYYYYMMDD),
    )
    .first();
  if (existing) await ctx.db.delete(existing._id);
}
