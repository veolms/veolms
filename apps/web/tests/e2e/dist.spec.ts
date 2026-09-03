import { test, expect } from "./app.fixture.ts";
import { installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("first visible shell uses the persisted layout geometry", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { message: "Unauthenticated" } }),
  );
  await page.route("**/api/v1/courses", (route) =>
    route.fulfill({ status: 200, json: { courses: [] } }),
  );

  await page.goto("/courses");
  await expect(page.locator(".courses-app")).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.setItem("veolms-sidebar-mode", "collapsed");
    window.localStorage.setItem("veolms-sidebar-width", "252");
    window.localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ showCollapsedLogo: true }),
    );
  });

  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      const root = document.documentElement;
      root.dataset.testFirstSidebarState = root.dataset.sidebarState;
      root.dataset.testFirstSidebarWidth =
        root.style.getPropertyValue("--sidebar-width");
      const isVisible = (element: Element | null) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0
        );
      };
      root.dataset.testFirstSidebarLogoVisible = String(
        isVisible(document.querySelector(".courses-logo-clip")),
      );
      root.dataset.testFirstSidebarToggleVisible = String(
        isVisible(document.querySelector(".sidebar-collapse")),
      );
    });
  });

  await page.goto("/courses");
  await expect(page.locator(".courses-app")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-first-sidebar-state",
    "collapsed",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-first-sidebar-width",
    "252px",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-first-sidebar-logo-visible",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-first-sidebar-toggle-visible",
    "false",
  );
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  await expect(page.locator(".courses-app")).toHaveClass(
    /courses-app--collapsed/,
  );
  expect(await page.evaluate(() => window.__VEO_BOOTSTRAP__?.sidebar)).toEqual({
    mode: "collapsed",
    width: 252,
  });
});

test("each deep-linked settings tab is the only visible static slide", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { message: "Unauthenticated" } }),
  );
  await page.route("**/api/v1/courses", (route) =>
    route.fulfill({ status: 200, json: { courses: [] } }),
  );
  await page.route("**/api/v1/notification-preferences", (route) =>
    route.fulfill({ status: 200, json: { preferences: [] } }),
  );
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      const visibleSlides = Array.from(
        document.querySelectorAll<HTMLElement>(
          "#settings-tab-panel [data-panel-tab]:not([hidden])",
        ),
      );
      document.documentElement.dataset.testFirstSettingsHeadings =
        JSON.stringify(
          visibleSlides.map(
            (slide) => slide.querySelector("h2, h3")?.textContent?.trim() ?? "",
          ),
        );
    });
  });

  for (const [route, tab, heading] of [
    ["/settings/appearance", "appearance", "Display mode"],
    ["/settings/sidebar", "sidebar", "Sidebar header"],
    ["/settings/learning", "learning", "Playback & Learning"],
  ] as const) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute(
      "data-test-first-settings-headings",
      JSON.stringify([heading]),
    );
    await expect(page.getByRole("tabpanel")).toHaveAttribute(
      "data-settings-tab",
      tab,
    );
    await expect(page.getByRole("tabpanel")).toHaveClass(/\bpb-8\b/);
    await expect(
      page.locator("#settings-tab-panel [data-panel-tab].pb-8"),
    ).toHaveCount(0);
    await expect(
      page.locator(".settings-tab-content [data-panel-tab]:not([hidden])"),
    ).toHaveCount(1);
    await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  }
});

