import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, StyleSheet } from "react-native";
import { createPortal } from "react-dom";
import { Colors } from "../../../../constants/colors";
import {
  assessClockHhMmInput,
  normalizeClockHhMm,
} from "../../../../lib/dates";
import { applyClockHhmmMask } from "../../../../lib/clockHhmmMask";
import {
  filterStartPresets,
  type StartTimeComboFieldProps,
} from "./startTimeComboShared";

/**
 * Web: one input + portal dropdown (mat-autocomplete style, same model as
 * `DurationPickerDesktop`) — type masked HH:MM or pick from quarter-hour list.
 */
export function StartTimeComboField({
  label,
  value,
  onChange,
}: StartTimeComboFieldProps) {
  const [focused, setFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userNavigatedRef = useRef(false);

  const filteredOptions = useMemo(() => filterStartPresets(value), [value]);

  const hideDropdownSoon = useCallback(() => {
    if (blurTimerRef.current != null) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      setFocused(false);
      const n = normalizeClockHhMm(value);
      if (n) onChange(n);
    }, 120);
  }, [onChange, value]);

  const cancelHide = useCallback(() => {
    if (blurTimerRef.current != null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    if (!focused) {
      setDropdownPos(null);
      return;
    }
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const minWidth = Math.max(rect.width, 160);
      let top = rect.bottom + 4;
      let left = rect.left;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 220 && rect.top > 220) {
        top = rect.top - 4 - 240;
      }
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
  }, [focused]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const pickPreset = useCallback(
    (opt: string, closeAfter = false) => {
      cancelHide();
      onChange(opt);
      setHighlightIndex(0);
      userNavigatedRef.current = false;
      requestAnimationFrame(() => {
        if (closeAfter) inputRef.current?.blur();
        else inputRef.current?.focus();
      });
    },
    [cancelHide, onChange]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = applyClockHhmmMask(e.target.value);
      onChange(masked);
      setHighlightIndex(0);
      userNavigatedRef.current = false;
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el && document.activeElement === el) {
          const pos = masked.length;
          el.setSelectionRange(pos, pos);
        }
      });
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        // Arrow-key list navigation takes precedence: commit highlighted preset
        // (even when the input still has filter text — matches mat-autocomplete).
        if (userNavigatedRef.current && filteredOptions.length > 0) {
          pickPreset(
            filteredOptions[highlightIndex] ?? filteredOptions[0],
            true
          );
          return;
        }
        const typed = value.trim();
        if (typed && assessClockHhMmInput(value) === "valid") {
          const n = normalizeClockHhMm(value);
          if (n) onChange(n);
          inputRef.current?.blur();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        inputRef.current?.blur();
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
    [filteredOptions, highlightIndex, onChange, pickPreset, value]
  );

  const handleOptionMouseDown = useCallback(
    (opt: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      pickPreset(opt, true);
    },
    [pickPreset]
  );

  const status = assessClockHhMmInput(value);
  const errText =
    status === "invalid" && value.length > 0
      ? "Enter a valid 24-hour time (HH:MM)."
      : null;

  return (
    <View style={styles.block}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: Colors.surfaceContainer,
          border: `1px solid ${
            errText ? Colors.error : Colors.outlineVariant
          }`,
          borderRadius: 10,
          minHeight: 44,
          paddingRight: 8,
          width: "100%",
          boxSizing: "border-box" as const,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {React.createElement("input", {
          ref: inputRef,
          type: "text",
          value,
          onChange: handleChange,
          onKeyDown: handleKeyDown,
          onFocus: () => {
            cancelHide();
            setFocused(true);
            setHighlightIndex(0);
            userNavigatedRef.current = false;
          },
          onBlur: hideDropdownSoon,
          placeholder: "hh:mm",
          inputMode: "numeric",
          autoComplete: "off",
          "aria-label": label,
          "aria-autocomplete": "list",
          "aria-expanded": focused,
          style: {
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: Colors.text,
            fontSize: 14,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontVariantNumeric: "tabular-nums",
            padding: "10px 12px",
            boxSizing: "border-box" as const,
          },
        })}
        <span
          style={{
            color: Colors.textSecondary,
            fontSize: 12,
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          ▾
        </span>
      </div>
      {errText ? <Text style={styles.errorSmall}>{errText}</Text> : null}
      {!errText && status === "typing" && value.length > 0 ? (
        <Text style={styles.helperSmall}>24-hour format, e.g. 09:30</Text>
      ) : null}
      {focused &&
        filteredOptions.length > 0 &&
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
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: "100%", marginBottom: 0 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  errorSmall: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 6,
  },
  helperSmall: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 6,
  },
});
