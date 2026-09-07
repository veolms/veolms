import { execSync } from "node:child_process";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  bold,
  cyan,
  dim,
  green,
  red,
  yellow,
} from "@veolms/fleet-types/terminal";
import {
  isMainModule,
  type ProviderDestroyOptions,
  type ProviderDestroyResult,
} from "@veolms/fleet-types";
import { resolveS3BucketName, resolveS3BuildBucketName } from "../config.ts";
import { isNonInteractive } from "./common.ts";

const ROLE_NAME = "VeoLMSWorkerRole";
const INSTANCE_PROFILE_NAME = "VeoLMSWorkerInstanceProfile";
const LAMBDA_NAME = "veolms-fleet-manager";

export interface DestroyOptions {
  readonly rl?: readline.Interface;
  readonly region?: string;
  readonly endpointUrl?: string | null;
  readonly s3BucketName?: string | null;
  readonly s3BuildBucket?: string | null;
  readonly nonInteractive?: boolean;
}

function exec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

async function destroyS3Bucket(
  rl: readline.Interface,
  bucketName: string,
  region: string,
): Promise<void> {
  console.info(`\n[6/6] Checking S3 bucket ${bold(bucketName)}...`);

  const exists =
    exec(
      `aws s3api head-bucket --bucket "${bucketName}" --region ${region}`,
    ) !== null;
  if (!exists) {
    console.info(`  ${green("✔")} Bucket does not exist — nothing to delete.`);
    return;
  }

  // `KeyCount` is unreliable here — LocalStack's list-objects-v2 response
  // omits the field entirely (returns "None"), which would silently read as
  // zero objects and skip the confirmation prompt below even when the
  // bucket holds real data. Counting `Contents` directly works identically
  // against real AWS and LocalStack.
  // We use JSON output to avoid shell quoting and escaping differences across platforms.
  let objectCount = 0;
  const countRaw = exec(
    `aws s3api list-objects-v2 --bucket "${bucketName}" --region ${region} --output json`,
  );
  if (countRaw) {
    try {
      const parsed = JSON.parse(countRaw);
      objectCount = Array.isArray(parsed.Contents) ? parsed.Contents.length : 0;
    } catch {
      objectCount = 0;
    }
  }

  if (objectCount > 0) {
    const nonInteractiveMode = isNonInteractive();

    console.info(`
  ${bold(red("⚠ WARNING:"))} S3 bucket ${bold(bucketName)} contains ${bold(String(objectCount))} object(s)
  — transcoded videos, HLS playlists/segments, and worker bundles.
  Deleting this bucket will ${bold(red("PERMANENTLY DELETE ALL OF THAT DATA"))}.
  This cannot be undone.
`);
    if (!nonInteractiveMode) {
      const answer = await rl.question(
        `  ${bold("?")} Type "yes" to permanently delete the bucket and all its data: `,
      );
      if (answer.trim().toLowerCase() !== "yes") {
        console.info(
          `  ${yellow("⚠")} Skipped — bucket ${bold(bucketName)} and its data were ${bold("NOT")} deleted.`,
        );
        return;
      }
    } else {
      console.info(
        `  ${yellow("⚠")} Non-interactive mode: proceeding with bucket deletion.`,
      );
    }
  } else {
    console.info(`  ${dim("Bucket is empty — no confirmation needed.")}`);
  }

  const emptyRes = exec(
    `aws s3 rm "s3://${bucketName}" --recursive --region ${region}`,
  );
  if (emptyRes === null && objectCount > 0) {
    console.info(`  ${red("✘")} Failed to empty bucket ${bucketName}.`);
    return;
  }

  const deleteRes = exec(
    `aws s3api delete-bucket --bucket "${bucketName}" --region ${region}`,
  );
  if (deleteRes !== null) {
    console.info(`  ${green("✔")} Deleted S3 bucket: ${bucketName}`);
  } else {
    console.info(`  ${red("✘")} Could not delete S3 bucket: ${bucketName}`);
  }
}

export async function runAwsInfraDestroy(
  options: DestroyOptions = {},
): Promise<void> {
  const region = options.region ?? process.env.AWS_REGION ?? "us-east-1";
  const endpointUrl =
    options.endpointUrl !== undefined
      ? options.endpointUrl
      : process.env.AWS_ENDPOINT_URL || null;
  const s3BucketName =
    options.s3BucketName !== undefined
      ? options.s3BucketName
      : resolveS3BucketName(process.env);
  const s3BuildBucket =
    options.s3BuildBucket !== undefined
      ? options.s3BuildBucket
      : resolveS3BuildBucketName(process.env);

  console.info(`
${bold(red("╔══════════════════════════════════════════════════════╗"))}
${bold(red("║"))}          ${bold("VeoLMS AWS Infrastructure Teardown")}          ${bold(red("║"))}
${bold(red("╚══════════════════════════════════════════════════════╝"))}
`);

  console.info(
    `Target: ${bold(cyan(endpointUrl ? `LocalStack @ ${endpointUrl}` : "Real AWS"))}`,
  );
  console.info(`Region: ${bold(cyan(region))}\n`);

  const ownRl = !options.rl;
  const rl = options.rl ?? readline.createInterface({ input, output });

  try {
    await runDestroySteps(rl, {
      region,
      endpointUrl,
      s3BucketName,
      s3BuildBucket,
    });
  } finally {
    if (ownRl) {
      rl.close();
    }
  }
}

