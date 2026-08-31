import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  isDockerRunning,
  publishFfprobeLayer,
  resolveDockerDir,
  resolveRepoRoot,
} from "../src/setup/layer-builder.ts";
import {
  sanitizeLambdaEnvVars,
  AWS_RESERVED_ENV_KEYS,
} from "../src/setup/index.ts";

describe("Layer Builder & Docker Integration", () => {
  it("should check docker daemon status without crashing", () => {
    const running = isDockerRunning();
    assert.equal(typeof running, "boolean");
  });

  it("should reliably resolve workspace repo root", () => {
    const repoRoot = resolveRepoRoot();
    assert.ok(fs.existsSync(repoRoot), `repoRoot should exist: ${repoRoot}`);
    assert.ok(
      fs.existsSync(path.join(repoRoot, "pnpm-workspace.yaml")),
      "repoRoot should contain pnpm-workspace.yaml",
    );
  });

  it("should reliably resolve docker directory containing Dockerfile.ffprobe-layer", () => {
    const dockerDir = resolveDockerDir();
    assert.ok(fs.existsSync(dockerDir), `dockerDir should exist: ${dockerDir}`);
    const dockerfilePath = path.join(dockerDir, "Dockerfile.ffprobe-layer");
    assert.ok(
      fs.existsSync(dockerfilePath),
      `Expected Dockerfile at ${dockerfilePath}`,
    );

    const content = fs.readFileSync(dockerfilePath, "utf-8");
    assert.match(content, /bin\/ffprobe/);
    assert.match(content, /TARGETARCH/);
  });

  it("should sanitize Lambda environment variables to remove AWS reserved keys", () => {
    const dirtyEnvVars = {
      AWS_REGION: "us-east-1",
      AWS_DEFAULT_REGION: "us-east-1",
      _HANDLER: "index.handler",
      AWS_LAMBDA_FUNCTION_NAME: "test-fn",
      FLEET_MODE: "serverless",
      LOG_LEVEL: "info",
      S3_BUCKET: "my-test-bucket",
      CUSTOM_SETTING: "123",
    };

    const cleanEnvVars = sanitizeLambdaEnvVars(dirtyEnvVars);

    // Reserved keys MUST be removed
    assert.equal(cleanEnvVars["AWS_REGION"], undefined);
    assert.equal(cleanEnvVars["AWS_DEFAULT_REGION"], undefined);
    assert.equal(cleanEnvVars["_HANDLER"], undefined);
    assert.equal(cleanEnvVars["AWS_LAMBDA_FUNCTION_NAME"], undefined);

    // Non-reserved keys MUST be preserved
    assert.equal(cleanEnvVars["FLEET_MODE"], "serverless");
    assert.equal(cleanEnvVars["LOG_LEVEL"], "info");
    assert.equal(cleanEnvVars["S3_BUCKET"], "my-test-bucket");
    assert.equal(cleanEnvVars["CUSTOM_SETTING"], "123");
  });

  it("should format publish layer parameters correctly", async () => {
    let capturedCommand: any = null;
    const mockLambdaClient = {
      send: async (command: any) => {
        capturedCommand = command;
        return {
          LayerVersionArn:
            "arn:aws:lambda:us-east-1:123456789012:layer:veolms-ffprobe:1",
        };
      },
    } as any;

    const tempZip = path.join(
      import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
      "temp-layer-test.zip",
    );
    fs.writeFileSync(tempZip, Buffer.from("PK\x05\x06" + "\x00".repeat(18)));

    try {
      const arn = await publishFfprobeLayer({
        lambdaClient: mockLambdaClient,
        zipPath: tempZip,
        architecture: "arm64",
        layerName: "veolms-ffprobe",
      });

      assert.equal(
        arn,
        "arn:aws:lambda:us-east-1:123456789012:layer:veolms-ffprobe:1",
      );
      assert.ok(capturedCommand);
      assert.equal(capturedCommand.input.LayerName, "veolms-ffprobe");
      assert.deepEqual(capturedCommand.input.CompatibleArchitectures, [
        "arm64",
      ]);
    } finally {
      if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
    }
  });
});
