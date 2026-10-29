/**
 * What every browser test is written with:
 *
 * - `test` and `expect` from Playwright, with two additions:
 *   - `academy`: sets the stage before a test (courses, learners, staff
 *     actions) through the test server's helpers, and reads what the
 *     learner would get by email;
 *   - every page sends its own visitor address and gets the fake payment
 *     window in place of Razorpay's (see fake-razorpay-checkout.js).
 * - small checks about the lesson video: `expectVideoToPlay`,
 *   `expectNoVideo`.
 *
 * A test fails if the page throws an error nobody caught: a crashed screen
 * is a bug even when the test's own checks pass.
 */
import { fileURLToPath } from "node:url";
import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { CONTROL_URL, WEB_URL } from "./ports";

// ---------------------------------------------------------------- the stage

export interface TestCourse {
  id: string;
  slug: string;
  title: string;
  /** In rupees. 0 for a free course. */
  price: number;
  /** Lesson N is `lessons[N - 1]`. */
  lessons: { id: string; mediaId: string | null; number: number | null }[];
}

export interface CourseOptions {
  title?: string;
  status?: "draft" | "published" | "archived";
  pricing?: "free" | "paid";
  /** In rupees. */
  price?: number;
  /** "restricted": only staff can give it (no buying, no free joining). */
  access?: "everyone" | "restricted";
  /**
   * The course's lessons, in order. Left out: lesson 1 is a free preview,
   * lessons 2 and 3 are locked.
   */
  lessons?: {
    title?: string;
    preview?: boolean;
    published?: boolean;
    video?: "ready" | "processing" | "none";
  }[];
}

export interface TestLearner {
  email: string;
  username: string;
  displayName: string;
  userId: string;
  session: { name: string; value: string };
}

async function callTestServer<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${CONTROL_URL}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Test server ${method} ${path}: ${result.error}`);
  }
  return result as T;
}

/** Sets the stage for a test. Everything here goes through the real API. */
export class Academy {
  readonly #context: BrowserContext;

  constructor(context: BrowserContext) {
    this.#context = context;
  }

  /** A course written as the course editor leaves it, its videos ready. */
  createCourse(options: CourseOptions = {}): Promise<TestCourse> {
    // Every lesson plays the 12-second test video.
    return callTestServer("POST", "/courses", { videoSeconds: 12, ...options });
  }

  /** A learner who has signed up (in another browser, earlier). */
  createLearner(label = "learner"): Promise<TestLearner> {
    return callTestServer("POST", "/learners", { label });
  }

  /** This browser is now signed in as `learner`, as after typing their code. */
  async signInAs(learner: { session: TestLearner["session"] }) {
    await this.#context.addCookies([
      { ...learner.session, domain: "127.0.0.1", path: "/" },
    ]);
  }

  /** A learner who has signed up, signed in in this browser. */
  async signedInLearner(label = "learner"): Promise<TestLearner> {
    const learner = await this.createLearner(label);
    await this.signInAs(learner);
    return learner;
  }

  /**
   * The same learner, signed in again somewhere else (their phone, say):
   * a session of its own. Put it in another browser with `signInAs`.
   */
  async onAnotherDevice(learner: TestLearner): Promise<TestLearner> {
    const { session } = await callTestServer<{
      session: TestLearner["session"];
    }>("POST", "/sessions", { email: learner.email });
    return { ...learner, session };
  }

  /** A new session for the academy's administrator. */
  adminSession(): Promise<{ session: TestLearner["session"] }> {
    return callTestServer("POST", "/admin-session");
  }

  /** This browser is now signed in as the academy's administrator. */
  async signInAsAdmin() {
    await this.signInAs(await this.adminSession());
  }

  /** The 6-digit code in the last email sent to `email`. */
  async emailedCode(email: string): Promise<string> {
    const { code } = await callTestServer<{ code: string }>(
      "GET",
      `/emails/code?to=${encodeURIComponent(email)}`,
    );
    return code;
  }

  /** Staff give `learner` the course (Students → Give access). */
  giveCourse(learner: TestLearner, course: TestCourse) {
    return callTestServer("POST", "/grants", {
      userId: learner.userId,
      courseId: course.id,
    });
  }

  /** Staff take the course away from `learner`. */
  takeCourseAway(learner: TestLearner, course: TestCourse) {
    return callTestServer("POST", "/revocations", {
      userId: learner.userId,
      courseId: course.id,
    });
  }

  /** The video files of lesson N the test CDN was asked for. */
  videoFilesRequested(course: TestCourse, lessonNumber: number) {
    const mediaId = course.lessons[lessonNumber - 1]?.mediaId;
    return callTestServer<{ file: string; status: number }[]>(
      "GET",
      `/cdn/requests?mediaId=${mediaId}`,
    );
  }
}

// ------------------------------------------------------------ the browser

const FAKE_RAZORPAY_SCRIPT = fileURLToPath(
  new URL("./fake-razorpay-checkout.js", import.meta.url),
);

// One address per test, as if each test were a learner on their own
// connection: the API limits sign-in codes per address (5 a minute), and
// without this every test would come from 127.0.0.1.
let addressCounter = 0;
function nextVisitorAddress(workerIndex: number): string {
  addressCounter += 1;
  // TEST-NET-3, a range set aside for examples.
  return `203.0.${(workerIndex * 4 + Math.floor(addressCounter / 250)) % 256}.${(addressCounter % 250) + 1}`;
}

async function prepareBrowser(context: BrowserContext, address: string) {
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": address });

  // Razorpay's checkout script and window are replaced; nothing reaches it.
  await context.route("https://checkout.razorpay.com/**", (route) =>
    route.fulfill({
      path: FAKE_RAZORPAY_SCRIPT,
      contentType: "text/javascript",
    }),
  );
  await context.route("https://api.razorpay.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<script>parent.postMessage({ source: "frame", event: "load" }, "*")</script>`,
    }),
  );
  // The fake window's "Pay": the fake gateway takes the payment.
  await context.exposeFunction("journeyGatewayPay", (gatewayOrderId: string) =>
    callTestServer("POST", "/payments/pay", { gatewayOrderId }),
  );
}

