import { z } from "zod";

export const awsProviderConfigSchema = z.object({
  AWS_REGION: z.string().default("us-east-1"),
  EC2_IAM_INSTANCE_PROFILE: z.string().default("VeoLMSWorkerInstanceProfile"),
  EC2_USE_SPOT: z
    .enum(["true", "false"])
    .default("true")
    .transform((val) => val === "true"),
  S3_BUCKET: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_BUILD_BUCKET: z.string().optional(),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("s3"),
  AMI_ID: z.string().optional(),
  SUBNET_ID: z.string().optional(),
  SECURITY_GROUP_IDS: z.string().optional(),
  EC2_SECURITY_GROUP_IDS: z.string().optional(),
  KEY_NAME: z.string().optional(),
  EC2_KEY_NAME: z.string().optional(),
  WORKER_IDLE_POLL_SECONDS: z.coerce.number().int().min(1).optional(),
  // Comma-separated exact instance types (e.g. "c7g.xlarge,c7g.2xlarge").
  // When set, each size tier's candidate list (see instance-types.ts) is
  // filtered down to only the types present here, letting an operator
  // restrict provisioning to a known set of types.
  EC2_ALLOWED_INSTANCE_TYPES: z.string().optional(),
});

export type AwsProviderEnvironmentConfig = z.infer<
  typeof awsProviderConfigSchema
>;

export function resolveS3BucketName(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  return env["S3_BUCKET"] || env["S3_BUCKET_NAME"] || null;
}

export function resolveS3BuildBucketName(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  return env["S3_BUILD_BUCKET"] || null;
}

export function loadAwsProviderConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AwsProviderEnvironmentConfig {
  const resolvedEnv = {
    ...env,
    S3_BUCKET: resolveS3BucketName(env) ?? undefined,
    S3_BUILD_BUCKET: resolveS3BuildBucketName(env) ?? undefined,
    KEY_NAME: env["KEY_NAME"] || env["EC2_KEY_NAME"],
    SECURITY_GROUP_IDS:
      env["SECURITY_GROUP_IDS"] ||
      env["EC2_SECURITY_GROUP_IDS"] ||
      env["EC2_SECURITY_GROUP_ID"],
  };
  return awsProviderConfigSchema.parse(resolvedEnv);
}
