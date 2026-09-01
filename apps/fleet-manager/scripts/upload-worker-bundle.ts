import { buildAndUploadWorkerBundle } from "@veolms/fleet-provider-aws/setup";
import { bold, cyan, green, red } from "@veolms/fleet-types/terminal";

async function main(): Promise<void> {
  const bucketName = process.env.S3_BUCKET_NAME || process.env.S3_BUCKET;
  const region =
    process.env.AWS_REGION ||
    process.env.FLEET_MANAGER_LAMBDA_REGION ||
    "us-east-2";

  console.info(`\n╔══════════════════════════════════════════════════════╗`);
  console.info(`║       VeoLMS Media Worker Bundle Uploader          ║`);
  console.info(`╚══════════════════════════════════════════════════════╝\n`);

  if (!bucketName) {
    console.error(
      red("✘ Error: S3_BUCKET_NAME or S3_BUCKET is not configured in .env."),
    );
    process.exit(1);
  }

  console.info(`  Target Bucket:  ${bold(cyan(bucketName))}`);
  console.info(`  Target Region:  ${bold(cyan(region))}`);
  console.info(`  S3 Key:         ${bold(cyan("bundles/media-worker.js"))}`);
  console.info(`  Building & uploading media worker bundle...`);

  const success = await buildAndUploadWorkerBundle(bucketName, region);

  if (success) {
    console.info(
      `\n${green("✔")} Successfully uploaded media worker bundle to ${bold(`s3://${bucketName}/bundles/media-worker.js`)}!\n`,
    );
  } else {
    console.error(red("\n✘ Bundle upload failed. Check logs above."));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
