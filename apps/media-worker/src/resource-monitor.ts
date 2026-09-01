import * as os from "node:os";

export interface ResourceUsage {
  cpuPercent: number;
  memoryPercent: number;
}

/**
 * Whole-machine CPU + memory utilization — not this Node process's own
 * usage. FFmpeg (the actual CPU-heavy work) runs as a separate child
 * process, so process.cpuUsage() would just show Node's near-idle
 * orchestration overhead and completely miss the load that matters here.
 * os.cpus() gives cumulative per-core tick counts since boot; sampling it
 * twice a short window apart and diffing yields a real utilization %.
 */
export async function sampleResourceUsage(
  sampleWindowMs = 200,
): Promise<ResourceUsage> {
  const start = os.cpus();
  await new Promise((resolve) => setTimeout(resolve, sampleWindowMs));
  const end = os.cpus();

  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < start.length; i++) {
    const s = start[i]?.times;
    const e = end[i]?.times;
    if (!s || !e) continue;
    const sTotal = s.user + s.nice + s.sys + s.idle + s.irq;
    const eTotal = e.user + e.nice + e.sys + e.idle + e.irq;
    idleDelta += e.idle - s.idle;
    totalDelta += eTotal - sTotal;
  }

  const cpuPercent = Math.min(
    100,
    Math.max(0, totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0),
  );
  const memoryPercent = Math.min(
    100,
    Math.max(0, (1 - os.freemem() / os.totalmem()) * 100),
  );

  return { cpuPercent, memoryPercent };
}