async function runDestroySteps(
  rl: readline.Interface,
  config: {
    readonly region: string;
    readonly endpointUrl: string | null;
    readonly s3BucketName: string | null;
    readonly s3BuildBucket?: string | null;
  },
): Promise<void> {
  const { region, s3BucketName, s3BuildBucket } = config;

  // 1. Terminate any running EC2 instances
  console.info("[1/6] Terminating active EC2 worker instances...");
  const instanceIds = exec(
    `aws ec2 describe-instances --region ${region} --filters "Name=tag:ManagedBy,Values=veolms-fleet-manager,veolms-infra-setup" "Name=instance-state-name,Values=running,pending,stopped,stopping" --query "Reservations[*].Instances[*].InstanceId" --output text`,
  );
  if (instanceIds) {
    const termRes = exec(
      `aws ec2 terminate-instances --instance-ids ${instanceIds} --region ${region}`,
    );
    if (termRes !== null) {
      console.info(`  ${green("✔")} Terminated instances: ${instanceIds}`);
    } else {
      console.info(
        `  ${red("✘")} Failed to terminate instances: ${instanceIds}`,
      );
    }
  } else {
    console.info(`  ${green("✔")} No active EC2 instances found.`);
  }

  // 2. Delete Lambda functions & Layers
  console.info("\n[2/6] Deleting AWS Lambda functions and layers...");
  const lambdaNames = [LAMBDA_NAME, "veolms-video-metadata-probe"];
  for (const fnName of lambdaNames) {
    const lambdaDel = exec(
      `aws lambda delete-function --function-name ${fnName} --region ${region}`,
    );
    if (lambdaDel !== null) {
      console.info(`  ${green("✔")} Deleted Lambda: ${fnName}`);
    } else {
      console.info(
        `  ${dim(`Lambda ${fnName} not found or already deleted.`)}`,
      );
    }
  }

  // Delete ffprobe layer versions
  try {
    const layerVersionsRaw = exec(
      `aws lambda list-layer-versions --layer-name veolms-ffprobe --region ${region} --query "LayerVersions[*].Version" --output text`,
    );
    if (layerVersionsRaw) {
      const versions = layerVersionsRaw.split(/\s+/).filter(Boolean);
      for (const ver of versions) {
        exec(
          `aws lambda delete-layer-version --layer-name veolms-ffprobe --version-number ${ver} --region ${region}`,
        );
      }
      if (versions.length > 0) {
        console.info(
          `  ${green("✔")} Deleted veolms-ffprobe layer versions: ${versions.join(", ")}`,
        );
      }
    }
  } catch {
    // Ignore layer deletion errors
  }

  // 3. Delete CloudWatch Log Groups
  console.info("\n[3/6] Deleting CloudWatch log groups...");
  const logGroups = [
    `/aws/lambda/${LAMBDA_NAME}`,
    "/aws/lambda/veolms-video-metadata-probe",
    "/veolms/workers",
    "/veolms/fleet-manager",
  ];
  for (const lg of logGroups) {
    const res = exec(
      `aws logs delete-log-group --log-group-name "${lg}" --region ${region}`,
    );
    if (res !== null) {
      console.info(`  ${green("✔")} Deleted log group: ${lg}`);
    } else {
      console.info(`  ${dim(`Log group ${lg} not found or already deleted.`)}`);
    }
  }

  // 4. Delete IAM Instance Profile
  console.info("\n[4/6] Deleting IAM Instance Profile...");
  exec(
    `aws iam remove-role-from-instance-profile --instance-profile-name ${INSTANCE_PROFILE_NAME} --role-name ${ROLE_NAME}`,
  );
  const profileDel = exec(
    `aws iam delete-instance-profile --instance-profile-name ${INSTANCE_PROFILE_NAME}`,
  );
  if (profileDel !== null) {
    console.info(
      `  ${green("✔")} Deleted instance profile: ${INSTANCE_PROFILE_NAME}`,
    );
  } else {
    console.info(
      `  ${red("✘")} Could not delete instance profile (may not exist): ${INSTANCE_PROFILE_NAME}`,
    );
  }

  // 5. Delete IAM Role
  console.info("\n[5/6] Deleting IAM Role & Policies...");
  const inlinePolicies = (
    exec(
      `aws iam list-role-policies --role-name ${ROLE_NAME} --query "PolicyNames" --output text`,
    ) ?? ""
  )
    .split(/\s+/)
    .filter(Boolean);

  for (const pol of inlinePolicies) {
    const res = exec(
      `aws iam delete-role-policy --role-name ${ROLE_NAME} --policy-name "${pol}"`,
    );
    if (res !== null) {
      console.info(`  ${green("✔")} Deleted inline policy: ${pol}`);
    } else {
      console.info(`  ${red("✘")} Could not delete inline policy: ${pol}`);
    }
  }

  const attachedPolicies = (
    exec(
      `aws iam list-attached-role-policies --role-name ${ROLE_NAME} --query "AttachedPolicies[*].PolicyArn" --output text`,
    ) ?? ""
  )
    .split(/\s+/)
    .filter(Boolean);

  for (const polArn of attachedPolicies) {
    const res = exec(
      `aws iam detach-role-policy --role-name ${ROLE_NAME} --policy-arn "${polArn}"`,
    );
    if (res !== null) {
      console.info(`  ${green("✔")} Detached managed policy: ${polArn}`);
    } else {
      console.info(`  ${red("✘")} Could not detach managed policy: ${polArn}`);
    }
  }

  const roleDel = exec(`aws iam delete-role --role-name ${ROLE_NAME}`);
  if (roleDel !== null) {
    console.info(`  ${green("✔")} Deleted IAM role: ${ROLE_NAME}`);
  } else {
    console.info(
      `  ${red("✘")} Could not delete IAM role (may not exist): ${ROLE_NAME}`,
    );
  }

  // 6. Delete EC2 Worker Security Group
  console.info("\n[6/8] Deleting EC2 Worker Security Group...");
  const sgDel = exec(
    `aws ec2 delete-security-group --group-name "VeoLMSWorkerSecurityGroup" --region ${region}`,
  );
  if (sgDel !== null) {
    console.info(
      `  ${green("✔")} Deleted security group: VeoLMSWorkerSecurityGroup`,
    );
  } else {
    console.info(
      `  ${dim("Security group VeoLMSWorkerSecurityGroup not found or already deleted.")}`,
    );
  }

  // 7. Delete EventBridge Scheduler Schedule & Role
  console.info("\n[7/8] Deleting EventBridge Scheduler Schedule & Role...");
  exec(
    `aws scheduler delete-schedule --name veolms-fleet-next-check --region ${region} 2>/dev/null`,
  );
  exec(
    `aws iam delete-role-policy --role-name VeoLMSSchedulerRole --policy-name VeoLMSSchedulerInvokeLambda 2>/dev/null`,
  );
  const schedRoleDel = exec(
    `aws iam delete-role --role-name VeoLMSSchedulerRole 2>/dev/null`,
  );
  if (schedRoleDel !== null) {
    console.info(`  ${green("✔")} Deleted IAM role: VeoLMSSchedulerRole`);
  } else {
    console.info(
      `  ${dim("IAM role VeoLMSSchedulerRole not found or already deleted.")}`,
    );
  }

  // 8. Delete S3 bucket(s) — asks for confirmation if it still holds data
  if (s3BucketName) {
    await destroyS3Bucket(rl, s3BucketName, region);
  } else {
    console.info(
      `\n[8/8] No S3_BUCKET configured — skipping S3 media bucket cleanup.`,
    );
  }

  if (s3BuildBucket && s3BuildBucket !== s3BucketName) {
    console.info(
      `\nChecking dedicated S3 build bucket ${bold(s3BuildBucket)}...`,
    );
    await destroyS3Bucket(rl, s3BuildBucket, region);
  }

  console.info(`
${bold(green("╔══════════════════════════════════════════════════════╗"))}
${bold(green("║"))}        ${bold("All AWS Infrastructure Destroyed!")}           ${bold(green("║"))}
${bold(green("╚══════════════════════════════════════════════════════╝"))}
`);
}

export async function destroyInfra(
  options: ProviderDestroyOptions = {},
): Promise<ProviderDestroyResult> {
  const isNonInteractive =
    options.nonInteractive === true ||
    options.interactive === false ||
    process.env.CI === "true" ||
    process.argv.includes("--yes") ||
    process.argv.includes("-y") ||
    process.argv.includes("--non-interactive");

  await runAwsInfraDestroy({
    nonInteractive: isNonInteractive,
  });

  return {
    success: true,
    provider: "aws",
  };
}

export const runDestroy = destroyInfra;
export default destroyInfra;

if (isMainModule(import.meta.url)) {
  destroyInfra().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ Destroy failed: ${msg}\n`);
    process.exit(1);
  });
}
