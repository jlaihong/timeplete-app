import React, { useEffect, useState } from "react";
import { Colors } from "../../constants/colors";
import type { ListPermissionPortalArgs } from "./listPermissionPortal";

type AnchoredMenu = ListPermissionPortalArgs["permMenu"];

export function WebListPermissionPopover(props: {
  permMenu: AnchoredMenu;
  updating: boolean;
  onDismiss: () => void;
  onPick: (perm: "VIEWER" | "EDITOR") => void;
}) {
  const { permMenu, updating, onDismiss, onPick } = props;
  const { top, left, minWidth, current } = permMenu;

  /**
   * RN-web forwards the triggering click to DOM: the fullscreen backdrop mounts
   * in the same event turn and eats the bubbled click, so the menu vanishes.
   * Defer dismissal until after the opener gesture settles.
   */
  const [dismissArmed, setDismissArmed] = useState(false);
  useEffect(() => {
    setDismissArmed(false);
    const tid = window.setTimeout(() => setDismissArmed(true), 220);
    return () => window.clearTimeout(tid);
  }, [permMenu.collaboratorUserId, permMenu.current, top, left]);

  const handleBackdropDismiss = () => {
    if (!dismissArmed || updating) return;
    onDismiss();
  };

  return (
    <>
      <div
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 520000,
          backgroundColor: "rgba(13,21,22,0.35)",
        }}
        onMouseDown={(e) => {
          // Catch outside interaction without competing with opener `click`.
          if (e.button !== 0) return;
          e.preventDefault();
          handleBackdropDismiss();
        }}
      />
      <div
        role="menu"
        style={{
          position: "fixed",
          top,
          left,
          minWidth,
          zIndex: 520001,
          backgroundColor: Colors.surfaceContainerHigh,
          borderRadius: 8,
          border: `1px solid ${Colors.border}`,
          padding: 4,
          boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
          opacity: updating ? 0.6 : 1,
          pointerEvents: updating ? "none" : "auto",
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {(
          [
            ["VIEWER", "Viewer"] as const,
            ["EDITOR", "Editor"] as const,
          ] as const
        ).map(([perm, label]) => (
          <button
            key={perm}
            type="button"
            disabled={perm === current}
            role="menuitem"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              gap: 12,
              padding: "10px 14px",
              border: "none",
              margin: 0,
              cursor: perm === current ? "default" : "pointer",
              background:
                perm === current ? `${Colors.primary}22` : "transparent",
              color: Colors.text,
              borderRadius: 6,
              fontSize: 15,
              fontWeight: 600,
              textAlign: "left",
              fontFamily: "system-ui,sans-serif",
            }}
            onClick={() => onPick(perm)}
          >
            <span>{label}</span>
            {perm === current ? (
              <span style={{ color: Colors.primary, fontSize: 18 }}>✓</span>
            ) : null}
          </button>
        ))}
      </div>
    </>
  );
}
