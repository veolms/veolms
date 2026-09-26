import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";

export type CourseStaticPageRefreshState =
  "idle" | "queued" | "running" | "succeeded" | "failed";

export interface CourseStaticPageRefreshStatus {
  courseId: string;
  status: CourseStaticPageRefreshState;
  message: string | null;
  updatedAt: string;
  requestId: string | null;
  runUrl: string | null;
}

export interface CourseStaticPageRefreshService {
  requestRefresh(input: {
    courseId: string;
    courseSlug?: string | null;
  }): CourseStaticPageRefreshStatus;
  getStatus(courseId: string): CourseStaticPageRefreshStatus;
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
  name?: string;
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

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Cloudflare page deployment failed.";
}

export function createCourseStaticPageRefreshService({
  githubToken,
  repository,
  ref,
  workflow,
  logger,
}: CreateCourseStaticPageRefreshServiceOptions): CourseStaticPageRefreshService {
  const states = new Map<string, CourseStaticPageRefreshStatus>();
  const requestedRevisions = new Map<string, number>();
  const completedRevisions = new Map<string, number>();
  const requestedSlugs = new Map<string, string | null>();
  const inFlight = new Map<string, Promise<void>>();
  let deploymentQueueTail = Promise.resolve();

  function getStatus(courseId: string): CourseStaticPageRefreshStatus {
    return (
      states.get(courseId) ?? {
        courseId,
        status: "idle",
        message: null,
        updatedAt: new Date().toISOString(),
        requestId: null,
        runUrl: null,
      }
    );
  }

  function updateStatus(
    courseId: string,
    updates: Partial<CourseStaticPageRefreshStatus>,
  ) {
    states.set(courseId, {
      ...getStatus(courseId),
      ...updates,
      courseId,
      updatedAt: new Date().toISOString(),
    });
  }

  async function githubRequest<T>(
    pathname: string,
    init?: RequestInit,
  ): Promise<T> {
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
    const repositoryPath = `/repos/${repository}/actions/workflows/${workflowPath}`;
    const startDeadline = Date.now() + RUN_START_TIMEOUT_MS;
    let run: GitHubWorkflowRun | undefined;

    while (Date.now() < startDeadline) {
      const result = await githubRequest<{
        workflow_runs: GitHubWorkflowRun[];
      }>(
        `${repositoryPath}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=20`,
      );
      run = result.workflow_runs.find(
        (candidate) =>
          candidate.display_title === `Public pages refresh ${requestId}` ||
          candidate.name === `Public pages refresh ${requestId}`,
      );
      if (run) break;
      await delay(RUN_POLL_INTERVAL_MS);
    }

    if (!run) {
      throw new Error("The page refresh workflow did not start in time.");
    }

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

  async function serializeDeployment<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = deploymentQueueTail;
    let release!: () => void;
    deploymentQueueTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function deployRevision(
    courseId: string,
    courseSlug: string | null | undefined,
    revision: number,
  ) {
    await serializeDeployment(async () => {
      if ((requestedRevisions.get(courseId) ?? 0) > revision) {
        updateStatus(courseId, {
          status: "queued",
          message: "A newer course edit is queued for publishing.",
        });
        return;
      }

      const requestId = randomUUID();
      updateStatus(courseId, {
        status: "running",
        message: "Rendering and deploying the public course pages.",
        requestId,
        runUrl: null,
      });

      try {
        if (!repository) {
          throw new Error(
            "Course page refresh is not configured. Set COURSE_STATIC_REFRESH_REPOSITORY.",
          );
        }
        const workflowPath = encodeURIComponent(workflow);
        await githubRequest<void>(
          `/repos/${repository}/actions/workflows/${workflowPath}/dispatches`,
          {
            method: "POST",
            body: JSON.stringify({
              ref,
              inputs: {
                course_id: courseId,
                course_slug: courseSlug ?? "",
                request_id: requestId,
              },
            }),
          },
        );

        const result = await waitForWorkflow(requestId);
        if (result.conclusion !== "success") {
          updateStatus(courseId, {
            status: "failed",
            message: "Cloudflare did not publish the updated course pages.",
            runUrl: result.runUrl,
          });
          return;
        }
        updateStatus(courseId, {
          status:
            (requestedRevisions.get(courseId) ?? 0) > revision
              ? "queued"
              : "succeeded",
          message:
            (requestedRevisions.get(courseId) ?? 0) > revision
              ? "A newer course edit is queued for publishing."
              : "Public course pages are updated.",
          runUrl: result.runUrl,
        });
      } catch (error) {
        const message = normalizeError(error);
        logger.error(
          { courseId, requestId, err: error },
          "Public course page refresh failed after the course data was saved",
        );
        updateStatus(courseId, {
          status: "failed",
          message,
        });
      }
    });
  }

  async function processCourse(courseId: string) {
    while (true) {
      const revision = requestedRevisions.get(courseId) ?? 0;
      await deployRevision(courseId, requestedSlugs.get(courseId), revision);
      completedRevisions.set(courseId, revision);
      if ((requestedRevisions.get(courseId) ?? 0) <= revision) return;
    }
  }

  function startCourseProcessing(courseId: string) {
    if (inFlight.has(courseId)) return;

    const task = processCourse(courseId)
      .catch((error) => {
        const failedRevision = requestedRevisions.get(courseId) ?? 0;
        completedRevisions.set(courseId, failedRevision);
        logger.error(
          { courseId, err: error },
          "Course page refresh queue failed",
        );
        updateStatus(courseId, {
          status: "failed",
          message: normalizeError(error),
        });
      })
      .finally(() => {
        inFlight.delete(courseId);
        if (
          (requestedRevisions.get(courseId) ?? 0) >
          (completedRevisions.get(courseId) ?? 0)
        ) {
          updateStatus(courseId, {
            status: "queued",
            message: "A newer course edit is queued for publishing.",
          });
          startCourseProcessing(courseId);
        }
      });
    inFlight.set(courseId, task);
  }

  function requestRefresh(input: {
    courseId: string;
    courseSlug?: string | null;
  }): CourseStaticPageRefreshStatus {
    const courseId = input.courseId;
    requestedRevisions.set(
      courseId,
      (requestedRevisions.get(courseId) ?? 0) + 1,
    );
    requestedSlugs.set(courseId, input.courseSlug ?? null);
    updateStatus(courseId, {
      status: "queued",
      message: "Course page refresh queued.",
    });

    startCourseProcessing(courseId);

    return getStatus(courseId);
  }

  return { requestRefresh, getStatus };
}
