import { normalizeShortLinkPath } from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";

import { findTakenLinkPaths } from "./links.repository.ts";

/**
 * Whether a link uses `/<name>`. A profile lives at `/<username>` and the
 * website Worker answers a link before the app, so such a username's
 * profile could never be opened.
 */
export async function isShortLinkPath(
  database: DatabaseExecutor,
  name: string,
): Promise<boolean> {
  const path = normalizeShortLinkPath(name);
  if (!path) return false;
  return (await findTakenLinkPaths(database, [path])).has(path);
}
