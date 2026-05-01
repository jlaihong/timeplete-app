import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Colors } from "../../constants/colors";
import { hhmmToSeconds, secondsToDurationString } from "../../lib/dates";
import { TRACKABLE_DURATION_PRESETS } from "../../lib/trackableLogPresets";
import {
  applyDurationHhmmMask,
} from "../../lib/durationHhmmMask";

export interface DurationPickerDesktopProps {
  durationSeconds: number;
  /** When true, formats the read-only label as MM:SS (or HH:MM:SS) — used while a timer is ticking. */
  showSeconds?: boolean;
  /** Disable editing; also typically passed when the value is being driven by a live timer. */
  readonly?: boolean;
  /** Called once when the user commits a new value (Enter, option-click, or auto-format on blur). */
  onDurationChanged?: (newSeconds: number) => void;
  /** Optional extra CSS to apply to the read-only button (matches the row's typography). */
  buttonStyle?: React.CSSProperties;
  /** When true, the read-only label colour is overridden (e.g. green ticking colour). */
  active?: boolean;
}

/**
 * Mirrors productivity-one's `app-duration-picker`:
 * - Click → inline input with masked HH:MM entry and an autocomplete dropdown of presets.
 * - Enter / option-click → commit; blur (with 100 ms grace so option clicks register) → cancel.
 * - Web-only by design — only used from `TaskRowDesktop`.
 */
