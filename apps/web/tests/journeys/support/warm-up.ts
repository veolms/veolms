/**
 * Runs once before the tests. The web app runs in dev mode, which builds
 * each page the first time it is opened (up to half a minute on a cold
 * start) and may reload the page while doing so. Opening every page the
 * tests use here first, and waiting for each one's own content, keeps that
 * wait, and those reloads, out of the tests themselves.
 */
import {
  chromium,
  expect,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

import { CONTROL_URL, WEB_URL } from "./ports";

interface Session {
  name: string;
  value: string;
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${CONTROL_URL}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Warm-up: ${path} answered ${response.status}`);
  }
  return (await response.json()) as T;
}

/** A browser signed in with `session`, or a visitor's without one. */
async function browserFor(browser: Browser, session?: Session) {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    extraHTTPHeaders: { "X-Forwarded-For": "203.0.254.1" },
  });
  if (session) {
    await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/" }]);
  }
  return context.newPage();
}

/** Opens `path` and waits until what `ready` finds is on the screen. */
async function visit(page: Page, path: string, ready: (page: Page) => Locator) {
  // Twice: the first visit may be cut short by a dev-server reload.
  for (const round of [1, 2]) {
    await page.goto(path, { timeout: 120_000 });
    await expect(ready(page).first()).toBeVisible({ timeout: 120_000 });
    if (round === 1) await page.waitForTimeout(1_000);
  }
}

const heading = (name: string) => (page: Page) =>
  page.getByRole("heading", { name, exact: true });

export default async function warmUp() {
  const course = await post<{ id: string; slug: string }>("/courses", {
    title: "Warm-up course",
    videoSeconds: 12,
  });
  const learner = await post<{ userId: string; session: Session }>(
    "/learners",
    {
      label: "warm_up",
    },
  );
  await post("/grants", { userId: learner.userId, courseId: course.id });
  const admin = await post<{ session: Session }>("/admin-session");

  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const visitor = await browserFor(browser);
    await visit(visitor, "/login", (page) =>
      page.getByRole("dialog").getByRole("textbox", { name: "Email" }),
    );
    await visit(visitor, `/courses/${course.slug}/overview`, (page) =>
      page.getByRole("region", { name: "Course pricing and enrollment" }),
    );
    // Waits for the lesson list, not the lock: whether the lock shows is
    // for the tests to check, and to report by name when it does not.
    await visit(visitor, `/learn/${course.slug}/lecture-2`, (page) =>
      page.getByRole("complementary", { name: "Course curriculum" }),
    );

    const owner = await browserFor(browser, learner.session);
    await visit(owner, `/learn/${course.slug}/lecture-1`, (page) =>
      page.getByRole("region", { name: /^Lesson video player/u }),
    );
    await visit(owner, `/courses/${course.slug}/overview`, (page) =>
      page.getByRole("region", { name: "Your progress in this course" }),
    );
    await visit(owner, "/courses/enrolled", heading("Warm-up course"));
    await visit(owner, "/purchase-history", (page) =>
      page.getByRole("main", { name: "Purchase History" }),
    );
    await visit(owner, "/team", (page) =>
      page.getByRole("complementary", { name: "Student navigation" }),
    );

    const staff = await browserFor(browser, admin.session);
    await visit(staff, "/orders", (page) =>
      page.getByRole("main", { name: "Orders" }),
    );
    await visit(staff, "/students", (page) =>
      page.getByRole("main", { name: "Students List" }),
    );
    for (const name of ["Analytics", "Coupons", "Platform", "Team"]) {
      await visit(staff, `/${name.toLowerCase()}`, heading(name));
    }
  } finally {
    await browser.close();
  }
}
