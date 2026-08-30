import { test, expect } from "./app.fixture.ts";
import type { Locator, Page } from "@playwright/test";
import {
  expectStoredValue,
  installBaselineState,
  openApp,
  expectAppearanceSettingsReady,
  updateSidebarPreferences,
} from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

const getFloatingScrollbarThumb = (scrollbar: Locator) =>
  scrollbar.locator(":scope > .floating-scrollbar__thumb");

const exerciseFloatingScrollbar = async (
  page: Page,
  scrollport: Locator,
  scrollbar: Locator,
  upwardDragDistance: number,
) => {
  const thumb = getFloatingScrollbarThumb(scrollbar);
  await scrollport.evaluate((element) => element.scrollTo(0, 0));
  const trackBounds = await scrollbar.boundingBox();
  expect(trackBounds).not.toBeNull();
  const scrollTopBeforeTrackClick = await scrollport.evaluate(
    (element) => element.scrollTop,
  );
  await page.mouse.click(
    trackBounds!.x + trackBounds!.width / 2,
    trackBounds!.y + trackBounds!.height * 0.82,
  );
  await expect
    .poll(() => scrollport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(scrollTopBeforeTrackClick);

  const thumbBounds = await thumb.boundingBox();
  expect(thumbBounds).not.toBeNull();
  const scrollTopBeforeDrag = await scrollport.evaluate(
    (element) => element.scrollTop,
  );
  await page.mouse.move(
    thumbBounds!.x + thumbBounds!.width / 2,
    thumbBounds!.y + thumbBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    thumbBounds!.x + thumbBounds!.width / 2,
    thumbBounds!.y + thumbBounds!.height / 2 - upwardDragDistance,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect
    .poll(() => scrollport.evaluate((element) => element.scrollTop))
    .toBeLessThan(scrollTopBeforeDrag);
};

test("appearance remains stable while navigating from courses into learning and home", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1247, height: 779 });
  await openApp(page, "/courses");

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveAttribute("data-palette", "graphite");

  await page.evaluate(() => {
    const rootElement = document.documentElement;
    const appearanceHistory = [
      {
        mode: rootElement.dataset.theme || "",
        palette: rootElement.dataset.palette || "",
      },
    ];
    Object.assign(window, { __veolmsAppearanceHistory: appearanceHistory });
    new MutationObserver(() => {
      appearanceHistory.push({
        mode: rootElement.dataset.theme || "",
        palette: rootElement.dataset.palette || "",
      });
    }).observe(rootElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette"],
    });
  });

  await page
    .getByRole("article", { name: /Complete Backend with Node\.js/ })
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await expect(page).toHaveURL(/\/learn\/backend-nodejs\//);
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveAttribute("data-palette", "graphite");
  await expectStoredValue(page, "veolms-theme", "dark");
  await expectStoredValue(page, "veolms-academy-theme", "graphite");

  await page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("button", { name: "Home" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveAttribute("data-palette", "graphite");

  const appearanceHistory = await page.evaluate(
    () =>
      (
        window as Window & {
          __veolmsAppearanceHistory?: Array<{
            mode: string;
            palette: string;
          }>;
        }
      ).__veolmsAppearanceHistory || [],
  );
  expect(appearanceHistory).not.toHaveLength(0);
  expect(appearanceHistory.every(({ mode }) => mode === "dark")).toBe(true);
  expect(appearanceHistory.every(({ palette }) => palette === "graphite")).toBe(
    true,
  );
});

test("framed layout scrolls inside its main surface while edge-to-edge uses the document", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1133, height: 753 });
  await openApp(page, "/courses");

  const root = page.locator("html");
  const mainSurface = page.locator("main.courses-main");
  await expect(root).toHaveAttribute("data-content-layout", "framed");
  await expect(page.locator(".courses-main-scrollport")).toHaveCount(0);
  await expect(mainSurface).toBeVisible();
  const framedMetrics = await mainSurface.evaluate((main) => {
    const bounds = main.getBoundingClientRect();
    const dockBounds = document
      .querySelector(".sidebar-appearance")
      ?.getBoundingClientRect();
    return {
      bottomGap: window.innerHeight - bounds.bottom,
      clientHeight: main.clientHeight,
      dockBottomDelta: dockBounds
        ? Math.abs(dockBounds.bottom - bounds.bottom)
        : Number.POSITIVE_INFINITY,
      overflowY: getComputedStyle(main).overflowY,
      rightGap: window.innerWidth - bounds.right,
      scrollHeight: main.scrollHeight,
      top: bounds.top,
    };
  });
  expect(framedMetrics.top).toBe(12);
  expect(framedMetrics.rightGap).toBe(12);
  expect(framedMetrics.bottomGap).toBe(10);
  expect(framedMetrics.dockBottomDelta).toBeLessThan(0.5);
  expect(framedMetrics.overflowY).toBe("auto");
  expect(framedMetrics.scrollHeight).toBeGreaterThan(
    framedMetrics.clientHeight,
  );

  await page.evaluate(() => window.scrollTo(0, 420));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await mainSurface.evaluate((main) => main.scrollTo(0, 420));
  await expect
    .poll(() => mainSurface.evaluate((main) => main.scrollTop))
    .toBeGreaterThan(300);

  await page.evaluate(() => {
    const current = JSON.parse(
      localStorage.getItem("veolms-sidebar-preferences") || "{}",
    ) as Record<string, unknown>;
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ ...current, contentLayout: "edge-to-edge" }),
    );
  });
  await page.reload();
  await expect(root).toHaveAttribute("data-content-layout", "edge-to-edge");
  await expect(mainSurface).toBeVisible();
  await expect(mainSurface).toHaveCSS("overflow-y", "visible");

  await page.evaluate(() => window.scrollTo(0, 420));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(300);
});

test("switching the main content layout preserves the current settings position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1133, height: 753 });
  await openApp(page, "/settings/sidebar");

  const root = page.locator("html");
  const mainSurface = page.locator("main.courses-main");
  const layoutGroup = page.getByRole("radiogroup", {
    name: "Main content layout",
  });

  await expect(root).toHaveAttribute("data-content-layout", "framed");
  await mainSurface.evaluate((main) => {
    const group = document.querySelector(
      '[role="radiogroup"][aria-label="Main content layout"]',
    );
    if (!group) return;
    const groupTop =
      group.getBoundingClientRect().top -
      main.getBoundingClientRect().top +
      main.scrollTop;
    main.scrollTo(0, Math.max(0, groupTop - 180));
  });
  await expect(layoutGroup).toBeVisible();

  const framedPosition = await mainSurface.evaluate((main) => main.scrollTop);
  expect(framedPosition).toBeGreaterThan(100);

  await page.getByRole("radio", { name: /Edge-to-edge/ }).click();
  await expect(root).toHaveAttribute("data-content-layout", "edge-to-edge");
  await expect
    .poll(async () =>
      Math.abs((await page.evaluate(() => window.scrollY)) - framedPosition),
    )
    .toBeLessThan(2);

  const edgePosition = await page.evaluate(() => window.scrollY);
  await page.getByRole("radio", { name: /Framed/ }).click();
  await expect(root).toHaveAttribute("data-content-layout", "framed");
  await expect
    .poll(async () =>
      Math.abs(
        (await mainSurface.evaluate((main) => main.scrollTop)) - edgePosition,
      ),
    )
    .toBeLessThan(2);
});

test("course catalogue uses the restored floating scrollbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1133, height: 678 });
  await openApp(page, "/courses");

  const mainSurface = page.locator("#courses-main-scrollport");
  const floatingScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="courses-main-scrollport"]',
  );
  await expect
    .poll(() =>
      mainSurface.evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    )
    .toBeGreaterThan(0);
  await expect(mainSurface).toHaveCSS("scrollbar-width", "none");
  await expect(floatingScrollbar).toHaveClass(/is-visible/);
  await expect(floatingScrollbar).toHaveAttribute("aria-hidden", "false");
  await expect(getFloatingScrollbarThumb(floatingScrollbar)).toHaveCSS(
    "width",
    "6px",
  );
  await expect(getFloatingScrollbarThumb(floatingScrollbar)).toHaveCSS(
    "border-radius",
    "999px",
  );
  await exerciseFloatingScrollbar(page, mainSurface, floatingScrollbar, 70);
});

test("sidebar navigation stays scrollable without exposing a scrollbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 962, height: 637 });
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-role", "creator");
    window.localStorage.setItem("veolms-sidebar-mode", "expanded");
  });
  await openApp(page, "/");

  const navigation = page.locator("#courses-sidebar-nav-scrollport");
  const floatingScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="courses-sidebar-nav-scrollport"]',
  );

  await expect
    .poll(() =>
      navigation.evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    )
    .toBeGreaterThan(0);
  await expect(navigation).toHaveCSS("scrollbar-width", "none");
  await expect(floatingScrollbar).toHaveCount(0);

  const navigationGeometry = await navigation.evaluate((element) => ({
    clientWidth: element.clientWidth,
    offsetWidth: (element as HTMLElement).offsetWidth,
  }));
  expect(
    navigationGeometry.offsetWidth - navigationGeometry.clientWidth,
  ).toBeLessThanOrEqual(1);

  await navigation.evaluate((element) =>
    element.scrollTo(0, element.scrollHeight),
  );
  await expect
    .poll(() => navigation.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await navigation.hover();
  await page.mouse.wheel(0, -480);
  await expect
    .poll(() => navigation.evaluate((element) => element.scrollTop))
    .toBeLessThan(
      await navigation.evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    );
});

test("page tabs pin beneath the shell edge while the framed surface uses the floating scrollbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1133, height: 753 });

  for (const [path, tabSelector] of [
    ["/discussions/q-and-a", ".discussion-hub__tabs"],
    ["/settings/appearance", ".settings-tabs"],
  ] as const) {
    await openApp(page, path);
    if (path === "/settings/appearance") {
      await expectAppearanceSettingsReady(page);
    }

    const mainSurface = page.locator("main.courses-main");
    const tabs = page.locator(tabSelector);
    const floatingScrollbar = page.locator(
      '.floating-scrollbar[aria-controls="courses-main-scrollport"]',
    );

    await mainSurface.evaluate((main) => main.scrollTo(0, 360));
    await expect
      .poll(() =>
        page.evaluate((selector) => {
          const main = document.querySelector("main.courses-main");
          const tabList = document.querySelector(selector);
          if (!main || !tabList) return null;
          return Math.abs(
            tabList.getBoundingClientRect().top -
              main.getBoundingClientRect().top,
          );
        }, tabSelector),
      )
      .toBeLessThan(0.5);

    await expect(tabs).toBeVisible();
    const tabRadii = await tabs
      .locator('[role="tab"]')
      .evaluateAll((items) =>
        items.map((item) =>
          Number.parseFloat(getComputedStyle(item).borderRadius),
        ),
      );
    expect(tabRadii.every((radius) => radius === 0)).toBe(true);
    const shellLayering = await page
      .locator(".courses-app")
      .evaluate((app, selector) => {
        const tabList = document.querySelector(selector);
        if (!tabList) return null;
        return {
          edgeShadow: getComputedStyle(app, "::after").boxShadow,
          edgeZIndex: Number(getComputedStyle(app, "::after").zIndex),
          tabZIndex: Number(getComputedStyle(tabList).zIndex),
        };
      }, tabSelector);
    expect(shellLayering).not.toBeNull();
    expect(shellLayering!.edgeShadow).not.toBe("none");
    expect(shellLayering!.edgeZIndex).toBeGreaterThan(shellLayering!.tabZIndex);
    await expect(floatingScrollbar).toHaveClass(/is-visible/);
    await expect(floatingScrollbar).toHaveAttribute("aria-hidden", "false");
    await expect(getFloatingScrollbarThumb(floatingScrollbar)).toHaveCSS(
      "width",
      "6px",
    );
    await expect(mainSurface).toHaveCSS("scrollbar-width", "none");

    const [mainBounds, trackBounds] = await Promise.all([
      mainSurface.boundingBox(),
      floatingScrollbar.boundingBox(),
    ]);
    expect(mainBounds).not.toBeNull();
    expect(trackBounds).not.toBeNull();
    expect(
      Math.abs(
        trackBounds!.x +
          trackBounds!.width -
          (mainBounds!.x + mainBounds!.width),
      ),
    ).toBeLessThan(0.5);

    await exerciseFloatingScrollbar(page, mainSurface, floatingScrollbar, 70);
  }
});

test("learning scrollports use floating scrollbars at compact and wide desktop sizes", async ({
  page,
}) => {
  for (const width of [981, 1133]) {
    await page.setViewportSize({ width, height: 678 });
    await openApp(
      page,
      "/learn/typescript-course/career-opportunities?from=home",
    );

    const mainSurface = page.locator("main.courses-main");
    const mainScrollbar = page.locator(
      '.floating-scrollbar[aria-controls="courses-main-scrollport"]',
    );
    const rightmostContent = page.locator(
      width <= 1080
        ? ".learning-workspace__player-wrap"
        : ".learning-workspace__curriculum-column",
    );
    await expect(mainScrollbar).toHaveClass(/is-visible/);
    await expect(rightmostContent).toBeVisible();
    await expect(mainSurface).toHaveCSS("scrollbar-width", "none");
    await expect(getFloatingScrollbarThumb(mainScrollbar)).toHaveCSS(
      "border-radius",
      "999px",
    );

    const [mainBounds, mainTrackBounds] = await Promise.all([
      mainSurface.boundingBox(),
      mainScrollbar.boundingBox(),
    ]);
    expect(mainBounds).not.toBeNull();
    expect(mainTrackBounds).not.toBeNull();
    expect(Math.abs(mainTrackBounds!.y - mainBounds!.y)).toBeLessThan(0.5);
    expect(
      Math.abs(
        mainTrackBounds!.y +
          mainTrackBounds!.height -
          (mainBounds!.y + mainBounds!.height),
      ),
    ).toBeLessThan(0.5);

    if (width > 1080) {
      const curriculum = page.locator("#learning-course-curriculum-scrollport");
      const curriculumScrollbar = page.locator(
        '.floating-scrollbar[aria-controls="learning-course-curriculum-scrollport"]',
      );
      await expect(curriculum).toBeVisible();
      await expect(curriculumScrollbar).toHaveClass(/is-visible/);
      await expect(curriculum).toHaveCSS("scrollbar-width", "none");
      await expect(getFloatingScrollbarThumb(curriculumScrollbar)).toHaveCSS(
        "border-radius",
        "999px",
      );
      const [curriculumBounds, trackBounds] = await Promise.all([
        curriculum.boundingBox(),
        curriculumScrollbar.boundingBox(),
      ]);
      expect(curriculumBounds).not.toBeNull();
      expect(trackBounds).not.toBeNull();
      expect(
        Math.abs(
          trackBounds!.x +
            trackBounds!.width -
            (curriculumBounds!.x + curriculumBounds!.width),
        ),
      ).toBeLessThan(0.5);
      await exerciseFloatingScrollbar(
        page,
        curriculum,
        curriculumScrollbar,
        60,
      );

      await page
        .getByRole("button", { name: "Collapse course content" })
        .click({ force: true });
      await expect(
        page.locator(".learning-workspace__curriculum-column"),
      ).toHaveClass(/is-collapsed/);
      await expect(getFloatingScrollbarThumb(mainScrollbar)).toHaveCSS(
        "border-radius",
        "999px",
      );
    }
  }
});