export function DurationPickerDesktop({
  durationSeconds,
  showSeconds = false,
  readonly = false,
  onDurationChanged,
  buttonStyle,
  active = false,
}: DurationPickerDesktopProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedRef = useRef(false);
  // True only after the user has explicitly navigated the preset list
  // with the arrow keys. Without this, Enter on a typed value like
  // `"1:33"` would fall through to `filteredOptions[0] === "0:05"` (the
  // first preset shown when the typed value matches no preset) and
  // silently overwrite the user's input with 5 minutes.
  const userNavigatedRef = useRef(false);

  const filteredOptions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return TRACKABLE_DURATION_PRESETS;
    const matches = TRACKABLE_DURATION_PRESETS.filter((o) =>
      o.toLowerCase().includes(q)
    );
    // Fallback: if the typed value doesn't match any preset (e.g. "00:01"),
    // still show the full list so the dropdown is never invisibly empty.
    return matches.length > 0 ? matches : TRACKABLE_DURATION_PRESETS;
  }, [text]);

  const startEditing = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      if (readonly) return;
      // Match productivity-one: input opens empty (placeholder "hh:mm") so the
      // user sees the full preset list and can either type or pick. This avoids
      // pre-filling a value that would unintentionally filter the list down.
      setText("");
      setHighlightIndex(0);
      committedRef.current = false;
      userNavigatedRef.current = false;
      setIsEditing(true);
    },
    [readonly]
  );

  // Focus + select-all when entering edit mode.
  useLayoutEffect(() => {
    if (isEditing) {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [isEditing]);

  // Compute (and keep updated) the portal-anchored dropdown position whenever
  // we're editing. We listen to scroll (capture-phase, so we catch any scroll
  // ancestor) and resize so the dropdown follows the input.
  useLayoutEffect(() => {
    if (!isEditing) {
      setDropdownPos(null);
      return;
    }
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const minWidth = Math.max(rect.width, 100);
      // Default: open below the input, right-edge aligned to the input.
      let top = rect.bottom + 4;
      let left = rect.right - minWidth;
      // Flip above if there isn't ~240px of room below.
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 220 && rect.top > 220) {
        top = rect.top - 4 - 240;
      }
      // Clamp horizontally to the viewport.
      left = Math.max(8, Math.min(left, window.innerWidth - minWidth - 8));
      setDropdownPos({ top, left, width: minWidth });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isEditing]);

  // Cleanup any pending blur timer on unmount.
  useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) {
        clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const commit = useCallback(
    (raw: string) => {
      if (committedRef.current) return;
      committedRef.current = true;
      const masked = applyDurationHhmmMask(raw);
      const secs = hhmmToSeconds(masked);
      setIsEditing(false);
      // Only fire if the value actually changed.
      if (secs !== durationSeconds) {
        onDurationChanged?.(secs);
      }
    },
    [durationSeconds, onDurationChanged]
  );

  const cancel = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    setIsEditing(false);
  }, []);

  /* ---- Masked input handling (mirrors productivity-one's directive) ---- */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const masked = applyDurationHhmmMask(raw);
      setText(masked);
      setHighlightIndex(0);
      // Typing resets the "I navigated to a preset" intent — Enter
      // should commit what the user typed, not whatever happens to be
      // at the top of the (possibly fallback) preset list.
      userNavigatedRef.current = false;

      // Reposition the cursor to the end (simple heuristic — matches typing
      // forward; the angular directive is more elaborate but for our needs
      // this is good enough since editing is short-lived).
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el && document.activeElement === el) {
          const pos = masked.length;
          el.setSelectionRange(pos, pos);
        }
      });
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        // Priority order:
        //   1. User has typed something → commit the typed value (mirrors
        //      `mat-autocomplete`: the input is canonical, the panel is a
        //      suggestion list).
        //   2. Field is empty but the user has explicitly navigated the
        //      preset list with arrow keys → commit the highlighted preset.
        //   3. Otherwise → no-op (cancel).
        const typed = text.trim();
        if (typed) {
          commit(typed);
        } else if (userNavigatedRef.current && filteredOptions.length > 0) {
          commit(filteredOptions[highlightIndex] ?? filteredOptions[0]);
        } else {
          cancel();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        userNavigatedRef.current = true;
        setHighlightIndex((i) =>
          filteredOptions.length === 0
            ? 0
            : Math.min(filteredOptions.length - 1, i + 1)
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        userNavigatedRef.current = true;
        setHighlightIndex((i) => Math.max(0, i - 1));
      }
    },
    [cancel, commit, filteredOptions, highlightIndex, text]
  );

  /**
   * Match angular's onBlur: defer 100ms so a click on a dropdown option
   * (which causes the input to blur first) still registers as a commit.
   */
  const handleBlur = useCallback(() => {
    if (blurTimerRef.current != null) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      if (!isEditing) return;
      // If the user typed something, commit it; otherwise cancel.
      if (text.trim()) {
        commit(text);
      } else {
        cancel();
      }
    }, 120);
  }, [cancel, commit, isEditing, text]);

  const handleFocus = useCallback(() => {
    if (blurTimerRef.current != null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const handleOptionMouseDown = useCallback(
    (option: string, e: React.MouseEvent) => {
      // mousedown (not click) so we beat the input's blur — and the
      // 120ms blur grace would also catch us, but this is faster + cleaner.
      e.preventDefault();
      e.stopPropagation();
      if (blurTimerRef.current != null) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      commit(option);
    },
    [commit]
  );

  const labelText = secondsToDurationString(durationSeconds, showSeconds);

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        disabled={readonly}
        style={{
          background: "transparent",
          border: "none",
          padding: "4px 8px",
          margin: 0,
          color: active ? Colors.success : Colors.text,
          fontWeight: active ? 600 : 400,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 14,
          cursor: readonly ? "default" : "text",
          borderRadius: 6,
          minWidth: 56,
          textAlign: "right",
          ...buttonStyle,
        }}
        onMouseEnter={(e) => {
          if (!readonly) {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.06)";
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "transparent";
        }}
      >
        {labelText}
      </button>
    );
  }

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", display: "inline-block" }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder="hh:mm"
        aria-label="duration"
        inputMode="numeric"
        style={{
          width: 80,
          padding: "4px 8px",
          background: Colors.surfaceContainerHighest,
          color: Colors.text,
          border: `1px solid ${Colors.outline}`,
          borderRadius: 6,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 14,
          textAlign: "right",
          outline: "none",
        }}
      />
      {filteredOptions.length > 0 &&
        dropdownPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              minWidth: dropdownPos.width,
              zIndex: 100000,
              maxHeight: 240,
              overflowY: "auto",
              background: Colors.surfaceContainerHigh,
              border: `1px solid ${Colors.outlineVariant}`,
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              padding: 4,
            }}
            // Don't let the dropdown swallow blur — option mousedown handles commit.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          >
            {filteredOptions.map((option, i) => {
              const isHighlighted = i === highlightIndex;
              return (
                <div
                  key={option}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onMouseDown={(e) => handleOptionMouseDown(option, e)}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    borderRadius: 6,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 14,
                    color: Colors.text,
                    background: isHighlighted
                      ? "rgba(255,255,255,0.08)"
                      : "transparent",
                  }}
                >
                  {option}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
