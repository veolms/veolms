# VeoLMS Fleet Provider Architecture & Lifecycle Specification

> **Audience**: AI Coding Agents & Systems Engineers  
> **Package**: `@veolms/fleet-types`  
> **Location**: `packages/fleet-types/AGENTS.md`

This document defines the strict architectural standards, command workflows, and lifecycle contracts for **VeoLMS Pluggable Fleet Providers**.

---

## 🏛️ 1. Golden Architectural Rules

1. **Zero Provider-Specific Code in Fleet Manager**:
   [`apps/fleet-manager`](../../apps/fleet-manager) is **100% provider-agnostic**. It MUST NOT contain any cloud vendor SDKs (e.g. `@aws-sdk/*`, `@google-cloud/*`, `@azure/*`), provider-specific setup logic, or provider-specific CLI branches.
2. **Standard Provider Package Naming & Location**:
   Every provider package MUST be named `@veolms/fleet-provider-<name>` and located at `packages/fleet-provider-<name>`.
3. **Strict Lifecycle Contract Implementation**:
   Every provider package MUST implement and export the 4 standard lifecycle modules defined in `@veolms/fleet-types`:
   - Environment Configuration (`configureEnv`)
   - Infrastructure Provisioning (`provisionInfra`)
   - Infrastructure Teardown (`destroyInfra`)
   - End-to-End Task Trigger (`triggerTest`)
4. **Shared Database Queue Ownership**:
   Adding jobs to the PostgreSQL queue (`media_assets` and `video_jobs`) is a centralized Fleet Manager responsibility. When `pnpm fleet:queue:trigger` runs, `apps/fleet-manager` creates the database job and hands the queued `jobId` to the provider. The provider only performs the compute execution (Lambda invocation, container spawn, VM launch).

---

## ⚡ 2. The 4 Fleet Lifecycle Commands

| Command                    | Workspace Entrypoint                        | Dynamic Resolution                             | Core Responsibility                                                         |
| :------------------------- | :------------------------------------------ | :--------------------------------------------- | :-------------------------------------------------------------------------- |
| `pnpm fleet:provider`      | `apps/fleet-manager/src/provider-select.ts` | Scans workspace for `@veolms/fleet-provider-*` | Interactively select active provider and set `FLEET_PROVIDER` in `.env`     |
| `pnpm fleet:infra`         | `apps/fleet-manager/src/cli.ts infra`       | `@veolms/fleet-provider-<name>/setup`          | Generates `.env`, prompts user review, provisions infrastructure            |
| `pnpm fleet:destroy`       | `apps/fleet-manager/src/cli.ts destroy`     | `@veolms/fleet-provider-<name>/destroy`        | Terminates active workers and tears down provisioned cloud/local resources  |
| `pnpm fleet:queue:trigger` | `apps/fleet-manager/src/cli.ts trigger`     | `@veolms/fleet-provider-<name>/trigger`        | Queues DB transcode job in Fleet Manager, triggers provider worker dispatch |

### Command Details

#### A. `pnpm fleet:provider`

- Scans `packages/` for directories starting with `fleet-provider-`.
- Interactively lists available providers (`aws`, `local`, etc.).
- Dynamically updates `apps/fleet-manager/.env` with `FLEET_PROVIDER="<selected>"`.

#### B. `pnpm fleet:infra [--provider=<name>] [--yes]`

The infrastructure setup follows a **two-phase review-first pattern**:

1. **Configuration Generation**:
   - Provider calls `configureEnv(options)`.
   - Writes generated `.env` files for `apps/fleet-manager/.env` and `apps/media-worker/.env`.
2. **Review & Confirmation Prompt**:
   - Displays the exact file paths on disk:
     ```text
     ✔ Configuration saved!
     Please check envs on the paths:
       • apps/fleet-manager/.env
       • apps/media-worker/.env
     You can change them if needed.

     Proceed with infrastructure provisioning? (yes/no) [yes]:
     ```
   - Passing `--yes`, `-y`, `--non-interactive`, or setting `CI=true` / `SETUP_NON_INTERACTIVE=true` automatically bypasses this prompt.
3. **Infrastructure Provisioning**:
   - Provider calls `provisionInfra(options)`.
   - Provisions resources (IAM roles, buckets, container registries, Lambda functions, or local storage directories).

#### C. `pnpm fleet:destroy [--provider=<name>] [--yes]`

- Dispatches to `@veolms/fleet-provider-<name>/destroy` (`destroyInfra`).
- Prompts for confirmation if interactive (bypassable with `--yes` / `-y`).
- Finds and terminates any active/running compute workers.
- Deletes compute functions, containers, IAM roles, log groups, and storage directories.

#### D. `pnpm fleet:queue:trigger [--provider=<name>] [--key=<path>] [--qty=<qualities>] [--yes]`

