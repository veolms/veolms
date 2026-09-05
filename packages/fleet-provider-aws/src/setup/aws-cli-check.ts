/**
 * AWS CLI / Credentials pre-flight check.
 *
 * Verifies that AWS credentials are configured and working before
 * attempting to create any infrastructure resources.
 *
 * Checks (in priority order):
 *   1. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY environment variables
 *   2. AWS_PROFILE environment variable → ~/.aws/credentials
 *   3. Default ~/.aws/credentials or ~/.aws/config profile
 *   4. EC2 Instance Metadata (IMDS) — when running on EC2
 *
 * On failure: prints actionable instructions and throws an error.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { bold, cyan, dim, green, red } from "@veolms/fleet-types/terminal";

export interface AwsIdentity {
  accountId: string;
  userId: string;
  arn: string;
  profile?: string;
}

/**
 * Discovers available AWS profile names from ~/.aws/credentials and ~/.aws/config,
 * or via AWS CLI `aws configure list-profiles`.
 */
export function listAvailableAwsProfiles(): string[] {
  const profiles = new Set<string>();

  const credentialsPath = path.join(os.homedir(), ".aws", "credentials");
  const configPath = path.join(os.homedir(), ".aws", "config");

  const parseIniProfiles = (filePath: string, isConfig: boolean) => {
    if (!fs.existsSync(filePath)) return;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          const section = trimmed.slice(1, -1).trim();
          if (isConfig) {
            const p =
              section === "default"
                ? "default"
                : section.startsWith("profile ")
                  ? section.slice("profile ".length).trim()
                  : undefined;
            if (p) profiles.add(p);
          } else if (section) {
            profiles.add(section);
          }
        }
      }
    } catch {
      // Ignore file read error
    }
  };

  parseIniProfiles(credentialsPath, false);
  parseIniProfiles(configPath, true);

  if (profiles.size === 0) {
    try {
      const output = execSync("aws configure list-profiles", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of output.split("\n")) {
        const p = line.trim();
        if (p) profiles.add(p);
      }
    } catch {
      // Ignore AWS CLI errors
    }
  }

  const result = Array.from(profiles);
  const defaultIdx = result.indexOf("default");
  if (defaultIdx > 0) {
    result.splice(defaultIdx, 1);
    result.unshift("default");
  } else if (
    result.length === 0 &&
    (fs.existsSync(credentialsPath) || fs.existsSync(configPath))
  ) {
    result.push("default");
  }

  return result;
}

function hasEnvCredentials(): boolean {
  return (
    Boolean(process.env["AWS_ACCESS_KEY_ID"]) &&
    Boolean(process.env["AWS_SECRET_ACCESS_KEY"])
  );
}

function hasAwsCredentialsFile(): boolean {
  const credentialsFile = path.join(os.homedir(), ".aws", "credentials");
  const configFile = path.join(os.homedir(), ".aws", "config");
  return fs.existsSync(credentialsFile) || fs.existsSync(configFile);
}

function detectCredentialSource(profile?: string): string {
  if (profile && profile !== "default") {
    return `AWS profile: ${bold(profile)}`;
  }
  if (process.env["AWS_PROFILE"]) {
    return `AWS profile: ${bold(process.env["AWS_PROFILE"])}`;
  }
  if (hasEnvCredentials()) {
    return `environment variables (${bold("AWS_ACCESS_KEY_ID")} / ${bold("AWS_SECRET_ACCESS_KEY")})`;
  }
  if (hasAwsCredentialsFile()) {
    return `~/.aws/credentials or ~/.aws/config (default profile)`;
  }
  return "unknown";
}

/**
 * Verifies AWS credentials are configured by calling STS GetCallerIdentity.
 * Returns the caller's identity on success.
 * Throws a descriptive error on failure.
 */
export async function checkAwsCredentials(
  region: string,
  profile?: string,
): Promise<AwsIdentity> {
  if (profile) {
    process.env["AWS_PROFILE"] = profile;
  }

  // First: fast local check — are there any credentials at all?
  const hasLocalCreds = hasEnvCredentials() || hasAwsCredentialsFile();

  if (!hasLocalCreds && !process.env["AWS_PROFILE"]) {
    printCredentialsError("No AWS credentials found on this machine.");
    throw new Error("AWS credentials not configured.");
  }

  // Second: live verification via STS
  const sts = new STSClient({
    region,
    ...(profile ? { profile } : {}),
  });

  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));

    const accountId = identity.Account ?? "unknown";
    const userId = identity.UserId ?? "unknown";
    const arn = identity.Arn ?? "unknown";

    console.log(
      `  ${green("✔")} AWS credentials verified (source: ${detectCredentialSource(profile)})`,
    );
    console.log(`  ${green("✔")} Account:  ${bold(accountId)}`);
    console.log(`  ${green("✔")} Identity: ${bold(arn)}`);

    return { accountId, userId, arn, ...(profile ? { profile } : {}) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (
      msg.includes("InvalidClientTokenId") ||
      msg.includes("AuthFailure") ||
      msg.includes("InvalidAccessKeyId")
    ) {
      printCredentialsError("AWS credentials are invalid or expired.");
    } else if (
      msg.includes("ExpiredToken") ||
      msg.includes("ExpiredTokenException")
    ) {
      printCredentialsError(
        "AWS session token has expired. Refresh your credentials.",
      );
    } else if (
      msg.includes("ENOTFOUND") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("Network")
    ) {
      printCredentialsError(
        "Cannot reach AWS STS endpoint. Check your internet connection.",
      );
    } else {
      printCredentialsError(`AWS credential check failed: ${msg}`);
    }

    throw new Error(`AWS credentials check failed: ${msg}`);
  }
}

function printCredentialsError(reason: string): void {
  console.error(`
  ${red("✘ AWS Credentials Error")}
  ${dim("─".repeat(52))}
  ${reason}

  ${bold("To fix, configure AWS credentials using one of:")}

  ${bold("Option 1 — AWS CLI (recommended):")}
    ${cyan("aws configure")}
    ${dim("This creates ~/.aws/credentials with your access key.")}

  ${bold("Option 2 — Environment variables:")}
    ${cyan("export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE")}
    ${cyan("export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")}
    ${cyan("export AWS_REGION=us-east-1")}

  ${bold("Option 3 — Named AWS profile:")}
    ${cyan("export AWS_PROFILE=my-profile")}

  ${bold("Option 4 — IAM Role (EC2 / Lambda):")}
    ${dim("Attach an IAM role with sufficient permissions to the machine.")}

  ${bold("Required IAM permissions for setup:")}
    ${dim("iam:CreateRole, iam:AttachRolePolicy, iam:PutRolePolicy")}
    ${dim("iam:CreateInstanceProfile, iam:AddRoleToInstanceProfile")}
    ${dim("logs:CreateLogGroup, logs:PutRetentionPolicy")}
    ${dim("lambda:CreateFunction (only when Fleet Mode = serverless)")}
    ${dim("s3:HeadBucket, s3:GetBucketLocation (only when S3 provider)")}
    ${dim("sts:GetCallerIdentity")}
`);
}
