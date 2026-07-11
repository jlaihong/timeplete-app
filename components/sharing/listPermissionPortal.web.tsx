import type React from "react";
import { createPortal } from "react-dom";
import { WebListPermissionPopover } from "./ListPermissionPopover.web";
import type { ListPermissionPortalArgs } from "./listPermissionPortal.types";

export function renderListPermissionPortal({
  permMenu,
  busyUpdating,
  onDismiss,
  onPick,
  onRemove,
}: ListPermissionPortalArgs): React.ReactNode {
  if (typeof document === "undefined") return null;
  return createPortal(
    <WebListPermissionPopover
      permMenu={permMenu}
      updating={busyUpdating}
      onDismiss={onDismiss}
      onPick={onPick}
      onRemove={onRemove}
    />,
    document.body,
  );
}

export type { ListPermissionPortalArgs } from "./listPermissionPortal.types";