test("desktop settings tab navigation never paints an empty active slide", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { message: "Unauthenticated" } }),
  );
  await page.route("**/api/v1/courses", (route) =>
    route.fulfill({ status: 200, json: { courses: [] } }),
  );
  await openApp(page, "/settings/profile");
  await expect(
    page.getByRole("heading", { name: "Your public profile" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Appearance", exact: true }).hover();
  await expect(
    page.locator('#settings-tab-panel [data-panel-tab="appearance"]'),
  ).toBeAttached();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.testSettingsTransitionFrames = "0";
    root.dataset.testSettingsBlankFrames = "0";

    window.addEventListener(
      "click",
      () => {
        const startedAt = performance.now();
        const isReady = () => {
          const activeSlide = document.querySelector<HTMLElement>(
            '#settings-tab-panel [data-panel-tab="appearance"]:not([hidden])',
          );
          return Boolean(
            activeSlide?.firstElementChild &&
            document
              .getElementById("settings-tab-appearance")
              ?.getAttribute("aria-selected") === "true",
          );
        };
        queueMicrotask(() => {
          if (isReady()) {
            root.dataset.testSettingsLatency = String(
              performance.now() - startedAt,
            );
          }
        });
        let frames = 0;
        const sample = () => {
          frames += 1;
          root.dataset.testSettingsTransitionFrames = String(frames);
          if (!isReady()) {
            root.dataset.testSettingsBlankFrames = String(
              Number(root.dataset.testSettingsBlankFrames) + 1,
            );
          }
          if (frames < 12) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      },
      { capture: true, once: true },
    );
  });

  const appearanceTab = page.getByRole("tab", {
    name: "Appearance",
    exact: true,
  });
  const appearancePressContent = appearanceTab.locator(
    ".settings-tab__press-content",
  );
  await page.mouse.down();
  try {
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect
      .poll(() =>
        appearancePressContent.evaluate(
          (content) => getComputedStyle(content).scale,
        ),
      )
      .not.toBe("none");
    await expect(appearanceTab).toHaveCSS("transform", "none");
  } finally {
    await page.mouse.up();
  }
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect
    .poll(() =>
      appearancePressContent.evaluate(
        (content) => getComputedStyle(content).scale,
      ),
    )
    .toBe("none");
  await expect
    .poll(() =>
      page
        .locator("html")
        .getAttribute("data-test-settings-transition-frames")
        .then(Number),
    )
    .toBe(12);
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-settings-blank-frames",
    "0",
  );
  const latency = Number(
    await page.locator("html").getAttribute("data-test-settings-latency"),
  );
  expect(latency).toBeLessThan(50);
});

test("deep-linked settings tabs stay visible throughout hydration", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { message: "Unauthenticated" } }),
  );
  await page.route("**/api/v1/courses", (route) =>
    route.fulfill({ status: 200, json: { courses: [] } }),
  );
  await page.route("**/api/v1/notification-preferences", (route) =>
    route.fulfill({ status: 200, json: { preferences: [] } }),
  );
  await page.addInitScript(() => {
    const sample = () => {
      const root = document.documentElement;
      if (!root) {
        requestAnimationFrame(sample);
        return;
      }
      const panel = document.querySelector<HTMLElement>("#settings-tab-panel");
      if (!panel) {
        requestAnimationFrame(sample);
        return;
      }

      const visibleSlide = panel.querySelector<HTMLElement>(
        "[data-panel-tab]:not([hidden])",
      );
      const contentTop =
        visibleSlide?.firstElementChild?.getBoundingClientRect().top;
      const contentTops = JSON.parse(
        root.dataset.testSettingsHydrationContentTops ?? "[]",
      ) as number[];
      if (contentTop !== undefined) contentTops.push(contentTop);
      root.dataset.testSettingsHydrationContentTops =
        JSON.stringify(contentTops);
      const frames =
        Number(root.dataset.testSettingsHydrationFrames ?? "0") + 1;
      root.dataset.testSettingsHydrationFrames = String(frames);
      if (!visibleSlide) {
        root.dataset.testSettingsHydrationBlankFrames = String(
          Number(root.dataset.testSettingsHydrationBlankFrames ?? "0") + 1,
        );
      } else if (!root.dataset.testSettingsHydrationBlankFrames) {
        root.dataset.testSettingsHydrationBlankFrames = "0";
      }
      if (frames < 24) requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });

  for (const route of [
    "/settings/appearance",
    "/settings/sidebar",
    "/settings/learning",
    "/settings/notifications",
    "/settings/security",
    "/settings/account",
  ]) {
    await page.goto(route);
    await expect
      .poll(() =>
        page
          .locator("html")
          .getAttribute("data-test-settings-hydration-frames")
          .then(Number),
      )
      .toBe(24);
    await expect(page.locator("html"), route).toHaveAttribute(
      "data-test-settings-hydration-blank-frames",
      "0",
    );
    const contentTops = JSON.parse(
      (await page
        .locator("html")
        .getAttribute("data-test-settings-hydration-content-tops")) ?? "[]",
    ) as number[];
    expect(
      Math.max(...contentTops) - Math.min(...contentTops),
      route,
    ).toBeLessThan(2);
  }
});