- Accepts CLI flags and options:
  - **Video Key**: `--key=<path>`, `--video-key=<path>`, `--video=<path>`, `-k <path>`, positional argument, or `VIDEO_KEY` env var. Prompts interactively if omitted in interactive mode.
  - **Qualities**: `--qty=<qualities>`, `--qualities=<qualities>`, `--quality=<qualities>`, `-q <qualities>`, or `QUALITIES` env var. Prompts interactively if omitted in interactive mode.
- **Fleet Manager Queue Step**:
  1. Ensures a media asset exists in PostgreSQL (`media_assets`).
  2. Inserts job into PostgreSQL (`video_jobs`) with `status: "queued"`.
  3. Outputs: `✓ Job [<jobId>] queued in PostgreSQL database.`
- **Provider Dispatch Step**:
  1. Calls `triggerTest({ jobId, videoId, videoKey, outputPrefix, qualities, ... })`.
  2. Provider performs ONLY the provider-specific action (AWS invokes Lambda; Local spawns worker child process; GCP triggers Cloud Run; Kubernetes creates Job).
  3. Standalone Fallback: If `options.jobId` is not provided (e.g. direct test execution), provider queues its own fallback job in PostgreSQL.

---

## 📁 3. Provider Package Anatomy & File Tree

Every provider package MUST follow this exact structure:

```text
packages/fleet-provider-<name>/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Exports create<Name>Provider() implementing FleetProvider
│   ├── setup/
│   │   ├── index.ts       # Exports configureEnv, provisionInfra, runInfraSetup
│   │   └── destroy.ts     # Exports destroyInfra, runDestroy
│   └── trigger.ts         # Exports triggerTest, runTrigger
└── tests/
    └── provider.test.ts   # Automated tests
```

### `package.json` Requirements

```json
{
  "name": "@veolms/fleet-provider-<name>",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./setup": "./src/setup/index.ts",
    "./destroy": "./src/setup/destroy.ts",
    "./trigger": "./src/trigger.ts"
  },
  "dependencies": {
    "@veolms/config": "workspace:*",
    "@veolms/database": "workspace:*",
    "@veolms/fleet-types": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.10.13",
    "typescript": "npm:@typescript/typescript6@^6.0.2"
  }
}
```

---

## 🧩 4. TypeScript Interface Contracts (`@veolms/fleet-types`)

All providers must strictly implement the contracts defined in [`packages/fleet-types/src/provider.ts`](./src/provider.ts):

### 1. `FleetProvider` Interface (`src/index.ts`)

```typescript
export interface FleetProvider {
  /** Unique provider identifier (e.g. "aws", "local", "gcp", "docker") */
  readonly name: string;

  /** Provisions a new worker instance */
  createWorker(id: string, spec: WorkerSpec): Promise<WorkerHandle>;

  /** Retrieves metadata and status of a running or recent worker */
  getWorker(providerWorkerId: string): Promise<WorkerHandle | null>;

  /** Checks worker status without querying full metadata */
  getWorkerStatus(providerWorkerId: string): Promise<WorkerStatus>;

  /** Requests immediate graceful termination of a worker */
  terminateWorker(providerWorkerId: string): Promise<void>;

  /** Executes an inspection/debug command inside the worker environment */
  execute(
    providerWorkerId: string,
    command: readonly string[],
  ): Promise<ExecutionResult>;

  /** Checks connectivity and operational status */
  healthCheck(providerWorkerId: string): Promise<HealthStatus>;

  /** Optional: verifies generated HLS playlists and media segments */
  verifyJobOutput?(
    outputPrefix: string,
    qualities: readonly VideoQualityLevel[],
  ): Promise<boolean>;
}
```

### 2. Lifecycle Options & Results

```typescript
export interface ProviderConfigOptions {
  interactive?: boolean;
  nonInteractive?: boolean;
  cwd?: string;
  rawArgs?: readonly string[];
}

export interface ProviderConfigResult {
  provider: string;
  envFiles: readonly string[];
  details?: Record<string, unknown>;
}

export interface ProviderInfraOptions {
  interactive?: boolean;
  nonInteractive?: boolean;
  skipEnvConfig?: boolean;
  force?: boolean;
  cwd?: string;
  rawArgs?: readonly string[];
}

export interface ProviderInfraResult {
  success: boolean;
  provider: string;
  createdResources?: readonly string[];
}

export interface ProviderDestroyOptions {
  interactive?: boolean;
  nonInteractive?: boolean;
  force?: boolean;
  cwd?: string;
  rawArgs?: readonly string[];
}

export interface ProviderDestroyResult {
  success: boolean;
  provider: string;
  deletedResources?: readonly string[];
}

export interface ProviderTriggerOptions {
  jobId?: string;
  videoId?: string;
  videoKey?: string;
  outputPrefix?: string;
  qualities?: readonly string[];
  videoSize?: number;
  interactive?: boolean;
  nonInteractive?: boolean;
  cwd?: string;
  rawArgs?: readonly string[];
}

export interface ProviderTriggerResult {
  success: boolean;
  jobId?: string;
  workerId?: string;
  details?: Record<string, unknown>;
}
```

