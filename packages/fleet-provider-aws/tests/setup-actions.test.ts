import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as setupModule from "../src/setup/index.ts";
import * as destroyModule from "../src/setup/destroy.ts";

describe("AWS Setup Module Interface", () => {
  it("should export runAwsInfraSetup function", () => {
    assert.equal(typeof setupModule.runAwsInfraSetup, "function");
  });

  it("should export runAwsInfraUpdate function", () => {
    assert.equal(typeof setupModule.runAwsInfraUpdate, "function");
  });

  it("should export runAwsInfraDestroy function from both index and destroy", () => {
    assert.equal(typeof setupModule.runAwsInfraDestroy, "function");
    assert.equal(typeof destroyModule.runAwsInfraDestroy, "function");
  });

  it("should export helper provisioning functions", () => {
    assert.equal(typeof setupModule.checkOrCreateRole, "function");
    assert.equal(typeof setupModule.createInstanceProfile, "function");
    assert.equal(typeof setupModule.buildAndUploadWorkerBundle, "function");
    assert.equal(typeof setupModule.buildAndUploadBuildArtifacts, "function");
    assert.equal(typeof setupModule.ensureSecurityGroup, "function");
    assert.equal(typeof setupModule.checkKeyPair, "function");
    assert.equal(typeof setupModule.runBuildAmi, "function");
    assert.equal(typeof setupModule.ensureSpotServiceLinkedRole, "function");
    assert.equal(typeof setupModule.runSetupCicdIam, "function");
  });

  it("should discover available AWS profiles without throwing", () => {
    const profiles = setupModule.listAvailableAwsProfiles();
    assert.ok(Array.isArray(profiles));
  });

  it("should correctly write initial .env and update them when re-running setup", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "veolms-env-test-"));
    const fleetEnvDir = path.join(tempDir, "apps", "fleet-manager");
    const workerEnvDir = path.join(tempDir, "apps", "media-worker");
    fs.mkdirSync(fleetEnvDir, { recursive: true });
    fs.mkdirSync(workerEnvDir, { recursive: true });

    try {
      // 1. Initial Setup Generation
      const initialAnswers: any = {
        targetEnv: "aws",
        region: "ap-south-1",
        profile: "initial-profile",
        fleetMode: "serverless",
        databaseUrl: "postgresql://user:pass@localhost:5432/db",
        storageProvider: "s3",
        s3BucketName: "veolms-media-initial",
        s3BuildBucket: "veolms-build-initial",
        maxWorkers: 5,
        workerIdlePollSeconds: 15,
        useSpot: true,
        bootMode: "ami",
        amiId: "ami-initial-12345",
        allowedInstanceTypes: ["c7g.xlarge"],
      };

      const initialResult: any = {
        workerRoleArn: "arn:aws:iam::123456789012:role/VeoLMSWorkerRole",
        instanceProfileArn:
          "arn:aws:iam::123456789012:instance-profile/VeoLMSWorkerInstanceProfile",
        logGroupWorkers: "/veolms/workers",
        logGroupFleet: "/veolms/fleet-manager",
        lambdaFunctionArn:
          "arn:aws:lambda:ap-south-1:123456789012:function:veolms-fleet-manager",
        probeLambdaArn:
          "arn:aws:lambda:ap-south-1:123456789012:function:veolms-video-metadata-probe",
        s3BucketName: "veolms-media-initial",
        s3BuildBucket: "veolms-build-initial",
      };

      await setupModule.generateEnvFiles(
        initialAnswers,
        initialResult,
        tempDir,
      );

      const fleetEnvInitial = setupModule.parseEnvFile(
        path.join(fleetEnvDir, ".env"),
      );
      const workerEnvInitial = setupModule.parseEnvFile(
        path.join(workerEnvDir, ".env"),
      );

      assert.equal(fleetEnvInitial["AWS_REGION"], "ap-south-1");
      assert.equal(fleetEnvInitial["AWS_PROFILE"], "initial-profile");
      assert.equal(fleetEnvInitial["S3_BUCKET"], "veolms-media-initial");
      assert.equal(fleetEnvInitial["AMI_ID"], "ami-initial-12345");
      assert.equal(workerEnvInitial["AWS_REGION"], "ap-south-1");
      assert.equal(workerEnvInitial["AWS_PROFILE"], "initial-profile");

      // 2. Re-running Setup with Updated Values
      const updatedAnswers: any = {
        targetEnv: "aws",
        region: "us-east-1",
        profile: "production-profile",
        fleetMode: "serverless",
        databaseUrl: "postgresql://user:pass@localhost:5432/db",
        storageProvider: "s3",
        s3BucketName: "veolms-media-updated",
        s3BuildBucket: "veolms-build-updated",
        maxWorkers: 10,
        workerIdlePollSeconds: 20,
        useSpot: false,
        bootMode: "ami",
        amiId: "ami-updated-99999",
        allowedInstanceTypes: ["c7g.2xlarge"],
      };

      const updatedResult: any = {
        workerRoleArn: "arn:aws:iam::123456789012:role/VeoLMSWorkerRole",
        instanceProfileArn:
          "arn:aws:iam::123456789012:instance-profile/VeoLMSWorkerInstanceProfile",
        logGroupWorkers: "/veolms/workers",
        logGroupFleet: "/veolms/fleet-manager",
        lambdaFunctionArn:
          "arn:aws:lambda:us-east-1:123456789012:function:veolms-fleet-manager",
        probeLambdaArn:
          "arn:aws:lambda:us-east-1:123456789012:function:veolms-video-metadata-probe",
        s3BucketName: "veolms-media-updated",
        s3BuildBucket: "veolms-build-updated",
      };

      await setupModule.generateEnvFiles(
        updatedAnswers,
        updatedResult,
        tempDir,
      );

      const fleetEnvUpdated = setupModule.parseEnvFile(
        path.join(fleetEnvDir, ".env"),
      );
      const workerEnvUpdated = setupModule.parseEnvFile(
        path.join(workerEnvDir, ".env"),
      );

      // Verify that re-running infra setup updated all .env values correctly
      assert.equal(fleetEnvUpdated["AWS_REGION"], "us-east-1");
      assert.equal(fleetEnvUpdated["AWS_PROFILE"], "production-profile");
      assert.equal(fleetEnvUpdated["S3_BUCKET"], "veolms-media-updated");
      assert.equal(fleetEnvUpdated["AMI_ID"], "ami-updated-99999");
      assert.equal(fleetEnvUpdated["MAX_WORKERS"], "10");
      assert.equal(fleetEnvUpdated["EC2_USE_SPOT"], "false");

      assert.equal(workerEnvUpdated["AWS_REGION"], "us-east-1");
      assert.equal(workerEnvUpdated["AWS_PROFILE"], "production-profile");
      assert.equal(workerEnvUpdated["S3_BUCKET"], "veolms-media-updated");
      assert.equal(workerEnvUpdated["WORKER_IDLE_POLL_SECONDS"], "20");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should load S3_BUCKET_ACCESS and AMI_NAME from combined config in loadExistingConfig", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "veolms-cfg-test-"));
    const fleetEnvDir = path.join(tempDir, "apps", "fleet-manager");
    fs.mkdirSync(fleetEnvDir, { recursive: true });

    const origArgv = [...process.argv];
    const origBucketAccess = process.env.S3_BUCKET_ACCESS;
    const origAmiName = process.env.AMI_NAME;
    try {
      process.argv = ["node", "setup.ts"];
      delete process.env.S3_BUCKET_ACCESS;
      delete process.env.AMI_NAME;
      fs.writeFileSync(
        path.join(fleetEnvDir, ".env"),
        "S3_BUCKET_ACCESS=public\nAMI_NAME=my-prebaked-ami\n",
      );

      const config = setupModule.loadExistingConfig(tempDir);
      assert.equal(config.s3BucketAccess, "public");
      assert.equal(config.amiName, "my-prebaked-ami");
    } finally {
      process.argv = origArgv;
      if (origBucketAccess === undefined) delete process.env.S3_BUCKET_ACCESS;
      else process.env.S3_BUCKET_ACCESS = origBucketAccess;
      if (origAmiName === undefined) delete process.env.AMI_NAME;
      else process.env.AMI_NAME = origAmiName;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should preserve CLI-provided values for --public-bucket and --ami-name over .env in loadExistingConfig", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "veolms-cfg-test-"));
    const fleetEnvDir = path.join(tempDir, "apps", "fleet-manager");
    fs.mkdirSync(fleetEnvDir, { recursive: true });

    const origArgv = [...process.argv];
    const origBucketAccess = process.env.S3_BUCKET_ACCESS;
    const origAmiName = process.env.AMI_NAME;
    try {
      delete process.env.S3_BUCKET_ACCESS;
      delete process.env.AMI_NAME;
      fs.writeFileSync(
        path.join(fleetEnvDir, ".env"),
        "S3_BUCKET_ACCESS=private\nAMI_NAME=env-ami-name\n",
      );

      process.argv = [
        "node",
        "setup.ts",
        "--public-bucket",
        "--ami-name=cli-custom-ami",
      ];

      const config = setupModule.loadExistingConfig(tempDir);
      assert.equal(config.s3BucketAccess, "public");
      assert.equal(config.amiName, "cli-custom-ami");
    } finally {
      process.argv = origArgv;
      if (origBucketAccess === undefined) delete process.env.S3_BUCKET_ACCESS;
      else process.env.S3_BUCKET_ACCESS = origBucketAccess;
      if (origAmiName === undefined) delete process.env.AMI_NAME;
      else process.env.AMI_NAME = origAmiName;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should have s3:DeleteObject and s3:DeleteObjectVersion in cicd-infra-deployer-policy.json", () => {
    const policyPath = path.join(
      import.meta.dirname,
      "..",
      "iam",
      "cicd-infra-deployer-policy.json",
    );
    const policy = JSON.parse(fs.readFileSync(policyPath, "utf-8"));
    const s3Statement = policy.Statement.find(
      (s: { Sid: string }) => s.Sid === "S3BuildBucketUploadAndRead",
    );
    assert.ok(s3Statement, "S3BuildBucketUploadAndRead statement should exist");
    assert.ok(s3Statement.Action.includes("s3:DeleteObject"));
    assert.ok(s3Statement.Action.includes("s3:DeleteObjectVersion"));
  });
});
