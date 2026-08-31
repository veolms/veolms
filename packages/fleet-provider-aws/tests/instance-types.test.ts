import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterAllowedInstanceTypes,
  selectOptimalInstanceType,
} from "../src/instance-types.ts";

describe("AWS Instance Type Selector", () => {
  it("should select an ordered ARM64 candidate list based on CPU and memory requirements", () => {
    // 1 vCPU, 2GB -> NANO tier (Graviton-only, no x86 equivalent)
    const nano = selectOptimalInstanceType({
      cpu: 1,
      memoryMb: 2048,
      architecture: "arm64",
      storageGb: 20,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.deepEqual(nano, ["c7g.medium", "c8g.medium", "c6g.medium"]);

    // 2 vCPU, 4GB -> MICRO tier
    const micro = selectOptimalInstanceType({
      cpu: 2,
      memoryMb: 4096,
      architecture: "arm64",
      storageGb: 30,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.deepEqual(micro, ["c7g.large", "c8g.large", "c6g.large"]);

    // 4 vCPU, 8GB -> SMALL tier
    const small = selectOptimalInstanceType({
      cpu: 4,
      memoryMb: 8192,
      architecture: "arm64",
      storageGb: 50,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.deepEqual(small, ["c7g.xlarge", "c8g.xlarge", "c6g.xlarge"]);

    // 8 vCPU, 16GB -> MEDIUM tier
    const medium = selectOptimalInstanceType({
      cpu: 8,
      memoryMb: 16384,
      architecture: "arm64",
      storageGb: 80,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.deepEqual(medium, ["c7g.2xlarge", "c8g.2xlarge", "c6g.2xlarge"]);
  });

  it("should select an ordered x86_64 candidate list, collapsing NANO into MICRO (no .medium size exists)", () => {
    const nano = selectOptimalInstanceType({
      cpu: 1,
      memoryMb: 2048,
      architecture: "x86_64",
      storageGb: 20,
      region: "us-east-1",
      environmentVariables: {},
    });
    const micro = selectOptimalInstanceType({
      cpu: 2,
      memoryMb: 4096,
      architecture: "x86_64",
      storageGb: 30,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.deepEqual(nano, micro);
    assert.deepEqual(micro, ["c6i.large", "c5.large", "c7i.large"]);

    const small = selectOptimalInstanceType({
      cpu: 4,
      memoryMb: 8192,
      architecture: "x86_64",
      storageGb: 50,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.deepEqual(small, ["c6i.xlarge", "c5.xlarge", "c7i.xlarge"]);
  });

  describe("filterAllowedInstanceTypes", () => {
    const candidates = ["c7g.large", "c8g.large", "c6g.large"];

    it("returns the full candidate list when no allow-list is configured", () => {
      assert.deepEqual(filterAllowedInstanceTypes(candidates), candidates);
      assert.deepEqual(filterAllowedInstanceTypes(candidates, []), candidates);
    });

    it("intersects the candidate list with the configured allow-list", () => {
      assert.deepEqual(
        filterAllowedInstanceTypes(candidates, ["c8g.large", "t4g.small"]),
        ["c8g.large"],
      );
    });

    it("falls back to the full candidate list when the allow-list has no overlap", () => {
      assert.deepEqual(
        filterAllowedInstanceTypes(candidates, ["t4g.small"]),
        candidates,
      );
    });
  });
});
