import {
  IAMClient,
  CreateUserCommand,
  GetUserCommand,
  CreatePolicyCommand,
  GetPolicyCommand,
  CreatePolicyVersionCommand,
  ListPolicyVersionsCommand,
  DeletePolicyVersionCommand,
  AttachUserPolicyCommand,
  CreateAccessKeyCommand,
  ListAccessKeysCommand,
} from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { isMainModule } from "@veolms/fleet-types";
import {
  bold,
  cyan,
  dim,
  green,
  red,
  yellow,
} from "@veolms/fleet-types/terminal";
import { resolveS3BucketName, resolveS3BuildBucketName } from "../src/config.ts";

const USER_NAME = "veolms-fleet-infra-action";
const POLICY_NAME = "veolms-fleet-infra-action-policy";

export interface SetupCicdOptions {
  readonly region?: string;
  readonly bucketName?: string;
  readonly profile?: string | null;
  readonly userName?: string;
  readonly policyName?: string;
  readonly generateKeys?: boolean;
}

export interface SetupCicdResult {
  readonly accountId: string;
  readonly region: string;
  readonly bucketName: string;
  readonly userName: string;
  readonly policyArn: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
}

export async function runSetupCicdIam(
  options?: SetupCicdOptions,
): Promise<SetupCicdResult> {
  const profile =
    options?.profile ?? process.env["AWS_PROFILE"] ?? undefined;
  const region =
    options?.region ||
    process.env["AWS_REGION"] ||
    process.env["FLEET_MANAGER_LAMBDA_REGION"] ||
    "us-east-1";

  const bucketName =
    options?.bucketName ||
    resolveS3BuildBucketName(process.env) ||
    resolveS3BucketName(process.env);

  const userName =
    options?.userName ||
    process.env["CICD_USER_NAME"] ||
    USER_NAME;
  const policyName =
    options?.policyName ||
    process.env["CICD_POLICY_NAME"] ||
    POLICY_NAME;

  if (!bucketName) {
    throw new Error(
      "S3_BUILD_BUCKET, S3_BUCKET_NAME, or S3_BUCKET environment variable must be specified to configure least-privilege CI/CD permissions.\n" +
        "Run `pnpm fleet:infra` first to provision the bucket, or pass S3_BUILD_BUCKET=<name>.",
    );
  }

  console.info(`\n╔══════════════════════════════════════════════════════╗`);
  console.info(`║    VeoLMS CI/CD Deployer IAM Setup                   ║`);
  console.info(`╚══════════════════════════════════════════════════════╝\n`);

  if (profile) {
    console.info(`  Active AWS Profile: ${bold(cyan(profile))}`);
  }
  console.info(`  Target IAM User:    ${bold(cyan(userName))}`);
  console.info(`  Target IAM Policy:  ${bold(cyan(policyName))}`);
  console.info(`  Target Region:      ${bold(cyan(region))}`);
  console.info(`  Target S3 Bucket:   ${bold(cyan(bucketName))}\n`);

  const clientConfig = {
    region,
    profile,
  };

  const sts = new STSClient(clientConfig);
  const iam = new IAMClient(clientConfig);

  console.info(`[1/4] Resolving AWS Account ID dynamically via STS...`);
  let caller;
  try {
    caller = await sts.send(new GetCallerIdentityCommand({}));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to verify AWS credentials with STS: ${msg}\n` +
        `Please ensure valid AWS credentials are configured (e.g. run 'aws configure' or specify --profile=<name>).`,
    );
  }

  const accountId = caller.Account;
  if (!accountId) {
    throw new Error("Could not determine AWS Account ID from active credentials.");
  }
  console.info(`  ${green("✔")} AWS Account ID: ${bold(accountId)}`);

  // 1. Create or verify IAM User
  console.info(`\n[2/4] Checking IAM user ${bold(userName)}...`);
  try {
    await iam.send(new GetUserCommand({ UserName: userName }));
    console.info(`  ${green("✔")} IAM user ${bold(userName)} already exists.`);
  } catch (err: any) {
    if (err.name === "NoSuchEntityException" || err.name === "NoSuchEntity") {
      await iam.send(new CreateUserCommand({ UserName: userName }));
      console.info(`  ${green("✔")} Created IAM user ${bold(userName)}.`);
    } else {
      throw err;
    }
  }

  // 2. Build Policy Document
  const policyDocument = JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "S3BuildBucketUploadAndRead",
          Effect: "Allow",
          Action: [
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject",
            "s3:DeleteObjectVersion",
            "s3:HeadObject",
            "s3:ListBucket",
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}`,
            `arn:aws:s3:::${bucketName}/*`,
          ],
        },
        {
          Sid: "LambdaFunctionCodeUpdate",
          Effect: "Allow",
          Action: [
            "lambda:UpdateFunctionCode",
            "lambda:GetFunction",
            "lambda:GetFunctionConfiguration",
            "lambda:PublishVersion",
          ],
          Resource: [
            `arn:aws:lambda:${region}:${accountId}:function:veolms-fleet-manager`,
            `arn:aws:lambda:${region}:${accountId}:function:veolms-video-metadata-probe`,
          ],
        },
        {
          Sid: "CloudWatchLogsDescribe",
          Effect: "Allow",
          Action: ["logs:DescribeLogGroups"],
          Resource: "*",
        },
      ],
    },
    null,
    2,
  );

  const policyArn = `arn:aws:iam::${accountId}:policy/${policyName}`;

  // 3. Create or Update Policy & Attach to User
  console.info(`\n[3/4] Updating CI/CD policy ${bold(policyName)}...`);
  try {
    await iam.send(new GetPolicyCommand({ PolicyArn: policyArn }));
    console.info(`  Policy exists — rotating policy versions...`);
    const versionsRes = await iam.send(
      new ListPolicyVersionsCommand({ PolicyArn: policyArn }),
    );
    for (const v of versionsRes.Versions || []) {
      if (!v.IsDefaultVersion && v.VersionId) {
        await iam.send(
          new DeletePolicyVersionCommand({
            PolicyArn: policyArn,
            VersionId: v.VersionId,
          }),
        );
      }
    }
    await iam.send(
      new CreatePolicyVersionCommand({
        PolicyArn: policyArn,
        PolicyDocument: policyDocument,
        SetAsDefault: true,
      }),
    );
    console.info(`  ${green("✔")} Updated policy with current S3 bucket & region.`);
  } catch (err: any) {
    if (err.name === "NoSuchEntityException" || err.name === "NoSuchEntity") {
      await iam.send(
        new CreatePolicyCommand({
          PolicyName: policyName,
          PolicyDocument: policyDocument,
          Description:
            "Least-privilege CI/CD deployer policy for VeoLMS video fleet artifacts & Lambdas",
        }),
      );
      console.info(`  ${green("✔")} Created policy ${bold(policyName)}.`);
    } else {
      throw err;
    }
  }

  await iam.send(
    new AttachUserPolicyCommand({
      UserName: userName,
      PolicyArn: policyArn,
    }),
  );
  console.info(`  ${green("✔")} Attached policy to ${bold(userName)}.`);

  // 4. Check / Create Access Keys
  console.info(`\n[4/4] Checking access keys for ${bold(userName)}...`);
  const keys = await iam.send(new ListAccessKeysCommand({ UserName: userName }));
  const existingKeyCount = keys.AccessKeyMetadata?.length ?? 0;
  let accessKeyId: string | undefined = undefined;
  let secretAccessKey: string | undefined = undefined;

  if (existingKeyCount > 0) {
    accessKeyId = keys.AccessKeyMetadata?.[0]?.AccessKeyId;
    console.info(
      `  ${dim("•")} Found ${bold(String(existingKeyCount))} existing access key(s) for ${bold(userName)}:`,
    );
    for (const k of keys.AccessKeyMetadata || []) {
      console.info(
        `    ${dim("-")} ${bold(k.AccessKeyId || "")} (${k.Status || "Active"})`,
      );
    }
  }

  let shouldGenerate = options?.generateKeys;
  if (shouldGenerate === undefined) {
    const isInteractive =
      process.stdin.isTTY &&
      !process.argv.includes("--yes") &&
      !process.argv.includes("-y") &&
      !process.argv.includes("--non-interactive");

    if (
      process.argv.includes("--generate-keys") ||
      process.argv.includes("--create-keys")
    ) {
      shouldGenerate = true;
    } else if (
      process.argv.includes("--no-keys") ||
      process.argv.includes("--skip-keys")
    ) {
      shouldGenerate = false;
    } else if (isInteractive) {
      if (existingKeyCount >= 2) {
        console.info(
          `  ${yellow("⚠")} User already has 2 access keys (AWS maximum limit). Cannot generate additional keys without deleting one first.`,
        );
        shouldGenerate = false;
      } else {
        const readline = await import("node:readline/promises");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        try {
          const promptMsg =
            existingKeyCount > 0
              ? `  ${bold("?")} Do you want to generate a new additional AWS Access Key? ${dim("(y/N)")}: `
              : `  ${bold("?")} Do you want to generate an AWS Access Key for ${bold(userName)}? ${dim("(y/N)")}: `;
          const answer = (await rl.question(promptMsg)).trim().toLowerCase();
          shouldGenerate = answer === "y" || answer === "yes";
        } finally {
          rl.close();
        }
      }
    } else {
      // Non-interactive without explicit flag: only generate if user has 0 keys
      shouldGenerate = existingKeyCount === 0;
    }
  }

  if (shouldGenerate) {
    if (existingKeyCount >= 2) {
      console.info(
        `  ${yellow("⚠")} Cannot generate new access key: AWS maximum of 2 active keys reached for user ${bold(userName)}.`,
      );
      console.info(
        `  ${dim("Delete an old key in AWS IAM and re-run to generate a new key.")}`,
      );
    } else {
      const createdKey = await iam.send(
        new CreateAccessKeyCommand({ UserName: userName }),
      );
      accessKeyId = createdKey.AccessKey?.AccessKeyId || "";
      secretAccessKey = createdKey.AccessKey?.SecretAccessKey || "";
      console.info(`  ${green("✔")} Created new access key for ${bold(userName)}.`);
    }
  } else {
    console.info(`  ${dim("ℹ")} Skipped generating new access keys.`);
  }

  console.info(`\n${bold(cyan("╔══════════════════════════════════════════════════════╗"))}`);
  console.info(`${bold(cyan("║"))}          ${bold(green("CI/CD IAM User Setup Complete!"))}              ${bold(cyan("║"))}`);
  console.info(`${bold(cyan("╚══════════════════════════════════════════════════════╝"))}\n`);
  console.info(`  ${bold("IAM User:")}              ${bold(userName)}`);
  console.info(`  ${bold("IAM Policy:")}            ${bold(policyArn)}`);
  console.info(`  ${bold("AWS Region:")}            ${bold(region)}`);
  console.info(`  ${bold("S3 Build Bucket:")}       ${bold(bucketName)}\n`);

  console.info(`${bold("GitHub Repository Secrets:")}`);
  console.info(
    `Configure these secrets under: ${cyan("Settings -> Secrets and variables -> Actions")}\n`,
  );
  if (accessKeyId) {
    console.info(`  ${bold("AWS_ACCESS_KEY_ID")}:     ${bold(green(accessKeyId))}`);
  } else {
    console.info(`  ${bold("AWS_ACCESS_KEY_ID")}:     ${dim("<not-generated>")}`);
  }
  if (secretAccessKey) {
    console.info(
      `  ${bold("AWS_SECRET_ACCESS_KEY")}: ${bold(green(secretAccessKey))}`,
    );
    console.info(
      `\n  ${yellow("⚠ Save the Secret Access Key now — it cannot be viewed again once this screen closes!")}`,
    );
  } else {
    console.info(
      `  ${bold("AWS_SECRET_ACCESS_KEY")}: ${dim(accessKeyId ? "<existing-secret-access-key>" : "<not-generated>")}`,
    );
  }
  console.info(`  ${bold("AWS_REGION")}:            ${bold(region)}`);
  console.info(`  ${bold("S3_BUILD_BUCKET")}:       ${bold(bucketName)}\n`);

  return {
    accountId,
    region,
    bucketName,
    userName,
    policyArn,
    accessKeyId,
    secretAccessKey,
  };
}

