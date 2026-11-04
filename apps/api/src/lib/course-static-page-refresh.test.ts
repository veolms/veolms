import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createCourseStaticPageRefreshService } from "@veolms/services/course-static-pages";
import type { FastifyBaseLogger } from "fastify";

const COURSE_A = "0b76ecc7-d8d4-5c53-a73d-c440b617eab8";
const COURSE_B = "1d66da61-a17d-5b46-a2ba-6e079e5a5316";

const silentLogger = {
  warn() {},
  error() {},
} as unknown as FastifyBaseLogger;

interface Dispatch {
  courseIds: string;
  requestId: string;
}

/**
 * A stand-in for the GitHub Actions API: each dispatch becomes a run that
 * completes with the next conclusion in `conclusions` (success by default).
 */
function fakeGitHub(conclusions: string[] = []) {
  const dispatches: Dispatch[] = [];
  const runs = new Map<number, { title: string; conclusion: string }>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/dispatches")) {
      const body = JSON.parse(String(init?.body)) as {
        inputs: { course_ids: string; request_id: string };
      };
      dispatches.push({
        courseIds: body.inputs.course_ids,
        requestId: body.inputs.request_id,
      });
      runs.set(runs.size + 1, {
        title: `Public pages refresh ${body.inputs.request_id}`,
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
    const run = runs.get(id);
    return Response.json({
      id,
      status: "completed",
      conclusion: run?.conclusion ?? null,
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

function createService(quietPeriodMs = 30, maxWaitMs = 1_000) {
  return createCourseStaticPageRefreshService({
    githubToken: "token",
    repository: "owner/repo",
    ref: "dev",
    workflow: "website-pages.yml",
    logger: silentLogger,
    quietPeriodMs,
    maxWaitMs,
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

void describe("course static page refresh", () => {
  let github: ReturnType<typeof fakeGitHub>;
  beforeEach(() => {
    github = fakeGitHub();
  });
  afterEach(() => github.restore());

  void it("builds the courses saved in one quiet period in one run", async () => {
    const service = createService();
    service.requestRefresh({ courseId: COURSE_A });
    service.requestRefresh({ courseId: COURSE_A });
    service.requestRefresh({ courseId: COURSE_B });
    assert.equal(service.getStatus(COURSE_A).status, "queued");
    await settle(() => service.getStatus(COURSE_B).status === "succeeded");
    assert.equal(github.dispatches.length, 1);
    assert.deepEqual(
      github.dispatches[0]?.courseIds.split(",").sort(),
      [COURSE_A, COURSE_B].sort(),
    );
    assert.equal(service.getStatus(COURSE_A).status, "succeeded");
  });

  void it("starts a cancelled run again", async () => {
    github.restore();
    github = fakeGitHub(["cancelled"]);
    const service = createService();
    service.requestRefresh({ courseId: COURSE_A });
    await settle(() => service.getStatus(COURSE_A).status === "succeeded");
    assert.equal(github.dispatches.length, 2);
  });

  void it("reports a failed run", async () => {
    github.restore();
    github = fakeGitHub(["failure"]);
    const service = createService();
    service.requestRefresh({ courseId: COURSE_A });
    await settle(() => service.getStatus(COURSE_A).status === "failed");
    assert.match(service.getStatus(COURSE_A).message ?? "", /failure/u);
    assert.equal(
      service.getStatus(COURSE_A).runUrl,
      "https://github.com/runs/1",
    );
  });

  void it("rebuilds every page with no course ids, at once", async () => {
    const service = createService(60_000, 60_000);
    assert.equal(service.requestFullRebuild().status, "queued");
    await settle(() => service.getFullRebuildStatus().status === "succeeded");
    assert.equal(github.dispatches.length, 1);
    assert.equal(github.dispatches[0]?.courseIds, "");
  });

  void it("does nothing when not configured", () => {
    const service = createCourseStaticPageRefreshService({
      logger: silentLogger,
    });
    assert.equal(service.requestRefresh({ courseId: COURSE_A }).status, "idle");
    assert.equal(service.requestFullRebuild().status, "failed");
    assert.equal(github.dispatches.length, 0);
  });
});
