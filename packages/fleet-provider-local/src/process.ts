import { spawn, type ChildProcess } from "node:child_process";

export interface ManagedProcess {
  readonly workerId: string;
  readonly pid: number;
  readonly child: ChildProcess;
  readonly startedAt: Date;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  exitCode: number | null;
  terminated: boolean;
  terminatedByRequest: boolean;
}

export class LocalProcessRegistry {
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly pidToWorkerId = new Map<number, string>();

  public spawnProcess(options: {
    workerId: string;
    command: string;
    args: readonly string[];
    env: Readonly<Record<string, string>>;
    cwd?: string;
  }): ManagedProcess {
    const { workerId, command, args, env, cwd } = options;
    const resolvedCwd = cwd ?? process.cwd();

    const isPosix = process.platform !== "win32";

    const child = spawn(command, [...args], {
      env: {
        ...process.env,
        ...env,
      },
      cwd: resolvedCwd,
      detached: isPosix,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (!child.pid) {
      throw new Error(`Failed to spawn child process for worker ${workerId}`);
    }

    const managed: ManagedProcess = {
      workerId,
      pid: child.pid,
      child,
      startedAt: new Date(),
      cwd: resolvedCwd,
      env,
      exitCode: null,
      terminated: false,
      terminatedByRequest: false,
    };

    child.on("exit", (code) => {
      managed.exitCode = code;
      managed.terminated = true;
    });

    child.on("error", (err) => {
      console.error(
        `Local worker process error for ${workerId} (pid ${child.pid}):`,
        err,
      );
      managed.terminated = true;
    });

    // Pipe stdout and stderr to parent console with worker prefix if available
    child.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trimEnd();
      if (line.length > 0) {
        console.info(`[worker:${workerId.slice(0, 8)}] ${line}`);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trimEnd();
      if (line.length > 0) {
        console.error(`[worker:${workerId.slice(0, 8)}] ${line}`);
      }
    });

    this.processes.set(workerId, managed);
    this.pidToWorkerId.set(child.pid, workerId);

    return managed;
  }

  public getByWorkerId(workerId: string): ManagedProcess | undefined {
    return this.processes.get(workerId);
  }

  public getByPid(pid: number): ManagedProcess | undefined {
    const workerId = this.pidToWorkerId.get(pid);
    if (!workerId) {
      return undefined;
    }
    return this.processes.get(workerId);
  }

  public isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private killProcessOrGroup(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
    if (process.platform !== "win32") {
      try {
        process.kill(-pid, signal);
        return;
      } catch {
        // Fallback to direct PID if group kill fails
      }
    }

    try {
      process.kill(pid, signal);
    } catch {
      // Process already terminated
    }
  }

  public async terminate(pid: number, gracePeriodMs = 5000): Promise<void> {
    const markTerminated = () => {
      const managed = this.getByPid(pid);
      if (managed) {
        managed.terminated = true;
        managed.terminatedByRequest = true;
      }
    };

    if (!this.isAlive(pid)) {
      markTerminated();
      return;
    }

    this.killProcessOrGroup(pid, "SIGTERM");

    const checkInterval = 100;
    const start = Date.now();

    while (Date.now() - start < gracePeriodMs) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      if (!this.isAlive(pid)) {
        markTerminated();
        return;
      }
    }

    // Force kill if still alive after grace period
    if (this.isAlive(pid)) {
      this.killProcessOrGroup(pid, "SIGKILL");
    }

    markTerminated();
  }

  public remove(workerId: string): void {
    const managed = this.processes.get(workerId);
    if (managed) {
      this.pidToWorkerId.delete(managed.pid);
      this.processes.delete(workerId);
    }
  }
}
