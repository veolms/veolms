import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Creates a mock executable script that outputs the given JSON payload.
 * Stores the JSON in an isolated file to prevent shell single-quote corruption.
 */
export function createMockExecutable(
  dir: string,
  baseName: string,
  outputJson: unknown,
): string {
  const jsonPath = path.join(dir, `${baseName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(outputJson));

  if (process.platform === "win32") {
    const cmdPath = path.join(dir, `${baseName}.cmd`);
    fs.writeFileSync(cmdPath, `@echo off\r\ntype "${jsonPath}"\r\n`);
    return cmdPath;
  }

  const shPath = path.join(dir, `${baseName}.sh`);
  fs.writeFileSync(shPath, `#!/bin/sh\ncat "${jsonPath}"\n`, { mode: 0o755 });
  return shPath;
}