/**
 * Another browser, signed in with `session`: a second person, or the same
 * learner on another device. Close it with `context.close()` when done.
 */
export async function openSecondBrowser(
  browser: Browser,
  { session }: { session: TestLearner["session"] },
) {
  const context = await browser.newContext({ baseURL: WEB_URL });
  await prepareBrowser(context, `203.0.255.${(addressCounter++ % 250) + 1}`);
  await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/" }]);
  return { context, page: await context.newPage() };
}

// Each fixture hands its value to the test with `provide` (Playwright's
// `use`, renamed so it is not taken for React's `use`).
export const test = base.extend<{ academy: Academy }>({
  context: async ({ context }, provide, testInfo) => {
    await prepareBrowser(context, nextVisitorAddress(testInfo.workerIndex));
    await provide(context);
  },

  page: async ({ page }, provide) => {
    const crashes: string[] = [];
    let reactDevLogFailed = false;
    page.on("pageerror", (error) => {
      // React's development build logs every render for Chrome's
      // Performance panel, reading the components' props as it goes. During
      // a payment those props reach Razorpay's frame, which belongs to
      // another site, and the browser refuses the read; React then trips
      // over its own half-finished work ("Should not already be working").
      // That logging does not exist in production builds, so learners never
      // meet it; any other error still fails the test.
      if (error.stack?.includes("logComponentRender")) {
        reactDevLogFailed = true;
        return;
      }
      if (
        reactDevLogFailed &&
        error.message === "Should not already be working."
      ) {
        return;
      }
      crashes.push(error.message);
    });
    await provide(page);
    expect(crashes, "The page threw errors nobody caught").toEqual([]);
  },

  academy: async ({ context }, provide) => {
    await provide(new Academy(context));
  },
});

export { expect };

// ------------------------------------------------------- the lesson video

/** The lesson page of lesson N, as a learner opens it. */
export function openLesson(
  page: Page,
  course: TestCourse,
  lessonNumber: number,
) {
  return page.goto(`/learn/${course.slug}/lecture-${lessonNumber}`);
}

