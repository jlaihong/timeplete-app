import React, { createElement } from "react";

export interface AnalyticsSelectOption {
  value: string;
  label: string;
}

/** Inline `<select>` — productivity-one style desktop dropdown (non-blocking). */
export function AnalyticsSelect({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  accessibilityLabel,
}: {
  value: string;
  options: AnalyticsSelectOption[];
  onChange: (value: string) => void;
  /** Shown as first disabled `<option value="">` when `value` is `""`. */
  placeholder?: string;
  ariaLabel?: string;
  accessibilityLabel?: string;
}) {
  const children = [
    placeholder
      ? createElement(
          "option",
          { key: "__ph", value: "", disabled: true },
          placeholder
        )
      : null,
    ...options.map((o) =>
      createElement("option", { key: o.value, value: o.value }, o.label)
    ),
  ].filter(Boolean) as ReturnType<typeof createElement>[];

  return createElement(
    "select",
    {
      value,
      "aria-label": ariaLabel ?? accessibilityLabel,
      onChange: (e: { target: { value: string } }) => {
        const v = String(e.target.value);
        if (v === "") return;
        onChange(v);
      },
      style: {
        height: 36,
        minWidth: 116,
        maxWidth: 200,
        paddingLeft: 10,
        paddingRight: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#3B494C",
        backgroundColor: "#242B2D",
        color: "#DDE4E5",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      } as import("react").CSSProperties,
    },
    children
  );
}
