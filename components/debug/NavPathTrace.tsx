import React, { useEffect, useRef } from "react";
import { usePathname } from "expo-router";
import {
  isNavTraceEnabled,
  traceAfterPaint,
  tracePathnameCommitted,
  installLongTaskLogger,
} from "../../lib/navInstrumentation";

/**
 * Subscribes to pathname commits + double-rAF “after paint” for `lib/navInstrumentation`.
 * Mount once under `(app)` (inside Expo Router context).
 */
export function NavPathTrace() {
  const pathname = usePathname();
  const prevPath = useRef(pathname);

  useEffect(() => {
    return installLongTaskLogger();
  }, []);

  useEffect(() => {
    if (!isNavTraceEnabled()) return;
    const prev = prevPath.current;
    if (prev === pathname) return;
    tracePathnameCommitted(pathname, prev);
    prevPath.current = pathname;

    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        traceAfterPaint(pathname);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [pathname]);

  return null;
}
