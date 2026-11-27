import { randomUUID } from "node:crypto";
import type {
  CourseStaticPageRefreshStatus,
  StaticSiteRebuildStatus,
} from "@veolms/contracts";
import type { FastifyBaseLogger } from "fastify";

export interface CourseStaticPageRefreshService {
  requestRefresh(input: {
    courseId: string;
    courseSlug?: string | null;
  }): CourseStaticPageRefreshStatus;
  getStatus(courseId: string): CourseStaticPageRefreshStatus;
  retry(courseId: string): CourseStaticPageRefreshStatus;
  /** Every public page built again (the admin's "Rebuild all public pages"). */
  requestFullRebuild(): StaticSiteRebuildStatus;
  /**
   * The home page (and the catalogue) built again, after the home page
   * settings, or the video its hero plays, changed.
   */
  requestHomePageRefresh(): void;
  /**
   * Only these pages built again (`/terms`), after the content they alone
   * show changed. Tracked by the same status as a full rebuild.
   */
  requestPagesRefresh(paths: readonly string[]): StaticSiteRebuildStatus;
  getFullRebuildStatus(): StaticSiteRebuildStatus;
}

/**
 * A page a page refresh may build: a site path of letters, digits and
 * dashes (`/terms`, `/about`), no query, never a course's or a lesson's.
 */
const REFRESHABLE_PAGE = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u;

interface CreateCourseStaticPageRefreshServiceOptions {
  githubToken?: string;
  repository?: string;
  ref?: string;
  workflow?: string;
  logger: FastifyBaseLogger;
  /** How long a course has to stay unchanged before its pages are built. */
  quietPeriodMs?: number;
  /** The longest a changed course waits while it keeps being edited. */
  maxWaitMs?: number;
  /** How often GitHub is asked about the run. */
  pollIntervalMs?: number;
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
// A full build of every page takes most of half an hour.
const RUN_COMPLETE_TIMEOUT_MS = 50 * 60_000;
const RUN_POLL_INTERVAL_MS = 5_000;
const QUIET_PERIOD_MS = 20_000;
const MAX_WAIT_MS = 2 * 60_000;
/**
 * GitHub keeps one waiting run per deployment group and cancels the one it
 * replaces; a cancelled refresh is started again this many times.
 */
const MAX_CANCELLED_ATTEMPTS = 3;
const NOT_CONFIGURED =
  "Course page refresh is not configured. Set COURSE_STATIC_REFRESH_GITHUB_TOKEN and COURSE_STATIC_REFRESH_REPOSITORY.";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Page deployment failed.";
}

/**
 * Builds the public pages again after their content changes, through a
 * GitHub Actions workflow that renders and deploys them.
 *
 * Changes are gathered: a course is built once it has been left unchanged
 * for a short while (an editor saves as the admin types), and all courses
 * waiting by then go in one run, with the home page when it changed too.
 * One run at a time; a full rebuild covers everything waiting with it.
 *
 * The state lives in this process: it is lost on restart, and each API
 * process tracks the changes it received.
 */