/** The course's page with its price and "Pay Now" / "Enroll Now". */
export function openCoursePage(page: Page, course: TestCourse) {
  return page.goto(`/courses/${course.slug}/overview`);
}

interface VideoState {
  seconds: number;
  playing: boolean;
  error: number | null;
}

/** The lesson player's video, or null when the page shows none. */
function lessonVideo(page: Page): Promise<VideoState | null> {
  return page.evaluate(() => {
    // The lesson player is the video that has a source; the page may keep
    // a second, empty one ready for the next lesson.
    const video = [...document.querySelectorAll("video")].find(
      (element) => element.currentSrc !== "",
    );
    if (!video) return null;
    return {
      seconds: video.currentTime,
      playing: !video.paused && !video.ended,
      error: video.error?.code ?? null,
    };
  });
}

/**
 * Presses Play and waits until the video has really played (at least
 * `seconds` of it, with no error). The video is never played to its end.
 */
export async function expectVideoToPlay(page: Page, seconds = 2) {
  const player = page.getByRole("region", { name: /^Lesson video player/u });
  await expect(player).toBeVisible();
  // The player's own button: "Play" while paused, "Pause" while playing.
  const playOrPause = page.getByRole("button", {
    name: /^(Play|Pause)$/u,
  });
  await expect(playOrPause).toBeVisible();
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  if ((await pause.count()) === 0) await playOrPause.click();

  await expect
    .poll(
      async () => {
        const video = await lessonVideo(page);
        if (!video) return "no video on the page";
        if (video.error) return `the video failed (error ${video.error})`;
        if (!video.playing) return `paused at ${video.seconds.toFixed(1)} s`;
        if (video.seconds < seconds) {
          return `playing, at ${video.seconds.toFixed(1)} s`;
        }
        return "playing";
      },
      {
        message: `the video plays past ${seconds} seconds`,
        timeout: 25_000,
      },
    )
    .toBe("playing");
}

interface SavedProgress {
  lessonId: string;
  progressPercent: number;
  positionSeconds?: number;
}

/**
 * Waits until the page has sent the learner's progress and the API has
 * taken it: the next save whose lessons match `matches`. Start waiting
 * before doing what should be saved, then await the result.
 *
 * The lesson page saves every 15 seconds, when a lesson ends, and when the
 * learner moves to another page of the app.
 */
export function waitForProgressSave(
  page: Page,
  matches: (lessons: SavedProgress[]) => boolean,
) {
  return page.waitForResponse(
    (response) => {
      const request = response.request();
      if (request.method() !== "POST") return false;
      if (
        !/\/learning-progress\/[^/]+\/batch$/u.test(
          new URL(response.url()).pathname,
        )
      ) {
        return false;
      }
      const body = request.postDataJSON() as { items?: SavedProgress[] } | null;
      return response.ok() && matches(body?.items ?? []);
    },
    // Three of the page's 15-second rounds.
    { timeout: 45_000 },
  );
}

/** Pauses the video by tapping it, as a learner does. */
export async function pauseVideo(page: Page) {
  await page
    .getByRole("button", { name: "Play or pause video; tap to show controls" })
    .click();
  await expect
    .poll(async () => (await lessonVideo(page))?.playing, {
      message: "the video is paused",
    })
    .toBe(false);
}

/** Where the lesson's video is, in seconds (0 when there is none). */
export async function videoPosition(page: Page): Promise<number> {
  return (await lessonVideo(page))?.seconds ?? 0;
}

/** The page shows no video for this lesson: nothing that could play. */
export async function expectNoVideo(page: Page) {
  await expect(
    page.getByRole("region", { name: /^Lesson video player/u }),
  ).toHaveCount(0);
  expect(await lessonVideo(page)).toBeNull();
}

/** The lesson's row in the course's lesson list, e.g. "2. Lesson 2 00:12 , locked". */
export function lessonInList(page: Page, lessonNumber: number) {
  return page
    .getByRole("complementary", { name: "Course curriculum" })
    .getByRole("button", { name: new RegExp(`^${lessonNumber}\\. `, "u") });
}