test("Appearance controls scrollbar visibility and style across the app", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1247, height: 779 });
  await openApp(
    page,
    "/learn/typescript-course/career-opportunities?from=home",
  );

  const root = page.locator("html");
  const mainSurface = page.locator("#courses-main-scrollport");
  const sidebarNavigation = page.locator("#courses-sidebar-nav-scrollport");
  const curriculum = page.locator("#learning-course-curriculum-scrollport");
  const sidebarScrollbar = page.locator(".floating-scrollbar--sidebar");
  const mainScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="courses-main-scrollport"]',
  );
  const curriculumScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="learning-course-curriculum-scrollport"]',
  );
  await expect(root).toHaveAttribute("data-hide-scrollbars", "false");
  await expect(root).toHaveAttribute("data-scrollbar-style", "theme");
  await expect(mainSurface).toHaveCSS("scrollbar-width", "none");
  await expect(sidebarNavigation).toHaveCSS("scrollbar-width", "none");
  await expect(sidebarScrollbar).toHaveCount(0);
  await expect(curriculum).toHaveCSS("scrollbar-width", "none");
  await expect(mainScrollbar).toHaveClass(/is-visible/);
  await expect(curriculumScrollbar).toHaveClass(/is-visible/);

  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);
  const showScrollbars = page.getByRole("switch", {
    name: "Show scrollbars",
  });
  const scrollbarStyleMenu = page.getByRole("radiogroup", {
    name: "Scrollbar style",
  });
  await expect(showScrollbars).toHaveAttribute("aria-checked", "true");

  await scrollbarStyleMenu.getByRole("radio", { name: /^Thick/ }).click();
  await expect(root).toHaveAttribute("data-scrollbar-style", "thick");
  await expectStoredValue(page, "veolms-scrollbar-style", "thick");

  await scrollbarStyleMenu.getByRole("radio", { name: /^Default/ }).click();
  await expect(root).toHaveAttribute("data-scrollbar-style", "default");
  await expectStoredValue(page, "veolms-scrollbar-style", "default");

  await openApp(
    page,
    "/learn/typescript-course/career-opportunities?from=home",
  );
  await expect(mainSurface).toHaveCSS("scrollbar-width", "auto");
  await expect(sidebarNavigation).toHaveCSS("scrollbar-width", "none");
  await expect(sidebarScrollbar).toHaveCount(0);
  await expect(curriculum).toHaveCSS("scrollbar-width", "auto");
  await expect(mainScrollbar).toBeHidden();
  await expect(curriculumScrollbar).toBeHidden();

  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);
  await showScrollbars.click();
  await expect(root).toHaveAttribute("data-hide-scrollbars", "true");
  await expectStoredValue(page, "veolms-hide-scrollbars", "true");

  await openApp(
    page,
    "/learn/typescript-course/career-opportunities?from=home",
  );
  await expect(mainSurface).toHaveCSS("scrollbar-width", "none");
  await expect(curriculum).toHaveCSS("scrollbar-width", "none");
  await expect(mainScrollbar).toBeHidden();
  await expect(curriculumScrollbar).toBeHidden();
});

test("learning scrollbars independently control resize affordances and layout", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1247, height: 779 });
  await openApp(
    page,
    "/learn/typescript-course/career-opportunities?from=home",
  );

  const root = page.locator("html");
  const lesson = page.locator(".learning-workspace__lesson-column");
  const curriculumColumn = page.locator(
    ".learning-workspace__curriculum-column",
  );
  const resizeRail = page.getByRole("separator", {
    name: "Resize course curriculum",
  });
  const mainScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="courses-main-scrollport"]',
  );
  const curriculumScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="learning-course-curriculum-scrollport"]',
  );

  await expect(root).toHaveAttribute("data-lesson-page-scrollbar", "visible");
  await expect(root).toHaveAttribute("data-curriculum-scrollbar", "visible");
  await expect(mainScrollbar).toHaveClass(/is-visible/);
  await expect(mainScrollbar).toBeVisible();
  await expect(curriculumScrollbar).toBeVisible();
  await expect
    .poll(() =>
      resizeRail.evaluate((rail) =>
        Number.parseFloat(getComputedStyle(rail, "::before").opacity),
      ),
    )
    .toBe(0);

  const widthBeforeScrollbarResize = await curriculumColumn.evaluate(
    (column) => column.getBoundingClientRect().width,
  );
  const scrollbarBounds = await mainScrollbar.boundingBox();
  expect(scrollbarBounds).not.toBeNull();
  await page.mouse.move(
    scrollbarBounds!.x + scrollbarBounds!.width / 2,
    scrollbarBounds!.y + scrollbarBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    scrollbarBounds!.x + scrollbarBounds!.width / 2 - 48,
    scrollbarBounds!.y + scrollbarBounds!.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      curriculumColumn.evaluate(
        (column) => column.getBoundingClientRect().width,
      ),
    )
    .toBeGreaterThan(widthBeforeScrollbarResize + 30);

  await openApp(page, "/settings/learning");
  await page
    .getByRole("switch", { name: "Show lesson page scrollbar" })
    .click();
  await page
    .getByRole("switch", { name: "Show course content scrollbar" })
    .click();
  await openApp(
    page,
    "/learn/typescript-course/career-opportunities?from=home",
  );

  await expect(root).toHaveAttribute("data-lesson-page-scrollbar", "hidden");
  await expect(root).toHaveAttribute("data-curriculum-scrollbar", "hidden");
  await expect(mainScrollbar).toBeHidden();
  await expect(curriculumScrollbar).toBeHidden();
  await expect
    .poll(() =>
      resizeRail.evaluate((rail) =>
        Number.parseFloat(getComputedStyle(rail, "::before").opacity),
      ),
    )
    .toBeGreaterThan(0.6);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const lessonColumn = document.querySelector(
          ".learning-workspace__lesson-column",
        );
        const curriculum = document.querySelector(
          ".learning-workspace__curriculum-column",
        );
        if (!lessonColumn || !curriculum) return Number.POSITIVE_INFINITY;
        return Math.abs(
          lessonColumn.getBoundingClientRect().right -
            curriculum.getBoundingClientRect().left,
        );
      }),
    )
    .toBeLessThanOrEqual(0.5);

  const widthBeforeRailResize = await curriculumColumn.evaluate(
    (column) => column.getBoundingClientRect().width,
  );
  const railBounds = await resizeRail.boundingBox();
  expect(railBounds).not.toBeNull();
  await page.mouse.move(
    railBounds!.x + railBounds!.width / 2,
    railBounds!.y + railBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    railBounds!.x + railBounds!.width / 2 - 32,
    railBounds!.y + railBounds!.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      curriculumColumn.evaluate(
        (column) => column.getBoundingClientRect().width,
      ),
    )
    .toBeGreaterThan(widthBeforeRailResize + 20);
});

test("curriculum floating scrollbar follows sidebar layout shifts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1424, height: 678 });
  await openApp(
    page,
    "/learn/typescript-course/career-opportunities?from=home",
  );

  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });

  const curriculum = page.locator("#learning-course-curriculum-scrollport");
  const curriculumScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="learning-course-curriculum-scrollport"]',
  );
  await expect(curriculum).toBeVisible();
  await expect(curriculumScrollbar).toHaveClass(/is-visible/);
  await expect
    .poll(() => curriculum.evaluate((element) => element.scrollHeight))
    .toBeGreaterThan(
      await curriculum.evaluate((element) => element.clientHeight),
    );
  await expect(curriculum).toHaveCSS("scrollbar-width", "none");

  const scrollbarEdgeDelta = () =>
    page.evaluate(() => {
      const scrollport = document.querySelector(
        "#learning-course-curriculum-scrollport",
      );
      const scrollbar = document.querySelector(
        '.floating-scrollbar[aria-controls="learning-course-curriculum-scrollport"]',
      );
      if (!scrollport || !scrollbar) return Number.POSITIVE_INFINITY;
      return Math.abs(
        scrollbar.getBoundingClientRect().right -
          scrollport.getBoundingClientRect().right,
      );
    });

  await expect.poll(scrollbarEdgeDelta).toBeLessThan(0.5);

  await navigation
    .getByRole("button", { name: /^(Expand|Collapse) navigation$/ })
    .click();
  await expect.poll(scrollbarEdgeDelta).toBeLessThan(0.5);
});

test("dock context menus stay attached and reading controls update immediately", async ({
  page,
}) => {
  await openApp(page, "/");
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const appearanceControls = sidebar.getByRole("group", {
    name: "Appearance controls",
  });
  const sidebarBox = await sidebar.boundingBox();

  const modeControl = appearanceControls.getByRole("button").nth(0);
  await modeControl.click({ button: "right" });
  const paletteMenu = page.getByRole("menu", { name: "Choose a color theme" });
  await expect(paletteMenu).toBeVisible();
  const modeBox = await modeControl.boundingBox();
  const paletteBox = await paletteMenu.boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(modeBox).not.toBeNull();
  expect(paletteBox).not.toBeNull();
  expect(paletteBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x - 1);
  expect(paletteBox!.x + paletteBox!.width).toBeLessThanOrEqual(
    sidebarBox!.x + sidebarBox!.width + 1,
  );
  expect(
    Math.abs(paletteBox!.y + paletteBox!.height - modeBox!.y),
  ).toBeLessThanOrEqual(4);
  await page.keyboard.press("Escape");

  const readingModeControl = appearanceControls.getByRole("button", {
    name: "Turn reading mode on",
  });
  await readingModeControl.click({ button: "right" });
  const quickSettings = page.getByRole("dialog", {
    name: "Reading mode quick settings",
  });
  await expect(quickSettings).toBeVisible();
  const readingBox = await readingModeControl.boundingBox();
  const quickSettingsBox = await quickSettings.boundingBox();
  expect(readingBox).not.toBeNull();
  expect(quickSettingsBox).not.toBeNull();
  expect(quickSettingsBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x - 1);
  expect(quickSettingsBox!.x + quickSettingsBox!.width).toBeLessThanOrEqual(
    sidebarBox!.x + sidebarBox!.width + 1,
  );
  expect(
    Math.abs(quickSettingsBox!.y + quickSettingsBox!.height - readingBox!.y),
  ).toBeLessThanOrEqual(4);

  const texture = quickSettings.getByRole("slider", { name: "Quick texture" });
  await expect(texture).toHaveValue("90");
  await expect
    .poll(() =>
      texture.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--app-slider-thumb-size")
          .trim(),
      ),
    )
    .toBe("20px");
  await texture.focus();
  await page.keyboard.press("ArrowRight");
  await expect(texture).toHaveValue("91");
  await quickSettings
    .getByRole("switch", { name: "Turn reading mode on" })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode",
    "true",
  );

  await quickSettings
    .getByRole("button", { name: /^Quick reading mode colors:/ })
    .click();
  await page.getByRole("option", { name: "Light colors" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode-colors",
    "light",
  );
});

test("mobile reading mode quick settings stay inside the More sheet viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/courses");

  await page.getByRole("button", { name: "More navigation options" }).click();
  const moreDialog = page.getByRole("dialog", { name: /More/ });
  const readingModeControl = moreDialog.getByRole("button", {
    name: "Turn reading mode on",
  });
  await readingModeControl.click({ button: "right" });

  const quickSettings = page.getByRole("dialog", {
    name: "Reading mode quick settings",
  });
  await expect(quickSettings).toBeVisible();
  const quickSettingsBox = await quickSettings.boundingBox();
  expect(quickSettingsBox).not.toBeNull();
  expect(quickSettingsBox!.x).toBeGreaterThanOrEqual(8);
  expect(quickSettingsBox!.y).toBeGreaterThanOrEqual(8);
  expect(quickSettingsBox!.x + quickSettingsBox!.width).toBeLessThanOrEqual(
    382,
  );
  expect(quickSettingsBox!.y + quickSettingsBox!.height).toBeLessThanOrEqual(
    784,
  );
});

test("theme menus use the available height before introducing overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1101, height: 753 });
  await openApp(page, "/");
  const dockItems = ["appearance", "theme", "reading-mode", "fullscreen"];
  await updateSidebarPreferences(page, "/", {
    dockItems,
    dockOrder: dockItems,
  });

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const appearance = sidebar.getByRole("group", {
    name: "Appearance controls",
  });
  const assertPaletteFits = async (insideSidebar = false) => {
    const paletteMenu = page.getByRole("menu", {
      name: "Choose a color theme",
    });
    await expect(paletteMenu).toBeVisible();
    expect(
      await paletteMenu.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(false);
    const bounds = await paletteMenu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(12);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(741);
    if (insideSidebar) {
      const sidebarBounds = await sidebar.boundingBox();
      expect(sidebarBounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(sidebarBounds!.x - 1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
        sidebarBounds!.x + sidebarBounds!.width + 1,
      );
    }
  };

  await sidebar.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(
    sidebar.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await appearance.getByRole("button", { name: "Choose color theme" }).click();
  await assertPaletteFits();
  await page.keyboard.press("Escape");

  await appearance.getByRole("button").nth(0).click({ button: "right" });
  await assertPaletteFits();
  await page.keyboard.press("Escape");

  await sidebar.getByRole("button", { name: "Expand navigation" }).click();
  await appearance.getByRole("button", { name: "Choose color theme" }).click();
  await assertPaletteFits(true);
  await page.keyboard.press("Escape");

  const modeControl = appearance.getByRole("button").nth(0);
  await modeControl.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await modeControl.click({ button: "right" });
  const lightPaletteMaterial = await page
    .getByRole("menu", { name: "Choose a color theme" })
    .evaluate((menu) => {
      const styles = getComputedStyle(menu);
      return {
        backgroundColor: styles.backgroundColor,
        backgroundImage: styles.backgroundImage,
        boxShadow: styles.boxShadow,
      };
    });
  expect(lightPaletteMaterial.backgroundColor).not.toBe("rgb(36, 35, 33)");
  expect(lightPaletteMaterial.backgroundImage).toBe("none");
  expect(lightPaletteMaterial.boxShadow).not.toBe("none");
});

test("theme menu background follows the active palette and appearance", async ({
  page,
}) => {
  await openApp(page, "/courses");

  const root = page.locator("html");
  const modeControl = page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("group", { name: "Appearance controls" })
    .getByRole("button")
    .nth(0);
  const menu = page.getByRole("menu", { name: "Choose a color theme" });
  const readMaterial = () =>
    menu.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundBlendMode: styles.backgroundBlendMode,
        backgroundColor: styles.backgroundColor,
        backgroundImage: styles.backgroundImage,
      };
    });

  await modeControl.click({ button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitemradio", { name: /Ocean Blue/ }).click();
  await expect(root).toHaveAttribute("data-palette", "ocean");
  const oceanMaterial = await readMaterial();

  await menu.getByRole("menuitemradio", { name: /Barbie Pink/ }).click();
  await expect(root).toHaveAttribute("data-palette", "barbie");
  const barbieMaterial = await readMaterial();

  expect(oceanMaterial.backgroundColor).not.toBe(
    barbieMaterial.backgroundColor,
  );
  expect(barbieMaterial.backgroundBlendMode).toBe("soft-light");
  expect(barbieMaterial.backgroundImage).toContain("theme-menu-grain.webp");

  await page.keyboard.press("Escape");
  await modeControl.click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await modeControl.click({ button: "right" });
  await expect(menu).toBeVisible();
  const lightMaterial = await readMaterial();

  expect(lightMaterial.backgroundColor).not.toBe(
    barbieMaterial.backgroundColor,
  );
  expect(lightMaterial.backgroundBlendMode).toBe("normal");
  expect(lightMaterial.backgroundImage).toBe("none");
});

test("sidebar keyboard shortcut hints can be hidden without disabling shortcuts", async ({
  page,
}) => {
  await openApp(page, "/settings/sidebar");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const settingsItem = sidebar.getByRole("button", { name: "Settings" });
  const shortcutHint = settingsItem.locator(".courses-nav__shortcut");
  const shortcutToggle = page.getByRole("switch", {
    name: "Show keyboard shortcuts",
  });

  await expect(shortcutToggle).toHaveAttribute("aria-checked", "true");
  await settingsItem.hover();
  await expect(shortcutHint).toBeVisible();

  await shortcutToggle.click();
  await expect(shortcutToggle).toHaveAttribute("aria-checked", "false");
  await expect(shortcutHint).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(
          window.localStorage.getItem("veolms-sidebar-preferences") || "{}",
        );
        return saved.showKeyboardShortcuts;
      }),
    )
    .toBe(false);

  await openApp(page, "/");
  await page.keyboard.press("Control+,");
  await expect(page).toHaveURL(/\/settings\/appearance$/);

  await openApp(page, "/settings/sidebar");
  await expect(
    page.getByRole("switch", { name: "Show keyboard shortcuts" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    page
      .getByRole("complementary", { name: "Student navigation" })
      .locator(".courses-nav__shortcut"),
  ).toHaveCount(0);
});

