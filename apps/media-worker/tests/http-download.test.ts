import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  downloadHttpFile,
  isPrivateOrReservedHost,
  validateHttpVideoUrl,
} from "../src/http-download.ts";

describe("SSRF Protection & URL Validation", () => {
  it("rejects loopback and local hostnames", () => {
    assert.equal(isPrivateOrReservedHost("localhost"), true);
    assert.equal(isPrivateOrReservedHost("localhost."), true);
    assert.equal(isPrivateOrReservedHost("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedHost("127.0.1.1"), true);
    assert.equal(isPrivateOrReservedHost("::1"), true);
    assert.equal(isPrivateOrReservedHost("[::1]"), true);
    assert.equal(isPrivateOrReservedHost("app.local"), true);
    assert.equal(isPrivateOrReservedHost("service.internal"), true);
  });

  it("rejects AWS and cloud metadata endpoints", () => {
    assert.equal(isPrivateOrReservedHost("169.254.169.254"), true);
    assert.equal(isPrivateOrReservedHost("169.254.1.1"), true);
    assert.equal(isPrivateOrReservedHost("instance-data"), true);
    assert.equal(isPrivateOrReservedHost("metadata.google.internal"), true);
  });

  it("rejects RFC 1918 private IPv4 networks", () => {
    assert.equal(isPrivateOrReservedHost("10.0.0.1"), true);
    assert.equal(isPrivateOrReservedHost("10.255.255.255"), true);
    assert.equal(isPrivateOrReservedHost("10.255.255.255."), true);
    assert.equal(isPrivateOrReservedHost("172.16.0.1"), true);
    assert.equal(isPrivateOrReservedHost("172.31.255.255"), true);
    assert.equal(isPrivateOrReservedHost("192.168.1.1"), true);
    assert.equal(isPrivateOrReservedHost("192.168.0.254"), true);
  });

  it("rejects IPv6 private, link-local, and unique-local networks (fe80:, fc00:, fd00:)", () => {
    assert.equal(isPrivateOrReservedHost("fe80::1"), true);
    assert.equal(isPrivateOrReservedHost("[fe80::1]"), true);
    assert.equal(isPrivateOrReservedHost("fe80::200:5aee:feaa:20a2"), true);
    assert.equal(isPrivateOrReservedHost("[fe80::200:5aee:feaa:20a2]"), true);
    assert.equal(isPrivateOrReservedHost("fc00::1"), true);
    assert.equal(isPrivateOrReservedHost("[fc00::1]"), true);
    assert.equal(isPrivateOrReservedHost("fd00::1"), true);
    assert.equal(isPrivateOrReservedHost("[fd00::1]"), true);
  });

  it("allows public IPv4 and IPv6 addresses and public domains", () => {
    assert.equal(isPrivateOrReservedHost("example.com"), false);
    assert.equal(isPrivateOrReservedHost("example.com."), false);
    assert.equal(isPrivateOrReservedHost("s3.amazonaws.com"), false);
    assert.equal(isPrivateOrReservedHost("8.8.8.8"), false);
    assert.equal(isPrivateOrReservedHost("1.1.1.1"), false);
    assert.equal(isPrivateOrReservedHost("2606:4700:4700::1111"), false);
    assert.equal(isPrivateOrReservedHost("[2606:4700:4700::1111]"), false);
  });

  it("validateHttpVideoUrl accepts safe public HTTPS URLs", () => {
    const url = validateHttpVideoUrl("https://example.com/videos/sample.mp4");
    assert.equal(url.hostname, "example.com");
    assert.equal(url.protocol, "https:");
  });

  it("validateHttpVideoUrl throws on metadata or private URLs", () => {
    assert.throws(
      () =>
        validateHttpVideoUrl(
          "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        ),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
    assert.throws(
      () => validateHttpVideoUrl("http://localhost:8080/secret.mp4"),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
    assert.throws(
      () => validateHttpVideoUrl("http://localhost./video.mp4"),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
    assert.throws(
      () => validateHttpVideoUrl("http://[::1]/video.mp4"),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
    assert.throws(
      () => validateHttpVideoUrl("http://192.168.1.50/video.mp4"),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
    assert.throws(
      () => validateHttpVideoUrl("http://[fe80::1]/video.mp4"),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
    assert.throws(
      () => validateHttpVideoUrl("http://[fc00::1]/video.mp4"),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
    assert.throws(
      () => validateHttpVideoUrl("http://[fd00::1]/video.mp4"),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
  });

  it("validateHttpVideoUrl throws on unsupported protocols", () => {
    assert.throws(
      () => validateHttpVideoUrl("file:///etc/passwd"),
      /Unsupported protocol "file:" in video URL/,
    );
    assert.throws(
      () => validateHttpVideoUrl("ftp://files.example.com/video.mp4"),
      /Unsupported protocol "ftp:" in video URL/,
    );
  });

  it("rejects redirect targets pointing to private IPv6 or reserved addresses", async () => {
    const originalFetch = globalThis.fetch;
    const testTargets = [
      "http://[::1]/video.mp4",
      "http://[fe80::1]/video.mp4",
      "http://[fc00::1]/video.mp4",
      "http://[fd00::1]/video.mp4",
      "http://localhost./video.mp4",
    ];

    try {
      for (const target of testTargets) {
        globalThis.fetch = async () => {
          return new Response(null, {
            status: 302,
            headers: { Location: target },
          });
        };

        await assert.rejects(
          async () => {
            await downloadHttpFile(
              "http://93.184.216.34/initial.mp4",
              "/tmp/test-out.mp4",
              { maxBytes: 1000, timeoutMs: 2000 },
            );
          },
          /Access to private, loopback, or cloud metadata network addresses is prohibited/,
        );
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
