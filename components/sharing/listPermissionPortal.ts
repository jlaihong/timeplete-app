import type React from "react";

export interface ListPermissionPortalArgs {
  permMenu: {
    collaboratorUserId: string;
    current: "VIEWER" | "EDITOR";
    top: number;
    left: number;
    minWidth: number;
  };
  busyUpdating: boolean;
  onDismiss: () => void;
  /** Apply new role — caller persists + closes modal */
  onPick: (perm: "VIEWER" | "EDITOR") => void;
}

export function renderListPermissionPortal(
  _args: ListPermissionPortalArgs,
): React.ReactNode {
  return null;
}
