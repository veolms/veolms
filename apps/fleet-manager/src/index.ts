import { runCli } from "./cli.ts";

export * from "./cli.ts";
export * from "./core/fleet-manager.ts";
export * from "./core/video-job-manager.ts";
export * from "./core/monitor.ts";
export * from "./core/scheduler.ts";
export * from "./core/worker-manager.ts";
export * from "./core/provider-resolver.ts";
export * from "./diagnostics/diagnostics.ts";
export * from "./entrypoints/serverful.ts";
export * from "./entrypoints/serverless.ts";

export function main(): void {
  runCli(process.argv.slice(2)).catch((err: unknown) => {
    console.error("[fleet-manager] Fatal error:", err);
    process.exit(1);
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}
