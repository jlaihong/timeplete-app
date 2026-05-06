import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireApprovedUser } from "./_helpers/auth";

export const shareList = mutation({
  args: {
    listId: v.id("lists"),
    email: v.string(),
    permission: v.union(v.literal("VIEWER"), v.literal("EDITOR")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const list = await ctx.db.get(args.listId);
    if (!list || list.userId !== user._id)
      throw new Error("Not the list owner");

    const targetUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (targetUser) {
      if (targetUser._id === user._id)
        throw new Error("Cannot share with yourself");

      const existingShare = await ctx.db
        .query("listShares")
        .withIndex("by_list", (q) => q.eq("listId", args.listId))
        .filter((q) =>
          q.eq(q.field("sharedWithUserId"), targetUser._id)
        )
        .first();

      if (existingShare) {
        await ctx.db.patch(existingShare._id, {
          permission: args.permission,
        });
        return { status: existingShare.status, sharedWithUserId: targetUser._id };
      }

      const shareId = await ctx.db.insert("listShares", {
        listId: args.listId,
        sharedWithUserId: targetUser._id,
        permission: args.permission,
        status: "PENDING",
      });

      return { status: "PENDING", sharedWithUserId: targetUser._id };
    }

    await ctx.db.insert("pendingListInvites", {
      listId: args.listId,
      invitedEmail: args.email,
      permission: args.permission,
      invitedByUserId: user._id,
    });

    return { status: "PENDING_INVITE", sharedWithUserId: null };
  },
});

export const shareTrackable = mutation({
  args: {
    trackableId: v.id("trackables"),
    email: v.string(),
    permission: v.union(v.literal("VIEWER"), v.literal("EDITOR")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const trackable = await ctx.db.get(args.trackableId);
    if (!trackable || trackable.userId !== user._id)
      throw new Error("Not the trackable owner");

    const targetUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!targetUser) throw new Error("User not found");
    if (targetUser._id === user._id)
      throw new Error("Cannot share with yourself");

    const existing = await ctx.db
      .query("trackableShares")
      .withIndex("by_trackable", (q) => q.eq("trackableId", args.trackableId))
      .filter((q) => q.eq(q.field("sharedWithUserId"), targetUser._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { permission: args.permission });
      return { status: existing.status };
    }

    await ctx.db.insert("trackableShares", {
      trackableId: args.trackableId,
      sharedWithUserId: targetUser._id,
      permission: args.permission,
      status: "PENDING",
    });

    return { status: "PENDING" };
  },
});

export const getSharedWithMe = query({
  args: {
    status: v.optional(
      v.union(v.literal("PENDING"), v.literal("ACCEPTED"), v.literal("REJECTED"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    let listShares;
    if (args.status) {
      listShares = await ctx.db
        .query("listShares")
        .withIndex("by_shared_user_status", (q) =>
          q.eq("sharedWithUserId", user._id).eq("status", args.status!)
        )
        .collect();
    } else {
      listShares = await ctx.db
        .query("listShares")
        .withIndex("by_shared_user", (q) =>
          q.eq("sharedWithUserId", user._id)
        )
        .collect();
    }

    let trackableShares;
    if (args.status) {
      trackableShares = await ctx.db
        .query("trackableShares")
        .withIndex("by_shared_user_status", (q) =>
          q.eq("sharedWithUserId", user._id).eq("status", args.status!)
        )
        .collect();
    } else {
      trackableShares = await ctx.db
        .query("trackableShares")
        .withIndex("by_shared_user", (q) =>
          q.eq("sharedWithUserId", user._id)
        )
        .collect();
    }

    const enrichedLists = [];
    for (const share of listShares) {
      const list = await ctx.db.get(share.listId);
      const owner = list ? await ctx.db.get(list.userId) : null;
      enrichedLists.push({
        ...share,
        listName: list?.name ?? "Unknown",
        ownerName: owner?.name ?? "Unknown",
      });
    }

    const enrichedTrackables = [];
    for (const share of trackableShares) {
      const trackable = await ctx.db.get(share.trackableId);
      const owner = trackable ? await ctx.db.get(trackable.userId) : null;
      enrichedTrackables.push({
        ...share,
        trackableName: trackable?.name ?? "Unknown",
        ownerName: owner?.name ?? "Unknown",
      });
    }

    return { listShares: enrichedLists, trackableShares: enrichedTrackables };
  },
});

export const acceptShare = mutation({
  args: {
    shareId: v.string(),
    shareType: v.union(v.literal("list"), v.literal("trackable")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    if (args.shareType === "list") {
      const share = await ctx.db.get(args.shareId as any);
      if (!share) throw new Error("Share not found");
      await ctx.db.patch(args.shareId as any, { status: "ACCEPTED" });
    } else {
      const share = await ctx.db.get(args.shareId as any);
      if (!share) throw new Error("Share not found");
      await ctx.db.patch(args.shareId as any, { status: "ACCEPTED" });
    }
  },
});

export const rejectShare = mutation({
  args: {
    shareId: v.string(),
    shareType: v.union(v.literal("list"), v.literal("trackable")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    await ctx.db.delete(args.shareId as any);
  },
});

export const removeListShare = mutation({
  args: { shareId: v.id("listShares") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const share = await ctx.db.get(args.shareId);
    if (!share) throw new Error("Share not found");
    const list = await ctx.db.get(share.listId);
    if (!list || list.userId !== user._id)
      throw new Error("Only the list owner can remove access");
    await ctx.db.delete(args.shareId);
  },
});

export const removeTrackableShare = mutation({
  args: { shareId: v.id("trackableShares") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    await ctx.db.delete(args.shareId);
  },
});

export const updateListSharePermission = mutation({
  args: {
    shareId: v.id("listShares"),
    permission: v.union(v.literal("VIEWER"), v.literal("EDITOR")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const share = await ctx.db.get(args.shareId);
    if (!share) throw new Error("Share not found");
    const list = await ctx.db.get(share.listId);
    if (!list || list.userId !== user._id)
      throw new Error("Only the list owner can change permissions");
    await ctx.db.patch(args.shareId, { permission: args.permission });
  },
});

/** Resolve share server-side — works without `shareId` on stale client payloads. */
export const updateListCollaboratorPermission = mutation({
  args: {
    listId: v.id("lists"),
    collaboratorUserId: v.id("users"),
    permission: v.union(v.literal("VIEWER"), v.literal("EDITOR")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const list = await ctx.db.get(args.listId);
    if (!list || list.userId !== user._id)
      throw new Error("Only the list owner can change permissions");
    if (args.collaboratorUserId === user._id) {
      throw new Error("Cannot change your owner role here");
    }

    const share = await ctx.db
      .query("listShares")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .filter((q) =>
        q.eq(q.field("sharedWithUserId"), args.collaboratorUserId),
      )
      .first();

    if (!share) throw new Error("That person does not have access to this list");
    await ctx.db.patch(share._id, { permission: args.permission });
  },
});

export const leaveList = mutation({
  args: { listId: v.id("lists") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const share = await ctx.db
      .query("listShares")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .filter((q) => q.eq(q.field("sharedWithUserId"), user._id))
      .first();

    if (!share) throw new Error("No share found");
    await ctx.db.delete(share._id);
  },
});

export const getCollaborators = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUser(ctx);

    const myShares = await ctx.db
      .query("listShares")
      .withIndex("by_shared_user", (q) => q.eq("sharedWithUserId", user._id))
      .filter((q) => q.eq(q.field("status"), "ACCEPTED"))
      .collect();

    const userIds = new Set<Id<"users">>();
    for (const share of myShares) {
      const list = await ctx.db.get(share.listId);
      if (list) userIds.add(list.userId);
    }

    const myLists = await ctx.db
      .query("lists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const list of myLists) {
      const shares = await ctx.db
        .query("listShares")
        .withIndex("by_list", (q) => q.eq("listId", list._id))
        .filter((q) => q.eq(q.field("status"), "ACCEPTED"))
        .collect();
      for (const s of shares) userIds.add(s.sharedWithUserId);
    }

    const collaborators = [];
    for (const uid of Array.from(userIds)) {
      if (uid === user._id) continue;
      const u = await ctx.db.get(uid);
      if (u) collaborators.push({ id: u._id, name: u.name, email: u.email });
    }

    return collaborators;
  },
});

/**
 * Union of users who appear in List-detail assignee filters: list owner
 * (OWNER) plus EDITOR shares, across all lists the viewer owns or has an
 * accepted share on. Matches `normalizeListMembersQuery` → OWNER|EDITOR on
 * any single list, but deduped for Home.
 */
export const getHomeFilterAssignableMembers = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUser(ctx);

    const listIds = new Set<Id<"lists">>();

    const ownedLists = await ctx.db
      .query("lists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const l of ownedLists) {
      listIds.add(l._id);
    }

    const acceptedShares = await ctx.db
      .query("listShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", user._id).eq("status", "ACCEPTED"),
      )
      .collect();
    for (const s of acceptedShares) {
      listIds.add(s.listId);
    }

    const assignableIds = new Set<Id<"users">>();

    for (const listId of listIds) {
      const list = await ctx.db.get(listId);
      if (!list) continue;

      assignableIds.add(list.userId);

      const shares = await ctx.db
        .query("listShares")
        .withIndex("by_list", (q) => q.eq("listId", listId))
        .collect();

      for (const share of shares) {
        if (share.permission === "EDITOR") {
          assignableIds.add(share.sharedWithUserId);
        }
      }
    }

    const rows: { userId: Id<"users">; name: string }[] = [];
    for (const uid of assignableIds) {
      const u = await ctx.db.get(uid);
      if (u) {
        rows.push({ userId: u._id, name: u.name });
      }
    }

    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

export const getListMembers = query({
  args: { listId: v.id("lists") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const list = await ctx.db.get(args.listId);
    if (!list) throw new Error("List not found");

    const shares = await ctx.db
      .query("listShares")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();

    const members = [];
    const owner = await ctx.db.get(list.userId);
    if (owner) {
      members.push({
        userId: owner._id,
        name: owner.name,
        email: owner.email,
        permission: "OWNER" as const,
        isOwner: true,
      });
    }

    for (const share of shares) {
      const u = await ctx.db.get(share.sharedWithUserId);
      if (u) {
        members.push({
          userId: u._id,
          name: u.name,
          email: u.email,
          permission: share.permission,
          isOwner: false,
          shareId: share._id,
          shareStatus: share.status,
        });
      }
    }

    return {
      viewerIsOwner: list.userId === user._id,
      members,
    };
  },
});
