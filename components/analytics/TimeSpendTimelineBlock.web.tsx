import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { CSSProperties } from "react";
import { Colors } from "../../constants/colors";

export type TimeSpendTimelineBlockProps = {
  accessibilityLabel: string;
  displayTitle: string;
  segmentTimeRangeLabel: string;
  style: StyleProp<ViewStyle>;
};

const TOOLTIP_OFFSET_X = 12;
const TOOLTIP_OFFSET_Y = 14;

/**
 * RN Web `View` does not forward DOM attrs reliably; native `title` tooltips
 * also appear after a long browser delay. Render real DOM + a fixed-position
 * portal tooltip so copy shows immediately on hover (within one frame).
 */
export function TimeSpendTimelineBlock({
  accessibilityLabel,
  displayTitle,
  segmentTimeRangeLabel,
  style,
}: TimeSpendTimelineBlockProps) {
  const flat = StyleSheet.flatten(style) as CSSProperties;
  const [tipOpen, setTipOpen] = useState(false);
  const [tipPos, setTipPos] = useState({ left: 0, top: 0 });
  const rafRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      hoveringRef.current = false;
      setTipOpen(false);
    };
  }, []);

  const moveTooltip = useCallback((clientX: number, clientY: number) => {
    const left = Math.round(clientX + TOOLTIP_OFFSET_X);
    const top = Math.round(clientY + TOOLTIP_OFFSET_Y);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setTipPos({ left, top });
      rafRef.current = null;
    });
  }, []);

  const onMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      hoveringRef.current = true;
      moveTooltip(e.clientX, e.clientY);
      setTipOpen(true);
    },
    [moveTooltip],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!hoveringRef.current) return;
      moveTooltip(e.clientX, e.clientY);
    },
    [moveTooltip],
  );

  const onMouseLeave = useCallback(() => {
    hoveringRef.current = false;
    setTipOpen(false);
  }, []);

  const titleAttr = `${displayTitle}\n${segmentTimeRangeLabel}`;

  const hitArea = (
    <div
      data-analytics-time-spend-block="1"
      className="analytics-time-spend-block-hit"
      title={titleAttr}
      aria-label={accessibilityLabel}
      role="presentation"
      style={{
        ...flat,
        pointerEvents: "auto",
        cursor: "default",
        boxSizing: "border-box",
      }}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    />
  );

  const tooltipBubble =
    tipOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            role="tooltip"
            data-analytics-time-spend-tooltip="1"
            style={{
              position: "fixed",
              left: tipPos.left,
              top: tipPos.top,
              zIndex: 100000,
              maxWidth: 280,
              padding: "8px 10px",
              borderRadius: 6,
              backgroundColor: Colors.surfaceContainerHighest,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: Colors.borderLight,
              color: Colors.text,
              fontSize: 12,
              lineHeight: "16px",
              pointerEvents: "none",
              boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
              whiteSpace: "pre-line",
              fontFamily:
                'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            <span style={{ fontWeight: 600 }}>{displayTitle}</span>
            {"\n"}
            <span style={{ color: Colors.textSecondary }}>
              {segmentTimeRangeLabel}
            </span>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {hitArea}
      {tooltipBubble}
    </>
  );
}
