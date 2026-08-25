import { test, expect } from "./app.fixture.ts";
import type { Locator, Page } from "@playwright/test";
import {
  expectStoredValue,
  installBaselineState,
  openApp,
  revealDeferredAppearanceSettings,
  updateSidebarPreferences,
} from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

const getFloatingScrollbarThumb = (scrollbar: Locator) =>
  scrollbar.locator(":scope > .floating-scrollbar__thumb");

const getFloatingScrollbarThumbAppearance = async (thumb: Locator) =>
  thumb.evaluate((element) => {
    const background = getComputedStyle(element).backgroundColor;
    const modernAlpha = background.match(/\/\s*([\d.]+)\)/)?.[1];
    const legacyAlpha = background.match(
      /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/,
    )?.[1];
    return {
      alpha: Number(modernAlpha ?? legacyAlpha ?? 1),
      background,
    };
  });

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

test("framed layout scrolls inside its main surface while edge-to-edge uses the document", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1133, height: 753 });
  await openApp(page, "/my-courses");

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

test("page tabs pin beneath the shell edge while the framed surface uses only a floating thumb", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1133, height: 753 });

  for (const [path, tabSelector] of [
    ["/discussions/q-and-a", ".discussion-hub__tabs"],
    ["/settings/appearance", ".settings-tabs"],
  ] as const) {
    await openApp(page, path);
    if (path === "/settings/appearance") {
      await revealDeferredAppearanceSettings(page);
    }

    const mainSurface = page.locator("main.courses-main");
    const tabs = page.locator(tabSelector);
    const floatingScrollbar = page.locator(".floating-scrollbar");

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
    const thumb = getFloatingScrollbarThumb(floatingScrollbar);
    await expect(thumb).toHaveCount(1);
    await expect(thumb).toHaveCSS("width", "6px");
    await expect(floatingScrollbar).toHaveCSS("cursor", "auto");
    await expect(thumb).toHaveCSS("cursor", "auto");
    await expect
      .poll(() =>
        mainSurface.evaluate(
          (main) =>
            (main as HTMLElement).offsetWidth -
            (main as HTMLElement).clientWidth,
        ),
      )
      .toBe(0);

    await mainSurface.evaluate((main) => main.scrollTo(0, 0));
    const trackBounds = await floatingScrollbar.boundingBox();
    const mainBounds = await mainSurface.boundingBox();
    expect(trackBounds).not.toBeNull();
    expect(mainBounds).not.toBeNull();
    expect(
      Math.abs(
        trackBounds!.x +
          trackBounds!.width -
          (mainBounds!.x + mainBounds!.width),
      ),
    ).toBeLessThan(0.5);
    expect(trackBounds!.y - mainBounds!.y).toBeGreaterThanOrEqual(17.5);
    expect(
      mainBounds!.y +
        mainBounds!.height -
        (trackBounds!.y + trackBounds!.height),
    ).toBeGreaterThanOrEqual(17.5);

    const thumbAppearance = await getFloatingScrollbarThumbAppearance(thumb);
    expect(thumbAppearance.alpha).toBeCloseTo(0.9, 2);
    await page.locator("html").evaluate((root) => {
      root.style.setProperty("--accent", "#ff0066");
    });
    await expect
      .poll(() =>
        thumb.evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .not.toBe(thumbAppearance.background);
    await page.locator("html").evaluate((root) => {
      root.style.removeProperty("--accent");
    });

    await exerciseFloatingScrollbar(page, mainSurface, floatingScrollbar, 70);
  }
});

