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
}: {
  value: string;
  options: AnalyticsSelectOption[];
  onChange: (value: string) => void;
}) {
  return createElement(
    "select",
    {
      value,
      onChange: (e: { target: { value: string } }) =>
        onChange(String(e.target.value)),
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
    options.map((o) =>
      createElement("option", { key: o.value, value: o.value }, o.label)
    )
  );
}
