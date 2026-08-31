import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(typeof setupModule.ensureSecurityGroup, "function");
    assert.equal(typeof setupModule.checkKeyPair, "function");
  });
});