test("sidebar menu depth is independent from application surface depth", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);

  const root = page.locator("html");
  const mainSurface = page.locator("main.student-surface-main");
  const settingsCard = page.locator(".settings-section").first();
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const inactiveMenuItem = sidebar.getByRole("button", { name: "Home" });
  const activeMenuItem = sidebar.getByRole("button", { name: "Settings" });
  const globalToggle = page.getByRole("switch", {
    name: "Elevated surfaces",
  });
  const shadowOf = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).boxShadow);

  await expect(globalToggle).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("data-elevated-surfaces", "true");
  expect(
    await settingsCard.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    ),
  ).not.toBe("none");
  await expect
    .poll(() => shadowOf("main.student-surface-main"))
    .not.toBe("none");
  expect(
    await inactiveMenuItem.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    ),
  ).toBe("none");

  await globalToggle.click();
  await expect(globalToggle).toHaveAttribute("aria-checked", "false");
  await expect(root).toHaveAttribute("data-elevated-surfaces", "false");
  await expect.poll(() => shadowOf(".settings-section")).toBe("none");
  await expect.poll(() => shadowOf("main.student-surface-main")).toBe("none");
  await expect
    .poll(() =>
      inactiveMenuItem.evaluate(
        (element) => getComputedStyle(element).boxShadow,
      ),
    )
    .toBe("none");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("veolms-elevated-surfaces")),
    )
    .toBe("false");

  await openApp(page, "/settings/sidebar");
  const sidebarOverride = page.getByRole("switch", {
    name: "Elevate sidebar menus",
  });
  await expect(sidebarOverride).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("data-sidebar-menu-elevation", "true");
  await sidebarOverride.click();
  await expect(sidebarOverride).toHaveAttribute("aria-checked", "false");
  await sidebarOverride.click();
  await expect(sidebarOverride).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("data-sidebar-menu-elevation", "true");
  await expect
    .poll(() =>
      inactiveMenuItem.evaluate(
        (element) => getComputedStyle(element).boxShadow,
      ),
    )
    .toBe("none");
  await expect
    .poll(() =>
      activeMenuItem.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .not.toBe("none");
  await expect.poll(() => shadowOf(".settings-section")).toBe("none");
  await expect(mainSurface).toHaveCSS("box-shadow", "none");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(
          localStorage.getItem("veolms-sidebar-preferences") || "{}",
        );
        return stored.elevateMenus;
      }),
    )
    .toBe(true);

  await page.reload();
  await expect(root).toHaveAttribute("data-elevated-surfaces", "false");
  await expect(root).toHaveAttribute("data-sidebar-menu-elevation", "true");
  await expect(sidebarOverride).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() =>
      inactiveMenuItem.evaluate(
        (element) => getComputedStyle(element).boxShadow,
      ),
    )
    .toBe("none");
  await expect
    .poll(() =>
      activeMenuItem.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .not.toBe("none");
});

test("light mode uses a visible neutral shadow for elevated surfaces", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);

  await page.getByRole("radio", { name: /^Light / }).click();
  const elevatedSurfaces = page.getByRole("switch", {
    name: "Elevated surfaces",
  });
  await expect(elevatedSurfaces).toHaveAttribute("aria-checked", "true");

  const settingsCard = page.locator(".settings-section").first();
  const mainSurface = page.locator("main.student-surface-main");
  const cardShadow = () =>
    settingsCard.evaluate((element) => getComputedStyle(element).boxShadow);
  const mainSurfaceShadow = () =>
    mainSurface.evaluate((element) => getComputedStyle(element).boxShadow);
  await expect.poll(cardShadow).toContain("0px 19px 38px");
  await expect.poll(mainSurfaceShadow).toContain("0px 19px 38px");

  await elevatedSurfaces.click();
  await expect.poll(cardShadow).toBe("none");
  await expect.poll(mainSurfaceShadow).toBe("none");
});

test("dark mode uses distinct contact and ambient shadows for elevated surfaces", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);

  await page.getByRole("radio", { name: /^Dark / }).click();
  const root = page.locator("html");
  const elevatedSurfaces = page.getByRole("switch", {
    name: "Elevated surfaces",
  });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(elevatedSurfaces).toHaveAttribute("aria-checked", "true");

  const settingsCard = page.locator(".settings-section").first();
  const mainSurface = page.locator("main.student-surface-main");
  const shadowOf = (locator: typeof settingsCard) =>
    locator.evaluate((element) => getComputedStyle(element).boxShadow);

  await expect
    .poll(() => shadowOf(settingsCard))
    .toContain("rgba(0, 0, 0, 0.5)");
  await expect
    .poll(() => shadowOf(settingsCard))
    .toContain("rgba(0, 0, 0, 0.54)");
  await expect
    .poll(() => shadowOf(mainSurface))
    .toContain("rgba(0, 0, 0, 0.56)");
  await expect
    .poll(() => shadowOf(mainSurface))
    .toContain("rgba(0, 0, 0, 0.6)");

  await elevatedSurfaces.click();
  await expect.poll(() => shadowOf(settingsCard)).toBe("none");
  await expect.poll(() => shadowOf(mainSurface)).toBe("none");
});

test("dark active sidebar items share the dashboard card elevation", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");
  await page.getByRole("radio", { name: /^Dark / }).click();
  await openApp(page, "/settings/sidebar");

  const root = page.locator("html");
  const elevationToggle = page.getByRole("switch", {
    name: "Elevate sidebar menus",
  });
  if ((await elevationToggle.getAttribute("aria-checked")) !== "true") {
    await elevationToggle.click();
  }
  await expect(root).toHaveAttribute("data-sidebar-menu-elevation", "true");

  await openApp(page, "/");
  const activeHome = page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("button", { name: "Home" });
  const goalSummary = page.locator(".home-goal-summary");
  const shadowOf = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element).boxShadow);

  await expect
    .poll(() => shadowOf(activeHome))
    .toBe(await shadowOf(goalSummary));
});

test("light mode keeps active sidebar items raised and strengthens optional depth", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");

  await page.getByRole("radio", { name: /^Light / }).click();
  const root = page.locator("html");
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const activeMenuItem = sidebar.getByRole("button", { name: "Settings" });
  const activeShadow = () =>
    activeMenuItem.evaluate((element) => getComputedStyle(element).boxShadow);

  await openApp(page, "/settings/sidebar");
  const elevationToggle = page.getByRole("switch", {
    name: "Elevate sidebar menus",
  });
  if ((await elevationToggle.getAttribute("aria-checked")) === "true") {
    await elevationToggle.click();
  }
  await expect(root).toHaveAttribute("data-sidebar-menu-elevation", "false");

  const baseShadow = await activeShadow();
  expect(baseShadow).not.toBe("none");
  expect(baseShadow).not.toContain("inset 0px -");
  expect(baseShadow).toContain("rgba(25, 32, 45");

  await elevationToggle.click();
  await expect(root).toHaveAttribute("data-sidebar-menu-elevation", "true");
  await expect.poll(activeShadow).not.toBe(baseShadow);
  expect(await activeShadow()).toContain("rgba(25, 32, 45");
});

test("light mode keeps toggle thumbs white in every switch state", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");
  await page.getByRole("radio", { name: /^Light / }).click();
  await openApp(page, "/settings/sidebar");

  const elevationToggle = page.getByRole("switch", {
    name: "Elevate sidebar menus",
  });
  const thumb = elevationToggle.locator("span");
  await expect(elevationToggle).toHaveAttribute("aria-checked", "true");
  await expect(thumb).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await elevationToggle.hover();
  await expect(thumb).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await elevationToggle.click();
  await expect(elevationToggle).toHaveAttribute("aria-checked", "false");
  await expect(thumb).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("active dock controls reuse the sidebar menu active surface", async ({
  page,
}) => {
  await openApp(page, "/");
  const dockItems = ["appearance", "theme", "reading-mode", "fullscreen"];
  await updateSidebarPreferences(page, "/", {
    dockItems,
    dockOrder: dockItems,
  });

  const activeNavigation = page.locator(".courses-nav button.is-active");
  const appearanceControls = page.getByRole("group", {
    name: "Appearance controls",
  });
  const activeMode = appearanceControls.locator(":scope > button.is-active");
  const paletteTrigger = appearanceControls.getByRole("button", {
    name: "Choose color theme",
  });
  const activeSurface = async (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
      };
    });
  const expectMatchingSurface = async (selector: string) => {
    expect(await activeSurface(selector)).toEqual(
      await activeSurface(".courses-nav button.is-active"),
    );
  };

  await expect(activeNavigation).toBeVisible();
  await expect(activeMode).toBeVisible();
  await expectMatchingSurface(".sidebar-appearance > button.is-active");

  await paletteTrigger.click();
  await expect(paletteTrigger).toHaveAttribute("aria-pressed", "true");
  await expectMatchingSurface('.sidebar-palette-trigger[aria-pressed="true"]');
  await page.keyboard.press("Escape");

  await activeMode.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectMatchingSurface(".sidebar-appearance > button.is-active");
});

test("mobile bottom navigation keeps its active item flat in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/courses");

  const root = page.locator("html");
  const mobileNavigation = page.getByRole("navigation", {
    name: "Student mobile navigation",
  });
  const mobileActive = mobileNavigation.locator(":scope > button.is-active");
  const activeSurface = async (locator: typeof mobileActive) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      const icon = element.querySelector("svg");
      const label = element.querySelector("small");
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        color: style.color,
        iconColor: icon ? getComputedStyle(icon).color : null,
        labelColor: label ? getComputedStyle(label).color : null,
      };
    });
  const expectFlatActiveState = async () => {
    const mobileSurface = await activeSurface(mobileActive);
    expect(mobileSurface).toMatchObject({
      backgroundColor: "rgba(0, 0, 0, 0)",
      backgroundImage: "none",
      boxShadow: "none",
    });
    expect(mobileSurface.iconColor).toBe(mobileSurface.color);
    expect(mobileSurface.labelColor).toBe(mobileSurface.color);
  };

  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(mobileActive).toBeVisible();
  await expectFlatActiveState();

  await page.evaluate(() => localStorage.setItem("veolms-theme", "light"));
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(mobileActive).toBeVisible();
  await expectFlatActiveState();
});

test("mobile More navigation uses the sidebar selected-surface effect", async ({
  page,
}) => {
  await openApp(page, "/courses");

  const readSelectedSurface = async (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
      };
    });

  const sidebarSurface = await readSelectedSurface(
    ".courses-nav button.is-active",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNavigation = page.getByRole("navigation", {
    name: "Student mobile navigation",
  });
  await mobileNavigation
    .getByRole("button", { name: "More navigation options" })
    .click();

  const drawerActive = page.locator(
    ".mobile-menu-sheet__list > button.is-active",
  );
  await expect(drawerActive).toBeVisible();
  const drawerSurface = await drawerActive.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
    };
  });
  expect(drawerSurface).toEqual(sidebarSurface);
});

test("sidebar navigation clips at the rail edges without moving its menu items", async ({
  page,
}) => {
  await openApp(page, "/courses");

  const readGeometry = () =>
    page.evaluate(() => {
      const sidebar = document.querySelector<HTMLElement>(".courses-sidebar");
      const navigation = sidebar?.querySelector<HTMLElement>(".courses-nav");
      const firstItem = navigation?.querySelector<HTMLElement>("button");
      if (!sidebar || !navigation || !firstItem) {
        throw new Error("Expected sidebar navigation");
      }

      const sidebarRect = sidebar.getBoundingClientRect();
      const navigationRect = navigation.getBoundingClientRect();
      const itemRect = firstItem.getBoundingClientRect();
      return {
        navigationInsets: {
          left: navigationRect.left - sidebarRect.left,
          right: sidebarRect.right - navigationRect.right,
        },
        itemInsets: {
          left: itemRect.left - sidebarRect.left,
          right: sidebarRect.right - itemRect.right,
        },
      };
    });

  const geometry = await readGeometry();

  expect(geometry.navigationInsets.left).toBeCloseTo(0, 1);
  expect(geometry.navigationInsets.right).toBeCloseTo(0, 1);
  expect(geometry.itemInsets.left).toBeCloseTo(14, 1);
  expect(geometry.itemInsets.right).toBeCloseTo(14, 1);

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.locator(".courses-app")).toHaveClass(
    /courses-app--collapsed/,
  );

  const collapsedGeometry = await readGeometry();
  expect(collapsedGeometry.navigationInsets.left).toBeCloseTo(0, 1);
  expect(collapsedGeometry.navigationInsets.right).toBeCloseTo(0, 1);
  expect(collapsedGeometry.itemInsets.left).toBeCloseTo(14, 1);
  expect(collapsedGeometry.itemInsets.right).toBeCloseTo(14, 1);
});

test("role, appearance, and academy palette persist across routes and reloads", async ({
  page,
}) => {
  await openApp(page, "/");
  const dockItems = ["appearance", "theme", "reading-mode", "fullscreen"];
  await updateSidebarPreferences(page, "/", {
    dockItems,
    dockOrder: dockItems,
  });
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const appearanceControls = sidebar.getByRole("group", {
    name: "Appearance controls",
  });
  const appearanceIcons = appearanceControls.locator(
    ":scope > button > svg, :scope > .sidebar-palette-wrap > button > svg",
  );
  const expectIconsToMatchTheme = async () => {
    const themeColor = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--accent-ink, var(--accent))";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    const iconColors = await appearanceIcons.evaluateAll((icons) =>
      icons.map((icon) => getComputedStyle(icon).color),
    );
    expect(iconColors).toEqual([
      themeColor,
      themeColor,
      themeColor,
      themeColor,
    ]);
  };

  await expect(appearanceControls.getByRole("button")).toHaveCount(4);
  await expectIconsToMatchTheme();
  await expect(
    appearanceControls.getByRole("button").nth(0),
  ).toHaveAccessibleName("Dark mode active. Switch to light mode");
  await expect(appearanceControls.getByRole("button").nth(0)).toHaveAttribute(
    "title",
    "Dark mode - switch to light mode",
  );
  await expect(
    appearanceControls.getByRole("button").nth(1),
  ).toHaveAccessibleName("Choose color theme");
  await expect(appearanceControls.getByRole("button").nth(1)).toHaveAttribute(
    "title",
    "Choose color theme",
  );
  await expect(
    appearanceControls.getByRole("button").nth(2),
  ).toHaveAccessibleName("Turn reading mode on");
  await expect(appearanceControls.getByRole("button").nth(2)).toHaveAttribute(
    "title",
    "Reading mode - off",
  );
  await expect(
    appearanceControls.getByRole("button").nth(3),
  ).toHaveAccessibleName("Fullscreen");
  await expect(appearanceControls.getByRole("button").nth(3)).toHaveAttribute(
    "title",
    "Fullscreen",
  );

  const modeControl = appearanceControls.getByRole("button").nth(0);
  await modeControl.click({ button: "right" });
  const contextPaletteMenu = page.getByRole("menu", {
    name: "Choose a color theme",
  });
  await expect(contextPaletteMenu).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(contextPaletteMenu).toBeHidden();

  await appearanceControls
    .getByRole("button", { name: /Switch to light mode/ })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "light",
  );
  await expectStoredValue(page, "veolms-theme", "light");
  await expectIconsToMatchTheme();
  await expect(
    appearanceControls.getByRole("button").nth(0),
  ).toHaveAccessibleName("Light mode active. Switch to dark mode");

  await appearanceControls
    .getByRole("button", { name: "Choose color theme" })
    .click();
  const paletteMenu = page.getByRole("menu", { name: "Choose a color theme" });
  await page.getByRole("menuitemradio", { name: /Ocean Blue/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
  await expectStoredValue(page, "veolms-academy-theme", "ocean");
  await expectIconsToMatchTheme();
  await expect(paletteMenu).toBeVisible();

  await sidebar
    .getByRole("button", { name: "Open role and appearance menu" })
    .click({ position: { x: 24, y: 24 } });
  await expect(paletteMenu).toBeHidden();
  await page.evaluate(() => localStorage.setItem("veolms-role", "creator"));
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Creator navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Good afternoon, Anurag/ }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-role", "creator");

  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Creator navigation" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");

  await page
    .getByRole("complementary", { name: "Creator navigation" })
    .getByRole("button", { name: "Courses" })
    .click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
});

test("toggling appearance dismisses the open desktop theme menu", async ({
  page,
}) => {
  await openApp(page, "/");
  const dockItems = ["appearance", "theme", "reading-mode", "fullscreen"];
  await updateSidebarPreferences(page, "/", {
    dockItems,
    dockOrder: dockItems,
  });
  const appearanceControls = page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("group", { name: "Appearance controls" });
  const modeToggle = appearanceControls.getByRole("button").nth(0);
  const paletteMenu = page.getByRole("menu", {
    name: "Choose a color theme",
  });

  await appearanceControls
    .getByRole("button", { name: "Choose color theme" })
    .click();
  await expect(paletteMenu).toBeVisible();

  await modeToggle.click();
  await expect(paletteMenu).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectStoredValue(page, "veolms-theme", "light");
});

