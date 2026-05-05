import type { ReactNode } from "react";

export interface CollaboratorRoleBadgeProps {
  label: string;
  disabled?: boolean;
  onOpenFromRect: (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => void;
}

/**
 * Non-web stub — `MemberList` only renders this branch when `Platform.OS === "web"`.
 * Exists so Metro can resolve `./MemberListCollaboratorRoleBadge` on native bundles.
 */
export function CollaboratorRoleBadge(
  _props: CollaboratorRoleBadgeProps,
): ReactNode {
  return null;
}
