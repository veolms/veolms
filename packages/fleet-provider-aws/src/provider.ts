import {
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeInstanceStatusCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
  type _InstanceType,
  type Instance,
} from "@aws-sdk/client-ec2";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import type {
  ActiveProviderInstance,
  ExecutionResult,
  FleetProvider,
  HealthStatus,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "@veolms/fleet-types";
import {
  encodeUserDataBase64,
  generateUserDataScript,
} from "./bootstrapper.ts";
import { loadAwsProviderConfig } from "./config.ts";
import { resolveDebianAmiId } from "./debian-ami.ts";
import {
  filterAllowedInstanceTypes,
  selectOptimalInstanceType,
} from "./instance-types.ts";
import {
  createAwsSchedulerManager,
  type AwsSchedulerConfig,
  type AwsSchedulerManager,
} from "./scheduler.ts";

// Capacity/availability-class RunInstances errors: worth trying the next
// same-size candidate for. Everything else (bad AMI, IAM, subnet, etc.)
// would fail identically on every candidate, so it's raised immediately
// instead of wasting time retrying.
const RETRYABLE_EC2_ERROR_NAMES = new Set([
  "InsufficientInstanceCapacity",
  "Unsupported",
  "InstanceLimitExceeded",
  "SpotMaxPriceTooLow",
  "MaxSpotInstanceCountExceeded",
]);

function isRetryableEc2Error(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name;
  return typeof name === "string" && RETRYABLE_EC2_ERROR_NAMES.has(name);
}

export interface AwsProviderConfig {
  readonly region?: string;
  readonly amiId?: string;
  readonly securityGroupIds?: readonly string[];
  readonly subnetId?: string;
  readonly keyName?: string;
  readonly iamInstanceProfile?: string;
  readonly useSpot?: boolean;
  readonly defaultEnv?: Readonly<Record<string, string>>;
  readonly s3BucketName?: string;
  readonly s3BuildBucket?: string;
  readonly ec2Client?: EC2Client;
  readonly ssmClient?: SSMClient;
  readonly s3Client?: S3Client;
  readonly schedulerManager?: AwsSchedulerManager;
  readonly schedulerConfig?: AwsSchedulerConfig;
}

const DEFAULT_ROOT_DEVICE_NAME = "/dev/sda1";

async function resolveRootDeviceName(
  ec2: EC2Client,
  imageId: string,
): Promise<string> {
  try {
    const response = await ec2.send(
      new DescribeImagesCommand({ ImageIds: [imageId] }),
    );
    return response.Images?.[0]?.RootDeviceName ?? DEFAULT_ROOT_DEVICE_NAME;
  } catch (err: unknown) {
    console.error(
      `Failed to resolve root device name for AMI ${imageId}, falling back to ${DEFAULT_ROOT_DEVICE_NAME}:`,
      err,
    );
    return DEFAULT_ROOT_DEVICE_NAME;
  }
}

export function mapEc2StateToWorkerStatus(stateName?: string): WorkerStatus {
  switch (stateName) {
    case "pending":
      return "starting";
    case "running":
      return "processing";
    case "shutting-down":
      return "terminating";
    case "terminated":
      return "terminated";
    case "stopping":
    case "stopped":
      return "failed";
    default:
      return "pending";
  }
}

export function createAwsProvider(
  config: AwsProviderConfig = {},
): FleetProvider {
  // Fields not explicitly passed by the caller fall back to the AWS
  // provider's own env-derived config, so constructing this provider
  // through the generic fleet-manager resolver (which only knows about
  // provider-agnostic options like workerScriptPath) still picks up
  // region/spot/IAM-profile from the environment instead of silently
  // defaulting to us-east-1 + on-demand + no instance profile.
  const envConfig = loadAwsProviderConfig(process.env);
  const region = config.region ?? envConfig.AWS_REGION;
  const amiId = config.amiId ?? envConfig.AMI_ID;
  const iamInstanceProfile =
    config.iamInstanceProfile ?? envConfig.EC2_IAM_INSTANCE_PROFILE;
  const useSpot = config.useSpot ?? envConfig.EC2_USE_SPOT;
  const subnetId = config.subnetId ?? envConfig.SUBNET_ID;
  const rawKeyName = config.keyName ?? envConfig.KEY_NAME;
  const normalizedKeyName = rawKeyName?.trim();
  const keyName =
    normalizedKeyName &&
    normalizedKeyName !== "null" &&
    normalizedKeyName !== "undefined"
      ? normalizedKeyName
      : undefined;
  const securityGroupIds =
    config.securityGroupIds ??
    (envConfig.SECURITY_GROUP_IDS
      ? envConfig.SECURITY_GROUP_IDS.split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined);

  const ec2 = config.ec2Client ?? new EC2Client({ region });
  const ssm = config.ssmClient ?? new SSMClient({ region });
  const s3 = config.s3Client ?? new S3Client({ region });
  const schedulerManager =
    config.schedulerManager ??
    createAwsSchedulerManager({
      region,
      ...config.schedulerConfig,
    });
  // LocalStack Docker VM manager only accepts its tagged Docker AMIs.
  // Real AWS AMI IDs are API-only/mock resources in LocalStack and do not
  // create an instance container or execute UserData.
  const isLocalStack = Boolean(process.env.AWS_ENDPOINT_URL);
  const defaultLocalStackAmi = "ami-df5de72bdb3b3";

  return {
    name: "aws",

    async createWorker(id: string, spec: WorkerSpec): Promise<WorkerHandle> {
      const candidates = selectOptimalInstanceType(spec);
      const allowedInstanceTypes = envConfig.EC2_ALLOWED_INSTANCE_TYPES
        ? envConfig.EC2_ALLOWED_INSTANCE_TYPES.split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;
      const instanceTypesToTry = filterAllowedInstanceTypes(
        candidates,
        allowedInstanceTypes,
      );

      const imageId =
        amiId ??
        (isLocalStack
          ? defaultLocalStackAmi
          : await resolveDebianAmiId(ssm, region, spec.architecture));
      // LocalStack's EC2 mock doesn't model real AMI metadata (see the
      // isLocalStack comment above), so DescribeImages there wouldn't
      // return a meaningful RootDeviceName — skip straight to the default.
      const rootDeviceName = isLocalStack
        ? DEFAULT_ROOT_DEVICE_NAME
        : await resolveRootDeviceName(ec2, imageId);

      const bucketName = config.s3BucketName ?? envConfig.S3_BUCKET;
      const buildBucket =
        config.s3BuildBucket ?? envConfig.S3_BUILD_BUCKET ?? bucketName;
      const defaultAwsEnv: Record<string, string> = {
        AWS_REGION: region,
        STORAGE_PROVIDER: envConfig.STORAGE_PROVIDER,
        ...(bucketName
          ? { S3_BUCKET: bucketName, S3_BUCKET_NAME: bucketName }
          : {}),
        ...(buildBucket ? { S3_BUILD_BUCKET: buildBucket } : {}),
        ...config.defaultEnv,
      };

      const userDataScript = generateUserDataScript({
        workerId: id,
        spec,
        extraEnv: defaultAwsEnv,
      });

      const userDataBase64 = encodeUserDataBase64(userDataScript);

      // Try each same-size candidate in turn, most-preferred first. Only a
      // capacity/availability-class error moves on to the next candidate —
      // any other error (bad AMI, IAM, subnet, ...) would fail identically
      // on every candidate, so it's raised immediately instead.
      let lastError: unknown;
      for (const instanceType of instanceTypesToTry) {
        const command = new RunInstancesCommand({
          ImageId: imageId,
          InstanceType: instanceType as _InstanceType,
          MinCount: 1,
          MaxCount: 1,
          UserData: userDataBase64,
          SubnetId: subnetId,
          SecurityGroupIds: securityGroupIds
            ? [...securityGroupIds]
            : undefined,
          KeyName: keyName,
          IamInstanceProfile: iamInstanceProfile
            ? { Name: iamInstanceProfile }
            : undefined,
          InstanceMarketOptions: useSpot ? { MarketType: "spot" } : undefined,
          BlockDeviceMappings: [
            {
              DeviceName: rootDeviceName,
              Ebs: {
                VolumeSize: Math.max(30, spec.storageGb),
                VolumeType: "gp3",
                DeleteOnTermination: true,
              },
            },
          ],
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [
                { Key: "Name", Value: `veolms-worker-${id.slice(0, 8)}` },
                { Key: "WorkerId", Value: id },
                { Key: "ManagedBy", Value: "veolms-fleet-manager" },
                { Key: "Architecture", Value: spec.architecture },
              ],
            },
          ],
        });

        try {
          const response = await ec2.send(command);
          const instance = response.Instances?.[0];

          if (!instance || !instance.InstanceId) {
            throw new Error(`Failed to launch EC2 instance for worker ${id}`);
          }

          return {
            id,
            providerWorkerId: instance.InstanceId,
            provider: "aws",
            status: "starting",
            privateIp: instance.PrivateIpAddress ?? null,
            publicIp: instance.PublicIpAddress ?? null,
            createdAt: instance.LaunchTime
              ? new Date(instance.LaunchTime)
              : new Date(),
          };
        } catch (err: unknown) {
          lastError = err;
          if (!isRetryableEc2Error(err)) {
            throw err;
          }
          const errName = err instanceof Error ? err.name : "unknown error";
          console.warn(
            `[fleet-provider-aws] ${instanceType} unavailable for worker ${id} (${errName}) — trying next candidate...`,
          );
        }
      }

      throw new Error(
        `Failed to launch EC2 instance for worker ${id}: exhausted candidates [${instanceTypesToTry.join(", ")}]`,
        { cause: lastError },
      );
    },

    async getWorker(providerWorkerId: string): Promise<WorkerHandle | null> {
      try {
        const response = await ec2.send(
          new DescribeInstancesCommand({
            InstanceIds: [providerWorkerId],
          }),
        );

        const reservation = response.Reservations?.[0];
        const instance: Instance | undefined = reservation?.Instances?.[0];

        if (!instance || !instance.InstanceId) {
          return null;
        }

        const workerIdTag = instance.Tags?.find(
          (t) => t.Key === "WorkerId",
        )?.Value;
        const workerId = workerIdTag ?? instance.InstanceId;

        return {
          id: workerId,
          providerWorkerId: instance.InstanceId,
          provider: "aws",
          status: mapEc2StateToWorkerStatus(instance.State?.Name),
          privateIp: instance.PrivateIpAddress ?? null,
          publicIp: instance.PublicIpAddress ?? null,
          createdAt: instance.LaunchTime
            ? new Date(instance.LaunchTime)
            : new Date(),
        };
      } catch (err: unknown) {
        console.error(`Error describing instance ${providerWorkerId}:`, err);
        return null;
      }
    },

    async getWorkerStatus(providerWorkerId: string): Promise<WorkerStatus> {
      try {
        const response = await ec2.send(
          new DescribeInstancesCommand({
            InstanceIds: [providerWorkerId],
          }),
        );

        const instance = response.Reservations?.[0]?.Instances?.[0];
        if (!instance) {
          return "terminated";
        }

        return mapEc2StateToWorkerStatus(instance.State?.Name);
      } catch {
        return "terminated";
      }
    },

    async terminateWorker(providerWorkerId: string): Promise<void> {
      try {
        await ec2.send(
          new TerminateInstancesCommand({
            InstanceIds: [providerWorkerId],
          }),
        );
      } catch (err: unknown) {
        console.error(`Error terminating instance ${providerWorkerId}:`, err);
      }
    },

    async healthCheck(providerWorkerId: string): Promise<HealthStatus> {
      try {
        const response = await ec2.send(
          new DescribeInstanceStatusCommand({
            InstanceIds: [providerWorkerId],
            IncludeAllInstances: true,
          }),
        );

        const status = response.InstanceStatuses?.[0];
        if (!status) {
          return {
            healthy: false,
            state: "terminated",
            message: `Instance status not found for ${providerWorkerId}`,
          };
        }

        const state = mapEc2StateToWorkerStatus(status.InstanceState?.Name);
        const systemOk = status.SystemStatus?.Status === "ok";
        const instanceOk = status.InstanceStatus?.Status === "ok";
        const isHealthy = state === "processing" && systemOk && instanceOk;

        return {
          healthy: isHealthy,
          state,
          message: `EC2 state: ${status.InstanceState?.Name ?? "unknown"}, System: ${status.SystemStatus?.Status ?? "unknown"}, Instance: ${status.InstanceStatus?.Status ?? "unknown"}`,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          healthy: false,
          state: "failed",
          message: `Health check failed: ${message}`,
        };
      }
    },

    async execute(
      providerWorkerId: string,
      command: readonly string[],
    ): Promise<ExecutionResult> {
      if (command.length === 0) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      const shellSafeCommand = command
        .map((arg) => `'${arg.replace(/'/g, "'\\''")}'`)
        .join(" ");

      try {
        const sendCmd = new SendCommandCommand({
          InstanceIds: [providerWorkerId],
          DocumentName: "AWS-RunShellScript",
          Parameters: {
            commands: [shellSafeCommand],
          },
        });

        const sendRes = await ssm.send(sendCmd);
        const commandId = sendRes.Command?.CommandId;

        if (!commandId) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Failed to dispatch SSM command",
          };
        }

        // Wait briefly for SSM command execution
        const maxWaitMs = 10000;
        const start = Date.now();

        while (Date.now() - start < maxWaitMs) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const inv = await ssm.send(
              new GetCommandInvocationCommand({
                CommandId: commandId,
                InstanceId: providerWorkerId,
              }),
            );

            if (inv.Status === "Success" || inv.Status === "Failed") {
              return {
                exitCode:
                  inv.ResponseCode ?? (inv.Status === "Success" ? 0 : 1),
                stdout: inv.StandardOutputContent ?? "",
                stderr: inv.StandardErrorContent ?? "",
              };
            }
          } catch {
            // Invocation might not be available immediately
          }
        }

        return {
          exitCode: 124,
          stdout: "",
          stderr: `SSM command ${commandId} timed out after ${maxWaitMs / 1000}s`,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { exitCode: 1, stdout: "", stderr: message };
      }
    },

    async listActiveInstances(): Promise<readonly ActiveProviderInstance[]> {
      try {
        const response = await ec2.send(
          new DescribeInstancesCommand({
            Filters: [
              {
                Name: "tag:ManagedBy",
                Values: ["veolms-fleet-manager", "veolms-infra-setup"],
              },
              {
                Name: "instance-state-name",
                Values: ["pending", "running", "shutting-down", "stopped"],
              },
            ],
          }),
        );

        const instances: ActiveProviderInstance[] = [];
        for (const res of response.Reservations ?? []) {
          for (const inst of res.Instances ?? []) {
            if (inst.InstanceId) {
              const workerIdTag = inst.Tags?.find(
                (t) => t.Key === "WorkerId",
              )?.Value;
              instances.push({
                providerWorkerId: inst.InstanceId,
                status: mapEc2StateToWorkerStatus(inst.State?.Name),
                launchTime: inst.LaunchTime
                  ? new Date(inst.LaunchTime)
                  : undefined,
                workerId: workerIdTag ?? null,
              });
            }
          }
        }
        return instances;
      } catch (err: unknown) {
        console.error("Failed to list active EC2 instances:", err);
        return [];
      }
    },

    async verifyJobOutput(outputPrefix: string): Promise<boolean> {
      const bucketName = config.s3BucketName ?? envConfig.S3_BUCKET;
      if (!bucketName) {
        return true;
      }

      const cleanPrefix = outputPrefix.replace(/^[/\\]+/, "");
      const masterKey = cleanPrefix.endsWith("/")
        ? `${cleanPrefix}master.m3u8`
        : `${cleanPrefix}/master.m3u8`;

      try {
        const head = await s3.send(
          new HeadObjectCommand({
            Bucket: bucketName,
            Key: masterKey,
          }),
        );
        return (head.ContentLength ?? 0) > 0;
      } catch {
        try {
          const directHead = await s3.send(
            new HeadObjectCommand({
              Bucket: bucketName,
              Key: cleanPrefix,
            }),
          );
          return (directHead.ContentLength ?? 0) > 0;
        } catch {
          return false;
        }
      }
    },

    async scheduleNextWakeup(
      targetTime: Date,
      payload: Readonly<Record<string, unknown>> = {},
    ): Promise<void> {
      await schedulerManager.scheduleNextWakeup(targetTime, payload);
    },

    async cancelWakeup(): Promise<void> {
      await schedulerManager.cancelWakeup();
    },
  };
}
