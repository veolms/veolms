import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadFleetManagerConfig,
  loadMediaWorkerConfig,
  loadServerConfig,
  loadWebConfig,
  resolveDefaultUploadConcurrency,
  resolveProviderName,
} from "../src/index.ts";

describe("packages/config", () => {
  describe("Server & Web Config", () => {
    it("should load default server configuration", () => {
      const config = loadServerConfig({
        SESSION_SECRET: "12345678901234567890123456789012",
        MFA_ENCRYPTION_KEY: "12345678901234567890123456789012",
        SETUP_TOKEN: "custom_setup_token",
      });
      assert.equal(config.API_PORT, 4000);
      assert.equal(config.NODE_ENV, "development");
      assert.equal(config.EMAIL_TRANSPORT, "console");
    });

    it("should load web configuration", () => {
      const config = loadWebConfig({
        WEB_PORT: "8080",
        VITE_API_BASE_URL: "https://api.example.com",
      });
      assert.equal(config.WEB_PORT, 8080);
      assert.equal(config.VITE_API_BASE_URL, "https://api.example.com");
    });
  });

  describe("Fleet Manager Config", () => {
    it("should resolve provider name with proper precedence", () => {
      assert.equal(resolveProviderName("aws", { PROVIDER: "local" }), "AWS");
      assert.equal(
        resolveProviderName(undefined, {
          PROVIDER: "aws",
          FLEET_PROVIDER: "local",
        }),
        "AWS",
      );
      assert.equal(
        resolveProviderName(undefined, { FLEET_PROVIDER: "aws" }),
        "AWS",
      );
      assert.equal(
        resolveProviderName(undefined, { FLEET_PROVIDER: "   " }),
        undefined,
      );
    });

    it("should load default fleet manager config", () => {
      const config = loadFleetManagerConfig({});
      assert.equal(config.PROVIDER, "LOCAL");
      assert.equal(config.POLL_INTERVAL_MS, 2000);
      assert.equal(config.MAX_WORKERS, 8);
      assert.equal(config.MAX_RETRIES, 3);
    });

    it("should preprocess FLEET_PROVIDER correctly", () => {
      const config = loadFleetManagerConfig({
        FLEET_PROVIDER: "aws",
        MAX_WORKERS: "16",
      });
      assert.equal(config.PROVIDER, "AWS");
      assert.equal(config.MAX_WORKERS, 16);
    });
  });

  describe("Media Worker Config", () => {
    const validWorkerId = "11111111-1111-4111-8111-111111111111";

    it("should calculate valid default upload concurrency", () => {
      const defaults = resolveDefaultUploadConcurrency();
      assert.ok(defaults.maxConcurrency >= 4 && defaults.maxConcurrency <= 32);
      assert.ok(defaults.minConcurrency >= 2);
      assert.ok(defaults.minConcurrency <= defaults.maxConcurrency);
    });

    it("should load media worker config with aliases and defaults", () => {
      const config = loadMediaWorkerConfig({
        WORKER_ID: validWorkerId,
        S3_BUCKET_NAME: "custom-media-bucket",
        AWS_REGION: "us-west-2",
        UPLOAD_MAX_CONCURRENCY: "10",
        UPLOAD_MIN_CONCURRENCY: "4",
      });
      assert.equal(config.WORKER_ID, validWorkerId);
      assert.equal(config.S3_BUCKET, "custom-media-bucket");
      assert.equal(config.S3_REGION, "us-west-2");
      assert.equal(config.UPLOAD_MAX_CONCURRENCY, 10);
      assert.equal(config.UPLOAD_MIN_CONCURRENCY, 4);
      assert.equal(config.VIDEO_COMPRESSION_CRF, 22);
    });

    it("should reject config when UPLOAD_MIN_CONCURRENCY > UPLOAD_MAX_CONCURRENCY", () => {
      assert.throws(
        () =>
          loadMediaWorkerConfig({
            WORKER_ID: validWorkerId,
            UPLOAD_MAX_CONCURRENCY: "2",
            UPLOAD_MIN_CONCURRENCY: "8",
          }),
        /UPLOAD_MIN_CONCURRENCY must not exceed UPLOAD_MAX_CONCURRENCY/,
      );
    });
  });
});
