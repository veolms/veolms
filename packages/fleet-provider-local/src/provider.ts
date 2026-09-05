import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../../..");
import type {
  ExecutionResult,
  FleetProvider,
  HealthStatus,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "@veolms/fleet-types";
import { LocalProcessRegistry, type ManagedProcess } from "./process.ts";

const execFileAsync = promisify(execFile);

const POST_TERMINATE_RETENTION_MS = 5 * 60 * 1000;

export interface LocalProviderConfig {
  readonly workerExecutable?: string;
  readonly workerScriptPath?: string;
  readonly defaultEnv?: Readonly<Record<string, string>>;
  readonly cwd?: string;
  readonly gracePeriodMs?: number;
}

/**
 * Single source of truth for turning a ManagedProcess's raw exit state into
 * a WorkerStatus, used by getWorker/getWorkerStatus/healthCheck alike.
 * terminatedByRequest is checked first because a SIGTERM/SIGKILL exit
 * normally reports exitCode === null, which would otherwise fall through
 * to "failed" even for a deliberate, successful terminateWorker() call.
 */
function deriveWorkerStatus(managed: ManagedProcess): WorkerStatus {
  if (managed.terminatedByRequest) {
    return "terminated";
  }
  return managed.exitCode === 0 ? "completed" : "failed";
}

export function parsePidFromWorkerId(providerWorkerId: string): number | null {
  if (providerWorkerId.startsWith("local-proc-")) {
    const rawPid = providerWorkerId.replace("local-proc-", "");
    const parsed = parseInt(rawPid, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = parseInt(providerWorkerId, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createLocalProvider(
  config: LocalProviderConfig = {},
): FleetProvider {
  const registry = new LocalProcessRegistry();
  const workerExecutable = config.workerExecutable ?? process.execPath;
  const workerScriptPath = config.workerScriptPath;
  const gracePeriodMs = config.gracePeriodMs ?? 5000;

  return {
    name: "local",

    async createWorker(id: string, spec: WorkerSpec): Promise<WorkerHandle> {
      const args: string[] = [];
      if (workerScriptPath) {
        args.push(workerScriptPath);
      }

      const env: Record<string, string> = {
        ...(process.env.DATABASE_URL
          ? { DATABASE_URL: process.env.DATABASE_URL }
          : {}),
        ...config.defaultEnv,
        ...spec.environmentVariables,
        WORKER_ID: id,
        PROVIDER: "local",
      };

      const managed = registry.spawnProcess({
        workerId: id,
        command: workerExecutable,
        args,
        env,
        cwd: config.cwd ?? repoRoot,
      });

      return {
        id,
        providerWorkerId: `local-proc-${managed.pid}`,
        provider: "local",
        status: "starting",
        privateIp: "127.0.0.1",
        publicIp: null,
        createdAt: managed.startedAt,
      };
    },

    async getWorker(providerWorkerId: string): Promise<WorkerHandle | null> {
      const pid = parsePidFromWorkerId(providerWorkerId);
      if (!pid) {
        return null;
      }

      const managed = registry.getByPid(pid);
      if (!managed) {
        return null;
      }

      // Check the recorded terminal state first — isAlive() only proves
      // *some* process currently holds this PID, and once a worker exits
      // the OS is free to reuse its PID for something unrelated.
      if (!managed.terminated && !registry.isAlive(pid)) {
        // Process died but the child's own "exit" event hasn't been
        // processed yet — record it now so later calls see it too.
        managed.terminated = true;
      }
      const status: WorkerStatus = managed.terminated
        ? deriveWorkerStatus(managed)
        : "processing";

      return {
        id: managed.workerId,
        providerWorkerId,
        provider: "local",
        status,
        privateIp: "127.0.0.1",
        publicIp: null,
        createdAt: managed.startedAt,
      };
    },

    async getWorkerStatus(providerWorkerId: string): Promise<WorkerStatus> {
      const pid = parsePidFromWorkerId(providerWorkerId);
      if (!pid) {
        return "terminated";
      }

      const managed = registry.getByPid(pid);
      if (!managed) {
        return registry.isAlive(pid) ? "processing" : "terminated";
      }

      if (managed.terminated) {
        return deriveWorkerStatus(managed);
      }

      if (!registry.isAlive(pid)) {
        managed.terminated = true;
        return deriveWorkerStatus(managed);
      }

      return "processing";
    },

    async execute(
      providerWorkerId: string,
      command: readonly string[],
    ): Promise<ExecutionResult> {
      const cmd = command[0];
      if (!cmd) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      // Run in the target worker's own cwd/env when it's a known local
      // worker, mirroring the AWS provider's execute() running on the
      // actual target instance — falling back to this process's own
      // defaults when the id doesn't resolve to a tracked worker.
      const pid = parsePidFromWorkerId(providerWorkerId);
      const managed = pid ? registry.getByPid(pid) : undefined;

      const args = command.slice(1);
      try {
        const { stdout, stderr } = await execFileAsync(cmd, [...args], {
          cwd: managed?.cwd,
          env: managed ? { ...process.env, ...managed.env } : undefined,
        });
        return {
          exitCode: 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        };
      } catch (err: unknown) {
        const error = err as {
          code?: number | string;
          stdout?: string | Buffer;
          stderr?: string | Buffer;
        };
        return {
          exitCode: typeof error.code === "number" ? error.code : 1,
          stdout: error.stdout?.toString() ?? "",
          stderr: error.stderr?.toString() ?? String(err),
        };
      }
    },

    async terminateWorker(providerWorkerId: string): Promise<void> {
      const pid = parsePidFromWorkerId(providerWorkerId);
      if (!pid) {
        return;
      }

      await registry.terminate(pid, gracePeriodMs);
      const managed = registry.getByPid(pid);
      if (managed) {
        // Delay removal instead of dropping it immediately: getWorker(),
        // getWorkerStatus(), and healthCheck() all need managed.exitCode/
        // terminatedByRequest to still be there for callers that poll
        // shortly after termination, so a clean shutdown reports as
        // TERMINATED rather than degrading to "not found" or FAILED.
        const workerId = managed.workerId;
        const timer = setTimeout(() => {
          registry.remove(workerId);
        }, POST_TERMINATE_RETENTION_MS);
        timer.unref();
      }
    },

    async healthCheck(providerWorkerId: string): Promise<HealthStatus> {
      const pid = parsePidFromWorkerId(providerWorkerId);
      if (!pid) {
        return {
          healthy: false,
          state: "terminated",
          message: `Invalid PID for worker handle: ${providerWorkerId}`,
        };
      }

      const isAlive = registry.isAlive(pid);
      if (!isAlive) {
        const managed = registry.getByPid(pid);
        return {
          healthy: false,
          state: managed ? deriveWorkerStatus(managed) : "terminated",
          message: managed
            ? `Process ${pid} is not running. Exit code: ${managed.exitCode ?? "unknown"}${managed.terminatedByRequest ? " (terminated on request)" : ""}`
            : `Process ${pid} is not running and is no longer tracked.`,
        };
      }

      return {
        healthy: true,
        state: "processing",
        message: `Process ${pid} is healthy and running`,
      };
    },
  };
}
