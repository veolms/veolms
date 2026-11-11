import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeShortLinkPath } from "@veolms/contracts";
import { getAppPathSegments, getCoreRoutes } from "@veolms/web-core";

import {
  checkDestination,
  collectOwnHosts,
  findStaticClash,
  randomShortPath,
  suggestAlternatives,
} from "./links.rules.ts";

const appSegments = new Set(getAppPathSegments(getCoreRoutes()));
const ownHosts = collectOwnHosts([
  "https://procodrr.com",
  "https://api.procodrr.com/v1/links/resolve",
]);

void describe("short link paths", () => {
  void it("normalises case, slashes and spaces", () => {
    assert.equal(normalizeShortLinkPath(" Node.JS/ "), "/node.js");
    assert.equal(normalizeShortLinkPath("/yt/Node"), "/yt/node");
    assert.equal(normalizeShortLinkPath("ts"), "/ts");
  });

  void it("refuses what cannot be a path", () => {
    for (const value of [
      "",
      "/",
      "/-x",
      "/a b",
      "/a/b/c/d",
      "/é",
      "/a//b",
      "/../x",
    ]) {
      assert.equal(normalizeShortLinkPath(value), null, value);
    }
  });

  void it("refuses the app's own pages, read from the route tree", () => {
    for (const path of [
      "/courses",
      "/Settings",
      "/learn/x",
      "/chat",
      "/login",
      "/quizzes",
    ]) {
      assert.equal(findStaticClash(path, appSegments)?.kind, "app", path);
    }
  });

  void it("refuses reserved prefixes", () => {
    for (const path of [
      "/api",
      "/v1/x",
      "/assets",
      "/cdn",
      "/_s",
      "/__spa-fallback.html",
      "/robots.txt",
    ]) {
      const clash = findStaticClash(path, appSegments);
      assert.ok(clash && clash.kind !== "app", path);
    }
  });

  void it("accepts a free path", () => {
    assert.equal(findStaticClash("/node.js", appSegments), null);
    assert.equal(findStaticClash("/yt/node", appSegments), null);
  });

  void it("suggests nearby paths, dropping an app page's prefix", () => {
    assert.deepEqual(suggestAlternatives("/nodejs").slice(0, 3), [
      "/nodejs",
      "/nodejs-2",
      "/nodejs-3",
    ]);
    assert.ok(suggestAlternatives("/courses/react").includes("/react"));
    assert.match(randomShortPath(), /^\/[a-z2-9]{6}$/u);
  });
});

void describe("short link destinations", () => {
  void it("accepts another site's https address", () => {
    assert.equal(
      checkDestination("https://procoder.netlify.app/node.js", ownHosts),
      null,
    );
  });

  void it("refuses other schemes, credentials, local hosts and this site", () => {
    for (const value of [
      "http://example.com",
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://user:pass@example.com",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://intranet/x",
      "https://procodrr.com/nodejs",
      "https://www.procodrr.com/x",
      "https://api.procodrr.com/v1",
      "not a url",
    ]) {
      assert.notEqual(checkDestination(value, ownHosts), null, value);
    }
  });
});
