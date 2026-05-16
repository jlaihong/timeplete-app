import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useRef,
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
import { UnsavedReviewChangesDialog } from "./UnsavedReviewChangesDialog";

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

/** Registered by `ReviewSection` so tab/date navigators warn before losing drafts. */
export type AnalyticsReviewGuard = {
  isDirty: () => boolean;
  save: () => Promise<void>;
  /** Optional hook before navigating away without saving (e.g. closing Reflect). */
  onDiscard?: () => void;
};

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
  registerAnalyticsReviewGuard: (guard: AnalyticsReviewGuard | null) => void;
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
  const reviewGuardRef = useRef<AnalyticsReviewGuard | null>(null);
  const pendingProceedRef = useRef<(() => void) | null>(null);

  const [reviewUnsavedOpen, setReviewUnsavedOpen] = useState(false);
  const [reviewNavSaving, setReviewNavSaving] = useState(false);

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

  const registerAnalyticsReviewGuard = useCallback(
    (guard: AnalyticsReviewGuard | null) => {
      reviewGuardRef.current = guard;
    },
    []
  );

  const dismissReviewUnsaved = useCallback(() => {
    pendingProceedRef.current = null;
    setReviewUnsavedOpen(false);
    setReviewNavSaving(false);
  }, []);

  const confirmOrProceed = useCallback((proceed: () => void) => {
    const g = reviewGuardRef.current;
    if (!g?.isDirty()) {
      proceed();
      return;
    }
    pendingProceedRef.current = proceed;
    setReviewUnsavedOpen(true);
  }, []);

  const handleReviewDiscardNavigate = useCallback(() => {
    const run = pendingProceedRef.current;
    pendingProceedRef.current = null;
    setReviewUnsavedOpen(false);
    reviewGuardRef.current?.onDiscard?.();
    run?.();
  }, []);

  const handleReviewSaveNavigate = useCallback(async () => {
    const g = reviewGuardRef.current;
    const run = pendingProceedRef.current;
    if (!g || !run) return;
    setReviewNavSaving(true);
    try {
      await g.save();
      pendingProceedRef.current = null;
      setReviewUnsavedOpen(false);
      run();
    } catch {
      // Leave dialog open; Review surfaces the error via alert/toast elsewhere.
    } finally {
      setReviewNavSaving(false);
    }
  }, []);

  const setTab = useCallback((tab: AnalyticsTab) => {
    confirmOrProceed(() => {
      setSelectedTab(tab);
      // Don't reset selectedDate — productivity-one preserves the user's
      // anchor date across tab switches, only the *window derivation*
      // changes.
    });
  }, [confirmOrProceed]);

  const setSelectedDateGuarded = useCallback(
    (date: string) => {
      confirmOrProceed(() => setSelectedDate(date));
    },
    [confirmOrProceed]
  );

  const goPrev = useCallback(() => {
    confirmOrProceed(() => {
      setSelectedDate((current) => {
        switch (selectedTab) {
          case "DAILY":
            return addDays(current, -1);
          case "WEEKLY":
            return addDays(current, -7);
          case "MONTHLY": {
            const start = startOfMonth(current);
            return addDays(start, -1);
          }
          case "YEARLY": {
            const start = startOfYear(current);
            return addDays(start, -1);
          }
        }
      });
    });
  }, [confirmOrProceed, selectedTab]);

  const goNext = useCallback(() => {
    confirmOrProceed(() => {
      setSelectedDate((current) => {
        switch (selectedTab) {
          case "DAILY":
            return addDays(current, 1);
          case "WEEKLY":
            return addDays(current, 7);
          case "MONTHLY": {
            const end = endOfMonth(current);
            return addDays(end, 1);
          }
          case "YEARLY": {
            const end = endOfYear(current);
            return addDays(end, 1);
          }
        }
      });
    });
  }, [confirmOrProceed, selectedTab]);

  const goToday = useCallback(() => {
    confirmOrProceed(() => {
      setSelectedDate(todayYYYYMMDD());
    });
  }, [confirmOrProceed]);

  const value = useMemo<AnalyticsState>(
    () => ({
      selectedTab,
      selectedDate,
      windowStart,
      windowEnd,
      canonicalReviewDate,
      setTab,
      setSelectedDate: setSelectedDateGuarded,
      goPrev,
      goNext,
      goToday,
      registerAnalyticsReviewGuard,
    }),
    [
      selectedTab,
      selectedDate,
      windowStart,
      windowEnd,
      canonicalReviewDate,
      setTab,
      setSelectedDateGuarded,
      goPrev,
      goNext,
      goToday,
      registerAnalyticsReviewGuard,
    ]
  );

  return (
    <AnalyticsStateContext.Provider value={value}>
      {children}
      <UnsavedReviewChangesDialog
        visible={reviewUnsavedOpen}
        mode="navigation"
        onDismiss={dismissReviewUnsaved}
        onDiscard={handleReviewDiscardNavigate}
        onSave={handleReviewSaveNavigate}
        saveLoading={reviewNavSaving}
      />
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
