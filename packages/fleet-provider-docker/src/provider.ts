import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  ActiveProviderInstance,
  ExecutionResult,
  FleetProvider,
  HealthStatus,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "@veolms/fleet-types";

const execFileAsync = promisify(execFile);
const POST_TERMINATE_RETENTION_MS = 5 * 60 * 1000;
const DOCKER_SOCKET_REQUEST_TIMEOUT_MS = 30_000;
const MANAGED_LABEL = "veolms.managed=true";

interface DockerWorkerRecord {
  readonly workerId: string;
  readonly createdAt: Date;
  status: WorkerStatus;
  terminated: boolean;
}

export interface DockerProviderConfig {
  readonly image?: string;
  readonly network?: string;
  readonly storageRoot?: string;
  /** Path visible to the manager for checking output after the daemon mount. */
  readonly verificationStorageRoot?: string;
  readonly workerDatabaseUrl?: string;
  readonly defaultEnv?: Readonly<Record<string, string>>;
  readonly dockerCommand?: string;
  /** Uses Docker Engine's Unix-socket API; required inside a LocalStack Lambda. */
  readonly transport?: "cli" | "socket";
  readonly socketPath?: string;
}

interface DockerApiResponse {
  readonly statusCode: number;
  readonly body: string;
}

interface DockerInspectResponse {
  readonly State?: { readonly Status?: string };
  readonly Created?: string;
  readonly Config?: {
    readonly Labels?: Record<string, string | undefined>;
  };
}

interface DockerContainerSummary {
  readonly Id?: string;
  readonly Labels?: Record<string, string | undefined>;
}

function mapDockerStatus(status: string): WorkerStatus {
  switch (status) {
    case "created":
    case "restarting":
      return "starting";
    case "running":
    case "paused":
      return "processing";
    case "exited":
      return "completed";
    case "dead":
      return "failed";
    default:
      return "terminated";
  }
}

function isMissingDockerContainerError(error: unknown): boolean {
  const candidate = error as {
    code?: number | string;
    stderr?: string | Buffer;
    message?: string;
  };
  const details = [candidate.message, candidate.stderr?.toString()]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    candidate.code === 404 ||
    candidate.code === "ENOENT" ||
    details.includes("no such container") ||
    details.includes("container not found") ||
    details.includes("no such object")
  );
}

export function buildDockerRunArgs(options: {
  workerId: string;
  spec: WorkerSpec;
  image: string;
  storageRoot: string;
  network?: string;
  defaultEnv?: Readonly<Record<string, string>>;
  workerDatabaseUrl?: string;
}): string[] {
  const env = buildWorkerEnvironment(options);
  const args = [
    "run",
    "--detach",
    "--label",
    MANAGED_LABEL,
    "--label",
    `veolms.worker-id=${options.workerId}`,
    "--name",
    `veolms-worker-${options.workerId.slice(0, 12)}`,
    "--cpus",
    String(options.spec.cpu),
    "--memory",
    `${options.spec.memoryMb}m`,
    "--mount",
    `type=bind,src=${options.storageRoot},dst=/app/s3-bucket,rw`,
    "--add-host",
    "host.docker.internal:host-gateway",
  ];
  if (options.network) {
    args.push("--network", options.network);
  }
  for (const [key, value] of Object.entries(env)) {
    args.push("--env", `${key}=${value}`);
  }
  args.push(options.image);
  return args;
}

function buildWorkerEnvironment(options: {
  workerId: string;
  spec: WorkerSpec;
  defaultEnv?: Readonly<Record<string, string>>;
  workerDatabaseUrl?: string;
}): Record<string, string> {
  return {
    ...options.defaultEnv,
    ...options.spec.environmentVariables,
    ...(options.workerDatabaseUrl
      ? { DATABASE_URL: options.workerDatabaseUrl }
      : {}),
    WORKER_ID: options.workerId,
    PROVIDER: "docker",
    LOCAL_STORAGE_ROOT: "/app/s3-bucket",
    WORKER_MAX_JOBS: "1",
  };
}

