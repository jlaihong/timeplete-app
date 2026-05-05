import type { Id } from "../convex/_generated/dataModel";

export type ListMembersRow = {
  userId: Id<"users">;
  name: string;
  email: string;
  permission: "OWNER" | "VIEWER" | "EDITOR";
  isOwner: boolean;
  shareId?: Id<"listShares">;
  shareStatus?: "PENDING" | "ACCEPTED" | "REJECTED";
};

/**
 * `sharing.getListMembers` returns `{ members, viewerIsOwner }` after deploy.
 * Older deployments still return `members[]` — normalize so the client never
 * reads `.members` off an array.
 */
export function normalizeListMembersQuery(
  data: unknown,
): { members: ListMembersRow[]; viewerIsOwner: boolean } | undefined {
  if (data == null) return undefined;
  if (Array.isArray(data)) {
    return { members: data as ListMembersRow[], viewerIsOwner: false };
  }
  if (typeof data === "object" && data !== null && "members" in data) {
    const o = data as { members?: unknown; viewerIsOwner?: unknown };
    const members = Array.isArray(o.members)
      ? (o.members as ListMembersRow[])
      : [];
    return { members, viewerIsOwner: Boolean(o.viewerIsOwner) };
  }
  return undefined;
}