test("compiled client serves direct routes and bundled course artwork", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  // Common direct URLs ship the page and deterministic sidebar shell as HTML.
  // Personalized navigation can enhance that shell after hydration.
  const settingsDocument = await page.request.get("/settings/appearance");
  expect(settingsDocument.ok()).toBe(true);
  const settingsHtml = await settingsDocument.text();
  expect(settingsHtml).toContain("Display mode");
  expect(settingsHtml).toContain("window.__VEO_BOOTSTRAP__");
  expect(settingsHtml).toContain("Student navigation");

  const catalogueDocument = await page.request.get("/courses");
  expect(catalogueDocument.ok()).toBe(true);
  const catalogueHtml = await catalogueDocument.text();
  expect(catalogueHtml).toContain("UI/UX Design Mastery");
  expect(catalogueHtml).toContain("window.__VEO_BOOTSTRAP__");
  expect(catalogueHtml).toContain("Student navigation");
  expect(catalogueHtml).not.toBe(settingsHtml);

  await openApp(page, "/");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();

  await page.goto("/courses");
  await expect(
    page.getByRole("heading", { name: "Courses", level: 1 }),
  ).toBeVisible();
  const courseImages = page
    .getByRole("region", { name: "Courses" })
    .locator("img");
  await expect(courseImages).toHaveCount(7);
  await expect
    .poll(() =>
      courseImages.evaluateAll((images) =>
        images.every((image) => {
          const courseImage = image as HTMLImageElement;
          return courseImage.complete && courseImage.naturalWidth > 0;
        }),
      ),
    )
    .toBe(true);

  await page.goto("/settings/appearance");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "appearance",
  );
  await expect(page).toHaveTitle(/^Settings .* ProCodrr$/);

  await page.goto("/COURSES");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/^Home .* ProCodrr$/);
  expect(new URL(page.url()).pathname).toBe("/COURSES");
  expect(browserErrors).toEqual([]);
});

test("compiled learning route loads the same-origin adaptive HLS manifest", async ({
  page,
}) => {
  const manifestRequest = page.waitForRequest((request) =>
    /\/course-hls\/[a-z0-9-]+\/master\.m3u8(?:\?.*)?$/.test(request.url()),
  );
  const manifestResponse = page.waitForResponse((response) =>
    /\/course-hls\/[a-z0-9-]+\/master\.m3u8(?:\?.*)?$/.test(response.url()),
  );
  await openApp(page, "/learn/typescript-course");
  await expect(
    page.getByRole("heading", {
      name: "The Beginning of a Design Journey",
      level: 1,
    }),
  ).toBeVisible();
  const player = page.getByRole("region", { name: /Lesson video player/ });
  await expect(player).toBeVisible();
  const mediaUrl = new URL((await manifestRequest).url());
  expect(mediaUrl.pathname).toMatch(/\/course-hls\/[a-z0-9-]+\/master\.m3u8$/);
  const mediaResponse = await manifestResponse;
  expect(mediaResponse.ok()).toBe(true);
  expect(mediaResponse.headers()["content-type"]).toMatch(
    /application\/(?:vnd\.apple\.)?mpegurl/i,
  );
  expect(await mediaResponse.text()).toContain("#EXTM3U");
});
