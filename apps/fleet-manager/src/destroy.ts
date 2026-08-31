/**
 * VeoLMS Fleet Manager — Infrastructure Destroy Dispatcher
 *
 * Resolves the provider from --provider, then PROVIDER, then
 * FLEET_PROVIDER (see resolveProviderName), and delegates to the
 * corresponding provider package's own destroy module.
 *
 * Usage:
 *   pnpm fleet:destroy [--provider=aws]
 */

import { red } from "@veolms/fleet-types/terminal";
import { resolveProviderName } from "@veolms/config";
import { loadModuleFunction } from "./core/dynamic-module.ts";

function parseProviderFlag(argv: readonly string[]): string | true | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--provider")) continue;
    const equalIndex = arg.indexOf("=");
    if (equalIndex !== -1) return arg.slice(equalIndex + 1);
    const next = argv[i + 1];
    return next && !next.startsWith("--") ? next : true;
  }
  return undefined;
}

const cliProviderFlag = parseProviderFlag(process.argv.slice(2));
if (cliProviderFlag === true) {
  console.error(`${red("✘")} --provider requires a value, e.g. --provider=aws`);
  process.exit(1);
}

// Matches config.ts's schema default ("local") rather than silently
// defaulting to "aws" when nothing is configured at all.
const provider = resolveProviderName(cliProviderFlag, process.env) ?? "local";

async function dispatch(): Promise<void> {
  const normalized = provider.trim().toLowerCase();
  const packageName = normalized.startsWith("@")
    ? `${normalized}/destroy`
    : `@veolms/fleet-provider-${normalized}/destroy`;

  let destroyFn: () => Promise<void>;
  try {
    destroyFn = await loadModuleFunction<() => Promise<void>>(
      packageName,
      [
        "runAwsInfraDestroy",
        "runLocalInfraDestroy",
        "runInfraDestroy",
        "default",
      ],
      `Provider destroy package "${packageName}" does not export a destroy function.`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load destroy module for provider "${provider}" (${packageName}). Run "pnpm fleet:provider" to install it. Details: ${msg}`,
    );
  }
  await destroyFn();
}

dispatch().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  ${red("✘ Infrastructure teardown failed:")} ${msg}\n`);
  process.exit(1);
});
