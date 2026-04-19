import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from "react";
import {
  todayYYYYMMDD,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "../../lib/dates";

/* ──────────────────────────────────────────────────────────────────── *
 * Single, unified state for the Analytics page.
 *
 * Mirrors productivity-one's per-tab logic but lifts ALL of it to one
 * place so every section (Trackable Progression, Time Breakdown, Time
 * Spend, Review) derives from the same `selectedTab` + `selectedDate`.
 * No section-level filtering is allowed — a section reads
 * `windowStart`/`windowEnd` and renders.
 *
 * - selectedTab: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
 * - selectedDate: anchor day in YYYYMMDD; the tab decides what that
 *   day _means_ (first of month, monday of week, etc.).
 * - windowStart/windowEnd: derived inclusive YYYYMMDD bounds.
 *   `windowEnd` is capped at today (parity with P1, which never shows
 *   future dates).
 * - canonicalReviewDate: the date the Review section saves under for
 *   the active frequency (mon-of-week / 1st-of-month / jan-1).
 * ──────────────────────────────────────────────────────────────────── */

export type AnalyticsTab = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export const ANALYTICS_TABS: { id: AnalyticsTab; label: string }[] = [
  { id: "DAILY", label: "Daily" },
  { id: "WEEKLY", label: "Weekly" },
  { id: "MONTHLY", label: "Monthly" },
  { id: "YEARLY", label: "Yearly" },
];

interface AnalyticsState {
  selectedTab: AnalyticsTab;
  selectedDate: string;
  windowStart: string;
  windowEnd: string;
  canonicalReviewDate: string;
  setTab: (tab: AnalyticsTab) => void;
  setSelectedDate: (date: string) => void;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
}

const AnalyticsStateContext = createContext<AnalyticsState | null>(null);

function deriveWindow(tab: AnalyticsTab, selectedDate: string) {
  const today = todayYYYYMMDD();
  const cap = (d: string) => (d > today ? today : d);

  switch (tab) {
    case "DAILY":
      return { start: selectedDate, end: cap(selectedDate) };
    case "WEEKLY": {
      const start = startOfWeek(selectedDate);
      return { start, end: cap(endOfWeek(selectedDate)) };
    }
    case "MONTHLY": {
      const start = startOfMonth(selectedDate);
      return { start, end: cap(endOfMonth(selectedDate)) };
    }
    case "YEARLY": {
      const start = startOfYear(selectedDate);
      return { start, end: cap(endOfYear(selectedDate)) };
    }
  }
}

/** Canonical "day under review" — matches P1's `normalizeDayUnderReview`. */
function canonicalForTab(tab: AnalyticsTab, selectedDate: string): string {
  switch (tab) {
    case "DAILY":
      return selectedDate;
    case "WEEKLY":
      return startOfWeek(selectedDate);
    case "MONTHLY":
      return startOfMonth(selectedDate);
    case "YEARLY":
      return startOfYear(selectedDate);
  }
}

export function AnalyticsStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedTab, setSelectedTab] = useState<AnalyticsTab>("DAILY");
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    todayYYYYMMDD()
  );

  const { windowStart, windowEnd } = useMemo(() => {
    const { start, end } = deriveWindow(selectedTab, selectedDate);
    return { windowStart: start, windowEnd: end };
  }, [selectedTab, selectedDate]);

  const canonicalReviewDate = useMemo(
    () => canonicalForTab(selectedTab, selectedDate),
    [selectedTab, selectedDate]
  );

  const setTab = useCallback((tab: AnalyticsTab) => {
    setSelectedTab(tab);
    // Don't reset selectedDate — productivity-one preserves the user's
    // anchor date across tab switches, only the *window derivation*
    // changes. This keeps "I was looking at March 3 daily" → switching
    // to Monthly still shows March.
  }, []);

  const goPrev = useCallback(() => {
    setSelectedDate((current) => {
      switch (selectedTab) {
        case "DAILY":
          return addDays(current, -1);
        case "WEEKLY":
          return addDays(current, -7);
        case "MONTHLY": {
          const start = startOfMonth(current);
          return addDays(start, -1); // last day of previous month
        }
        case "YEARLY": {
          const start = startOfYear(current);
          return addDays(start, -1); // last day of previous year
        }
      }
    });
  }, [selectedTab]);

  const goNext = useCallback(() => {
    setSelectedDate((current) => {
      switch (selectedTab) {
        case "DAILY":
          return addDays(current, 1);
        case "WEEKLY":
          return addDays(current, 7);
        case "MONTHLY": {
          const end = endOfMonth(current);
          return addDays(end, 1); // first day of next month
        }
        case "YEARLY": {
          const end = endOfYear(current);
          return addDays(end, 1); // first day of next year
        }
      }
    });
  }, [selectedTab]);

  const goToday = useCallback(() => {
    setSelectedDate(todayYYYYMMDD());
  }, []);

  const value = useMemo<AnalyticsState>(
    () => ({
      selectedTab,
      selectedDate,
      windowStart,
      windowEnd,
      canonicalReviewDate,
      setTab,
      setSelectedDate,
      goPrev,
      goNext,
      goToday,
    }),
    [
      selectedTab,
      selectedDate,
      windowStart,
      windowEnd,
      canonicalReviewDate,
      setTab,
      goPrev,
      goNext,
      goToday,
    ]
  );

  return (
    <AnalyticsStateContext.Provider value={value}>
      {children}
    </AnalyticsStateContext.Provider>
  );
}

export function useAnalyticsState(): AnalyticsState {
  const ctx = useContext(AnalyticsStateContext);
  if (!ctx) {
    throw new Error(
      "useAnalyticsState must be used inside <AnalyticsStateProvider>"
    );
  }
  return ctx;
}