test("theme picker keeps pointer choices open and makes keyboard previews reversible", async ({
  page,
}) => {
  await openApp(page, "/");
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const trigger = sidebar
    .getByRole("group", { name: "Appearance controls" })
    .getByRole("button")
    .nth(0);
  const openThemeMenu = () => trigger.click({ button: "right" });

  await openThemeMenu();
  const menu = page.getByRole("menu", { name: "Choose a color theme" });
  const graphite = menu.getByRole("menuitemradio", {
    name: /Graphite Studio/,
  });
  const ocean = menu.getByRole("menuitemradio", { name: /Ocean Blue/ });

  await expect(graphite).toBeFocused();
  await expect(graphite).toHaveAttribute("title", "Graphite Studio");
  const paletteMaterial = await graphite.evaluate((button) => {
    const swatch = button.querySelector("i");
    if (!swatch) throw new Error("Theme swatch surface is missing");
    const menu = button.parentElement;
    if (!menu) throw new Error("Theme menu surface is missing");
    const menuRect = menu.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const swatchRect = swatch.getBoundingClientRect();
    const menuStyles = getComputedStyle(menu);
    const buttonStyles = getComputedStyle(button);
    const swatchStyles = getComputedStyle(swatch);
    const countShadowLayers = (value: string) =>
      value.match(/(?:rgba?|color)\(/g)?.length ?? 0;
    return {
      menuWidth: menuRect.width,
      menuRadius: Number.parseFloat(menuStyles.borderRadius),
      gridGap: Number.parseFloat(menuStyles.columnGap),
      buttonSquareDelta: Math.abs(buttonRect.width - buttonRect.height),
      swatchSquareDelta: Math.abs(swatchRect.width - swatchRect.height),
      swatchSize: swatchRect.width,
      menuShadowLayers: countShadowLayers(menuStyles.boxShadow),
      selectedBorderLayers: countShadowLayers(buttonStyles.boxShadow),
      selectedInsetLayers: buttonStyles.boxShadow.match(/inset/g)?.length ?? 0,
      selectedBorderColor: buttonStyles.borderTopColor,
      selectedBorderStyle: buttonStyles.borderTopStyle,
      selectedBackgroundImage: buttonStyles.backgroundImage,
      menuBackgroundBlendMode: menuStyles.backgroundBlendMode,
      menuBackgroundImage: menuStyles.backgroundImage,
      selectedBorderWidth: Number.parseFloat(buttonStyles.borderTopWidth),
      selectedTransitionProperty: buttonStyles.transitionProperty,
      swatchDepthLayers: countShadowLayers(swatchStyles.boxShadow),
      swatchBackgroundImage: swatchStyles.backgroundImage,
      swatchTransform: swatchStyles.transform,
    };
  });
  expect(paletteMaterial.menuWidth).toBeCloseTo(216, 0);
  expect(paletteMaterial.menuRadius).toBe(24);
  expect(paletteMaterial.gridGap).toBe(4);
  expect(paletteMaterial.buttonSquareDelta).toBeLessThan(0.5);
  expect(paletteMaterial.swatchSquareDelta).toBeLessThan(0.5);
  expect(paletteMaterial.swatchSize).toBeGreaterThanOrEqual(35);
  expect(paletteMaterial.swatchSize).toBeLessThanOrEqual(38);
  expect(paletteMaterial.menuShadowLayers).toBeGreaterThanOrEqual(4);
  expect(paletteMaterial.selectedBorderLayers).toBeGreaterThanOrEqual(3);
  expect(paletteMaterial.selectedInsetLayers).toBe(1);
  expect(paletteMaterial.selectedBorderColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(paletteMaterial.selectedBorderStyle).toBe("solid");
  expect(paletteMaterial.selectedBackgroundImage).toBe("none");
  expect(paletteMaterial.menuBackgroundBlendMode).toBe("soft-light");
  expect(paletteMaterial.menuBackgroundImage).toContain(
    "theme-menu-grain.webp",
  );
  expect(paletteMaterial.selectedBorderWidth).toBe(3);
  expect(paletteMaterial.selectedTransitionProperty).toContain("transform");
  expect(paletteMaterial.swatchDepthLayers).toBe(2);
  expect(paletteMaterial.swatchBackgroundImage).toBe("none");
  expect(paletteMaterial.swatchTransform).toBe("none");

  const graphiteBounds = await graphite.boundingBox();
  expect(graphiteBounds).not.toBeNull();
  await page.mouse.move(
    graphiteBounds!.x + graphiteBounds!.width / 2,
    graphiteBounds!.y + graphiteBounds!.height / 2,
  );
  await page.mouse.down();
  await expect
    .poll(() =>
      graphite.evaluate((button) => {
        const transform = getComputedStyle(button).transform;
        return transform === "none" ? 1 : new DOMMatrix(transform).a;
      }),
    )
    .toBeCloseTo(0.985, 2);
  await page.mouse.up();
  await ocean.hover();
  await expect(page.locator("html")).toHaveAttribute(
    "data-palette",
    "graphite",
  );
  await expectStoredValue(page, "veolms-academy-theme", "graphite");

  await page.keyboard.press("ArrowRight");
  const copper = menu.getByRole("menuitemradio", { name: /Copper Slate/ });
  await expect(copper).toBeFocused();
  await expect(copper).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "violet");
  await expectStoredValue(page, "veolms-academy-theme", "graphite");

  await page.keyboard.press("ArrowLeft");
  await expect(graphite).toBeFocused();
  await expect(graphite).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press("ArrowDown");
  const grove = menu.getByRole("menuitemradio", { name: /Grove Green/ });
  await expect(grove).toBeFocused();
  await expect(grove).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "grove");
  await expectStoredValue(page, "veolms-academy-theme", "graphite");

  await page.keyboard.press("ArrowUp");
  await expect(graphite).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(grove).toBeFocused();

  await page.keyboard.press("End");
  const lime = menu.getByRole("menuitemradio", { name: /Electric Lime/ });
  const onyx = menu.getByRole("menuitemradio", { name: /Veo Onyx/ });
  await expect(lime).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(onyx).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(lime).toBeFocused();

  await page
    .locator("#courses-main-scrollport")
    .click({ position: { x: 20, y: 20 } });
  await expect(menu).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute(
    "data-palette",
    "graphite",
  );

  await openThemeMenu();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "grove");
  await expectStoredValue(page, "veolms-academy-theme", "grove");

  await openThemeMenu();
  await ocean.click();
  await expect(menu).toBeVisible();
  await expect(ocean).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
  await expectStoredValue(page, "veolms-academy-theme", "ocean");

  const brainwave = menu.getByRole("menuitemradio", {
    name: /Brainwave Slate/,
  });
  await brainwave.click();
  await expect(brainwave).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute(
    "data-palette",
    "brainwave",
  );
  await expectStoredValue(page, "veolms-academy-theme", "brainwave");
  await expect
    .poll(() =>
      page.locator("html").evaluate((root) => {
        const styles = getComputedStyle(root);
        return {
          shell: styles.getPropertyValue("--app-shell").trim(),
          workspace: styles.getPropertyValue("--main-surface").trim(),
          raised: styles.getPropertyValue("--surface").trim(),
          selected: styles.getPropertyValue("--selected").trim(),
          accent: styles.getPropertyValue("--accent").trim(),
        };
      }),
    )
    .toEqual({
      shell: "#151718",
      workspace: "#242627",
      raised: "#343839",
      selected: "#323337",
      accent: "#0085ff",
    });
});

test("double-clicking the brand header opens temporary floating navigation until pointer leave", async ({
  page,
}) => {
  await openApp(
    page,
    "/learn/javascript-course/what-is-ui-ux-design?from=home",
  );

  const app = page.locator(".courses-app");
  const sidebar = page.locator(".courses-sidebar");
  const brand = sidebar.locator(".courses-sidebar__brand");
  await expect(brand).toHaveAttribute("title", "Double-click to float sidebar");
  await brand.dblclick({ position: { x: 120, y: 2 } });

  await expect(app).toHaveClass(/courses-app--hidden/);
  await expect(app).toHaveClass(/courses-app--edge-open/);
  await expect(sidebar).toBeVisible();
  await expect(sidebar).not.toHaveAttribute("inert", "");
  const pinNavigation = sidebar.getByRole("button", {
    name: "Pin navigation",
  });
  await expect(pinNavigation).toBeVisible();
  await expect(pinNavigation).toHaveAttribute("title", "Pin (Ctrl+B)");
  await expect(brand).toHaveAttribute("title", "Double-click to pin sidebar");
  await expectStoredValue(page, "veolms-sidebar-mode", "hidden");

  const sidebarBox = await sidebar.boundingBox();
  expect(sidebarBox).not.toBeNull();
  await page.mouse.move(
    sidebarBox!.x + sidebarBox!.width / 2,
    sidebarBox!.y + sidebarBox!.height / 2,
  );
  await expect(app).toHaveClass(/courses-app--edge-open/);

  await page.mouse.move(900, 400);
  await expect(app).not.toHaveClass(/courses-app--edge-open/);
  await expect(sidebar).toHaveAttribute("inert", "");
});

test("single-clicking the floating pin control restores the fixed sidebar", async ({
  page,
}) => {
  await openApp(
    page,
    "/learn/javascript-course/what-is-ui-ux-design?from=home",
  );

  const app = page.locator(".courses-app");
  const sidebar = page.locator(".courses-sidebar");
  await sidebar
    .locator(".courses-sidebar__brand")
    .dblclick({ position: { x: 120, y: 2 } });
  await expect(app).toHaveClass(/courses-app--hidden/);
  await expect(app).toHaveClass(/courses-app--edge-open/);

  await sidebar.getByRole("button", { name: "Pin navigation" }).click();
  await expect(app).not.toHaveClass(/courses-app--hidden/, { timeout: 200 });
  await expect(app).not.toHaveClass(/courses-app--edge-open/);
  await expect(sidebar).not.toHaveAttribute("inert", "");
  await expect(
    sidebar.getByRole("button", { name: "Collapse navigation" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-sidebar-mode", "expanded");
});

test("sidebar collapse and hide shortcuts persist without losing navigation", async ({
  page,
}) => {
  await openApp(page, "/courses");

  const navigationIconTops = () =>
    page
      .locator(".courses-nav button > svg")
      .evaluateAll((icons) =>
        icons.map((icon) => icon.getBoundingClientRect().top),
      );
  const expandedIconTops = await navigationIconTops();

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-sidebar-mode", "collapsed");
  await expect(page.locator(".courses-logo-clip")).toHaveCSS(
    "left",
    "19.375px",
  );
  const collapsedIconTops = await navigationIconTops();
  expect(
    Math.max(
      ...expandedIconTops.map((top, index) =>
        Math.abs(top - collapsedIconTops[index]!),
      ),
    ),
  ).toBeLessThan(0.05);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();

  const resizeRail = page.getByRole("separator", { name: "Resize sidebar" });
  await resizeRail.dblclick();
  await expect(
    page.getByRole("button", { name: "Collapse navigation" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-sidebar-mode", "expanded");

  await resizeRail.dblclick();
  await expect(
    page.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-sidebar-mode", "collapsed");

  await resizeRail.dblclick();
  await expect(
    page.getByRole("button", { name: "Collapse navigation" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-sidebar-mode", "expanded");

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();

  await page.keyboard.press("Control+b");
  await expect(
    page.getByRole("button", { name: "Collapse navigation" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-sidebar-mode", "expanded");
  const restoredIconTops = await navigationIconTops();
  expect(
    Math.max(
      ...expandedIconTops.map((top, index) =>
        Math.abs(top - restoredIconTops[index]!),
      ),
    ),
  ).toBeLessThan(0.05);

  await openApp(page, "/settings/sidebar");
  await page.getByRole("switch", { name: "Hide sidebar" }).click();
  await expectStoredValue(page, "veolms-sidebar-mode", "hidden");
  await expect(page.locator(".courses-sidebar")).toHaveAttribute("inert", "");

  await page.keyboard.press("Control+Alt+b");
  await expectStoredValue(page, "veolms-sidebar-mode", "hidden");

  await page.keyboard.press("Control+b");
  await expectStoredValue(page, "veolms-sidebar-mode", "expanded");
  await expect(
    page.getByRole("complementary", { name: "Student navigation" }),
  ).toBeVisible();
});

test("moving header control swaps with the compact logo without showing both", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const preferences = JSON.parse(
      window.localStorage.getItem("veolms-sidebar-preferences") || "{}",
    );
    window.localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        ...preferences,
        headerLayout: "inline",
        showCollapsedLogo: true,
      }),
    );
    window.localStorage.setItem("veolms-sidebar-mode", "collapsed");
  });
  await openApp(page, "/settings/sidebar");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const logo = sidebar.getByRole("img", { name: "ProCodrr" });
  const expand = sidebar.getByRole("button", { name: "Expand navigation" });

  await page.getByRole("main").hover();
  await expect(logo).toHaveCSS("opacity", "1");
  await expect(expand).toHaveCSS("opacity", "0");
  const collapsedLogoLeft = await logo
    .locator("svg path")
    .first()
    .evaluate((path) => path.getBoundingClientRect().left);
  await sidebar.hover();
  await expect(logo).toHaveCSS("opacity", "0");
  await expect(expand).toHaveCSS("opacity", "1");
  await expand.click();
  const collapse = sidebar.getByRole("button", {
    name: "Collapse navigation",
  });
  await expect(collapse).toBeVisible();
  const expandedAlignment = await page.evaluate(() => {
    const logoPath = document.querySelector<SVGPathElement>(
      ".courses-logo-clip svg path",
    );
    const navigationIcon = document.querySelector<SVGElement>(
      ".courses-nav button > svg",
    );
    if (!logoPath || !navigationIcon) {
      throw new Error("Expected sidebar header alignment targets");
    }
    const navigationShapes = navigationIcon.querySelectorAll(
      "path, rect, line, polyline, polygon, circle",
    );
    if (!navigationShapes.length) {
      throw new Error("Expected a painted navigation glyph");
    }
    return {
      logo: logoPath.getBoundingClientRect().left,
      navigationIcon: Math.min(
        ...[...navigationShapes].map(
          (shape) => shape.getBoundingClientRect().left,
        ),
      ),
    };
  });
  expect(Math.abs(collapsedLogoLeft - expandedAlignment.logo)).toBeLessThan(1);
  expect(
    Math.abs(expandedAlignment.logo - expandedAlignment.navigationIcon),
  ).toBeLessThan(1);

  await collapse.click();
  await expect(expand).toBeVisible();

  await page.getByRole("switch", { name: "Show logo when collapsed" }).click();
  await page.getByRole("main").hover();
  await expect(logo).toBeHidden();
  await expect(expand).toHaveCSS("opacity", "1");
  await expect(expand).toHaveCSS("pointer-events", "auto");
});

test("sidebar wordmark aligns with navigation text and crops throughout a continuous collapse drag", async ({
  page,
}) => {
  const path = "/learn/ui-ux-design-mastery?from=courses";
  await openApp(page, path);
  await page.evaluate(() => {
    window.localStorage.setItem("veolms-sidebar-mode", "expanded");
    window.localStorage.setItem("veolms-sidebar-width", "300");
  });
  await updateSidebarPreferences(page, path, { headerLayout: "fixed" });

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const logo = sidebar.getByRole("img", { name: "ProCodrr" });
  const homeLabel = sidebar
    .getByRole("button", { name: "Home" })
    .locator(".courses-nav__text");

  const alignedLeftEdges = await page.evaluate(() => {
    const logoPath = document.querySelector<SVGPathElement>(
      ".courses-logo-clip svg path",
    );
    const label = [
      ...document.querySelectorAll<HTMLElement>(".courses-nav__text"),
    ].find((element) => element.textContent?.trim() === "Home");
    if (!logoPath || !label)
      throw new Error("Sidebar alignment targets missing");
    return {
      logo: logoPath.getBoundingClientRect().left,
      label: label.getBoundingClientRect().left,
    };
  });
  expect(Math.abs(alignedLeftEdges.logo - alignedLeftEdges.label)).toBeLessThan(
    1,
  );

  const resize = page.getByRole("separator", { name: "Resize sidebar" });
  const resizeBox = await resize.boundingBox();
  expect(resizeBox).not.toBeNull();
  const startX = resizeBox!.x + resizeBox!.width / 2;
  const dragY = resizeBox!.y + Math.min(180, resizeBox!.height / 2);

  await page.mouse.move(startX, dragY);
  await page.mouse.down();
  await page.mouse.move(startX - 170, dragY);
  await expect(page.locator(".courses-app")).not.toHaveClass(
    /courses-app--collapsed/,
  );
  await expect(page.locator(".courses-app")).toHaveClass(
    /courses-app--resizing/,
  );

  const crop = await page.evaluate(() => {
    const sidebarElement =
      document.querySelector<HTMLElement>(".courses-sidebar");
    const logoElement =
      document.querySelector<HTMLElement>(".courses-logo-clip");
    if (!sidebarElement || !logoElement) {
      throw new Error("Sidebar crop targets missing");
    }
    const sidebarRect = sidebarElement.getBoundingClientRect();
    const logoRect = logoElement.getBoundingClientRect();
    return {
      overflowX: getComputedStyle(sidebarElement).overflowX,
      opacity: getComputedStyle(logoElement).opacity,
      visibleWidth: Math.max(
        0,
        Math.min(sidebarRect.right, logoRect.right) -
          Math.max(sidebarRect.left, logoRect.left),
      ),
      logoWidth: logoRect.width,
    };
  });
  expect(crop.overflowX).toMatch(/clip|hidden/);
  expect(crop.opacity).toBe("1");
  expect(crop.visibleWidth).toBeGreaterThan(0);
  expect(crop.visibleWidth).toBeLessThan(156);

  await page.mouse.up();
  await expect(logo).toBeVisible();
});

test("profile control keeps equal avatar padding and a fixed height while the sidebar resizes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-sidebar-mode", "expanded");
  });
  await openApp(page, "/");

  const app = page.locator(".courses-app");
  const profileButton = page.locator(".courses-profile__button");
  const appearanceControls = page.locator(".sidebar-appearance");
  const profileGeometry = () =>
    page.evaluate(() => {
      const button = document.querySelector<HTMLElement>(
        ".courses-profile__button",
      );
      const avatar = button?.querySelector<HTMLElement>(
        ".shell-profile-avatar",
      );
      const navigationIcon = document.querySelector<SVGElement>(
        ".courses-nav button > svg",
      );
      if (!button || !avatar || !navigationIcon) {
        throw new Error("Expected profile alignment targets");
      }
      const buttonRect = button.getBoundingClientRect();
      const avatarRect = avatar.getBoundingClientRect();
      const navigationRect = navigationIcon.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        buttonHeight: buttonRect.height,
        buttonWidth: buttonRect.width,
        padding: [
          style.paddingTop,
          style.paddingRight,
          style.paddingBottom,
          style.paddingLeft,
        ],
        avatarInsets: {
          top: avatarRect.top - buttonRect.top,
          right: buttonRect.right - avatarRect.right,
          bottom: buttonRect.bottom - avatarRect.bottom,
          left: avatarRect.left - buttonRect.left,
        },
        avatarCenter: avatarRect.left + avatarRect.width / 2,
        navigationCenter: navigationRect.left + navigationRect.width / 2,
      };
    });
  const appearanceGeometry = () =>
    page.evaluate(() => {
      const controls = document.querySelector<HTMLElement>(
        ".sidebar-appearance",
      );
      if (!controls) {
        throw new Error("Expected sidebar appearance controls");
      }
      const rect = controls.getBoundingClientRect();
      const style = getComputedStyle(controls);
      return {
        height: rect.height,
        gap: style.gap,
        padding: [
          style.paddingTop,
          style.paddingRight,
          style.paddingBottom,
          style.paddingLeft,
        ],
      };
    });

  const expanded = await profileGeometry();
  expect(expanded.buttonHeight).toBe(57);
  expect(new Set(expanded.padding)).toEqual(new Set(["7px"]));
  expect(expanded.avatarInsets.top).toBe(expanded.avatarInsets.bottom);
  expect(expanded.avatarInsets.left).toBe(expanded.avatarInsets.top);
  expect(expanded.avatarCenter).toBe(expanded.navigationCenter);
  const expandedAppearance = await appearanceGeometry();
  expect(expandedAppearance.height).toBe(50);
  expect(expandedAppearance.gap).toBe("8px");
  expect(expandedAppearance.padding).toEqual(["6px", "8px", "6px", "8px"]);

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(app).toHaveClass(/courses-app--collapsed/);
  const collapsed = await profileGeometry();
  expect(collapsed.buttonHeight).toBe(57);
  expect(collapsed.buttonWidth).toBe(57);
  expect(new Set(Object.values(collapsed.avatarInsets))).toEqual(new Set([7]));
  expect(collapsed.avatarCenter).toBe(collapsed.navigationCenter);
  expect(new Set((await appearanceGeometry()).padding)).toEqual(
    new Set(["8px"]),
  );
  expect((await appearanceGeometry()).gap).toBe("8px");

  const rail = page.getByRole("separator", { name: "Resize sidebar" });
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();
  const startX = railBox!.x + railBox!.width / 2;
  const startY = railBox!.y + 180;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 30, startY);
  await expect(app).toHaveClass(/courses-app--resizing/);
  await expect(profileButton).toHaveCSS("height", "57px");
  await expect(appearanceControls).toHaveCSS("padding", "8px");
  expect((await profileGeometry()).padding).toEqual([
    "7px",
    "7px",
    "7px",
    "7px",
  ]);
  await page.mouse.up();
});

test("sidebar wordmark and profile copy wait for an intentional expansion drag", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-sidebar-mode", "collapsed");
  });
  await openApp(page, "/learn/ui-ux-design-mastery?from=courses");

  const app = page.locator(".courses-app");
  const rail = page.getByRole("separator", { name: "Resize sidebar" });
  const logo = page.locator(".courses-logo-clip");
  const profileButton = page.locator(".courses-profile__button");
  const profileCopy = page.locator(".courses-profile__button > span");
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();
  const startX = railBox!.x + railBox!.width / 2;
  const startY = railBox!.y + Math.min(180, railBox!.height / 2);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(app).toHaveClass(/courses-app--resizing/);
  await expect(app).not.toHaveClass(/courses-app--resize-content-visible/);
  await expect(logo).toHaveCSS("opacity", "0");
  await expect(profileCopy).toHaveCSS("max-width", "0px");

  await page.mouse.move(startX + 16, startY);
  await expect(app).not.toHaveClass(/courses-app--resize-content-visible/);
  await expect(logo).toHaveCSS("opacity", "0");
  await expect(profileCopy).toHaveCSS("max-width", "0px");

  await page.mouse.move(startX + 28, startY);
  await expect(app).toHaveClass(/courses-app--resize-content-visible/);
  await expect(logo).toHaveCSS("opacity", "1");
  await expect(profileButton).toHaveCSS("gap", "12px");
  await expect(profileCopy).toHaveCSS("max-width", "190px");
  const profileSpacing = await page.evaluate(() => {
    const avatar = document.querySelector(
      ".courses-profile__button > .shell-profile-avatar",
    );
    const copy = document.querySelector(".courses-profile__button > span");
    if (!avatar || !copy) throw new Error("Expected profile spacing targets");
    return (
      copy.getBoundingClientRect().left - avatar.getBoundingClientRect().right
    );
  });
  expect(profileSpacing).toBeGreaterThanOrEqual(11.9);

  await page.mouse.up();
  await expect(app).not.toHaveClass(/courses-app--resize-content-visible/);
  await page.mouse.move(startX + 100, startY);
  await expect(logo).toHaveCSS("opacity", "1");
  await expect(logo).toHaveCSS("max-width", "21px");
  await expect(profileCopy).toHaveCSS("max-width", "0px");
});

