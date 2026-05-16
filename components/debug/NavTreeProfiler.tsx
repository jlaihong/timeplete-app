import React, { Profiler, type ProfilerOnRenderCallback } from "react";
import { isNavTraceEnabled } from "../../lib/navInstrumentation";

const onRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  if (!isNavTraceEnabled()) return;
  if (actualDuration < 8 && phase === "update") return;
  console.log(
    `[nav-trace] Profiler id=${id} phase=${phase} actualDuration=${actualDuration.toFixed(2)}ms baseDuration=${baseDuration.toFixed(2)}ms startTime=${startTime.toFixed(2)} commitTime=${commitTime.toFixed(2)}`,
  );
};

export function NavTreeProfiler({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  if (!isNavTraceEnabled()) return children;
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
