#!/usr/bin/env node
/**
 * Static regression guard for analytics time-spend hover targets on web.
 * Ensures the web-specific implementation exposes DOM markers + portal tooltip.
 *
 * Run: node scripts/verify-analytics-time-spend-tooltip-source.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webPath = path.join(
  root,
  "components/analytics/TimeSpendTimelineBlock.web.tsx",
);
const chartPath = path.join(
  root,
  "components/analytics/TimeSpendTimelineChart.tsx",
);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const webSrc = fs.readFileSync(webPath, "utf8");
const chartSrc = fs.readFileSync(chartPath, "utf8");

for (const needle of [
  "data-analytics-time-spend-block",
  "data-analytics-time-spend-tooltip",
  'createPortal(',
  "document.body",
  "aria-label={accessibilityLabel}",
  'pointerEvents: "auto"',
]) {
  if (!webSrc.includes(needle)) {
    fail(`TimeSpendTimelineBlock.web.tsx missing expected snippet: ${needle}`);
  }
}

for (const needle of [
  "TimeSpendTimelineBlock",
  "displayTitle={b.displayTitle}",
  "segmentTimeRangeLabel={b.segmentTimeRangeLabel}",
]) {
  if (!chartSrc.includes(needle)) {
    fail(`TimeSpendTimelineChart.tsx missing expected snippet: ${needle}`);
  }
}

console.log("verify-analytics-time-spend-tooltip-source: OK");