test("appearance controls grow with the sidebar before animating into a horizontal row when space is available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-reduce-animations", "false");
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element["animate"]>
    ) {
      if (this.parentElement?.classList.contains("sidebar-appearance")) {
        const current = Number(
          document.documentElement.dataset.appearanceAnimationCount || "0",
        );
        document.documentElement.dataset.appearanceAnimationCount = String(
          current + 1,
        );
      }
      return originalAnimate.apply(this, args);
    };
  });
  const path = "/learn/ui-ux-design-mastery";
  await openApp(page, path);
  const dockItems = ["appearance", "theme", "reading-mode", "fullscreen"];
  await updateSidebarPreferences(page, path, {
    dockItems,
    dockOrder: dockItems,
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    window.localStorage.setItem("veolms-reduce-animations", "false");
    document.documentElement.dataset.reduceAnimations = "false";
  });

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const appearance = sidebar.getByRole("group", {
    name: "Appearance controls",
  });
  const layoutItems = appearance.locator(
    ":scope > button, :scope > .sidebar-palette-wrap",
  );
  const itemCenters = () =>
    layoutItems.evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }),
    );
  const appearanceWidth = () =>
    appearance.evaluate((element) => element.getBoundingClientRect().width);
  const profileWidth = () =>
    sidebar
      .locator(".courses-profile__button")
      .evaluate((element) => element.getBoundingClientRect().width);
  const navigationIconTops = () =>
    sidebar
      .locator(".courses-nav button > svg")
      .evaluateAll((icons) =>
        icons.map((icon) => icon.getBoundingClientRect().top),
      );
  const maximumNavigationShift = async (reference: number[]) => {
    const current = await navigationIconTops();
    return Math.max(
      ...reference.map((top, index) => Math.abs(top - current[index]!)),
    );
  };

  await sidebar.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(appearance).toHaveClass(/sidebar-appearance--vertical/);
  await page.waitForTimeout(280);
  const verticalCenters = await itemCenters();
  const collapsedAppearanceWidth = await appearanceWidth();
  const collapsedNavigationTops = await navigationIconTops();
  expect(verticalCenters).toHaveLength(4);
  expect(verticalCenters[0]!.x).toBeCloseTo(verticalCenters[1]!.x, 0);
  expect(verticalCenters[1]!.x).toBeCloseTo(verticalCenters[2]!.x, 0);
  expect(verticalCenters[2]!.x).toBeCloseTo(verticalCenters[3]!.x, 0);
  expect(verticalCenters[0]!.y).toBeLessThan(verticalCenters[1]!.y);
  expect(verticalCenters[1]!.y).toBeLessThan(verticalCenters[2]!.y);
  expect(verticalCenters[2]!.y).toBeLessThan(verticalCenters[3]!.y);

  const rail = page.getByRole("separator", { name: "Resize sidebar" });
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();
  const startX = railBox!.x + railBox!.width / 2;
  const startY = railBox!.y + 180;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(page.locator(".courses-app")).toHaveClass(
    /courses-app--resizing/,
  );
  await expect
    .poll(() => maximumNavigationShift(collapsedNavigationTops))
    .toBeLessThan(0.05);
  await page.mouse.move(startX + 60, startY);
  await expect(appearance).toHaveClass(/sidebar-appearance--vertical/);
  await expect
    .poll(() => maximumNavigationShift(collapsedNavigationTops))
    .toBeLessThan(0.05);
  await expect
    .poll(appearanceWidth)
    .toBeGreaterThan(collapsedAppearanceWidth + 40);
  await expect
    .poll(async () =>
      Math.abs((await appearanceWidth()) - (await profileWidth())),
    )
    .toBeLessThan(1);

  const growingVerticalCenters = await itemCenters();
  expect(growingVerticalCenters[0]!.x).toBeCloseTo(
    growingVerticalCenters[1]!.x,
    0,
  );
  expect(growingVerticalCenters[1]!.x).toBeCloseTo(
    growingVerticalCenters[2]!.x,
    0,
  );
  expect(growingVerticalCenters[2]!.x).toBeCloseTo(
    growingVerticalCenters[3]!.x,
    0,
  );

  await page.mouse.move(startX + 80, startY);
  await expect(appearance).toHaveClass(/sidebar-appearance--vertical/);
  await page.mouse.move(startX + 150, startY);
  await expect(appearance).toHaveClass(/sidebar-appearance--horizontal/);
  await expect
    .poll(() => maximumNavigationShift(collapsedNavigationTops))
    .toBeLessThan(0.05);
  await expect
    .poll(async () =>
      Number(
        (await page
          .locator("html")
          .getAttribute("data-appearance-animation-count")) || "0",
      ),
    )
    .toBeGreaterThanOrEqual(4);

  await page.waitForTimeout(280);
  const horizontalCenters = await itemCenters();
  expect(horizontalCenters[0]!.y).toBeCloseTo(horizontalCenters[1]!.y, 0);
  expect(horizontalCenters[1]!.y).toBeCloseTo(horizontalCenters[2]!.y, 0);
  expect(horizontalCenters[2]!.y).toBeCloseTo(horizontalCenters[3]!.y, 0);
  expect(horizontalCenters[0]!.x).toBeLessThan(horizontalCenters[1]!.x);
  expect(horizontalCenters[1]!.x).toBeLessThan(horizontalCenters[2]!.x);
  expect(horizontalCenters[2]!.x).toBeLessThan(horizontalCenters[3]!.x);
  await page.mouse.up();
});

test("mobile More dialog traps the workflow and restores focus on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/courses");

  const mobileNavigation = page.getByRole("navigation", {
    name: "Student mobile navigation",
  });
  await expect(mobileNavigation).toBeVisible();
  const more = mobileNavigation.getByRole("button", {
    name: "More navigation options",
  });
  await more.click();

  const dialog = page.getByRole("dialog", { name: /More/ });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");
  await expect(dialog).toBeFocused();
  await expect(dialog.getByRole("button", { name: /close/i })).toHaveCount(0);

  const swipeHandle = dialog.locator('[data-slot="drawer-swipe-handle"]');
  const swipeHandleBounds = await swipeHandle.boundingBox();
  expect(swipeHandleBounds).not.toBeNull();
  await page.mouse.move(
    swipeHandleBounds!.x + swipeHandleBounds!.width / 2,
    swipeHandleBounds!.y + swipeHandleBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    swipeHandleBounds!.x + swipeHandleBounds!.width / 2,
    8,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  await expect(dialog).toHaveAttribute("data-expanded", "");
  await expect
    .poll(
      async () => (await dialog.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    )
    .toBeLessThanOrEqual(1);

  const focusable = dialog.locator(
    "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
  );
  await page.keyboard.press("Shift+Tab");
  await expect(focusable.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(focusable.first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(more).toBeFocused();
});

test("mobile More navigation clears its drawer history before routing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/courses");

  await page.getByRole("button", { name: "More navigation options" }).click();
  const dialog = page.getByRole("dialog", { name: /More/ });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Home", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(dialog).toBeHidden();
});

test("dismissing More clears a desktop reading menu hidden by a viewport change", async ({
  page,
}) => {
  await openApp(page, "/courses");
  const desktopReadingModeControl = page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("button", { name: "Turn reading mode on" });
  const quickSettings = page.getByRole("dialog", {
    name: "Reading mode quick settings",
  });

  await desktopReadingModeControl.click({ button: "right" });
  await expect(quickSettings).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(quickSettings).toBeHidden();
  const more = page
    .getByRole("navigation", { name: "Student mobile navigation" })
    .getByRole("button", { name: "More navigation options" });
  await more.click();
  const moreDialog = page.getByRole("dialog", { name: /More/ });
  await expect(moreDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(moreDialog).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(quickSettings).toBeHidden();
});

test("mobile More drawer keeps five dock controls in one touch-friendly row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openApp(page, "/courses");
  await page.evaluate(() => {
    const current = JSON.parse(
      localStorage.getItem("veolms-sidebar-preferences") || "{}",
    ) as Record<string, unknown>;
    const dockItems = [
      "appearance",
      "theme",
      "reading-mode",
      "fullscreen",
      "settings",
    ];
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ ...current, dockItems, dockOrder: dockItems }),
    );
  });
  await page.reload();

  await page.getByRole("button", { name: "More navigation options" }).click();
  const controls = page
    .getByRole("dialog", { name: /More/ })
    .getByRole("group", { name: "Appearance controls" });
  const buttons = controls.locator(":scope > button");
  await expect(buttons).toHaveCount(5);

  const geometry = await buttons.evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    }),
  );
  const rowTop = geometry[0]!.top;
  expect(
    Math.max(...geometry.map(({ top }) => Math.abs(top - rowTop))),
  ).toBeLessThan(0.5);
  for (const item of geometry) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
  }
  const controlsBox = await controls.boundingBox();
  expect(controlsBox).not.toBeNull();
  expect(geometry.at(-1)!.right).toBeLessThanOrEqual(
    controlsBox!.x + controlsBox!.width,
  );
});

