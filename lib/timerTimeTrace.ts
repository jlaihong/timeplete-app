/**
 * Dev / opt-in tracing for the timer resize → pause pipeline.
 * Set `globalThis.__TIMER_TRACE__ = true` in the JS console to log every stage,
 * or rely on `globalThis.__DEV__` (e.g. Metro / Expo dev).
 */
export function traceTimer(stage: string, payload: Record<string, unknown>): void {
  const g = globalThis as unknown as {
    __DEV__?: boolean;
    __TIMER_TRACE__?: boolean;
  };
  const nodeDev =
    typeof process !== "undefined" && process.env?.NODE_ENV === "development";
  if (g.__TIMER_TRACE__ !== true && g.__DEV__ !== true && !nodeDev) return;
  // eslint-disable-next-line no-console
  console.log(
    `[timer-time] ${stage}`,
    JSON.stringify(
      {
        ...payload,
        isoNow: new Date().toISOString(),
      },
      null,
      0,
    ),
  );
}
