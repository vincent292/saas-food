export function perfLogsEnabled() {
  return process.env.PERF_LOGS === "true";
}

export function perfNow() {
  return performance.now();
}

export function perfLog(label: string, startedAt: number, meta?: Record<string, string | number | boolean | null | undefined>) {
  if (!perfLogsEnabled()) {
    return;
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  const suffix = meta
    ? ` ${Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${value}`)
        .join(" ")}`
    : "";

  console.log(`[perf] ${label} ${elapsedMs}ms${suffix}`);
}

export async function measurePerf<T>(label: string, work: () => Promise<T>, meta?: Record<string, string | number | boolean | null | undefined>) {
  const startedAt = perfNow();
  try {
    return await work();
  } finally {
    perfLog(label, startedAt, meta);
  }
}
