import React from "react";
import { createPortal } from "react-dom";

export interface PickerAnchor {
  left: number;
  top: number;
  bottom: number;
}

const WIDTH = 260;
const ROOM_NEEDED = 280;

/**
 * Where the "@" picker is drawn. On the web it floats at the "@" being
 * typed, in a layer on top of the page so it is never clipped by the
 * field's surroundings, and flips above the line near the bottom of the
 * window.
 */
export function MentionPickerPortal({
  anchor,
  children,
}: {
  anchor: PickerAnchor | null;
  children: React.ReactNode;
}) {
  if (!anchor || typeof document === "undefined") return null;
  const above = anchor.bottom + ROOM_NEEDED > window.innerHeight;
  const left = Math.max(
    8,
    Math.min(anchor.left, window.innerWidth - WIDTH - 8),
  );
  return createPortal(
    <div
      // Keep the caret in the field while a row is clicked.
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        zIndex: 100000,
        left,
        width: WIDTH,
        ...(above
          ? { bottom: window.innerHeight - anchor.top + 4 }
          : { top: anchor.bottom + 4 }),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