test("the framed learning scrollbar clears content at compact and wide desktop sizes", async ({
  page,
}) => {
  for (const width of [981, 1133]) {
    await page.setViewportSize({ width, height: 678 });
    await openApp(
      page,
      "/learn/typescript-course/career-opportunities?from=home",
    );

    const mainSurface = page.locator("main.courses-main");
    const floatingScrollbar = page.locator(
      '.floating-scrollbar[aria-controls="courses-main-scrollport"]',
    );
    const rightmostContent = page.locator(
      width <= 1080
        ? ".learning-workspace__player-wrap"
        : ".learning-workspace__curriculum-column",
    );
    await expect(floatingScrollbar).toHaveClass(/is-visible/);
    await expect(rightmostContent).toBeVisible();

    const [mainBounds, trackBounds, contentBounds] = await Promise.all([
      mainSurface.boundingBox(),
      floatingScrollbar.boundingBox(),
      rightmostContent.boundingBox(),
    ]);
    expect(mainBounds).not.toBeNull();
    expect(trackBounds).not.toBeNull();
    expect(contentBounds).not.toBeNull();
    expect(
      Math.abs(
        trackBounds!.x +
          trackBounds!.width -
          (mainBounds!.x + mainBounds!.width),
      ),
    ).toBeLessThan(0.5);
    expect(
      trackBounds!.x - (contentBounds!.x + contentBounds!.width),
    ).toBeGreaterThanOrEqual(1.5);

    if (width > 1080) {
      const curriculum = page.locator("#learning-course-curriculum-scrollport");
      const curriculumScrollbar = page.locator(
        '.floating-scrollbar[aria-controls="learning-course-curriculum-scrollport"]',
      );
      const curriculumThumb = getFloatingScrollbarThumb(curriculumScrollbar);
      await expect(curriculumScrollbar).toHaveClass(/is-visible/);
      await expect(curriculumScrollbar).toHaveAttribute("aria-hidden", "false");

      const [curriculumBounds, curriculumTrackBounds] = await Promise.all([
        curriculum.boundingBox(),
        curriculumScrollbar.boundingBox(),
      ]);
      expect(curriculumBounds).not.toBeNull();
      expect(curriculumTrackBounds).not.toBeNull();
      expect(
        Math.abs(
          curriculumTrackBounds!.x +
            curriculumTrackBounds!.width -
            (curriculumBounds!.x + curriculumBounds!.width),
        ),
      ).toBeLessThan(0.5);
      expect(
        curriculumTrackBounds!.y - curriculumBounds!.y,
      ).toBeGreaterThanOrEqual(13.5);
      expect(
        curriculumBounds!.y +
          curriculumBounds!.height -
          (curriculumTrackBounds!.y + curriculumTrackBounds!.height),
      ).toBeGreaterThanOrEqual(13.5);

      const matchingScrollbarStyles = await page.evaluate(() => {
        const curriculum = document.querySelector(
          "#learning-course-curriculum-scrollport",
        );
        const curriculumScrollbar = document.querySelector(
          '.floating-scrollbar[aria-controls="learning-course-curriculum-scrollport"]',
        );
        const curriculumThumb = curriculumScrollbar?.querySelector(
          ".floating-scrollbar__thumb",
        );
        const mainScrollbar = document.querySelector(
          '.floating-scrollbar[aria-controls="courses-main-scrollport"]',
        );
        const mainThumb = mainScrollbar?.querySelector(
          ".floating-scrollbar__thumb",
        );
        if (
          !curriculum ||
          !curriculumScrollbar ||
          !curriculumThumb ||
          !mainThumb
        )
          return null;
        const nativeScrollbar = getComputedStyle(
          curriculum,
          "::-webkit-scrollbar",
        );
        const curriculumStyle = getComputedStyle(curriculum);
        const curriculumThumbStyle = getComputedStyle(curriculumThumb);
        const mainThumbStyle = getComputedStyle(mainThumb);
        const horizontalBorderWidth =
          Number.parseFloat(curriculumStyle.borderLeftWidth) +
          Number.parseFloat(curriculumStyle.borderRightWidth);
        return {
          curriculumCursor: curriculumThumbStyle.cursor,
          curriculumLayoutGutter:
            (curriculum as HTMLElement).offsetWidth -
            (curriculum as HTMLElement).clientWidth -
            horizontalBorderWidth,
          curriculumNativeWidth: Number.parseFloat(nativeScrollbar.width),
          curriculumPosition: getComputedStyle(curriculumScrollbar).position,
          curriculumThumbBackground: curriculumThumbStyle.backgroundColor,
          curriculumThumbWidth: curriculumThumb.getBoundingClientRect().width,
          mainThumbBackground: mainThumbStyle.backgroundColor,
          mainThumbCursor: mainThumbStyle.cursor,
          mainThumbWidth: mainThumb.getBoundingClientRect().width,
        };
      });
      expect(matchingScrollbarStyles).not.toBeNull();
      expect(matchingScrollbarStyles!.curriculumNativeWidth).toBe(0);
      expect(matchingScrollbarStyles!.curriculumLayoutGutter).toBe(0);
      expect(matchingScrollbarStyles!.curriculumPosition).toBe("fixed");
      expect(matchingScrollbarStyles!.curriculumThumbWidth).toBeCloseTo(6, 1);
      expect(matchingScrollbarStyles!.mainThumbWidth).toBeCloseTo(6, 1);
      expect(matchingScrollbarStyles!.curriculumThumbWidth).toBeCloseTo(
        matchingScrollbarStyles!.mainThumbWidth,
        1,
      );
      expect(matchingScrollbarStyles!.curriculumThumbBackground).toBe(
        matchingScrollbarStyles!.mainThumbBackground,
      );
      expect(matchingScrollbarStyles!.curriculumCursor).toBe("auto");
      expect(matchingScrollbarStyles!.mainThumbCursor).toBe("auto");

      expect(
        (await getFloatingScrollbarThumbAppearance(curriculumThumb)).alpha,
      ).toBeCloseTo(0.9, 2);
      await exerciseFloatingScrollbar(
        page,
        curriculum,
        curriculumScrollbar,
        60,
      );
    }
  }
});

