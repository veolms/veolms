import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTargetLambda,
  resolveFleetManagerLambdaName,
  resolveProbeLambdaName,
  buildAwsCliArgs,
  resolveAwsRegion,
  resolveAwsProfile,
} from "../src/trigger.ts";

describe("AWS Provider Trigger Target Lambda Resolution", () => {
  const originalEnv = { ...process.env };
  const originalArgv = [...process.argv];

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PROBE_LAMBDA_NAME;
    delete process.env.PROBE_LAMBDA_ARN;
    delete process.env.SETUP_PROBE_LAMBDA;
    delete process.env.FLEET_MANAGER_LAMBDA_NAME;
    delete process.env.LAMBDA_FUNCTION_NAME;
    delete process.env.LAMBDA_FUNCTION_ARN;
    delete process.env.DIRECT;
    delete process.env.PROBE;
    process.argv = ["node", "trigger.ts"];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
  });

  it("should automatically resolve to Fleet Manager Lambda (direct) when probe Lambda is skipped / not configured", () => {
    // When the user skipped probe Lambda during setup, neither PROBE_LAMBDA_NAME nor PROBE_LAMBDA_ARN is present in env.
    const resolved = resolveTargetLambda();
    assert.equal(resolved.name, "veolms-fleet-manager");
    assert.equal(resolved.isDirectFleetManager, true);
  });

  it("should resolve to probe Lambda when PROBE_LAMBDA_NAME is configured in environment", () => {
    process.env.PROBE_LAMBDA_NAME = "my-custom-probe-lambda";
    const resolved = resolveTargetLambda();
    assert.equal(resolved.name, "my-custom-probe-lambda");
    assert.equal(resolved.isDirectFleetManager, false);
  });

  it("should resolve to probe Lambda when PROBE_LAMBDA_ARN is configured in environment", () => {
    process.env.PROBE_LAMBDA_ARN =
      "arn:aws:lambda:us-east-1:123456789012:function:veolms-video-metadata-probe";
    const resolved = resolveTargetLambda();
    assert.equal(resolved.name, "veolms-video-metadata-probe");
    assert.equal(resolved.isDirectFleetManager, false);
  });

  it("should resolve to probe Lambda when SETUP_PROBE_LAMBDA is true", () => {
    process.env.SETUP_PROBE_LAMBDA = "true";
    const resolved = resolveTargetLambda();
    assert.equal(resolved.name, "veolms-video-metadata-probe");
    assert.equal(resolved.isDirectFleetManager, false);
  });

  it("should resolve to Fleet Manager when SETUP_PROBE_LAMBDA is false even if other flags unset", () => {
    process.env.SETUP_PROBE_LAMBDA = "false";
    const resolved = resolveTargetLambda();
    assert.equal(resolved.name, "veolms-fleet-manager");
    assert.equal(resolved.isDirectFleetManager, true);
  });

  it("should route to Fleet Manager Lambda when --direct or --fleet-manager flag is passed even if probe is configured", () => {
    process.env.PROBE_LAMBDA_NAME = "veolms-video-metadata-probe";
    const resolvedDirect = resolveTargetLambda({ rawArgs: ["--direct"] });
    assert.equal(resolvedDirect.name, "veolms-fleet-manager");
    assert.equal(resolvedDirect.isDirectFleetManager, true);

    const resolvedFleetMgr = resolveTargetLambda({
      rawArgs: ["--fleet-manager"],
    });
    assert.equal(resolvedFleetMgr.name, "veolms-fleet-manager");
    assert.equal(resolvedFleetMgr.isDirectFleetManager, true);
  });

  it("should route to probe Lambda when --probe flag is passed even if probe is not in env", () => {
    const resolved = resolveTargetLambda({ rawArgs: ["--probe"] });
    assert.equal(resolved.name, "veolms-video-metadata-probe");
    assert.equal(resolved.isDirectFleetManager, false);
  });

  it("should support custom --lambda=<name> flag", () => {
    const resolved = resolveTargetLambda({
      rawArgs: ["--lambda=my-special-lambda"],
    });
    assert.equal(resolved.name, "my-special-lambda");
  });

  it("should support custom --lambda <name> space-separated flag", () => {
    const resolved = resolveTargetLambda({
      rawArgs: ["--lambda", "my-other-lambda"],
    });
    assert.equal(resolved.name, "my-other-lambda");
  });

  it("should derive Fleet Manager Lambda name from LAMBDA_FUNCTION_ARN when FLEET_MANAGER_LAMBDA_NAME is unset", () => {
    process.env.LAMBDA_FUNCTION_ARN =
      "arn:aws:lambda:us-east-1:123456789012:function:custom-deployed-fleet-mgr";
    assert.equal(resolveFleetManagerLambdaName(), "custom-deployed-fleet-mgr");

    const resolved = resolveTargetLambda();
    assert.equal(resolved.name, "custom-deployed-fleet-mgr");
    assert.equal(resolved.isDirectFleetManager, true);
  });

  it("should derive probe Lambda name from PROBE_LAMBDA_ARN", () => {
    process.env.PROBE_LAMBDA_ARN =
      "arn:aws:lambda:us-east-1:123456789012:function:custom-deployed-probe";
    assert.equal(resolveProbeLambdaName(), "custom-deployed-probe");
  });

  it("should build AWS CLI invoke arguments properly with endpoint-url and profile", () => {
    const args = buildAwsCliArgs(
      ["lambda", "invoke", "--function-name", "test-fn"],
      "eu-west-1",
      "my-profile",
      "http://localhost:4566",
    );

    assert.deepEqual(args, [
      "lambda",
      "invoke",
      "--function-name",
      "test-fn",
      "--region",
      "eu-west-1",
      "--profile",
      "my-profile",
      "--endpoint-url",
      "http://localhost:4566",
    ]);
  });

  it("should resolve AWS region from rawArgs or env", () => {
    assert.equal(
      resolveAwsRegion({ rawArgs: ["--region=eu-central-1"] }),
      "eu-central-1",
    );
    assert.equal(
      resolveAwsRegion({ rawArgs: ["--region", "ap-northeast-1"] }),
      "ap-northeast-1",
    );

    process.env.AWS_REGION = "sa-east-1";
    assert.equal(resolveAwsRegion({ rawArgs: [] }), "sa-east-1");
  });

  it("should resolve AWS profile from rawArgs or env", () => {
    assert.equal(
      resolveAwsProfile({ rawArgs: ["--profile=staging"] }),
      "staging",
    );
    assert.equal(
      resolveAwsProfile({ rawArgs: ["--aws-profile", "production"] }),
      "production",
    );

    process.env.AWS_PROFILE = "env-profile";
    assert.equal(resolveAwsProfile({ rawArgs: [] }), "env-profile");
  });
});
