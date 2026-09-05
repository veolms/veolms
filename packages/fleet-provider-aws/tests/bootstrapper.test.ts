import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encodeUserDataBase64,
  generateUserDataScript,
} from "../src/bootstrapper.ts";

describe("EC2 UserData Bootstrapper Generator", () => {
  it("should generate a bootstrapper script with environment variables and install-if-missing checks", () => {
    const script = generateUserDataScript({
      workerId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      spec: {
        cpu: 2,
        memoryMb: 4096,
        architecture: "arm64",
        storageGb: 30,
        region: "us-east-1",
        environmentVariables: {
          JOB_ID: "job-123",
          DATABASE_URL: "postgresql://veolms:veolms@db:5432/veolms",
        },
      },
    });

    assert.ok(script.startsWith("#!/bin/bash"));
    assert.ok(
      script.includes('WORKER_ID="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"'),
    );
    assert.ok(script.includes('JOB_ID="job-123"'));
    assert.ok(script.includes("apt-get install"));
    assert.ok(script.includes("ffmpeg"));
    assert.ok(script.includes("if ! command -v node"));
    assert.ok(script.includes("awscli"));
  });

  it("always installs a trap-based cleanup that uploads the log and terminates on any exit", () => {
    const script = generateUserDataScript({
      workerId: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      spec: {
        cpu: 4,
        memoryMb: 8192,
        architecture: "arm64",
        storageGb: 50,
        region: "us-east-1",
        environmentVariables: {
          JOB_ID: "job-456",
        },
      },
    });

    assert.ok(script.includes("trap cleanup_and_terminate EXIT"));
    assert.ok(script.includes("aws s3 cp /var/log/veolms-bootstrap.log"));
    assert.ok(script.includes("aws ec2 terminate-instances"));
    assert.ok(
      script.includes('WORKER_ID="b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"'),
    );
  });

  it("resolves BUCKET_NAME only after worker.env has been sourced, not before", () => {
    const script = generateUserDataScript({
      workerId: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      spec: {
        cpu: 2,
        memoryMb: 2048,
        architecture: "arm64",
        storageGb: 10,
        region: "us-east-1",
        environmentVariables: {},
      },
      extraEnv: { S3_BUCKET: "real-bucket-name" },
    });

    const sourceIndex = script.indexOf("source /opt/veolms/worker.env");
    const realResolutionIndex = script.indexOf(
      'BUCKET_NAME="${S3_BUCKET:-${S3_BUCKET_NAME:-}}"',
    );

    assert.ok(sourceIndex !== -1, "script must source worker.env");
    assert.ok(
      realResolutionIndex !== -1,
      "script must resolve BUCKET_NAME from S3_BUCKET/S3_BUCKET_NAME",
    );
    assert.ok(
      realResolutionIndex > sourceIndex,
      "BUCKET_NAME must be resolved after worker.env is sourced, not before",
    );

    // And the download step (further down) must come after that real
    // resolution too, not accidentally reference an earlier empty default.
    const downloadIndex = script.indexOf('aws s3 cp "s3://$BUILD_BUCKET');
    assert.ok(downloadIndex > realResolutionIndex);
  });

  it("uploads bootstrap.log and worker.log to S3_BUILD_BUCKET when configured", () => {
    const script = generateUserDataScript({
      workerId: "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
      spec: {
        cpu: 2,
        memoryMb: 4096,
        architecture: "arm64",
        storageGb: 30,
        region: "us-east-1",
        environmentVariables: {
          S3_BUILD_BUCKET: "my-custom-build-bucket",
        },
      },
    });

    assert.ok(script.includes('S3_BUILD_BUCKET="my-custom-build-bucket"'));
    assert.ok(
      script.includes(
        '"s3://$LOG_BUCKET/worker-logs/d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44/bootstrap.log"',
      ),
    );
    assert.ok(
      script.includes(
        '"s3://$LOG_BUCKET/worker-logs/d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44/worker.log"',
      ),
    );
    assert.ok(
      script.includes(
        'aws s3 cp "s3://$BUILD_BUCKET/bundles/media-worker.js" /opt/veolms/worker.js',
      ),
    );
  });

  it("should encode UserData script to Base64", () => {
    const script = "#!/bin/bash\necho hello";
    const encoded = encodeUserDataBase64(script);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");

    assert.equal(decoded, script);
  });
});