test("curriculum scrollbar follows navigation and sidebar layout shifts without scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1424, height: 678 });
  await openApp(page, "/");

  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  await navigation.getByRole("button", { name: "My Courses" }).click();
  await page
    .getByRole("article")
    .filter({ hasText: "The Ultimate TypeScript Course" })
    .getByRole("button", { name: "Continue Learning" })
    .click();

  const curriculum = page.locator("#learning-course-curriculum-scrollport");
  const curriculumScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="learning-course-curriculum-scrollport"]',
  );
  await expect(curriculum).toBeVisible();
  await expect(curriculumScrollbar).toHaveClass(/is-visible/);

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
  await openApp(page, "/explore-courses");

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
  await revealDeferredAppearanceSettings(page);

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
  await revealDeferredAppearanceSettings(page);

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
  await revealDeferredAppearanceSettings(page);

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
    .toContain("rgba(0, 0, 0, 0.3)");
  await expect
    .poll(() => shadowOf(settingsCard))
    .toContain("rgba(0, 0, 0, 0.42)");
  await expect
    .poll(() => shadowOf(mainSurface))
    .toContain("rgba(0, 0, 0, 0.3)");
  await expect
    .poll(() => shadowOf(mainSurface))
    .toContain("rgba(0, 0, 0, 0.42)");

  await elevatedSurfaces.click();
  await expect.poll(() => shadowOf(settingsCard)).toBe("none");
  await expect.poll(() => shadowOf(mainSurface)).toBe("none");
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
  await expect(elevationToggle).toHaveAttribute("aria-checked", "false");
  await expect(thumb).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await elevationToggle.hover();
  await expect(thumb).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await elevationToggle.click();
  await expect(elevationToggle).toHaveAttribute("aria-checked", "true");
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
  await openApp(page, "/explore-courses");

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

test("sidebar navigation clips at the rail edges without moving its menu items", async ({
  page,
}) => {
  await openApp(page, "/explore-courses");

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
    "Dark mode — switch to light mode",
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
    "Reading mode — off",
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
  await page.getByRole("menuitemradio", { name: "Creator" }).click();
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
  await expect(page).toHaveURL(/\/explore-courses$/);
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

test("sidebar collapse and hide shortcuts persist without losing navigation", async ({
  page,
}) => {
  await openApp(page, "/explore-courses");

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
  const path = "/learn/ui-ux-design-mastery?from=explore-courses";
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
  await openApp(page, "/learn/ui-ux-design-mastery?from=explore-courses");

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
  await openApp(page, "/explore-courses");

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

test("dismissing More clears a desktop reading menu hidden by a viewport change", async ({
  page,
}) => {
  await openApp(page, "/explore-courses");
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
  await openApp(page, "/explore-courses");
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

test("mobile navigation items reorder after a long press drag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/explore-courses");

  await page.getByRole("button", { name: "More navigation options" }).click();
  const dialog = page.getByRole("dialog", { name: /More/ });
  const source = dialog.getByRole("button", { name: /^Home/ });
  const target = dialog.getByRole("button", { name: /^My Courses/ });
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
  await expect(page).toHaveURL(/\/explore-courses$/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const order = JSON.parse(
          localStorage.getItem("veolms-navigation-order-student") || "[]",
        ) as string[];
        return order.indexOf("My Courses") < order.indexOf("Home");
      }),
    )
    .toBe(true);
});

test("tablet sidebar navigation items reorder after a long press drag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await openApp(page, "/explore-courses");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const source = sidebar.getByRole("button", { name: /^Home/ });
  const target = sidebar.getByRole("button", { name: /^My Courses/ });
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
        return order.indexOf("My Courses") < order.indexOf("Home");
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
  await openApp(page, "/explore-courses");

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

  await page.keyboard.press("Escape");
  await expect(paletteMenu).toBeHidden();
  if (!(await dialog.isVisible())) {
    await more.click();
    await expect(dialog).toBeVisible();
  }
  await modeControl.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
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
  await openApp(page, "/explore-courses");

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
  await openApp(page, "/explore-courses");

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
          .getByRole("button", { name: "Explore Courses" })
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
        .getByRole("button", { name: "Explore Courses" })
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
    const mainBox = await page.getByRole("main").boundingBox();
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

    await openApp(page, "/settings/appearance");
    await revealDeferredAppearanceSettings(page);
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
