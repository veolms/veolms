import { runCli } from "./cli.ts";

runCli().catch((error: unknown) => {
  console.error("[fleet-cli] Fatal error:", error);
  process.exit(1);
});