test("mobile More navigation reaches both drawer edges without clipping item shadows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/courses");

  await page.getByRole("button", { name: "More navigation options" }).click();
  const dialog = page.getByRole("dialog", { name: /More/ });
  const body = dialog.locator(".mobile-menu-sheet__body");
  const list = dialog.locator(".mobile-menu-sheet__list");
  const activeItem = list.locator(":scope > button.is-active");
  await expect(activeItem).toBeVisible();

  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>(
      "#mobile-navigation-sheet",
    );
    const body = dialog?.querySelector<HTMLElement>(".mobile-menu-sheet__body");
    const list = dialog?.querySelector<HTMLElement>(".mobile-menu-sheet__list");
    const activeItem = list?.querySelector<HTMLElement>(
      ":scope > button.is-active",
    );
    if (!dialog || !body || !list || !activeItem) return null;

    const dialogBounds = dialog.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    const itemBounds = activeItem.getBoundingClientRect();
    const listStyle = getComputedStyle(list);
    return {
      bodyOverflow: getComputedStyle(body).overflow,
      dialogLeft: dialogBounds.left,
      dialogRight: dialogBounds.right,
      listLeft: listBounds.left,
      listRight: listBounds.right,
      itemLeft: itemBounds.left,
      itemRight: itemBounds.right,
      paddingTop: Number.parseFloat(listStyle.paddingTop),
      paddingRight: Number.parseFloat(listStyle.paddingRight),
      paddingBottom: Number.parseFloat(listStyle.paddingBottom),
      paddingLeft: Number.parseFloat(listStyle.paddingLeft),
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.bodyOverflow).toBe("visible");
  expect(geometry!.listLeft).toBeCloseTo(geometry!.dialogLeft, 0);
  expect(geometry!.listRight).toBeCloseTo(geometry!.dialogRight, 0);
  expect(geometry!.itemLeft - geometry!.listLeft).toBeCloseTo(
    geometry!.paddingLeft,
    0,
  );
  expect(geometry!.listRight - geometry!.itemRight).toBeCloseTo(
    geometry!.paddingRight,
    0,
  );
  expect(geometry!.paddingTop).toBeGreaterThanOrEqual(6);
  expect(geometry!.paddingBottom).toBeGreaterThanOrEqual(18);
});

test("mobile navigation items reorder after a long press drag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/courses");

  await page.getByRole("button", { name: "More navigation options" }).click();
  const dialog = page.getByRole("dialog", { name: /More/ });
  const source = dialog.getByRole("button", { name: /^Home/ });
  const target = dialog.getByRole("button", { name: /^Courses/ });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  const pointer = {
    pointerId: 61,
    pointerType: "touch",
    button: 0,
    clientX: sourceBox!.x + sourceBox!.width / 2,
    clientY: sourceBox!.y + sourceBox!.height / 2,
  };
  await source.dispatchEvent("pointerdown", { ...pointer, buttons: 1 });
  await page.waitForTimeout(520);
  await expect(source).toHaveClass(/is-dragging/);

  await source.dispatchEvent("pointermove", {
    ...pointer,
    buttons: 1,
    clientX: targetBox!.x + targetBox!.width / 2,
    clientY: targetBox!.y + targetBox!.height * 0.75,
  });
  await expect(target).toHaveClass(/is-drop-target/);
  await source.dispatchEvent("pointerup", {
    ...pointer,
    buttons: 0,
    clientX: targetBox!.x + targetBox!.width / 2,
    clientY: targetBox!.y + targetBox!.height * 0.75,
  });
  await source.dispatchEvent("click");

  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/courses$/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const order = JSON.parse(
          localStorage.getItem("veolms-navigation-order-student") || "[]",
        ) as string[];
        return order.indexOf("Courses") < order.indexOf("Home");
      }),
    )
    .toBe(true);
});

test("tablet sidebar navigation items reorder after a long press drag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await openApp(page, "/courses");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const source = sidebar.getByRole("button", { name: /^Home/ });
  const target = sidebar.getByRole("button", { name: /^Courses/ });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  const pointer = {
    pointerId: 62,
    pointerType: "touch",
    button: 0,
    clientX: sourceBox!.x + sourceBox!.width / 2,
    clientY: sourceBox!.y + sourceBox!.height / 2,
  };
  await source.dispatchEvent("pointerdown", { ...pointer, buttons: 1 });
  await page.waitForTimeout(520);
  await expect(source).toHaveClass(/is-dragging/);

  await source.dispatchEvent("pointermove", {
    ...pointer,
    buttons: 1,
    clientX: targetBox!.x + targetBox!.width / 2,
    clientY: targetBox!.y + targetBox!.height * 0.75,
  });
  await expect(target).toHaveClass(/is-drop-target/);
  await source.dispatchEvent("pointerup", {
    ...pointer,
    buttons: 0,
    clientX: targetBox!.x + targetBox!.width / 2,
    clientY: targetBox!.y + targetBox!.height * 0.75,
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const order = JSON.parse(
          localStorage.getItem("veolms-navigation-order-student") || "[]",
        ) as string[];
        return order.indexOf("Courses") < order.indexOf("Home");
      }),
    )
    .toBe(true);
});

test("mobile theme mode opens the color themes on long press without toggling mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (duration: number) => {
        document.documentElement.dataset.testLongPressVibration =
          String(duration);
        return true;
      },
    });
  });
  await openApp(page, "/courses");

  const more = page.getByRole("button", { name: "More navigation options" });
  await more.click();
  const dialog = page.getByRole("dialog", { name: /More/ });
  const appearance = dialog.getByRole("group", {
    name: "Appearance controls",
  });
  const modeControl = appearance.getByRole("button").nth(0);
  const pointer = {
    pointerId: 41,
    pointerType: "touch",
    button: 0,
    clientX: 40,
    clientY: 40,
  };

  await modeControl.dispatchEvent("pointerdown", {
    ...pointer,
    buttons: 1,
  });
  await page.waitForTimeout(550);
  const paletteMenu = page.getByRole("menu", {
    name: "Choose a color theme",
  });
  await expect(paletteMenu).toBeVisible();
  const [appearanceBounds, modeControlBounds, paletteBounds] =
    await Promise.all([
      appearance.boundingBox(),
      modeControl.boundingBox(),
      paletteMenu.boundingBox(),
    ]);
  expect(appearanceBounds).not.toBeNull();
  expect(modeControlBounds).not.toBeNull();
  expect(paletteBounds).not.toBeNull();
  expect(Math.abs(paletteBounds!.x - appearanceBounds!.x)).toBeLessThanOrEqual(
    1,
  );
  expect(paletteBounds!.x).toBeLessThanOrEqual(modeControlBounds!.x);
  expect(paletteBounds!.x + paletteBounds!.width).toBeGreaterThanOrEqual(
    modeControlBounds!.x + modeControlBounds!.width,
  );
  expect(paletteBounds!.y + paletteBounds!.height).toBeLessThanOrEqual(
    appearanceBounds!.y - 8,
  );
  expect(paletteBounds!.y).toBeGreaterThanOrEqual(0);
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-long-press-vibration",
    "18",
  );
  await modeControl.dispatchEvent("pointerup", {
    ...pointer,
    buttons: 0,
  });
  await modeControl.dispatchEvent("click");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const initialPaletteBackground = await paletteMenu.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await paletteMenu.getByRole("menuitemradio", { name: /Ocean Blue/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
  await expect
    .poll(() =>
      paletteMenu.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(initialPaletteBackground);
  const darkPaletteBackground = await paletteMenu.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await page.keyboard.press("Escape");
  await expect(paletteMenu).toBeHidden();
  if (!(await dialog.isVisible())) {
    await more.click();
    await expect(dialog).toBeVisible();
  }
  await modeControl.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await modeControl.dispatchEvent("pointerdown", {
    ...pointer,
    pointerId: 42,
    buttons: 1,
  });
  await page.waitForTimeout(550);
  await expect(paletteMenu).toBeVisible();
  await modeControl.dispatchEvent("pointerup", {
    ...pointer,
    pointerId: 42,
    buttons: 0,
  });
  await expect
    .poll(() =>
      paletteMenu.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(darkPaletteBackground);
});

test("mobile reading mode long press uses a subtle audio fallback when haptics are unavailable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: () => false,
    });

    class TestAudioContext {
      currentTime = 0;
      destination = {};
      state = "running";

      resume() {
        return Promise.resolve();
      }

      close() {
        return Promise.resolve();
      }

      createOscillator() {
        return {
          type: "triangle",
          frequency: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
          start() {
            document.documentElement.dataset.testLongPressPop = "played";
          },
          stop() {},
        };
      }

      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        };
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: TestAudioContext,
    });
  });
  await openApp(page, "/courses");

  await page.getByRole("button", { name: "More navigation options" }).click();
  const moreDialog = page.getByRole("dialog", { name: /More/ });
  const readingModeControl = moreDialog.getByRole("button", {
    name: "Turn reading mode on",
  });
  const pointer = {
    pointerId: 42,
    pointerType: "touch",
    button: 0,
    clientX: 80,
    clientY: 40,
  };

  await readingModeControl.dispatchEvent("pointerdown", {
    ...pointer,
    buttons: 1,
  });
  await page.waitForTimeout(550);
  await expect(
    page.getByRole("dialog", { name: "Reading mode quick settings" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-long-press-pop",
    "played",
  );
  await readingModeControl.dispatchEvent("pointerup", {
    ...pointer,
    buttons: 0,
  });
  await readingModeControl.dispatchEvent("click");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode",
    "false",
  );
});

test("mobile bottom navigation hides on forward scroll and returns on reversal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/courses");

  const navigation = page.locator(".mobile-bottom-nav");
  const scrollTo = (top: number) =>
    page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), top);

  await expect(navigation).not.toHaveClass(/is-scroll-hidden/);
  await scrollTo(36);
  await expect(navigation).not.toHaveClass(/is-scroll-hidden/);

  await scrollTo(110);
  await expect(navigation).toHaveClass(/is-scroll-hidden/);
  await expect(navigation).toHaveCSS("pointer-events", "none");

  await scrollTo(100);
  await expect(navigation).toHaveClass(/is-scroll-hidden/);
  await scrollTo(74);
  await expect(navigation).not.toHaveClass(/is-scroll-hidden/);

  await scrollTo(0);
  await expect(navigation).not.toHaveClass(/is-scroll-hidden/);
});

test("mobile bottom navigation follows an element scroll source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/settings/sidebar");

  const navigation = page.getByRole("navigation", {
    name: "Student mobile navigation",
  });
  const main = page.locator("main.courses-main");
  await main.evaluate((element) => {
    Object.assign((element as HTMLElement).style, {
      height: "420px",
      minHeight: "0",
      overflowY: "auto",
    });
  });
  await expect
    .poll(() =>
      main.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);

  await expect(navigation).not.toHaveClass(/is-scroll-hidden/);
  await main.evaluate((element) => element.scrollTo(0, 90));
  await expect(navigation).toHaveClass(/is-scroll-hidden/);

  await main.evaluate((element) => element.scrollTo(0, 62));
  await expect(navigation).not.toHaveClass(/is-scroll-hidden/);
});

test("hidden sidebar navigation stays open through selection and closes on pointer leave", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1247, height: 779 });
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-sidebar-mode", "hidden");
    window.localStorage.setItem("veolms-sidebar-width", "252");
  });
  await openApp(page, "/");

  const app = page.locator(".courses-app");
  const sidebar = page.locator(".courses-sidebar");
  await page.mouse.move(2, 180);
  await expect(app).toHaveClass(/courses-app--edge-open/);
  await expect(sidebar).toBeVisible();

  await sidebar.getByRole("button", { name: "Courses" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(app).toHaveClass(/courses-app--edge-open/);

  await page.mouse.move(900, 400);
  await expect(app).not.toHaveClass(/courses-app--edge-open/);
});

test("floating sidebar preserves the fixed active-menu elevation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1197, height: 779 });
  await openApp(page, "/courses");
  await page.evaluate(() => {
    window.localStorage.setItem("veolms-theme", "light");
    window.localStorage.setItem("veolms-sidebar-mode", "expanded");
    const preferences = JSON.parse(
      window.localStorage.getItem("veolms-sidebar-preferences") || "{}",
    ) as Record<string, unknown>;
    window.localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ ...preferences, elevateMenus: true }),
    );
  });
  await page.reload();

  const app = page.locator(".courses-app");
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const activeMenuItem = sidebar.locator(".courses-nav button.is-active");
  const shadowOf = () =>
    activeMenuItem.evaluate((element) => getComputedStyle(element).boxShadow);

  await expect(app).not.toHaveClass(/courses-app--hidden/);
  const fixedShadow = await shadowOf();
  expect(fixedShadow).not.toBe("none");

  await page.evaluate(() => {
    window.localStorage.setItem("veolms-sidebar-mode", "hidden");
  });
  await page.reload();
  await expect(app).toHaveClass(/courses-app--hidden/);
  await page.mouse.move(2, 180);
  await expect(app).toHaveClass(/courses-app--edge-open/);
  await expect(sidebar).toBeVisible();
  await expect.poll(shadowOf).toBe(fixedShadow);
});

test("floating, pinned, and collapsed sidebars keep one vertical content axis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1197, height: 779 });
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-sidebar-mode", "hidden");
    window.localStorage.setItem("veolms-sidebar-width", "270");
  });
  await openApp(page, "/learn/backend-nodejs/the-design-mindset?from=courses");

  const app = page.locator(".courses-app");
  const sidebar = page.locator(".courses-sidebar");
  const readGeometry = () =>
    page.evaluate(() => {
      const sidebarElement =
        document.querySelector<HTMLElement>(".courses-sidebar");
      const brand = document.querySelector<HTMLElement>(
        ".courses-sidebar__brand",
      );
      const logo = document.querySelector<HTMLElement>(".courses-logo-clip");
      const firstNavigationIcon = document.querySelector<SVGElement>(
        ".courses-nav button > svg",
      );
      if (!sidebarElement || !brand || !logo || !firstNavigationIcon) {
        throw new Error("Expected sidebar alignment targets");
      }

      const sidebarBounds = sidebarElement.getBoundingClientRect();
      return {
        sidebarTop: sidebarBounds.top,
        sidebarBottom: sidebarBounds.bottom,
        sidebarHeight: sidebarBounds.height,
        brandTop: brand.getBoundingClientRect().top,
        logoTop: logo.getBoundingClientRect().top,
        firstNavigationIconTop: firstNavigationIcon.getBoundingClientRect().top,
      };
    });

  await page.mouse.move(2, 180);
  await expect(app).toHaveClass(/courses-app--edge-open/);
  await expect(sidebar).toBeVisible();
  const floating = await readGeometry();

  await sidebar.getByRole("button", { name: "Pin navigation" }).click();
  await expect(app).not.toHaveClass(/courses-app--hidden/);
  await expect
    .poll(async () => {
      const current = await readGeometry();
      return Math.abs(current.brandTop - floating.brandTop);
    })
    .toBeLessThan(0.05);
  const pinned = await readGeometry();

  expect(Math.abs(floating.sidebarTop - pinned.sidebarTop)).toBeLessThanOrEqual(
    1.05,
  );
  expect(
    Math.abs(floating.sidebarBottom - pinned.sidebarBottom),
  ).toBeLessThanOrEqual(1.05);
  expect(
    Math.abs(floating.sidebarHeight - pinned.sidebarHeight),
  ).toBeLessThanOrEqual(2.05);
  expect(Math.abs(floating.brandTop - pinned.brandTop)).toBeLessThan(0.05);
  expect(Math.abs(floating.logoTop - pinned.logoTop)).toBeLessThan(0.05);
  expect(
    Math.abs(floating.firstNavigationIconTop - pinned.firstNavigationIconTop),
  ).toBeLessThan(0.05);

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(app).toHaveClass(/courses-app--collapsed/);
  const collapsed = await readGeometry();
  expect(Math.abs(collapsed.sidebarTop - pinned.sidebarTop)).toBeLessThan(0.05);
  expect(Math.abs(collapsed.sidebarHeight - pinned.sidebarHeight)).toBeLessThan(
    0.05,
  );
  expect(Math.abs(collapsed.brandTop - pinned.brandTop)).toBeLessThan(0.05);
  expect(
    Math.abs(collapsed.firstNavigationIconTop - pinned.firstNavigationIconTop),
  ).toBeLessThan(0.05);

  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(app).not.toHaveClass(/courses-app--collapsed/);
  await expect
    .poll(async () => {
      const current = await readGeometry();
      return Math.abs(
        current.firstNavigationIconTop - pinned.firstNavigationIconTop,
      );
    })
    .toBeLessThan(0.05);
  const expandedAgain = await readGeometry();
  expect(Math.abs(expandedAgain.brandTop - pinned.brandTop)).toBeLessThan(0.05);
  expect(
    Math.abs(
      expandedAgain.firstNavigationIconTop - pinned.firstNavigationIconTop,
    ),
  ).toBeLessThan(0.05);
});

