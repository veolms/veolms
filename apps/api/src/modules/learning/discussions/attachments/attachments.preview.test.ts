import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";

// Loopback destinations are only fetchable under NODE_ENV=test, and the
// module reads that when it is first loaded — so set it before importing.
process.env.NODE_ENV = "test";
const preview = await import("./attachments.preview.ts");
const { fetchSafeHtml, isPrivateOrReservedHost, validateSafeUrl } = preview;

const PAGE =
  '<html><head><title>Hello</title><meta property="og:title" content="OG Hello"></head><body>hi</body></html>';

let server: http.Server;
let base = "";

before(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/page") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(PAGE);
    } else if (request.url === "/gzip") {
      response.writeHead(200, {
        "content-type": "text/html",
        "content-encoding": "gzip",
      });
      response.end(zlib.gzipSync(PAGE));
    } else if (request.url === "/redirect") {
      response.writeHead(302, { location: "/page" });
      response.end();
    } else if (request.url === "/redirect-private") {
      response.writeHead(302, { location: "http://10.0.0.1/secret" });
      response.end();
    } else if (request.url === "/redirect-metadata") {
      response.writeHead(302, {
        location: "http://169.254.169.254/latest/meta-data/",
      });
      response.end();
    } else if (request.url === "/slow-body") {
      // Headers at once, then a body that never finishes.
      response.writeHead(200, { "content-type": "text/html" });
      response.write("<html><head>");
    } else if (request.url === "/huge") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<title>Big</title>" + "x".repeat(2 * 1024 * 1024));
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

void describe("link preview destination rules", () => {
  void it("refuses loopback unless explicitly allowed", () => {
    for (const host of [
      "127.0.0.1",
      "localhost",
      "::1",
      "127.9.9.9",
      "app.localhost",
      "::ffff:127.0.0.1",
    ]) {
      assert.equal(
        isPrivateOrReservedHost(host, { allowLoopback: false }),
        true,
        host,
      );
    }
  });

  void it("refuses private, link-local and metadata addresses", () => {
    for (const host of [
      "10.0.0.1",
      "172.16.5.4",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "metadata.google.internal",
      "fd00::1",
      "fe80::1",
      "fec0::1",
      "::ffff:10.0.0.1",
      "64:ff9b::a00:1",
      "2002:a00:1::1",
      "::10.0.0.1",
    ]) {
      assert.equal(isPrivateOrReservedHost(host), true, host);
    }
  });

  void it("allows public addresses", () => {
    for (const host of ["93.184.216.34", "example.com", "2606:2800:220:1::1"]) {
      assert.equal(isPrivateOrReservedHost(host), false, host);
    }
  });

  void it("only accepts http and https URLs", () => {
    assert.throws(() => validateSafeUrl("file:///etc/passwd"));
    assert.throws(() => validateSafeUrl("gopher://example.com/"));
    assert.throws(() => validateSafeUrl("not a url"));
  });

  void it("does not echo the resolved address in the refusal", () => {
    assert.throws(
      () => validateSafeUrl("http://10.0.0.1/"),
      (error: { code?: string; message?: string }) => {
        assert.equal(error.code, "SSRF_PROHIBITED");
        assert.doesNotMatch(error.message ?? "", /10\.0\.0\.1/);
        return true;
      },
    );
  });
});

void describe("link preview fetch", () => {
  void it("fetches a page", async () => {
    const { html, finalUrl } = await fetchSafeHtml(`${base}/page`);
    assert.match(html, /OG Hello/);
    assert.equal(finalUrl, `${base}/page`);
  });

  void it("decodes a compressed page", async () => {
    const { html } = await fetchSafeHtml(`${base}/gzip`);
    assert.match(html, /OG Hello/);
  });

  void it("follows a redirect and reports the final URL", async () => {
    const { html, finalUrl } = await fetchSafeHtml(`${base}/redirect`);
    assert.match(html, /OG Hello/);
    assert.equal(finalUrl, `${base}/page`);
  });

  void it("refuses a redirect to a private address", async () => {
    await assert.rejects(
      fetchSafeHtml(`${base}/redirect-private`),
      (error: { code?: string }) => error.code === "SSRF_PROHIBITED",
    );
    await assert.rejects(
      fetchSafeHtml(`${base}/redirect-metadata`),
      (error: { code?: string }) => error.code === "SSRF_PROHIBITED",
    );
  });

  void it("gives up on a body that never finishes", async () => {
    const started = Date.now();
    await assert.rejects(
      fetchSafeHtml(`${base}/slow-body`),
      (error: { code?: string }) => error.code === "TIMEOUT",
    );
    assert.ok(
      Date.now() - started < 8000,
      "the whole preview is bounded by one deadline",
    );
  });

  void it("stops reading at the size cap", async () => {
    const { html } = await fetchSafeHtml(`${base}/huge`);
    assert.match(html, /<title>Big<\/title>/);
    assert.ok(html.length < 1024 * 1024);
  });
});