async function cliMain(): Promise<void> {
  const args = process.argv.slice(2);
  let region: string | undefined;
  let bucketName: string | undefined;
  let profile: string | undefined;
  let userName: string | undefined;
  let policyName: string | undefined;
  let generateKeys: boolean | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--region=")) {
      region = arg.split("=")[1]?.trim();
    } else if (
      arg === "--region" &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      region = args[++i]?.trim();
    } else if (
      arg?.startsWith("--bucket=") ||
      arg?.startsWith("--build-bucket=") ||
      arg?.startsWith("--s3-build-bucket=")
    ) {
      bucketName = arg.split("=")[1]?.trim();
    } else if (
      (arg === "--bucket" ||
        arg === "--build-bucket" ||
        arg === "--s3-build-bucket") &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      bucketName = args[++i]?.trim();
    } else if (
      arg?.startsWith("--profile=") ||
      arg?.startsWith("--aws-profile=")
    ) {
      profile = arg.split("=")[1]?.trim();
    } else if (
      (arg === "--profile" || arg === "--aws-profile") &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      profile = args[++i]?.trim();
    } else if (arg?.startsWith("--name=") || arg?.startsWith("--user-name=")) {
      userName = arg.split("=")[1]?.trim();
    } else if (
      (arg === "--name" || arg === "--user-name") &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      userName = args[++i]?.trim();
    } else if (arg?.startsWith("--policy-name=")) {
      policyName = arg.split("=")[1]?.trim();
    } else if (
      arg === "--policy-name" &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      policyName = args[++i]?.trim();
    } else if (arg === "--generate-keys" || arg === "--create-keys") {
      generateKeys = true;
    } else if (arg === "--no-keys" || arg === "--skip-keys") {
      generateKeys = false;
    }
  }

  await runSetupCicdIam({
    region,
    bucketName,
    profile,
    userName,
    policyName,
    generateKeys,
  });
}

if (isMainModule(import.meta.url)) {
  cliMain().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n${red("✘")} ${bold("CI/CD Setup Failed:")} ${msg}\n`);
    process.exit(1);
  });
}
