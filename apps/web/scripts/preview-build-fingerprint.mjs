import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const fingerprintInputs = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  "package.json",
  "pnpm-lock.yaml",
  "apps/web/package.json",
  "apps/web/react-router.config.ts",
  "apps/web/vite.config.ts",
  "apps/web/scripts",
  "apps/web/src",
  "apps/web/public",
  "packages/config/package.json",
  "packages/config/src",
  "packages/contracts/package.json",
  "packages/contracts/src",
  "packages/video-player/package.json",
  "packages/video-player/src",
];

export async function getPreviewBuildFingerprint(
  workspaceRoot,
  { learningPrerenderScope, environment = process.env },
) {
  const hash = createHash("sha256");
  const relevantEnvironment = Object.fromEntries(
    Object.entries(environment)
      .filter(
        ([key]) => key.startsWith("VITE_") || key === "STATIC_BUILD_API_URL",
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  relevantEnvironment.NODE_ENV = "production";
  relevantEnvironment.VEO_LEARNING_PRERENDER_SCOPE = learningPrerenderScope;
  if (learningPrerenderScope === "first-section") {
    relevantEnvironment.VITE_API_BASE_URL = "/v1";
  }

  hash.update(JSON.stringify(relevantEnvironment));

  const addInput = async (relativePath) => {
    const absolutePath = path.join(workspaceRoot, relativePath);
    let details;
    try {
      details = await stat(absolutePath);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }

    hash.update(`${relativePath}\0`);
    if (details.isDirectory()) {
      const entries = (await readdir(absolutePath)).sort();
      for (const entry of entries) {
        await addInput(path.join(relativePath, entry));
      }
      return;
    }

    if (details.isFile()) {
      hash.update(await readFile(absolutePath));
    }
  };

  for (const input of fingerprintInputs) {
    await addInput(input);
  }

  return hash.digest("hex");
}
