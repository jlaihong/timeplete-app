import type React from "react";
import { createPortal } from "react-dom";
import { WebListPermissionPopover } from "./ListPermissionPopover.web";
import type { ListPermissionPortalArgs } from "./listPermissionPortal";

export function renderListPermissionPortal({
  permMenu,
  busyUpdating,
  onDismiss,
  onPick,
}: ListPermissionPortalArgs): React.ReactNode {
  if (typeof document === "undefined") return null;
  return createPortal(
    <WebListPermissionPopover
      permMenu={permMenu}
      updating={busyUpdating}
      onDismiss={onDismiss}
      onPick={onPick}
    />,
    document.body,
  );
}

export type { ListPermissionPortalArgs } from "./listPermissionPortal";
