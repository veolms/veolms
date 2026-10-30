import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createCourseStaticPageRefreshService } from "@veolms/services/course-static-pages";
import type { FastifyBaseLogger } from "fastify";

const COURSE = "0b76ecc7-d8d4-5c53-a73d-c440b617eab8";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
} as unknown as FastifyBaseLogger;

type Inputs = Record<string, string>;

/**
 * A stand-in for the GitHub Actions API: each dispatch becomes a run that
 * completes with the next conclusion in `conclusions` (success by default).
 */
function fakeGitHub(conclusions: string[] = []) {
  const dispatches: Inputs[] = [];
  const runs = new Map<number, { title: string; conclusion: string }>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/dispatches")) {
      const { inputs } = JSON.parse(String(init?.body)) as { inputs: Inputs };
      dispatches.push(inputs);
      runs.set(runs.size + 1, {
        title: `Public pages refresh ${inputs.request_id}`,
        conclusion: conclusions.shift() ?? "success",
      });
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/runs")) {
      return Response.json({
        workflow_runs: [...runs].map(([id, run]) => ({
          id,
          display_title: run.title,
          status: "queued",
          conclusion: null,
        })),
      });
    }
    const id = Number(url.pathname.split("/").pop());
    return Response.json({
      id,
      status: "completed",
      conclusion: runs.get(id)?.conclusion ?? null,
      html_url: `https://github.com/runs/${id}`,
    });
  }) as typeof fetch;
  return {
    dispatches,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function createService(quietPeriodMs = 30) {
  return createCourseStaticPageRefreshService({
    githubToken: "token",
    repository: "owner/repo",
    ref: "dev",
    workflow: "website-pages.yml",
    logger: silentLogger,
    quietPeriodMs,
    maxWaitMs: 1_000,
    pollIntervalMs: 1,
  });
}

async function settle(check: () => boolean) {
  for (let waited = 0; waited < 3_000; waited += 10) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("timed out");
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

void describe("home page static refresh", () => {
  let github: ReturnType<typeof fakeGitHub>;
  beforeEach(() => {
    github = fakeGitHub();
  });
  afterEach(() => github.restore());

  void it("refreshes the home page alone, after the quiet period", async () => {
    const service = createService();
    service.requestHomePageRefresh();
    service.requestHomePageRefresh();
    await settle(() => github.dispatches.length === 1);
    await wait(50);
    assert.equal(github.dispatches.length, 1);
    assert.equal(github.dispatches[0]?.course_ids, "");
    assert.equal(github.dispatches[0]?.home_page, "true");
  });

  void it("goes in the same run as the courses changed with it", async () => {
    const service = createService();
    service.requestRefresh({ courseId: COURSE });
    service.requestHomePageRefresh();
    await settle(() => service.getStatus(COURSE).status === "succeeded");
    assert.equal(github.dispatches.length, 1);
    assert.equal(github.dispatches[0]?.course_ids, COURSE);
    assert.equal(github.dispatches[0]?.home_page, "true");
  });

  void it("leaves the home page out of a course refresh that has no change to it", async () => {
    const service = createService();
    service.requestRefresh({ courseId: COURSE });
    await settle(() => service.getStatus(COURSE).status === "succeeded");
    assert.equal("home_page" in (github.dispatches[0] ?? {}), false);
  });

  void it("is covered by a full rebuild waiting with it", async () => {
    const service = createService(60_000);
    service.requestHomePageRefresh();
    service.requestFullRebuild();
    await settle(() => service.getFullRebuildStatus().status === "succeeded");
    await wait(50);
    assert.equal(github.dispatches.length, 1);
    assert.equal(github.dispatches[0]?.course_ids, "");
    assert.equal("home_page" in (github.dispatches[0] ?? {}), false);
  });

  void it("starts a cancelled home page run again", async () => {
    github.restore();
    github = fakeGitHub(["cancelled"]);
    const service = createService();
    service.requestHomePageRefresh();
    await settle(() => github.dispatches.length === 2);
    assert.equal(github.dispatches[1]?.home_page, "true");
  });

  void it("does nothing when not configured", async () => {
    const service = createCourseStaticPageRefreshService({
      logger: silentLogger,
      quietPeriodMs: 1,
    });
    service.requestHomePageRefresh();
    await wait(30);
    assert.equal(github.dispatches.length, 0);
  });
});