export function createCourseStaticPageRefreshService({
  githubToken,
  repository,
  ref = "main",
  workflow = "deploy-pages.yml",
  logger,
  quietPeriodMs = QUIET_PERIOD_MS,
  maxWaitMs = MAX_WAIT_MS,
  pollIntervalMs = RUN_POLL_INTERVAL_MS,
}: CreateCourseStaticPageRefreshServiceOptions): CourseStaticPageRefreshService {
  const configured = Boolean(githubToken && repository);
  const statuses = new Map<string, CourseStaticPageRefreshStatus>();
  let siteStatus: StaticSiteRebuildStatus = {
    status: "idle",
    message: null,
    updatedAt: new Date().toISOString(),
    runUrl: null,
  };
  /** Courses waiting for a run, with how many cancelled runs they had. */
  const pendingCourses = new Map<string, number>();
  let fullRebuildPending = false;
  let fullRebuildRunning = false;
  /** Pages waiting for a run, with how many cancelled runs they had. */
  const pendingPages = new Map<string, number>();
  /** The home page is waiting for a run, after this many cancelled ones. */
  let homePageAttempts: number | null = null;
  let firstPendingAt = 0;
  let lastChangeAt = 0;
  let wakeUp: ReturnType<typeof setTimeout> | null = null;
  let draining = false;

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

  function updateStatus(
    courseId: string,
    updates: Partial<CourseStaticPageRefreshStatus>,
  ) {
    statuses.set(courseId, {
      ...getStatus(courseId),
      ...updates,
      courseId,
      updatedAt: new Date().toISOString(),
    });
  }

  function updateSiteStatus(updates: Partial<StaticSiteRebuildStatus>) {
    siteStatus = {
      ...siteStatus,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  }

  async function githubRequest<T>(
    pathname: string,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(`${GITHUB_API}${pathname}`, {
      ...init,
      // Background work, but each poll iteration should still be bounded —
      // without a signal a hung GitHub API call stalls the refresh queue.
      signal: AbortSignal.timeout(15_000),
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

  async function waitForWorkflow(
    requestId: string,
    onStarted: (runUrl: string | null) => void,
  ) {
    const workflowPath = encodeURIComponent(workflow);
    const basePath = `/repos/${repository}/actions/workflows/${workflowPath}`;
    const startDeadline = Date.now() + RUN_START_TIMEOUT_MS;
    let run: GitHubWorkflowRun | undefined;

    while (Date.now() < startDeadline) {
      const result = await githubRequest<{
        workflow_runs: GitHubWorkflowRun[];
      }>(
        `${basePath}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=20`,
      );
      run = result.workflow_runs.find(
        (candidate) =>
          candidate.display_title === `Public pages refresh ${requestId}`,
      );
      if (run) break;
      await delay(pollIntervalMs);
    }

    if (!run) {
      throw new Error("The page refresh workflow did not start in time.");
    }
    onStarted(run.html_url ?? null);

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
      await delay(pollIntervalMs);
    }
    throw new Error("The page refresh workflow exceeded its time limit.");
  }

  /**
   * One run: these courses' pages, these pages and, with `homePage`, the
   * home page; or every page when there are none of them.
   */
  async function dispatch(
    courseIds: readonly string[],
    homePage: boolean,
    pages: readonly string[],
    requestId: string,
    onStarted: (runUrl: string | null) => void,
  ) {
    const workflowPath = encodeURIComponent(workflow);
    await githubRequest<void>(
      `/repos/${repository}/actions/workflows/${workflowPath}/dispatches`,
      {
        method: "POST",
        body: JSON.stringify({
          ref,
          inputs: {
            course_ids: courseIds.join(","),
            request_id: requestId,
            // Named only when wanted: a course refresh still works with a
            // workflow that has no home page input.
            ...(homePage ? { home_page: "true" } : {}),
            ...(pages.length > 0 ? { pages: pages.join(",") } : {}),
          },
        }),
      },
    );
    return waitForWorkflow(requestId, onStarted);
  }

  function schedule() {
    if (wakeUp) clearTimeout(wakeUp);
    wakeUp = null;
    if (draining) return;
    const dueAt = fullRebuildPending
      ? Date.now()
      : Math.min(lastChangeAt + quietPeriodMs, firstPendingAt + maxWaitMs);
    wakeUp = setTimeout(
      () => {
        wakeUp = null;
        void drain();
      },
      Math.max(0, dueAt - Date.now()),
    );
    wakeUp.unref?.();
  }

  async function runOnce() {
    const full = fullRebuildPending;
    const batch = new Map(pendingCourses);
    const homePage = homePageAttempts;
    // A full rebuild builds these pages too.
    const pageBatch = full ? new Map<string, number>() : new Map(pendingPages);
    fullRebuildPending = false;
    fullRebuildRunning = full;
    pendingCourses.clear();
    pendingPages.clear();
    homePageAttempts = null;
    const courseIds = [...batch.keys()];
    const pages = [...pageBatch.keys()];
    // The site's status follows a full rebuild, or a run of pages alone.
    const siteRun = full || pages.length > 0;
    const requestId = randomUUID();
    for (const courseId of courseIds) {
      updateStatus(courseId, {
        status: "running",
        message: null,
        requestId,
        runUrl: null,
      });
    }
    if (siteRun) {
      updateSiteStatus({ status: "running", message: null, runUrl: null });
    }

    try {
      const result = await dispatch(
        full ? [] : courseIds,
        !full && homePage !== null,
        pages,
        requestId,
        (runUrl) => {
          for (const courseId of courseIds) updateStatus(courseId, { runUrl });
          if (siteRun) updateSiteStatus({ runUrl });
        },
      );
      if (result.conclusion === "cancelled") {
        // Replaced while it waited for an earlier deployment.
        const retried = [...batch].filter(
          ([, attempts]) => attempts + 1 < MAX_CANCELLED_ATTEMPTS,
        );
        for (const [courseId, attempts] of batch) {
          if (attempts + 1 < MAX_CANCELLED_ATTEMPTS) {
            pendingCourses.set(courseId, attempts + 1);
            updateStatus(courseId, { status: "queued", runUrl: null });
          } else {
            updateStatus(courseId, {
              status: "failed",
              message: "The page deployment was cancelled.",
            });
          }
        }
        if (full) fullRebuildPending = true;
        const homePageRetried =
          !full && homePage !== null && homePage + 1 < MAX_CANCELLED_ATTEMPTS;
        if (homePageRetried) homePageAttempts = homePage + 1;
        const pagesRetried = [...pageBatch].filter(
          ([, attempts]) => attempts + 1 < MAX_CANCELLED_ATTEMPTS,
        );
        for (const [page, attempts] of pagesRetried) {
          pendingPages.set(page, attempts + 1);
        }
        if (pagesRetried.length > 0) {
          updateSiteStatus({ status: "queued", runUrl: null });
        }
        if (
          retried.length > 0 ||
          full ||
          homePageRetried ||
          pagesRetried.length > 0
        ) {
          logger.warn(
            { courseIds, pages, requestId, full, homePage: homePage !== null },
            "Public page refresh was cancelled; starting it again",
          );
          return;
        }
      }
      if (result.conclusion !== "success") {
        throw Object.assign(
          new Error(
            `Page deployment ended with ${result.conclusion ?? "no conclusion"}.`,
          ),
          { runUrl: result.runUrl },
        );
      }
      for (const courseId of courseIds) {
        updateStatus(courseId, {
          status: "succeeded",
          message: null,
          runUrl: result.runUrl,
        });
      }
      if (siteRun) {
        updateSiteStatus({
          status: "succeeded",
          message: null,
          runUrl: result.runUrl,
        });
      }
    } catch (error) {
      logger.error(
        {
          err: error,
          courseIds,
          pages,
          requestId,
          full,
          homePage: homePage !== null,
        },
        "Public page refresh failed",
      );
      const runUrl =
        error && typeof error === "object" && "runUrl" in error
          ? (error.runUrl as string | null)
          : undefined;
      for (const courseId of courseIds) {
        updateStatus(courseId, {
          status: "failed",
          message: errorMessage(error),
          ...(runUrl !== undefined ? { runUrl } : {}),
        });
      }
      if (siteRun) {
        updateSiteStatus({
          status: "failed",
          message: errorMessage(error),
          ...(runUrl !== undefined ? { runUrl } : {}),
        });
      }
    } finally {
      fullRebuildRunning = false;
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (
        fullRebuildPending ||
        pendingCourses.size > 0 ||
        pendingPages.size > 0 ||
        homePageAttempts !== null
      ) {
        // Changes made while the last run went are gathered as well.
        const dueAt = Math.min(
          lastChangeAt + quietPeriodMs,
          firstPendingAt + maxWaitMs,
        );
        if (!fullRebuildPending && Date.now() < dueAt) {
          await delay(dueAt - Date.now());
          continue;
        }
        await runOnce();
      }
    } finally {
      draining = false;
    }
  }

  /** A change came in: the next run waits for the quiet period from now. */
  function noteChange() {
    const now = Date.now();
    if (
      pendingCourses.size === 0 &&
      pendingPages.size === 0 &&
      homePageAttempts === null
    ) {
      firstPendingAt = now;
    }
    lastChangeAt = now;
  }

  function requestRefresh(input: {
    courseId: string;
    courseSlug?: string | null;
  }): CourseStaticPageRefreshStatus {
    if (!configured) {
      return {
        courseId: input.courseId,
        status: "idle",
        message: "Course static page refresh not configured",
        updatedAt: new Date().toISOString(),
        requestId: null,
        runUrl: null,
      };
    }
    noteChange();
    if (!pendingCourses.has(input.courseId)) {
      pendingCourses.set(input.courseId, 0);
    }
    updateStatus(input.courseId, {
      status: "queued",
      message: null,
      runUrl: null,
    });
    schedule();
    return getStatus(input.courseId);
  }

  function requestHomePageRefresh() {
    if (!configured) {
      logger.warn(
        { feature: "static-pages" },
        "The home page changed, but public page refresh is not configured: the static home page shows it after the next full rebuild.",
      );
      return;
    }
    noteChange();
    homePageAttempts ??= 0;
    schedule();
  }

  function requestFullRebuild(): StaticSiteRebuildStatus {
    if (!configured) {
      updateSiteStatus({ status: "failed", message: NOT_CONFIGURED });
      return siteStatus;
    }
    // One full rebuild waiting is enough; a refresh of some pages that is
    // waiting or running does not stand in for one.
    if (!fullRebuildPending && !fullRebuildRunning) {
      fullRebuildPending = true;
      updateSiteStatus({ status: "queued", message: null, runUrl: null });
      schedule();
    }
    return siteStatus;
  }

  function requestPagesRefresh(
    paths: readonly string[],
  ): StaticSiteRebuildStatus {
    if (!configured) {
      updateSiteStatus({ status: "failed", message: NOT_CONFIGURED });
      return siteStatus;
    }
    const valid = paths.filter((page) => REFRESHABLE_PAGE.test(page));
    if (valid.length === 0) return siteStatus;
    // A full rebuild waiting already builds them.
    if (fullRebuildPending) return siteStatus;
    noteChange();
    for (const page of valid) {
      if (!pendingPages.has(page)) pendingPages.set(page, 0);
    }
    updateSiteStatus({ status: "queued", message: null, runUrl: null });
    schedule();
    return siteStatus;
  }

  return {
    requestRefresh,
    getStatus,
    retry(courseId) {
      return getStatus(courseId).status === "failed"
        ? requestRefresh({ courseId })
        : getStatus(courseId);
    },
    requestFullRebuild,
    requestHomePageRefresh,
    requestPagesRefresh,
    getFullRebuildStatus: () => siteStatus,
  };
}
