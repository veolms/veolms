import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalProvider, parsePidFromWorkerId } from "../src/provider.ts";

describe("Local Fleet Provider", () => {
  it("should parse PID from worker provider ID", () => {
    assert.equal(parsePidFromWorkerId("local-proc-12345"), 12345);
    assert.equal(parsePidFromWorkerId("9999"), 9999);
    assert.equal(parsePidFromWorkerId("invalid"), null);
  });

  it("should execute commands locally", async () => {
    const provider = createLocalProvider();
    const result = await provider.execute?.("local-proc-1", [
      process.execPath,
      "-e",
      "console.log('hello local fleet')",
    ]);

    assert.ok(result);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), "hello local fleet");
  });

  it("should spawn, inspect, and gracefully terminate a worker process", async () => {
    const provider = createLocalProvider({
      workerExecutable: process.execPath,
      gracePeriodMs: 1000,
    });

    const workerId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    // Spawn a persistent node timer
    const handle = await provider.createWorker(workerId, {
      cpu: 1,
      memoryMb: 512,
      architecture: "arm64",
      storageGb: 10,
      region: "local",
      environmentVariables: {
        NODE_OPTIONS: "--eval=setInterval(()=>{},1000)",
      },
    });

    assert.equal(handle.id, workerId);
    assert.equal(handle.provider, "local");
    assert.ok(handle.providerWorkerId.startsWith("local-proc-"));

    // Check health while running
    const health = await provider.healthCheck(handle.providerWorkerId);
    assert.equal(health.healthy, true);
    assert.equal(health.state, "processing");

    // Terminate worker
    await provider.terminateWorker(handle.providerWorkerId);

    // A deliberate, successful termination must be reported as TERMINATED
    // everywhere — not "failed", which is what a SIGTERM exit (exitCode
    // null) would otherwise be misclassified as.
    const statusAfter = await provider.getWorkerStatus(handle.providerWorkerId);
    assert.equal(statusAfter, "terminated");

    const healthAfter = await provider.healthCheck(handle.providerWorkerId);
    assert.equal(healthAfter.healthy, false);
    assert.equal(healthAfter.state, "terminated");

    const workerAfter = await provider.getWorker(handle.providerWorkerId);
    assert.ok(
      workerAfter,
      "getWorker() should still find the just-terminated worker",
    );
    assert.equal(workerAfter?.status, "terminated");
  });

  it("getWorker() does not report PROCESSING once a worker has exited, even if its PID is later reused", async () => {
    const dir = await mkdtemp(join(tmpdir(), "veolms-local-provider-test-"));
    const scriptPath = join(dir, "exit-immediately.js");
    await writeFile(scriptPath, "process.exit(0);\n");

    try {
      const provider = createLocalProvider({
        workerExecutable: process.execPath,
        workerScriptPath: scriptPath,
        gracePeriodMs: 1000,
      });

      const workerId = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
      // Spawn a process that exits almost immediately on its own (not via
      // terminateWorker()), so managed.terminated gets set by the child's
      // own "exit" event handler.
      const handle = await provider.createWorker(workerId, {
        cpu: 1,
        memoryMb: 512,
        architecture: "arm64",
        storageGb: 10,
        region: "local",
        environmentVariables: {},
      });

      // Wait for the process to exit on its own.
      for (let i = 0; i < 50; i++) {
        const status = await provider.getWorkerStatus(handle.providerWorkerId);
        if (status !== "processing") break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const worker = await provider.getWorker(handle.providerWorkerId);
      assert.ok(worker);
      // Regardless of whatever PID now happens to be alive on the host,
      // getWorker() must trust the recorded exit state, not a raw isAlive()
      // check against a PID that may have been reused by an unrelated
      // process in the meantime.
      assert.notEqual(worker?.status, "processing");
      assert.equal(worker?.status, "completed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
