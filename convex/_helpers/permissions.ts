import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export async function resolveListOwnerId(
  ctx: QueryCtx | MutationCtx,
  listId: Id<"lists">,
  userId: Id<"users">
): Promise<Id<"users">> {
  const list = await ctx.db.get(listId);
  if (!list) throw new Error("List not found");

  if (list.userId === userId) return userId;

  const share = await ctx.db
    .query("listShares")
    .withIndex("by_list", (q) => q.eq("listId", listId))
    .filter((q) =>
      q.and(
        q.eq(q.field("sharedWithUserId"), userId),
        q.eq(q.field("status"), "ACCEPTED")
      )
    )
    .first();

  if (!share) throw new Error("No access to list");
  return list.userId;
}

export async function verifyListWriteAccess(
  ctx: QueryCtx | MutationCtx,
  listId: Id<"lists">,
  userId: Id<"users">
): Promise<void> {
  const list = await ctx.db.get(listId);
  if (!list) throw new Error("List not found");

  if (list.userId === userId) return;

  const share = await ctx.db
    .query("listShares")
    .withIndex("by_list", (q) => q.eq("listId", listId))
    .filter((q) =>
      q.and(
        q.eq(q.field("sharedWithUserId"), userId),
        q.eq(q.field("status"), "ACCEPTED"),
        q.eq(q.field("permission"), "EDITOR")
      )
    )
    .first();

  if (!share) throw new Error("No write access to list");
}

export async function verifyTaskWriteAccess(
  ctx: QueryCtx | MutationCtx,
  taskId: Id<"tasks">,
  userId: Id<"users">
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task) throw new Error("Task not found");

  if (task.userId === userId) return;

  if (task.listId) {
    await verifyListWriteAccess(ctx, task.listId, userId);
    return;
  }

  throw new Error("No write access to task");
}
