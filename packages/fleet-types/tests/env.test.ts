import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseEnvFile,
  readExistingEnv,
  resolveRepoRoot,
  writeEnvFile,
} from "../src/env.ts";

describe("Environment & Monorepo Helpers", () => {
  it("resolves the monorepo root containing pnpm-workspace.yaml", () => {
    const repoRoot = resolveRepoRoot();
    assert.ok(typeof repoRoot === "string" && repoRoot.length > 0);
  });

  it("parses .env files with quotes, comments, and CRLF", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "veolms-env-test-"));
    const envFile = join(tempDir, ".env");
    try {
      await writeEnvFile(envFile, {
        DATABASE_URL: "postgresql://localhost:5432/veolms",
        MAX_WORKERS: "4",
        S3_BUCKET: "my-bucket",
      });

      const parsed = parseEnvFile(envFile);
      assert.equal(
        parsed["DATABASE_URL"],
        "postgresql://localhost:5432/veolms",
      );
      assert.equal(parsed["MAX_WORKERS"], "4");
      assert.equal(parsed["S3_BUCKET"], "my-bucket");

      const asyncRead = await readExistingEnv(envFile);
      assert.deepEqual(asyncRead, parsed);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("merges existing environment variables when mergeExisting option is true", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "veolms-env-merge-test-"));
    const envFile = join(tempDir, ".env");
    try {
      await writeEnvFile(envFile, { FOO: "1", BAR: "2" });
      await writeEnvFile(
        envFile,
        { BAR: "updated", BAZ: "3" },
        { mergeExisting: true },
      );

      const parsed = parseEnvFile(envFile);
      assert.equal(parsed["FOO"], "1");
      assert.equal(parsed["BAR"], "updated");
      assert.equal(parsed["BAZ"], "3");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