---

## 🛠️ 5. Implementation Rules for Each File

### `src/setup/index.ts`

MUST export:

1. `configureEnv(options?: ProviderConfigOptions): Promise<ProviderConfigResult>`
   - Interactively queries or computes configuration.
   - Writes `apps/fleet-manager/.env` and `apps/media-worker/.env`.
   - Returns `{ provider: "<name>", envFiles: [paths...] }`.
2. `provisionInfra(options?: ProviderInfraOptions): Promise<ProviderInfraResult>`
   - Creates the necessary infrastructure resources.
3. `runInfraSetup(options?: ProviderInfraOptions): Promise<void>`
   - Orchestrates `configureEnv`, prompts user with `.env` paths and confirmation (unless `nonInteractive: true`), then calls `provisionInfra`.
   - Exported as `runInfraSetup`, `run<Name>InfraSetup`, and `default`.

> [!IMPORTANT]
> **Readline Interface Safety**:
> When a setup function can be called either with `options` or an existing `readline.Interface`, ALWAYS use a type guard:
>
> ```ts
> function isReadlineInterface(obj: unknown): obj is readline.Interface {
>   return (
>     typeof obj === "object" &&
>     obj !== null &&
>     "question" in obj &&
>     typeof (obj as any).question === "function"
>   );
> }
> ```
>
> Never do `const rl = existing ?? readline.createInterface(...)` without checking whether `existing` actually has `.question`.

### `src/setup/destroy.ts`

MUST export:

1. `destroyInfra(options?: ProviderDestroyOptions): Promise<ProviderDestroyResult>`
   - Finds and terminates any active compute workers for this provider.
   - Deletes cloud/local provisioned resources.
2. `runDestroy(options?: ProviderDestroyOptions): Promise<void>`
   - CLI entrypoint for teardown. Exported as `destroyInfra`, `runDestroy`, and `default`.

### `src/trigger.ts`

MUST export:

1. `triggerTest(options?: ProviderTriggerOptions): Promise<ProviderTriggerResult>`
   - **Job Resolution**: If `options.jobId` is passed, USE IT directly. DO NOT cancel it and DO NOT re-insert into `video_jobs`.
   - **Standalone Fallback**: If `options.jobId` is omitted, create a media asset and insert a job row into `video_jobs`.
   - **Provider Action**:
     - AWS: invokes AWS Lambda function (`veolms-fleet-manager` or probe Lambda) to claim the job and boot an EC2 worker.
     - Local: spawns local worker child process with `resolveJobHardware` sizing and tracks progress.
     - Container/Kubernetes: launches container worker pod/task.
   - **Output Verification**: Verifies generated `master.m3u8` playlist and rendition chunks (`.ts`/`.m3u8`).
   - **Clean Worker Termination**: Shuts down the test worker process after completion.
2. `runTrigger`: Aliased to `triggerTest`. Exported as `triggerTest`, `runTrigger`, and `default`.

---

## 🚀 6. Step-by-Step: Adding a New Provider

When you need to add a new provider (e.g. `gcp`, `docker`, `kubernetes`, `azure`):

1. **Create Directory**:
   `mkdir -p packages/fleet-provider-<name>/src/setup packages/fleet-provider-<name>/tests`
2. **Create `package.json`**:
   Set `name: "@veolms/fleet-provider-<name>"` and define `./setup`, `./destroy`, `./trigger` exports.
3. **Implement `src/index.ts`**:
   Implement `create<Name>Provider()` returning `FleetProvider`.
4. **Implement `src/setup/index.ts`**:
   Export `configureEnv`, `provisionInfra`, and `runInfraSetup`.
5. **Implement `src/setup/destroy.ts`**:
   Export `destroyInfra` and `runDestroy`.
6. **Implement `src/trigger.ts`**:
   Export `triggerTest` and `runTrigger`.
7. **Add Dependencies**:
   Add `@veolms/fleet-provider-<name>: "workspace:*"` to `apps/fleet-manager/package.json`.
8. **Add Tests**:
   Add `tests/provider.test.ts` verifying provider lifecycle methods.
9. **Verify All 4 Commands**:
   - `pnpm fleet:provider` (select new provider)
   - `pnpm fleet:infra --provider=<name> --yes`
   - `pnpm fleet:queue:trigger --provider=<name> --yes`
   - `pnpm fleet:destroy --provider=<name> --yes`