/** Docker Engine create payload used by the LocalStack Lambda fallback. */
export function buildDockerCreateRequest(options: {
  workerId: string;
  spec: WorkerSpec;
  image: string;
  storageRoot: string;
  network?: string;
  defaultEnv?: Readonly<Record<string, string>>;
  workerDatabaseUrl?: string;
}): { readonly name: string; readonly body: Record<string, unknown> } {
  const env = buildWorkerEnvironment(options);
  return {
    name: `veolms-worker-${options.workerId.slice(0, 12)}`,
    body: {
      Image: options.image,
      Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
      Labels: {
        "veolms.managed": "true",
        "veolms.worker-id": options.workerId,
      },
      HostConfig: {
        // Keep terminal containers long enough for reconciliation and logs.
        // The fleet manager removes them after observing terminal state.
        AutoRemove: false,
        NanoCpus: Math.round(options.spec.cpu * 1_000_000_000),
        Memory: options.spec.memoryMb * 1024 * 1024,
        Binds: [`${options.storageRoot}:/app/s3-bucket:rw`],
        ExtraHosts: ["host.docker.internal:host-gateway"],
        ...(options.network ? { NetworkMode: options.network } : {}),
      },
    },
  };
}

export function createDockerProvider(
  config: DockerProviderConfig = {},
): FleetProvider {
  const image = config.image ?? "veolms-media-worker:local";
  const storageRoot = resolve(
    config.storageRoot ?? join(process.cwd(), "s3-bucket"),
  );
  const verificationStorageRoot = resolve(
    config.verificationStorageRoot ?? storageRoot,
  );
  const docker = config.dockerCommand ?? "docker";
  const transport = config.transport ?? "cli";
  const socketPath = config.socketPath ?? "/var/run/docker.sock";
  const workers = new Map<string, DockerWorkerRecord>();

  const run = async (args: readonly string[]) =>
    await execFileAsync(docker, [...args], { maxBuffer: 1024 * 1024 });

  const requestDockerApi = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<DockerApiResponse> =>
    await new Promise((resolveRequest, rejectRequest) => {
      let settled = false;
      let request: ReturnType<typeof httpRequest> | undefined;
      const finish = (error?: Error, response?: DockerApiResponse) => {
        if (settled) return;
        settled = true;
        if (request) request.setTimeout(0);
        if (error) {
          request?.destroy();
          rejectRequest(error);
        } else if (response) {
          resolveRequest(response);
        }
      };
      const payload = body === undefined ? undefined : JSON.stringify(body);
      request = httpRequest(
        {
          socketPath,
          method,
          path,
          headers: payload
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(payload),
              }
            : undefined,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("error", (error) => finish(error));
          response.on("end", () =>
            finish(undefined, {
              statusCode: response.statusCode ?? 500,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      request.on("error", (error) => finish(error));
      request.setTimeout(DOCKER_SOCKET_REQUEST_TIMEOUT_MS, () =>
        finish(
          new Error(
            `Docker Engine request timed out after ${DOCKER_SOCKET_REQUEST_TIMEOUT_MS}ms`,
          ),
        ),
      );
      if (payload) request.write(payload);
      request.end();
    });

  const apiRequest = async (method: string, path: string, body?: unknown) => {
    const response = await requestDockerApi(method, path, body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(
        `Docker Engine ${method} ${path} failed (${response.statusCode}): ${response.body}`,
      );
    }
    return response.body;
  };

  const terminalHandle = (
    containerId: string,
    record: DockerWorkerRecord,
  ): WorkerHandle => ({
    id: record.workerId,
    providerWorkerId: containerId,
    provider: "docker",
    status: record.status,
    privateIp: null,
    publicIp: null,
    createdAt: record.createdAt,
  });

  return {
    name: "docker",

    async createWorker(id: string, spec: WorkerSpec): Promise<WorkerHandle> {
      await mkdir(storageRoot, { recursive: true });
      let providerWorkerId: string;
      if (transport === "socket") {
        const create = buildDockerCreateRequest({
          workerId: id,
          spec,
          image,
          storageRoot,
          network: config.network,
          defaultEnv: config.defaultEnv,
          workerDatabaseUrl: config.workerDatabaseUrl,
        });
        const response = JSON.parse(
          await apiRequest(
            "POST",
            `/containers/create?name=${encodeURIComponent(create.name)}`,
            create.body,
          ),
        ) as { Id?: string };
        providerWorkerId = response.Id?.trim() ?? "";
        if (providerWorkerId) {
          await apiRequest(
            "POST",
            `/containers/${encodeURIComponent(providerWorkerId)}/start`,
          );
        }
      } else {
        const { stdout } = await run(
          buildDockerRunArgs({
            workerId: id,
            spec,
            image,
            storageRoot,
            network: config.network,
            defaultEnv: config.defaultEnv,
            workerDatabaseUrl: config.workerDatabaseUrl,
          }),
        );
        providerWorkerId = stdout.trim();
      }
      if (!providerWorkerId) {
        throw new Error("Docker did not return a container ID for the worker");
      }
      workers.set(providerWorkerId, {
        workerId: id,
        createdAt: new Date(),
        status: "starting",
        terminated: false,
      });
      return terminalHandle(providerWorkerId, workers.get(providerWorkerId)!);
    },

    async getWorker(providerWorkerId: string): Promise<WorkerHandle | null> {
      const record = workers.get(providerWorkerId);
      if (record?.terminated) return terminalHandle(providerWorkerId, record);
      try {
        let rawStatus: string;
        let createdAt: Date | undefined;
        let discoveredWorkerId: string | undefined;
        if (transport === "socket") {
          const inspect = JSON.parse(
            await apiRequest(
              "GET",
              `/containers/${encodeURIComponent(providerWorkerId)}/json`,
            ),
          ) as DockerInspectResponse;
          rawStatus = inspect.State?.Status ?? "dead";
          createdAt = inspect.Created ? new Date(inspect.Created) : undefined;
          discoveredWorkerId = inspect.Config?.Labels?.["veolms.worker-id"];
        } else {
          const { stdout } = await run([
            "inspect",
            "--format",
            "{{json .}}",
            providerWorkerId,
          ]);
          const inspect = JSON.parse(stdout.trim()) as DockerInspectResponse;
          rawStatus = inspect.State?.Status ?? "dead";
          createdAt = inspect.Created ? new Date(inspect.Created) : undefined;
          discoveredWorkerId = inspect.Config?.Labels?.["veolms.worker-id"];
        }
        const status = mapDockerStatus(rawStatus);
        const worker = record ?? {
          workerId: discoveredWorkerId ?? providerWorkerId,
          createdAt: createdAt ?? new Date(),
          status,
          terminated:
            status === "terminated" ||
            status === "failed" ||
            status === "completed",
        };
        worker.status = status;
        worker.terminated =
          status === "terminated" ||
          status === "failed" ||
          status === "completed";
        if (worker.terminated) workers.set(providerWorkerId, worker);
        return terminalHandle(providerWorkerId, worker);
      } catch (error) {
        if (!isMissingDockerContainerError(error)) {
          throw error;
        }
        if (record) {
          record.status = "terminated";
          record.terminated = true;
          return terminalHandle(providerWorkerId, record);
        }
        return null;
      }
    },

    async getWorkerStatus(providerWorkerId: string): Promise<WorkerStatus> {
      return (await this.getWorker(providerWorkerId))?.status ?? "terminated";
    },

    async execute(
      providerWorkerId: string,
      command: readonly string[],
    ): Promise<ExecutionResult> {
      if (transport === "socket") {
        return {
          exitCode: 1,
          stdout: "",
          stderr:
            "Docker Engine socket execution is not supported for workers.",
        };
      }
      try {
        const { stdout, stderr } = await run([
          "exec",
          providerWorkerId,
          ...command,
        ]);
        return { exitCode: 0, stdout, stderr };
      } catch (error: unknown) {
        const err = error as {
          code?: number;
          stdout?: string | Buffer;
          stderr?: string | Buffer;
        };
        return {
          exitCode: typeof err.code === "number" ? err.code : 1,
          stdout: err.stdout?.toString() ?? "",
          stderr: err.stderr?.toString() ?? String(error),
        };
      }
    },

    async terminateWorker(providerWorkerId: string): Promise<void> {
      try {
        if (transport === "socket") {
          await apiRequest(
            "DELETE",
            `/containers/${encodeURIComponent(providerWorkerId)}?force=true`,
          );
        } else {
          await run(["rm", "--force", providerWorkerId]);
        }
      } catch {
        // Termination is idempotent: an already removed container is terminal.
      }
      const record = workers.get(providerWorkerId);
      if (record) {
        record.status = "terminated";
        record.terminated = true;
        const timer = setTimeout(
          () => workers.delete(providerWorkerId),
          POST_TERMINATE_RETENTION_MS,
        );
        timer.unref();
      }
    },

    async healthCheck(providerWorkerId: string): Promise<HealthStatus> {
      const worker = await this.getWorker(providerWorkerId);
      const state = worker?.status ?? "terminated";
      return {
        healthy: state === "processing" || state === "starting",
        state,
        message: `Docker container ${providerWorkerId} is ${state}`,
      };
    },

    async listActiveInstances(): Promise<readonly ActiveProviderInstance[]> {
      const discoveredIds =
        transport === "socket"
          ? (
              JSON.parse(
                // Docker Engine label filters can be unreliable through a
                // nested socket mount. Filter this local response instead so
                // reconciliation cannot mark a healthy worker as missing.
                await apiRequest("GET", "/containers/json?all=1"),
              ) as DockerContainerSummary[]
            )
              .filter(
                (container) => container.Labels?.["veolms.managed"] === "true",
              )
              .map((container) => container.Id?.trim())
              .filter((id): id is string => Boolean(id))
          : (
              await run(["ps", "--quiet", "--filter", `label=${MANAGED_LABEL}`])
            ).stdout
              .split("\n")
              .map((id) => id.trim())
              .filter(Boolean);
      // A long-lived serverful manager knows the containers it created. Keep
      // those records visible when a nested Docker socket cannot enumerate
      // them (a common Desktop/LocalStack topology); normal DB heartbeats and
      // termination still reconcile a genuinely dead worker.
      const ids = new Set(discoveredIds);
      if (transport === "socket") {
        for (const [id, worker] of workers) {
          if (!worker.terminated) ids.add(id);
        }
      }
      const instances: ActiveProviderInstance[] = [];
      for (const id of ids) {
        const record = workers.get(id);
        const handle =
          transport === "socket" && record && !discoveredIds.includes(id)
            ? terminalHandle(id, record)
            : await this.getWorker(id);
        if (handle) {
          instances.push({
            providerWorkerId: id,
            status: handle.status,
            launchTime: handle.createdAt,
            workerId: handle.id,
          });
        }
      }
      return instances;
    },

    async verifyJobOutput(outputPrefix: string): Promise<boolean> {
      const { stat } = await import("node:fs/promises");
      const cleanPrefix = outputPrefix.replace(/^[/\\]+/, "");
      try {
        return (
          (
            await stat(
              join(verificationStorageRoot, cleanPrefix, "master.m3u8"),
            )
          ).size > 0
        );
      } catch {
        return false;
      }
    },
  };
}

export const createProvider = createDockerProvider;