test("fixed sidebar stays transparent while the shell glow remains visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1247, height: 779 });
  await openApp(page, "/");

  const app = page.locator(".courses-app");
  const sidebar = page.locator(".courses-sidebar");
  const readMaterial = () =>
    page.evaluate(() => {
      const sidebarElement =
        document.querySelector<HTMLElement>(".courses-sidebar")!;
      const appElement = document.querySelector<HTMLElement>(".courses-app")!;
      const mainElement = document.querySelector<HTMLElement>(".courses-main")!;
      const style = getComputedStyle(sidebarElement);
      const pattern = getComputedStyle(appElement, "::before");
      const bokeh = getComputedStyle(sidebarElement, "::before");
      const bokehBackdrop = getComputedStyle(sidebarElement, "::after");
      return {
        backdropFilter: style.backdropFilter,
        backgroundColor: style.backgroundColor,
        borderStyle: style.borderTopStyle,
        bokehBackground: bokeh.backgroundImage,
        bokehCircleCount:
          bokeh.backgroundImage.match(/radial-gradient/g)?.length ?? 0,
        bokehContent: bokeh.content,
        bokehFilter: bokeh.filter,
        bokehOpacity: bokeh.opacity,
        bokehZIndex: bokeh.zIndex,
        bokehBackdropFilter: bokehBackdrop.backdropFilter,
        bokehBackdropMask:
          bokehBackdrop.maskImage ||
          bokehBackdrop.getPropertyValue("-webkit-mask-image"),
        bokehBackdropZIndex: bokehBackdrop.zIndex,
        mainZIndex: getComputedStyle(mainElement).zIndex,
        patternBackground: pattern.backgroundImage,
        patternContent: pattern.content,
        patternFilter: pattern.filter,
        patternOpacity: pattern.opacity,
        patternPosition: pattern.position,
        patternZIndex: pattern.zIndex,
        sidebarZIndex: style.zIndex,
      };
    });

  const expandedMaterial = await readMaterial();
  expect(expandedMaterial.backdropFilter).toBe("none");
  expect(expandedMaterial.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(expandedMaterial.borderStyle).toBe("none");
  expect(expandedMaterial.bokehContent).not.toBe("none");
  expect(expandedMaterial.bokehBackground).toContain("118px");
  expect(expandedMaterial.bokehCircleCount).toBe(3);
  expect(expandedMaterial.bokehFilter).toBe("none");
  expect(expandedMaterial.bokehOpacity).toBe("0.195");
  expect(expandedMaterial.bokehZIndex).toBe("-1");
  expect(expandedMaterial.bokehBackdropFilter).toBe("blur(8px) saturate(1.08)");
  expect(expandedMaterial.bokehBackdropMask).toContain("linear-gradient");
  expect(expandedMaterial.bokehBackdropZIndex).toBe("0");
  expect(expandedMaterial.patternContent).not.toBe("none");
  expect(expandedMaterial.patternBackground).toContain("720px 420px");
  expect(expandedMaterial.patternFilter).toBe("blur(26px) saturate(1.1)");
  expect(expandedMaterial.patternOpacity).toBe("0.25");
  expect(expandedMaterial.patternPosition).toBe("fixed");
  expect(expandedMaterial.mainZIndex).toBe("1");
  expect(expandedMaterial.patternZIndex).toBe("0");
  expect(expandedMaterial.sidebarZIndex).toBe("3");

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(app).toHaveClass(/courses-app--collapsed/);
  await expect.poll(readMaterial).toMatchObject(expandedMaterial);
});

test("sidebar glow follows the theme, accepts overrides or off, and persists", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1247, height: 779 });
  await openApp(page, "/settings/sidebar");

  const root = page.locator("html");
  const app = page.locator(".courses-app");
  const sidebar = page.locator(".courses-sidebar");
  const glowGroup = page.getByRole("radiogroup", {
    name: "Sidebar glow colors",
  });
  const followTheme = glowGroup.getByRole("radio", {
    name: /Follow theme/,
  });
  const purpleBlue = glowGroup.getByRole("radio", {
    name: /Purple \+ blue/,
  });
  const off = glowGroup.getByRole("radio", { name: /^Off/ });
  const shapeGroup = page.getByRole("radiogroup", { name: "Bokeh shape" });
  const circleShape = shapeGroup.getByRole("radio", { name: "Circle" });
  const starShape = shapeGroup.getByRole("radio", { name: "Star" });
  const shapeSize = page.getByRole("slider", {
    name: "Sidebar glow shape size",
  });
  const blur = page.getByRole("slider", {
    name: "Additional sidebar bokeh blur",
  });
  const intensity = page.getByRole("slider", {
    name: "Sidebar glow intensity",
  });
  const resetGlow = page.getByRole("button", {
    name: "Reset sidebar glow to defaults",
  });

  await expect(followTheme).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("data-sidebar-glow", "theme");
  await expect(circleShape).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("data-sidebar-glow-shape", "circle");
  await expect(shapeSize).toHaveValue("100");
  await expect(shapeSize).toHaveAttribute("min", "50");
  await expect(shapeSize).toHaveAttribute("max", "180");
  await expect(shapeSize).toHaveAttribute("aria-valuetext", "100 percent");
  const compactOptionGeometry = await followTheme.evaluate((element) => {
    const preview = element.querySelector<HTMLElement>(
      ".settings-sidebar-glow-option__preview",
    )!;
    const title = element.querySelector<HTMLElement>("strong")!;
    const radio = element.querySelector<HTMLElement>(".settings-radio")!;
    const optionBounds = element.getBoundingClientRect();
    const previewBounds = preview.getBoundingClientRect();
    const titleBounds = title.getBoundingClientRect();
    const radioBounds = radio.getBoundingClientRect();
    const previewBackdrop = getComputedStyle(preview, "::after");
    const previewBokeh = getComputedStyle(preview, "::before");
    return {
      height: optionBounds.height,
      previewTop: previewBounds.top - optionBounds.top,
      previewBottom: optionBounds.bottom - previewBounds.bottom,
      titleCentered:
        Math.abs(
          titleBounds.top +
            titleBounds.height / 2 -
            (optionBounds.top + optionBounds.height / 2),
        ) <= 1,
      radioRightOfTitle: radioBounds.left > titleBounds.right,
      radioCentered:
        Math.abs(
          radioBounds.top +
            radioBounds.height / 2 -
            (optionBounds.top + optionBounds.height / 2),
        ) <= 1,
      subtitleCount: element.querySelectorAll("small").length,
      optionOverflow: getComputedStyle(element).overflowX,
      previewOverflow: getComputedStyle(preview).overflowX,
      previewBaseBackdropFilter: getComputedStyle(preview).backdropFilter,
      previewBackdropFilter: previewBackdrop.backdropFilter,
      previewBokehOpacity: previewBokeh.opacity,
    };
  });
  expect(compactOptionGeometry.height).toBe(64);
  expect(compactOptionGeometry.previewTop).toBe(0);
  expect(compactOptionGeometry.previewBottom).toBe(0);
  expect(compactOptionGeometry.titleCentered).toBe(true);
  expect(compactOptionGeometry.radioRightOfTitle).toBe(true);
  expect(compactOptionGeometry.radioCentered).toBe(true);
  expect(compactOptionGeometry.subtitleCount).toBe(0);
  expect(compactOptionGeometry.optionOverflow).toBe("clip");
  expect(compactOptionGeometry.previewOverflow).toBe("clip");
  expect(compactOptionGeometry.previewBaseBackdropFilter).toBe(
    "blur(6px) saturate(1.08)",
  );
  expect(compactOptionGeometry.previewBackdropFilter).toBe(
    "blur(8px) saturate(1.08)",
  );
  expect(compactOptionGeometry.previewBokehOpacity).toBe("0.25");
  await expect(resetGlow).toBeDisabled();
  await expect(intensity).toHaveValue("25");
  await expect(intensity).toHaveAttribute("min", "0");
  await expect(intensity).toHaveAttribute("max", "100");
  await expect(intensity).toHaveAttribute("aria-valuetext", "25 percent");
  await expect(blur).toHaveValue("8");
  await expect(blur).toHaveAttribute("min", "0");
  await expect(blur).toHaveAttribute("max", "32");
  await expect(blur).toHaveAttribute("aria-valuetext", "8 pixels");

  await blur.evaluate((input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, "0");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(blur).toHaveValue("0");
  await expect(root).toHaveAttribute("data-sidebar-backdrop-blur", "off");
  await expect(
    followTheme.locator(".settings-sidebar-glow-option__preview"),
  ).toHaveClass(/is-clear/);
  await expect
    .poll(() =>
      followTheme.evaluate((element) => {
        const preview = element.querySelector<HTMLElement>(
          ".settings-sidebar-glow-option__preview",
        )!;
        return getComputedStyle(preview, "::after").backdropFilter;
      }),
    )
    .toBe("none");
  await expect
    .poll(() =>
      sidebar.evaluate(
        (element) => getComputedStyle(element, "::after").backdropFilter,
      ),
    )
    .toBe("none");

  await blur.evaluate((input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, "27");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(blur).toHaveValue("27");
  await expect(blur).toHaveAttribute("aria-valuetext", "27 pixels");
  await expect(root).toHaveAttribute("data-sidebar-backdrop-blur", "on");
  await expect(resetGlow).toBeEnabled();
  await expect
    .poll(() =>
      followTheme.evaluate((element) => {
        const preview = element.querySelector<HTMLElement>(
          ".settings-sidebar-glow-option__preview",
        )!;
        return getComputedStyle(preview, "::after").backdropFilter;
      }),
    )
    .toBe("blur(27px) saturate(1.08)");
  await expect
    .poll(() =>
      root.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--sidebar-backdrop-blur")
          .trim(),
      ),
    )
    .toBe("27px");
  await expect
    .poll(() =>
      sidebar.evaluate(
        (element) => getComputedStyle(element, "::after").backdropFilter,
      ),
    )
    .toBe("blur(27px) saturate(1.08)");

  const circleMask = await sidebar.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return style.maskImage || style.getPropertyValue("-webkit-mask-image");
  });
  await starShape.click();
  await expect(starShape).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("data-sidebar-glow-shape", "star");
  await expect
    .poll(() =>
      sidebar.evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return style.maskImage || style.getPropertyValue("-webkit-mask-image");
      }),
    )
    .not.toBe(circleMask);

  await shapeSize.evaluate((input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, "150");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(shapeSize).toHaveValue("150");
  await expect(shapeSize).toHaveAttribute("aria-valuetext", "150 percent");
  await expect
    .poll(() =>
      root.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--sidebar-bokeh-top-size")
          .trim(),
      ),
    )
    .toBe("177.00px");
  await expect
    .poll(() =>
      sidebar.evaluate(
        (element) => getComputedStyle(element, "::before").maskSize,
      ),
    )
    .toContain("177px 177px");
  await expect
    .poll(() =>
      app.evaluate(
        (element) => getComputedStyle(element, "::before").backgroundImage,
      ),
    )
    .toContain("1080px 630px");

  await intensity.evaluate((input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, "35");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(intensity).toHaveValue("35");
  await expect(intensity).toHaveAttribute("aria-valuetext", "35 percent");
  await expect
    .poll(() =>
      root.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--sidebar-glow-intensity")
          .trim(),
      ),
    )
    .toBe("0.35");
  await expect
    .poll(() =>
      followTheme.evaluate((element) => {
        const preview = element.querySelector<HTMLElement>(
          ".settings-sidebar-glow-option__preview",
        )!;
        return getComputedStyle(preview, "::before").opacity;
      }),
    )
    .toBe("0.35");
  await expect
    .poll(() =>
      app.evaluate((element) => getComputedStyle(element, "::before").opacity),
    )
    .toBe("0.175");

  const themeBackgrounds = await app.evaluate((element) => {
    const root = document.documentElement;
    const sidebarElement =
      document.querySelector<HTMLElement>(".courses-sidebar")!;
    const before = getComputedStyle(element, "::before").backgroundImage;
    root.dataset.palette = "rose";
    const after = getComputedStyle(element, "::before").backgroundImage;
    const sidebarAfter = getComputedStyle(
      sidebarElement,
      "::before",
    ).backgroundImage;
    return { before, after, sidebarAfter };
  });
  expect(themeBackgrounds.after).not.toBe(themeBackgrounds.before);

  await purpleBlue.click();
  await expect(purpleBlue).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("data-sidebar-glow", "purple-blue");
  await expect
    .poll(() =>
      root.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--sidebar-glow-primary")
          .trim(),
      ),
    )
    .toBe("#9a6cff");
  await expect
    .poll(() =>
      app.evaluate(
        (element) => getComputedStyle(element, "::before").backgroundImage,
      ),
    )
    .not.toBe(themeBackgrounds.after);
  await expect
    .poll(() =>
      sidebar.evaluate(
        (element) => getComputedStyle(element, "::before").backgroundImage,
      ),
    )
    .not.toBe(themeBackgrounds.sidebarAfter);

  await off.click();
  await expect(off).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("data-sidebar-glow", "off");
  await expect
    .poll(() =>
      app.evaluate((element) => getComputedStyle(element, "::before").opacity),
    )
    .toBe("0");
  await expect
    .poll(() =>
      sidebar.evaluate(
        (element) => getComputedStyle(element, "::before").opacity,
      ),
    )
    .toBe("0");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(
          window.localStorage.getItem("veolms-sidebar-preferences") || "{}",
        ) as {
          glowPalette?: string;
          glowShape?: string;
          glowShapeSize?: number;
          glowBlur?: number;
          glowIntensity?: number;
        };
        return {
          glowPalette: stored.glowPalette,
          glowShape: stored.glowShape,
          glowShapeSize: stored.glowShapeSize,
          glowBlur: stored.glowBlur,
          glowIntensity: stored.glowIntensity,
        };
      }),
    )
    .toEqual({
      glowPalette: "off",
      glowShape: "star",
      glowShapeSize: 150,
      glowBlur: 27,
      glowIntensity: 35,
    });

  await page.reload();
  await expect(root).toHaveAttribute("data-sidebar-glow", "off");
  await expect(root).toHaveAttribute("data-sidebar-glow-shape", "star");
  await expect(off).toHaveAttribute("aria-checked", "true");
  await expect(starShape).toHaveAttribute("aria-checked", "true");
  await expect(shapeSize).toHaveValue("150");
  await expect(blur).toHaveValue("27");
  await expect(intensity).toHaveValue("35");
  await expect(resetGlow).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await shapeGroup.scrollIntoViewIfNeeded();
  const mobileShapeLayout = await shapeGroup.evaluate((element) => ({
    clientWidth: element.clientWidth,
    optionCount: element.querySelectorAll('[role="radio"]').length,
    optionMinHeight: Math.min(
      ...Array.from(
        element.querySelectorAll<HTMLElement>('[role="radio"]'),
      ).map((option) => option.getBoundingClientRect().height),
    ),
    scrollWidth: element.scrollWidth,
  }));
  expect(mobileShapeLayout.optionCount).toBe(5);
  expect(mobileShapeLayout.optionMinHeight).toBeGreaterThanOrEqual(48);
  expect(mobileShapeLayout.scrollWidth).toBeLessThanOrEqual(
    mobileShapeLayout.clientWidth + 1,
  );

  await resetGlow.click();
  await expect(followTheme).toHaveAttribute("aria-checked", "true");
  await expect(circleShape).toHaveAttribute("aria-checked", "true");
  await expect(shapeSize).toHaveValue("100");
  await expect(blur).toHaveValue("8");
  await expect(intensity).toHaveValue("25");
  await expect(resetGlow).toBeDisabled();
  await expect(root).toHaveAttribute("data-sidebar-glow", "theme");
  await expect(root).toHaveAttribute("data-sidebar-glow-shape", "circle");
  await expect
    .poll(() =>
      root.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--sidebar-bokeh-top-size")
          .trim(),
      ),
    )
    .toBe("118.00px");
});

test("floating sidebar keeps fixed glass beneath bokeh at every additional blur value", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1247, height: 779 });
  await openApp(page, "/settings/sidebar");
  await page.evaluate(() => {
    localStorage.setItem("veolms-sidebar-mode", "hidden");
  });
  await updateSidebarPreferences(page, "/settings/sidebar", {
    glowPalette: "theme",
    glowShape: "star",
    glowBlur: 0,
    glowIntensity: 100,
  });

  const app = page.locator(".courses-app");
  const sidebar = page.locator(".courses-sidebar");
  await expect(app).toHaveClass(/courses-app--hidden/);

  const readMaterial = () =>
    sidebar.evaluate((element) => {
      const base = getComputedStyle(element);
      const bokeh = getComputedStyle(element, "::before");
      const upperGlass = getComputedStyle(element, "::after");
      return {
        baseBackdropFilter: base.backdropFilter,
        bokehOpacity: bokeh.opacity,
        bokehZIndex: bokeh.zIndex,
        upperBackdropFilter: upperGlass.backdropFilter,
        upperZIndex: upperGlass.zIndex,
      };
    });

  await expect.poll(readMaterial).toEqual({
    baseBackdropFilter: "blur(6px) saturate(1.2)",
    bokehOpacity: "0.39",
    bokehZIndex: "0",
    upperBackdropFilter: "none",
    upperZIndex: "0",
  });

  await updateSidebarPreferences(page, "/settings/sidebar", {
    glowBlur: 24,
  });
  await expect(app).toHaveClass(/courses-app--hidden/);
  await expect.poll(readMaterial).toEqual({
    baseBackdropFilter: "blur(6px) saturate(1.2)",
    bokehOpacity: "0.39",
    bokehZIndex: "0",
    upperBackdropFilter: "blur(24px) saturate(1.08)",
    upperZIndex: "0",
  });
});

