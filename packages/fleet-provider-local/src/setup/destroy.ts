/**
 * VeoLMS Local Provider Infrastructure Teardown
 *
 * The local provider has no cloud infrastructure to tear down — workers
 * are child processes already terminated by the Fleet Manager's
 * worker-manager. This is a no-op confirmation, kept symmetrical with
 * the AWS provider's destroy module so the dispatcher in
 * apps/fleet-manager/src/destroy.ts always finds a "./destroy" export.
 *
 * Dispatched via: apps/fleet-manager/src/destroy.ts
 * Triggered by:   pnpm fleet:destroy  (when FLEET_PROVIDER=local)
 */

import { bold, cyan, green } from "@veolms/fleet-types/terminal";

export async function runLocalInfraDestroy(): Promise<void> {
  console.info(`
${bold(cyan("╔══════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}          ${bold("VeoLMS Local Provider Teardown")}             ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════╝"))}

  ${green("✔")} No cloud infrastructure to destroy for the local provider.
  ${green("✔")} Any running worker processes are terminated by the Fleet
      Manager daemon directly — nothing further to clean up here.
`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runLocalInfraDestroy().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ Local teardown failed: ${msg}\n`);
    process.exit(1);
  });
}
