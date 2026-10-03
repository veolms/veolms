import { randomUUID } from "node:crypto";
import type { CourseStaticPageRefreshStatus } from "@veolms/contracts";
import type { FastifyBaseLogger } from "fastify";

export interface CourseStaticPageRefreshService {
  requestRefresh(input: {
    courseId: string;
    courseSlug?: string | null;
  }): CourseStaticPageRefreshStatus;
  getStatus(courseId: string): CourseStaticPageRefreshStatus;
  retry(courseId: string): CourseStaticPageRefreshStatus;
}

interface CreateCourseStaticPageRefreshServiceOptions {
  githubToken?: string;
  repository?: string;
  ref: string;
  workflow: string;
  logger: FastifyBaseLogger;
}

interface GitHubWorkflowRun {
  id: number;
  display_title?: string;
  html_url?: string;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: string | null;
}

const GITHUB_API = "https://api.github.com";
const RUN_START_TIMEOUT_MS = 90_000;
const RUN_COMPLETE_TIMEOUT_MS = 12 * 60_000;
const RUN_POLL_INTERVAL_MS = 2_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Cloudflare course page deployment failed.";
}

export function createCourseStaticPageRefreshService({
  githubToken,
  repository,
  ref,
  workflow,
  logger,
}: CreateCourseStaticPageRefreshServiceOptions): CourseStaticPageRefreshService {
  const statuses = new Map<string, CourseStaticPageRefreshStatus>();
  const requestedRevision = new Map<string, number>();
  const completedRevision = new Map<string, number>();
  const courseSlugs = new Map<string, string | null>();
  const activeCourses = new Set<string>();
  let deploymentTail: Promise<void> = Promise.resolve();

  function getStatus(courseId: string): CourseStaticPageRefreshStatus {
    return (
      statuses.get(courseId) ?? {
        courseId,
        status: "idle",
        message: null,
        updatedAt: new Date().toISOString(),
        requestId: null,
        runUrl: null,
      }
    );
  }

  function updateStatus(courseId: string, updates: Partial<CourseStaticPageRefreshStatus>) {
    statuses.set(courseId, {
      ...getStatus(courseId),
      ...updates,
      courseId,
      updatedAt: new Date().toISOString(),
    });
  }

  async function githubRequest<T>(pathname: string, init?: RequestInit): Promise<T> {
    if (!githubToken) {
      throw new Error(
        "Course page refresh is not configured. Set COURSE_STATIC_REFRESH_GITHUB_TOKEN.",
      );
    }
    const response = await fetch(`${GITHUB_API}${pathname}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub Actions request failed (${response.status}).`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function waitForWorkflow(requestId: string) {
    if (!repository) {
      throw new Error(
        "Course page refresh is not configured. Set COURSE_STATIC_REFRESH_REPOSITORY.",
      );
    }
    const workflowPath = encodeURIComponent(workflow);
    const basePath = `/repos/${repository}/actions/workflows/${workflowPath}`;
    const startDeadline = Date.now() + RUN_START_TIMEOUT_MS;
    let run: GitHubWorkflowRun | undefined;

    while (Date.now() < startDeadline) {
      const result = await githubRequest<{
        workflow_runs: GitHubWorkflowRun[];
      }>(`${basePath}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=20`);
      run = result.workflow_runs.find(
        (candidate) => candidate.display_title === `Public pages refresh ${requestId}`,
      );
      if (run) break;
      await delay(RUN_POLL_INTERVAL_MS);
    }

    if (!run) throw new Error("The page refresh workflow did not start in time.");

    const completeDeadline = Date.now() + RUN_COMPLETE_TIMEOUT_MS;
    while (Date.now() < completeDeadline) {
      const current = await githubRequest<GitHubWorkflowRun>(
        `/repos/${repository}/actions/runs/${run.id}`,
      );
      if (current.status === "completed") {
        return {
          runUrl: current.html_url ?? null,
          conclusion: current.conclusion,
        };
      }
      await delay(RUN_POLL_INTERVAL_MS);
    }
    throw new Error("The page refresh workflow exceeded its time limit.");
  }

  async function dispatch(courseId: string, requestId: string) {
    if (!repository) {
      throw new Error(
        "Course page refresh is not configured. Set COURSE_STATIC_REFRESH_REPOSITORY.",
      );
    }
    const workflowPath = encodeURIComponent(workflow);
    await githubRequest<void>(`/repos/${repository}/actions/workflows/${workflowPath}/dispatches`, {
      method: "POST",
      body: JSON.stringify({
        ref,
        inputs: {
          course_id: courseId,
          course_slug: courseSlugs.get(courseId) ?? "",
          request_id: requestId,
        },
      }),
    });
    return waitForWorkflow(requestId);
  }

  async function serializeDeployment<T>(operation: () => Promise<T>): Promise<T> {
    const previous = deploymentTail;
    let release!: () => void;
    deploymentTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function processCourse(courseId: string) {
    try {
      while ((completedRevision.get(courseId) ?? 0) < (requestedRevision.get(courseId) ?? 0)) {
        const revision = requestedRevision.get(courseId) ?? 0;
        const requestId = randomUUID();
        updateStatus(courseId, {
          status: "running",
          message: null,
          requestId,
          runUrl: null,
        });

        try {
          const result = await serializeDeployment(() => dispatch(courseId, requestId));
          if (result.conclusion !== "success") {
            updateStatus(courseId, { runUrl: result.runUrl });
            throw new Error(
              `Cloudflare page deployment ended with ${result.conclusion ?? "no conclusion"}.`,
            );
          }
          completedRevision.set(courseId, revision);
          updateStatus(courseId, {
            status: "succeeded",
            message: null,
            runUrl: result.runUrl,
          });
        } catch (error) {
          completedRevision.set(courseId, revision);
          logger.error({ err: error, courseId, requestId }, "Course public page refresh failed");
          updateStatus(courseId, {
            status: "failed",
            message: errorMessage(error),
          });
        }
      }
    } finally {
      activeCourses.delete(courseId);
      if ((completedRevision.get(courseId) ?? 0) < (requestedRevision.get(courseId) ?? 0)) {
        activeCourses.add(courseId);
        void processCourse(courseId);
      }
    }
  }

  function requestRefresh(input: {
    courseId: string;
    courseSlug?: string | null;
  }): CourseStaticPageRefreshStatus {
    if (input.courseSlug !== undefined) {
      courseSlugs.set(input.courseId, input.courseSlug);
    }
    requestedRevision.set(input.courseId, (requestedRevision.get(input.courseId) ?? 0) + 1);
    updateStatus(input.courseId, {
      status: "queued",
      message: null,
      runUrl: null,
    });
    if (!activeCourses.has(input.courseId)) {
      activeCourses.add(input.courseId);
      void processCourse(input.courseId);
    }
    return getStatus(input.courseId);
  }

  return {
    requestRefresh,
    getStatus,
    retry(courseId) {
      return getStatus(courseId).status === "failed"
        ? requestRefresh({ courseId })
        : getStatus(courseId);
    },
  };
}
