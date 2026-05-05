import React from "react";
import { Colors } from "../../constants/colors";
import type { CollaboratorRoleBadgeProps } from "./MemberListCollaboratorRoleBadge";

/**
 * Plain DOM button + viewport `getBoundingClientRect()`.
 *
 * RN-web `measureInWindow`/`UIManager.measureInWindow` only invokes the callback
 * when a host DOM node exists; refs from `TouchableOpacity`/`Animated.View` can
 * leave that undefined, so the menu never opened. Opening from the click target
 * is deterministic inside Modal + ScrollView.
 */
export function CollaboratorRoleBadge({
  label,
  disabled,
  onOpenFromRect,
}: CollaboratorRoleBadgeProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Change permission"
      aria-haspopup="menu"
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        onOpenFromRect({
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
        });
      }}
      style={{
        display: "inline-flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 6,
        paddingBottom: 6,
        borderRadius: 8,
        border: `1px solid ${Colors.primary}`,
        backgroundColor: Colors.surfaceContainerHighest,
        maxWidth: 200,
        minHeight: 36,
        boxSizing: "border-box",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        font: "inherit",
        margin: 0,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: Colors.text,
        }}
      >
        {label}
      </span>
      <span
        aria-hidden
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: Colors.primary,
          lineHeight: 1,
        }}
      >
        ▾
      </span>
    </button>
  );
}