test.describe("wide touch tablet navigation", () => {
  test.use({
    hasTouch: true,
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 2,
  });

  test("tracks the touch sidebar rail continuously and settles after release", async ({
    page,
  }) => {
    await openApp(page, "/learn/ui-ux-design-mastery");

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            matchMedia("(pointer: coarse)").matches ||
            matchMedia("(any-pointer: coarse)").matches,
        ),
      )
      .toBe(true);

    const rail = page.getByRole("separator", { name: "Resize sidebar" });
    await expect(rail).toBeVisible();
    await expect(rail).toHaveCSS("width", "44px");
    await expect(rail).toHaveCSS("touch-action", "none");

    const railBox = await rail.boundingBox();
    expect(railBox).not.toBeNull();
    const startX = railBox!.x + railBox!.width / 2;
    const startY = railBox!.y + Math.min(180, railBox!.height / 2);
    const cdp = await page.context().newCDPSession(page);
    const iconCenters = async () => {
      const controls = [
        page
          .getByRole("complementary", { name: "Student navigation" })
          .getByRole("button", { name: "Courses" })
          .locator("svg")
          .first(),
        page.locator(".courses-profile__button .shell-profile-avatar"),
      ];
      return Promise.all(
        controls.map(async (control) => {
          const box = await control.boundingBox();
          expect(box).not.toBeNull();
          return box!.x + box!.width / 2;
        }),
      );
    };

    const initialIconCenters = await iconCenters();
    for (const center of initialIconCenters) {
      expect(center).toBeCloseTo(initialIconCenters[0]!, 0);
    }

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y: startY }],
    });
    await expect(page.locator(".courses-app")).toHaveClass(
      /courses-app--resizing/,
    );
    for (const x of [startX - 70, startX - 140, startX - 210]) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: startY }],
      });
    }
    await expect(page.locator(".courses-app")).not.toHaveClass(
      /courses-app--collapsed/,
    );
    await expect(
      page
        .getByRole("complementary", { name: "Student navigation" })
        .getByRole("button", { name: "Courses" })
        .locator(".courses-nav__text"),
    ).toHaveCSS("opacity", "1");
    const resizingIconCenters = await iconCenters();
    for (const center of resizingIconCenters) {
      expect(center).toBeCloseTo(resizingIconCenters[0]!, 0);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });

    await expect(page.locator(".courses-app")).toHaveClass(
      /courses-app--collapsed/,
    );
    await expectStoredValue(page, "veolms-sidebar-mode", "collapsed");
    await expect
      .poll(async () => {
        const settledRailBox = await rail.boundingBox();
        return settledRailBox!.x + settledRailBox!.width / 2;
      })
      .toBeCloseTo(76, 0);

    const collapsedRailBox = await rail.boundingBox();
    expect(collapsedRailBox).not.toBeNull();
    const collapsedX = collapsedRailBox!.x + collapsedRailBox!.width / 2;
    const collapsedY =
      collapsedRailBox!.y + Math.min(180, collapsedRailBox!.height / 2);

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: collapsedX, y: collapsedY }],
    });
    await expect(page.locator(".courses-app")).toHaveClass(
      /courses-app--resizing/,
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: collapsedX + 60, y: collapsedY }],
    });

    await expect(page.locator(".courses-app")).toHaveClass(
      /courses-app--collapsed/,
    );
    await expect
      .poll(async () => {
        const previewRailBox = await rail.boundingBox();
        return Math.abs(
          previewRailBox!.x + previewRailBox!.width / 2 - (collapsedX + 60),
        );
      })
      .toBeLessThan(1);

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: collapsedX + 80, y: collapsedY }],
    });

    await expect(page.locator(".courses-app")).toHaveClass(
      /courses-app--collapsed/,
    );
    await expect
      .poll(async () => {
        const previewRailBox = await rail.boundingBox();
        return previewRailBox!.x + previewRailBox!.width / 2;
      })
      .toBeCloseTo(collapsedX + 80, 0);

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: collapsedX + 184, y: collapsedY }],
    });
    await expect(page.locator(".courses-app")).toHaveClass(
      /courses-app--collapsed/,
    );
    await expect
      .poll(async () => {
        const grownRailBox = await rail.boundingBox();
        return grownRailBox!.x + grownRailBox!.width / 2;
      })
      .toBeCloseTo(260, 0);

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });

    await expect(page.locator(".courses-app")).not.toHaveClass(
      /courses-app--collapsed/,
    );
    await expectStoredValue(page, "veolms-sidebar-mode", "expanded");
    await expectStoredValue(page, "veolms-sidebar-width", "260");

    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(page.locator(".courses-app")).toHaveClass(
      /courses-app--collapsed/,
    );
    const hiddenRailBox = await rail.boundingBox();
    expect(hiddenRailBox).not.toBeNull();
    const hiddenRailX = hiddenRailBox!.x + hiddenRailBox!.width / 2;
    const hiddenRailY =
      hiddenRailBox!.y + Math.min(180, hiddenRailBox!.height / 2);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: hiddenRailX, y: hiddenRailY }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: hiddenRailX - 48, y: hiddenRailY }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator(".courses-app")).toHaveClass(
      /courses-app--hidden/,
    );
    await expectStoredValue(page, "veolms-sidebar-mode", "hidden");
  });

  test("resizes, dismisses, and pins the temporary hidden sidebar", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("veolms-sidebar-mode", "hidden");
      window.localStorage.setItem("veolms-sidebar-width", "252");
    });
    await openApp(
      page,
      "/learn/backend-nodejs/career-opportunities-15?from=courses",
    );

    const app = page.locator(".courses-app");
    const sidebar = page.locator(".courses-sidebar");
    const cdp = await page.context().newCDPSession(page);
    let touchTimestamp = Date.now() / 1000;
    const sendTouch = async (
      type: "touchStart" | "touchMove" | "touchEnd",
      touchPoints: Array<{ x: number; y: number }>,
      elapsedMs = 24,
    ) => {
      touchTimestamp += elapsedMs / 1000;
      await cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints,
        timestamp: touchTimestamp,
      });
    };
    const revealSidebar = async () => {
      await sendTouch("touchStart", [{ x: 12, y: 160 }]);
      await sendTouch("touchMove", [{ x: 84, y: 160 }]);
      await sendTouch("touchEnd", []);
      await expect(app).toHaveClass(/courses-app--edge-open/);
      await expect(sidebar).toBeVisible();
    };

    await expect(app).toHaveClass(/courses-app--hidden/);
    await revealSidebar();

    const resizeRail = page.getByRole("separator", { name: "Resize sidebar" });
    await expect(resizeRail).toBeVisible();
    await expect(resizeRail).toHaveCSS("width", "44px");
    await expect(sidebar).toHaveCSS("padding-bottom", "14px");
    await expect
      .poll(() =>
        sidebar.evaluate((element) => getComputedStyle(element).boxShadow),
      )
      .not.toBe("none");
    const overlayMaterial = await sidebar.evaluate((element) => {
      const style = getComputedStyle(element);
      const bokehStyle = getComputedStyle(element, "::before");
      const glassStyle = getComputedStyle(element, "::after");
      return {
        backdropFilter: style.backdropFilter,
        backgroundColor: style.backgroundColor,
        borderStyle: style.borderTopStyle,
        borderRadius: style.borderRadius,
        bokehFilter: bokehStyle.filter,
        bokehZIndex: bokehStyle.zIndex,
        glassBackdropFilter: glassStyle.backdropFilter,
        glassBorderRadius: glassStyle.borderRadius,
        glassZIndex: glassStyle.zIndex,
      };
    });
    expect(overlayMaterial.backdropFilter).toBe("blur(6px) saturate(1.2)");
    expect(overlayMaterial.backgroundColor).toContain("/ 0.74");
    expect(overlayMaterial.borderStyle).toBe("none");
    expect(overlayMaterial.bokehFilter).toBe("none");
    expect(overlayMaterial.bokehZIndex).toBe("0");
    expect(overlayMaterial.glassBackdropFilter).toBe(
      "blur(8px) saturate(1.08)",
    );
    expect(overlayMaterial.glassBorderRadius).toBe(
      overlayMaterial.borderRadius,
    );
    expect(overlayMaterial.glassZIndex).toBe("0");
    const overlayGeometry = await page.evaluate(() => {
      const sidebarBounds = document
        .querySelector<HTMLElement>(".courses-sidebar")!
        .getBoundingClientRect();
      const mainBounds = document
        .querySelector<HTMLElement>("main.courses-main")!
        .getBoundingClientRect();
      return {
        bottomOverhang: sidebarBounds.bottom - mainBounds.bottom,
        topOverhang: mainBounds.top - sidebarBounds.top,
      };
    });
    expect(overlayGeometry.topOverhang).toBeCloseTo(1, 1);
    expect(overlayGeometry.bottomOverhang).toBeCloseTo(1, 1);

    await expect(sidebar.locator(".courses-nav button.is-active")).toHaveCount(
      0,
    );

    const resizeBox = await resizeRail.boundingBox();
    expect(resizeBox).not.toBeNull();
    const resizeX = resizeBox!.x + resizeBox!.width / 2;
    const resizeY = resizeBox!.y + 180;
    const main = page.locator("#courses-main-scrollport");
    const mainBoxBeforeResize = await main.boundingBox();
    expect(mainBoxBeforeResize).not.toBeNull();
    await sendTouch("touchStart", [{ x: resizeX, y: resizeY }]);
    await sendTouch("touchMove", [{ x: resizeX + 48, y: resizeY }]);
    await expect(app).toHaveClass(/courses-app--resizing/);
    await expect(sidebar).toHaveCSS("width", "300px");
    const mainBoxDuringResize = await main.boundingBox();
    expect(mainBoxDuringResize).not.toBeNull();
    expect(mainBoxDuringResize!.x).toBeCloseTo(mainBoxBeforeResize!.x, 1);
    expect(mainBoxDuringResize!.width).toBeCloseTo(
      mainBoxBeforeResize!.width,
      1,
    );
    await sendTouch("touchEnd", []);
    await expectStoredValue(page, "veolms-sidebar-width", "300");
    await expect(app).toHaveClass(/courses-app--hidden/);
    await expect(app).toHaveClass(/courses-app--edge-open/);

    await sendTouch("touchStart", [{ x: 150, y: 250 }]);
    await sendTouch("touchMove", [{ x: 72, y: 250 }]);
    await sendTouch("touchEnd", []);
    await expect(app).not.toHaveClass(/courses-app--edge-open/);
    await expect(sidebar).toHaveAttribute("inert", "");

    await revealSidebar();
    await sendTouch("touchStart", [{ x: 120, y: 250 }]);
    await sendTouch("touchMove", [{ x: 184, y: 250 }]);
    await sendTouch("touchEnd", []);
    await expect(app).not.toHaveClass(/courses-app--hidden/);
    await expectStoredValue(page, "veolms-sidebar-mode", "expanded");
    await expect(sidebar).not.toHaveAttribute("inert", "");
  });

  test("swipes from the full screen with distance and velocity settling while sliders remain isolated", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await openApp(page, "/notifications");
    await page.evaluate(() => {
      window.localStorage.setItem("veolms-sidebar-mode", "expanded");
      window.localStorage.setItem("veolms-sidebar-width", "252");
    });
    await openApp(page, "/notifications");

    const app = page.locator(".courses-app");
    const rail = page.getByRole("separator", { name: "Resize sidebar" });
    const cdp = await page.context().newCDPSession(page);
    let touchTimestamp = Date.now() / 1000;
    const sendTouch = async (
      type: "touchStart" | "touchMove" | "touchEnd",
      touchPoints: Array<{ x: number; y: number }>,
      elapsedMs = 16,
    ) => {
      touchTimestamp += elapsedMs / 1000;
      await cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints,
        timestamp: touchTimestamp,
      });
    };
    const mainBox = await page
      .locator("#courses-main-scrollport")
      .boundingBox();
    expect(mainBox).not.toBeNull();
    const startX = mainBox!.x + Math.min(520, mainBox!.width * 0.62);
    const startY = mainBox!.y + 90;
    const railCenter = async () => {
      const box = await rail.boundingBox();
      expect(box).not.toBeNull();
      return box!.x + box!.width / 2;
    };

    await sendTouch("touchStart", [{ x: startX, y: startY }]);
    await page.waitForTimeout(120);
    await sendTouch("touchMove", [{ x: startX - 28, y: startY }], 120);
    await expect(app).toHaveClass(/courses-app--resizing/);
    await expect.poll(railCenter).toBeCloseTo(224, 0);
    await page.waitForTimeout(150);
    await sendTouch("touchEnd", [], 150);
    await expect(app).not.toHaveClass(/courses-app--collapsed/);
    await expect.poll(railCenter).toBeCloseTo(252, 0);

    await sendTouch("touchStart", [{ x: startX, y: startY }]);
    await page.waitForTimeout(120);
    await sendTouch("touchMove", [{ x: startX - 96, y: startY }], 120);
    await expect(app).toHaveClass(/courses-app--resizing/);
    await page.waitForTimeout(150);
    await sendTouch("touchEnd", [], 150);
    await expect(app).toHaveClass(/courses-app--collapsed/);
    await expectStoredValue(page, "veolms-sidebar-mode", "collapsed");

    await sendTouch("touchStart", [{ x: startX, y: startY }]);
    await sendTouch("touchMove", [{ x: startX + 54, y: startY }]);
    await expect(app).toHaveClass(/courses-app--resizing/);
    await sendTouch("touchEnd", []);
    await expect(app).not.toHaveClass(/courses-app--collapsed/);
    await expectStoredValue(page, "veolms-sidebar-mode", "expanded");
    await expect.poll(railCenter).toBeCloseTo(252, 0);

    await sendTouch("touchStart", [{ x: startX, y: startY }]);
    await sendTouch("touchMove", [{ x: startX - 54, y: startY }]);
    await sendTouch("touchEnd", []);
    await expect(app).toHaveClass(/courses-app--collapsed/);

    await sendTouch("touchStart", [{ x: startX, y: startY }]);
    await sendTouch("touchMove", [{ x: startX + 54, y: startY }]);
    await sendTouch("touchEnd", []);
    await expect(app).not.toHaveClass(/courses-app--collapsed/);

    await sendTouch("touchStart", [{ x: startX, y: startY }]);
    await sendTouch("touchMove", [{ x: startX - 54, y: startY }]);
    await sendTouch("touchEnd", []);
    await expect(app).toHaveClass(/courses-app--collapsed/);

    await sendTouch("touchStart", [{ x: startX, y: startY }]);
    await sendTouch("touchMove", [{ x: startX - 54, y: startY }]);
    await sendTouch("touchEnd", []);
    await expect(app).toHaveClass(/courses-app--hidden/);
    await expectStoredValue(page, "veolms-sidebar-mode", "hidden");

    await page.keyboard.press("Control+b");
    await expect(app).not.toHaveClass(/courses-app--hidden/);
    await expectStoredValue(page, "veolms-sidebar-mode", "expanded");

    await openApp(page, "/settings/appearance");
    await expectAppearanceSettingsReady(page);
    const slider = page.locator("#reading-mode-color-temperature");
    await slider.scrollIntoViewIfNeeded();
    const sliderBox = await slider.boundingBox();
    expect(sliderBox).not.toBeNull();
    const sliderX = sliderBox!.x + sliderBox!.width / 2;
    const sliderY = sliderBox!.y + sliderBox!.height / 2;
    await sendTouch("touchStart", [{ x: sliderX, y: sliderY }]);
    await sendTouch("touchMove", [{ x: sliderX - 90, y: sliderY }]);
    await expect(app).not.toHaveClass(/courses-app--resizing/);
    await sendTouch("touchEnd", []);
    await expectStoredValue(page, "veolms-sidebar-mode", "expanded");
  });
});
