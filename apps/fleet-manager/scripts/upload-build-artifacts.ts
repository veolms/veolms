import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildAndUploadBuildArtifacts } from "@veolms/fleet-provider-aws/setup";
import { bold, cyan, green, red, yellow } from "@veolms/fleet-types/terminal";

const _require = createRequire(import.meta.url);
const {
  LambdaClient,
  UpdateFunctionCodeCommand,
  GetFunctionConfigurationCommand,
} = _require(
  fileURLToPath(
    new URL(
      "../../../packages/fleet-provider-aws/node_modules/@aws-sdk/client-lambda",
      import.meta.url,
    ),
  ),
);

async function waitForLambdaUpdate(
  lambda: InstanceType<typeof LambdaClient>,
  functionName: string,
  timeoutMs = 60_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let config;
    try {
      config = await lambda.send(
        new GetFunctionConfigurationCommand({ FunctionName: functionName }),
      );
    } catch {
      // Ignore transient errors while waiting
    }

    if (config) {
      if (config.LastUpdateStatus === "Successful") {
        return;
      }
      if (config.LastUpdateStatus === "Failed") {
        throw new Error(
          `Lambda update failed for ${functionName}: ${config.LastUpdateStatusReason || "Unknown failure"}`,
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    `Timeout waiting for Lambda update for ${functionName} after ${timeoutMs}ms`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyWorker =
    args.includes("--only-worker") ||
    args.includes("--worker-only") ||
    process.env["ONLY_WORKER"] === "true";
  const onlyLambda =
    args.includes("--only-lambda") ||
    args.includes("--lambda-only") ||
    process.env["ONLY_LAMBDA"] === "true";
  const shouldUpdateLambda =
    args.includes("--update-lambda") ||
    process.env["UPDATE_LAMBDA"] === "true";

  const bucketName =
    process.env.S3_BUILD_BUCKET ||
    process.env.S3_BUCKET_NAME ||
    process.env.S3_BUCKET;
  const region =
    process.env.AWS_REGION ||
    process.env.FLEET_MANAGER_LAMBDA_REGION ||
    "us-east-1";

  const includeWorker = !onlyLambda;
  const includeProbe =
    !onlyWorker && process.env.SETUP_PROBE_LAMBDA !== "false";
  const includeLambda = !onlyWorker && process.env.FLEET_MODE !== "serverful";

  console.info(`\n╔══════════════════════════════════════════════════════╗`);
  console.info(`║       VeoLMS Build Artifacts S3 Uploader           ║`);
  console.info(`╚══════════════════════════════════════════════════════╝\n`);

  if (!bucketName) {
    console.error(
      red(
        "✘ Error: S3_BUILD_BUCKET or S3_BUCKET is not configured in environment.",
      ),
    );
    process.exit(1);
  }

  console.info(`  Target Build Bucket:  ${bold(cyan(bucketName))}`);
  console.info(`  Target Region:        ${bold(cyan(region))}`);
  console.info(`  Build Worker:         ${includeWorker ? green("Yes") : yellow("Skipped")}`);
  console.info(`  Build Lambdas:        ${includeLambda ? green("Yes") : yellow("Skipped")}`);
  console.info(`  Update Lambda Code:   ${shouldUpdateLambda ? green("Yes") : yellow("No")}`);
  console.info(`  Building & uploading artifacts to S3...\n`);

  const result = await buildAndUploadBuildArtifacts({
    buildBucketName: bucketName,
    region,
    includeWorker,
    includeLambda,
    includeProbe,
  });

  console.info(`\n${bold("Upload Summary:")}`);
  if (includeWorker) {
    if (result.workerBundleUploaded) {
      console.info(
        `  ${green("✔")} Media Worker:       ${bold(`s3://${bucketName}/bundles/media-worker.js`)}`,
      );
    } else {
      console.info(`  ${yellow("⚠")} Media Worker:       Upload failed or skipped`);
    }
  }

  if (includeLambda) {
    if (result.lambdaZipUploaded) {
      console.info(
        `  ${green("✔")} Fleet Lambda:       ${bold(`s3://${bucketName}/bundles/fleet-manager.zip`)}`,
      );
    } else {
      console.info(`  ${yellow("⚠")} Fleet Lambda:       Upload failed or skipped`);
    }
  }

  if (includeProbe) {
    if (result.probeZipUploaded) {
      console.info(
        `  ${green("✔")} Probe Lambda:       ${bold(`s3://${bucketName}/bundles/probe-lambda.zip`)}`,
      );
    } else {
      console.info(`  ${yellow("⚠")} Probe Lambda:       Upload failed or skipped`);
    }
  }

  // If requested, update deployed Lambda functions with new S3 zip bundles
  let lambdaUpdatesSuccessful = true;
  if (shouldUpdateLambda && (result.lambdaZipUploaded || result.probeZipUploaded)) {
    console.info(`\n${bold("Updating Deployed AWS Lambda Functions:")}`);
    const lambda = new LambdaClient({ region });

    if (result.lambdaZipUploaded) {
      const fleetFunctionName =
        process.env["FLEET_MANAGER_LAMBDA_NAME"] || "veolms-fleet-manager";
      try {
        console.info(`  Updating ${bold(fleetFunctionName)}...`);
        await lambda.send(
          new UpdateFunctionCodeCommand({
            FunctionName: fleetFunctionName,
            S3Bucket: bucketName,
            S3Key: "bundles/fleet-manager.zip",
          }),
        );
        await waitForLambdaUpdate(lambda, fleetFunctionName);
        console.info(`  ${green("✔")} ${fleetFunctionName} updated successfully.`);
      } catch (err: unknown) {
        lambdaUpdatesSuccessful = false;
        console.error(
          red(`  ✘ Failed to update ${fleetFunctionName}: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    }

    if (result.probeZipUploaded) {
      const probeFunctionName =
        process.env["PROBE_LAMBDA_NAME"] || "veolms-video-metadata-probe";
      try {
        console.info(`  Updating ${bold(probeFunctionName)}...`);
        await lambda.send(
          new UpdateFunctionCodeCommand({
            FunctionName: probeFunctionName,
            S3Bucket: bucketName,
            S3Key: "bundles/probe-lambda.zip",
          }),
        );
        await waitForLambdaUpdate(lambda, probeFunctionName);
        console.info(`  ${green("✔")} ${probeFunctionName} updated successfully.`);
      } catch (err: unknown) {
        lambdaUpdatesSuccessful = false;
        console.error(
          red(`  ✘ Failed to update ${probeFunctionName}: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    }
  }

  const allExpectedUploaded =
    (!includeWorker || result.workerBundleUploaded) &&
    (!includeLambda || result.lambdaZipUploaded) &&
    (!includeProbe || result.probeZipUploaded);

  const deploymentSuccessful = allExpectedUploaded && lambdaUpdatesSuccessful;

  if (deploymentSuccessful) {
    console.info(
      `\n${green("✔")} All requested build artifacts successfully processed!\n`,
    );
  } else {
    console.warn(
      yellow("\n⚠ Some build artifacts could not be uploaded. Check logs above.\n"),
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
