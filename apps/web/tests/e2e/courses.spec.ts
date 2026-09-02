import { test, expect } from "./app.fixture.ts";
import { expectStoredValue, installBaselineState, openApp } from "./support.ts";
import { academyThemes } from "../../src/themes.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
  await openApp(page, "/courses");
});

test("bottom navigation starts at the 640px phone breakpoint", async ({
  page,
}) => {
  const navigation = page.getByRole("navigation", {
    name: "Student mobile navigation",
  });

  await page.setViewportSize({ width: 641, height: 844 });
  await expect(navigation).toHaveCount(0);
  await expect(page.locator(".courses-sidebar")).toBeVisible();

  await page.setViewportSize({ width: 640, height: 844 });
  await expect(navigation).toBeVisible();
  await expect(page.locator(".courses-sidebar")).toBeHidden();
});

test("browser back closes an ordinary popup before course navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const coursesUrl = page.url();
  await page
    .getByRole("button", { name: /^Actions for / })
    .first()
    .click();

  const actionsMenu = page.getByRole("menu", { name: /^Actions for / }).first();
  await expect(actionsMenu).toBeVisible();

  await page.goBack();
  await expect(actionsMenu).toBeHidden();
  await expect(page).toHaveURL(coursesUrl);
});

test("home shell follows viewport resizing without animating its layout track", async ({
  page,
}) => {
  await openApp(page, "/");

  for (const width of [1440, 1180, 900, 821, 820, 700, 820, 821, 900, 1440]) {
    await page.setViewportSize({ width, height: 779 });

    const resizeState = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".courses-app");
      const main = document.querySelector<HTMLElement>(".courses-main");
      if (!shell || !main) return null;

      const shellBounds = shell.getBoundingClientRect();
      const mainBounds = main.getBoundingClientRect();
      const layoutTrackTransitions = shell
        .getAnimations()
        .filter(
          (animation) =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === "grid-template-columns",
        ).length;

      return {
        layoutTrackTransitions,
        transitionDurationSeconds: Math.max(
          ...getComputedStyle(shell)
            .transitionDuration.split(",")
            .map((duration) => Number.parseFloat(duration)),
        ),
        shellLeft: shellBounds.left,
        shellRightGap: Math.abs(window.innerWidth - shellBounds.right),
        mainInsideShell:
          mainBounds.left >= shellBounds.left - 1 &&
          mainBounds.right <= shellBounds.right + 1,
      };
    });

    expect(resizeState).not.toBeNull();
    expect(resizeState!.layoutTrackTransitions, `${width}px`).toBe(0);
    expect(
      resizeState!.transitionDurationSeconds,
      `${width}px`,
    ).toBeLessThanOrEqual(0.001);
    expect(Math.abs(resizeState!.shellLeft), `${width}px`).toBeLessThanOrEqual(
      1,
    );
    expect(resizeState!.shellRightGap, `${width}px`).toBeLessThanOrEqual(1);
    expect(resizeState!.mainInsideShell, `${width}px`).toBe(true);
  }
});

test("sidebar layout animates unless reduced animations are enabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    localStorage.setItem("veolms-reduce-animations", "false");
    document.documentElement.dataset.reduceAnimations = "false";
  });

  const readSidebarTransition = () =>
    page.locator(".courses-app").evaluate((element) => ({
      duration: getComputedStyle(element).transitionDuration,
      property: getComputedStyle(element).transitionProperty,
    }));

  await expect
    .poll(async () => readSidebarTransition())
    .toEqual({
      duration: "0.22s",
      property: "grid-template-columns",
    });

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.locator(".courses-app")).toHaveClass(
    /courses-app--collapsed/,
  );

  await page.evaluate(() => {
    localStorage.setItem("veolms-reduce-animations", "true");
    document.documentElement.dataset.reduceAnimations = "true";
  });

  await expect
    .poll(async () =>
      Number.parseFloat((await readSidebarTransition()).duration),
    )
    .toBeLessThanOrEqual(0.001);
});

test("sidebar follows the 1080px default and remains manually toggleable", async ({
  page,
}) => {
  await page.evaluate(() => localStorage.setItem("veolms-role", "creator"));
  await page.setViewportSize({ width: 1080, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const app = page.locator(".courses-app");
  const sidebar = page.getByRole("complementary", {
    name: "Creator navigation",
  });
  await expect(app).toHaveClass(/courses-app--collapsed/);
  const expand = sidebar.getByRole("button", { name: "Expand navigation" });
  await sidebar.hover();
  await expect(expand).toHaveCSS("pointer-events", "auto");

  await expand.click();
  await expect(app).not.toHaveClass(/courses-app--collapsed/);
  await page.setViewportSize({ width: 1079, height: 779 });
  await expect(app).not.toHaveClass(/courses-app--collapsed/);

  await sidebar.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(app).toHaveClass(/courses-app--collapsed/);
  await page.setViewportSize({ width: 1081, height: 779 });
  await expect(app).not.toHaveClass(/courses-app--collapsed/);

  await sidebar.getByRole("button", { name: "Collapse navigation" }).click();
  await page.setViewportSize({ width: 1200, height: 779 });
  await expect(app).toHaveClass(/courses-app--collapsed/);

  await sidebar.hover();
  await sidebar.getByRole("button", { name: "Expand navigation" }).click();
  await page.setViewportSize({ width: 1080, height: 779 });
  await expect(app).toHaveClass(/courses-app--collapsed/);
});

test("course search matches the creator action and keeps the same student height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 779 });
  await page.evaluate(() => localStorage.setItem("veolms-role", "creator"));
  await openApp(page, "/courses");

  const creatorSearch = page.locator("#courses-search");
  const createCourse = page.getByRole("button", { name: "Create" });
  const creatorHeights = await Promise.all([
    creatorSearch.evaluate((element) => element.getBoundingClientRect().height),
    createCourse.evaluate((element) => element.getBoundingClientRect().height),
  ]);
  expect(creatorHeights).toEqual([44, 44]);

  await page.evaluate(() => localStorage.setItem("veolms-role", "student"));
  await openApp(page, "/courses");
  await expect(page.locator("#courses-search")).toHaveCSS("height", "44px");
});

test("course search shows only the custom clear control", async ({ page }) => {
  await page.setViewportSize({ width: 732, height: 779 });
  const searchToggle = page.locator(
    'button[aria-controls="courses-search-input"]',
  );
  const triggerBounds = await searchToggle.boundingBox();
  await searchToggle.click();

  const searchInput = page.locator("#courses-search-input");
  const searchField = page.locator("#courses-search");
  const fieldBounds = await searchField.boundingBox();
  expect(triggerBounds).not.toBeNull();
  expect(fieldBounds).not.toBeNull();
  expect(
    Math.abs(
      triggerBounds!.y +
        triggerBounds!.height / 2 -
        (fieldBounds!.y + fieldBounds!.height / 2),
    ),
  ).toBeLessThanOrEqual(1);

  await searchInput.fill("node");
  const clearSearch = page.getByRole("button", { name: "Clear search" });

  await expect(clearSearch).toBeVisible();
  await expect(searchInput).toHaveClass(/native-search-clear-hidden/);
  await expect(searchInput).toHaveCSS("appearance", "none");

  await clearSearch.click();
  await expect(searchInput).toHaveValue("");
});

test("course cards keep two columns down to the 560px breakpoint", async ({
  page,
}) => {
  const courseGrid = page.locator("[data-course-grid-section] > div");
  const columnCount = () =>
    courseGrid.evaluate(
      (grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    );

  for (const width of [767, 600, 560]) {
    await page.setViewportSize({ width, height: 779 });
    await expect.poll(columnCount, `${width}px course columns`).toBe(2);
  }

  await page.setViewportSize({ width: 559, height: 779 });
  await expect.poll(columnCount, "559px course columns").toBe(1);
});

test("the course catalogue and application frame stay elevated in every theme", async ({
  page,
}) => {
  test.slow();

  const root = page.locator("html");
  for (const mode of ["light", "dark"] as const) {
    await page.evaluate((nextMode) => {
      localStorage.setItem("veolms-theme", nextMode);
    }, mode);
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", mode);
    const appearanceButton = page
      .locator('.sidebar-appearance [data-dock-item="appearance"]')
      .first();
    await appearanceButton.dispatchEvent("contextmenu");
    const paletteMenu = page.locator("#desktop-theme-menu");
    await expect(paletteMenu).toBeVisible();

    for (const { id: palette } of academyThemes) {
      await paletteMenu.locator(`[data-theme-swatch="${palette}"]`).click();
      await expect(root).toHaveAttribute("data-palette", palette);
      // Theme surfaces transition for 150ms; sample after the visual state settles.
      await page.waitForTimeout(180);

      const reading = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>(".courses-main");
        const search = document.querySelector<HTMLElement>("#courses-search");
        return {
          frameShadow: frame ? getComputedStyle(frame).boxShadow : "none",
          searchBorder: search
            ? getComputedStyle(search).borderTopColor
            : "transparent",
          searchBorderWidth: search
            ? getComputedStyle(search).borderTopWidth
            : "0px",
        };
      });

      expect(reading.frameShadow, `${mode}/${palette}`).not.toBe("none");
      expect(reading.frameShadow, `${mode}/${palette}`).toContain(
        mode === "dark" ? "0px 20px 46px" : "0px 19px 38px",
      );
      expect(reading.searchBorder, `${mode}/${palette}`).not.toMatch(
        /transparent|rgba\([^)]*,\s*0\)|\/\s*0\s*\)/,
      );
      expect(
        parseFloat(reading.searchBorderWidth),
        `${mode}/${palette}`,
      ).toBeGreaterThan(0);
    }
  }
});

test("home cards keep their light material and elevation in every light palette", async ({
  page,
}) => {
  test.slow();

  await page.evaluate(() => {
    localStorage.setItem("veolms-theme", "light");
  });
  await openApp(page, "/");

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "light");

  const cards = page.locator(
    ".home-resume-card, .dashboard-panel, .home-goal-summary, .home-mini-course, .home-metric",
  );
  expect(await cards.count()).toBeGreaterThanOrEqual(10);

  const appearanceButton = page
    .locator('.sidebar-appearance [data-dock-item="appearance"]')
    .first();
  await appearanceButton.dispatchEvent("contextmenu");
  const paletteMenu = page.locator("#desktop-theme-menu");
  await expect(paletteMenu).toBeVisible();

  for (const { id: palette } of academyThemes) {
    await paletteMenu.locator(`[data-theme-swatch="${palette}"]`).click();
    await expect(root).toHaveAttribute("data-palette", palette);
    await page.waitForTimeout(180);

    const reading = await page.evaluate(() => {
      const homeCards = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".home-resume-card, .dashboard-panel, .home-goal-summary, .home-mini-course, .home-metric",
        ),
      );

      const resolvedBackground = (value: string) => {
        const probe = document.createElement("div");
        probe.style.background = value;
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      };

      return {
        backgrounds: homeCards.map(
          (card) => getComputedStyle(card).backgroundColor,
        ),
        shadows: homeCards.map((card) => getComputedStyle(card).boxShadow),
        surface: resolvedBackground("var(--surface)"),
        strongSurface: resolvedBackground("var(--surface-strong)"),
        cardSurface: resolvedBackground("var(--card-surface)"),
        raisedSurface: resolvedBackground("var(--card-surface-raised)"),
      };
    });

    for (const background of reading.backgrounds) {
      expect(
        [reading.cardSurface, reading.raisedSurface],
        `${palette}/${background}`,
      ).toContain(background);
    }
    for (const shadow of reading.shadows) {
      expect(shadow, palette).toContain("0px 7px 17px");
    }
    if (["sunlit", "grove", "rose"].includes(palette)) {
      expect(reading.cardSurface, palette).toBe(reading.surface);
      expect(reading.raisedSurface, palette).toBe(reading.strongSurface);
    }
  }
});

test("home replaces the duplicate TypeScript card with the enrolled JavaScript course", async ({
  page,
}) => {
  await openApp(page, "/");

  await expect(
    page
      .locator(".home-resume-card")
      .getByRole("heading", { name: "The Ultimate TypeScript Course" }),
  ).toBeVisible();

  const continueLearning = page.locator(".home-continue-panel");
  await expect(
    continueLearning.getByRole("heading", {
      name: "The Complete JavaScript Course",
    }),
  ).toBeVisible();
  await expect(
    continueLearning.getByRole("heading", {
      name: "The Ultimate TypeScript Course",
    }),
  ).toHaveCount(0);

  await continueLearning
    .getByRole("article")
    .filter({ hasText: "The Complete JavaScript Course" })
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/javascript-course\/[^/?]+\?from=home$/,
  );
  await expect(
    page.getByRole("heading", { name: "The Complete JavaScript Course" }),
  ).toBeVisible();
});

test("learning progress follows the selected application theme", async ({
  page,
}) => {
  const themeAccent = () =>
    page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--accent)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
  const expectThemeProgress = async (selector: string) => {
    const javascriptCourse = page
      .getByRole("article")
      .filter({ hasText: "The Complete JavaScript Course" });
    const progressFill = javascriptCourse.locator(selector);

    await expect
      .poll(() =>
        progressFill.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      )
      .toBe(await themeAccent());
  };

  await expectThemeProgress("[data-course-card-progress-fill]");

  await openApp(page, "/courses");

  await expectThemeProgress("[data-course-card-progress-fill]");

  await page
    .getByRole("button", { name: /mode active\. Switch to .* mode/ })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectThemeProgress("[data-course-card-progress-fill]");

  await openApp(page, "/courses");
  await expectThemeProgress("[data-course-card-progress-fill]");
});

test("course enrollment, search, status, and sort controls derive the visible catalogue", async ({
  page,
}) => {
  const grid = page.getByRole("region", { name: "Courses" });
  const allCourses = grid.getByRole("article");
  await expect(allCourses).toHaveCount(7);
  await expect(allCourses.nth(0)).toHaveAccessibleName(
    /Complete Backend with Node.js/,
  );
  await expect(allCourses.nth(1)).toHaveAccessibleName(/Figma UI Essentials/);
  await expect(
    grid.getByRole("article", { name: /AWS Cloud Practitioner Essentials/ }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Enrolled", exact: true }).click();
  await expect(grid.getByRole("article")).toHaveCount(5);
  await expect(grid.getByRole("article").nth(1)).toHaveAccessibleName(
    /The Ultimate TypeScript Course/,
  );
  await page.getByRole("tab", { name: "Not Enrolled" }).click();
  await expect(grid.getByRole("article")).toHaveCount(2);
  await page.getByRole("tab", { name: "All" }).click();

  await page.getByPlaceholder("Search courses...").fill("mongo");
  await expect(grid.getByRole("article")).toHaveCount(1);
  await expect(
    grid.getByRole("article", { name: /MongoDB & Database Design/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();

  await page.getByRole("button", { name: /^Filter course status:/ }).click();
  await page.getByRole("option", { name: "In Progress", exact: true }).click();
  await expect(grid.getByRole("article")).toHaveCount(3);
  await expect(
    grid.getByRole("article", { name: /Complete Backend with Node.js/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Filter course status:/ }).click();
  await page.getByRole("option", { name: "Status: All", exact: true }).click();
  await page.getByRole("button", { name: /^Sort courses:/ }).click();
  const titleSortOption = page.getByRole("option", {
    name: "A-Z",
  });
  await titleSortOption.hover();
  const optionInsets = await titleSortOption.evaluate((option) => {
    const content = option.closest(".themed-select__content");
    if (!(content instanceof HTMLElement)) return null;
    const contentRect = content.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    return {
      inlineStart: optionRect.left - contentRect.left,
      inlineEnd: contentRect.right - optionRect.right,
    };
  });
  expect(optionInsets).not.toBeNull();
  expect(optionInsets?.inlineStart).toBeCloseTo(1, 0);
  expect(optionInsets?.inlineEnd).toBeCloseTo(1, 0);
  await titleSortOption.click();
  await expect(grid.getByRole("heading", { level: 2 })).toHaveText([
    "AWS Cloud Practitioner Essentials",
    "Complete Backend with Node.js",
    "Figma UI Essentials",
    "MongoDB & Database Design",
    "The Complete JavaScript Course",
    "The Ultimate TypeScript Course",
    "UI/UX Design Mastery",
  ]);
});

test("retired course summary and compact catalogue controls stay absent", async ({
  page,
}) => {
  await expect(
    page.getByRole("region", { name: "Learning overview" }),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: /^Filter course status:/ }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: /^Sort courses:/ }),
  ).toBeHidden();
});

test("View Curriculum reveals the overview curriculum section", async ({
  page,
}) => {
  const figmaCourse = page.getByRole("article", {
    name: /Figma UI Essentials/,
  });

  await figmaCourse.getByRole("button", { name: "View Curriculum" }).click();
  await expect(page).toHaveURL(
    /\/courses\/figma-ui-essentials\/overview#cov-curriculum-heading$/,
  );
  await expect(page.locator("#cov-curriculum-heading")).toBeInViewport();
});

test("wishlist state is shared across catalogue routes and survives reload", async ({
  page,
}) => {
  await page
    .getByRole("button", {
      name: "Add Figma UI Essentials to wishlist",
    })
    .click();
  await expectStoredValue(page, "veolms-wishlist", '["figma-ui-essentials"]');

  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  await expect(
    navigation.getByRole("button", { name: "Wishlist, 1 saved" }),
  ).toBeVisible();
  await navigation.getByRole("button", { name: "Wishlist, 1 saved" }).click();
  await expect(page).toHaveURL(/\/wishlist$/);

  const wishlist = page.getByRole("region", { name: "Wishlist" });
  await expect(wishlist.getByRole("article")).toHaveCount(1);
  await expect(
    wishlist.getByRole("article", { name: /Figma UI Essentials/ }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remove Figma UI Essentials from wishlist",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", {
      name: "Remove Figma UI Essentials from wishlist",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your wishlist is empty" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-wishlist", "[]");
});

test("student course cards separate playback, curriculum, and preview actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 617, height: 724 });
  const backendCourse = page.getByRole("article", {
    name: /Complete Backend with Node.js/,
  });
  await expect(
    backendCourse.getByRole("button", { name: "Continue Learning" }),
  ).toBeVisible();
  const curriculumLink = backendCourse.getByRole("link", {
    name: "View curriculum for Complete Backend with Node.js",
  });
  const actionsButton = backendCourse.getByRole("button", {
    name: "Actions for Complete Backend with Node.js",
  });
  const details = backendCourse.locator("[data-course-card-details]");
  const infoRow = backendCourse.locator("[data-course-card-info-row]");
  await expect(curriculumLink).toHaveAttribute("title", "View Curriculum");
  const [detailsBounds, curriculumBounds, actionsBounds] = await Promise.all([
    details.boundingBox(),
    curriculumLink.boundingBox(),
    actionsButton.boundingBox(),
  ]);
  expect(detailsBounds).not.toBeNull();
  expect(curriculumBounds).not.toBeNull();
  expect(actionsBounds).not.toBeNull();
  expect(curriculumBounds).toEqual(detailsBounds);
  await curriculumLink.hover();
  expect(
    await curriculumLink.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).not.toBe("rgba(0, 0, 0, 0)");
  await actionsButton.hover();
  expect(
    await infoRow.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    await actionsButton
      .locator("span.relative > span")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
  await expect(actionsButton).toHaveAttribute("aria-haspopup", "menu");
  await actionsButton.click();
  const actionsMenu = page.getByRole("menu", {
    name: "Actions for Complete Backend with Node.js",
  });
  await expect(actionsMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(actionsMenu).toBeHidden();
  await curriculumLink.click();
  await expect(page).toHaveURL(/\/courses\/backend-nodejs\/overview$/);

  await openApp(page, "/courses");
  const figmaCourse = page.getByRole("article", {
    name: /Figma UI Essentials/,
  });
  await expect(
    figmaCourse.getByText("Not Enrolled", { exact: true }),
  ).toHaveAttribute("data-course-card-tag");
  await expect(figmaCourse.locator("[data-course-card-tag] svg")).toHaveCount(
    0,
  );
  await expect(figmaCourse.locator("[data-course-card-pricing]")).toContainText(
    "₹1,499",
  );
  await expect(figmaCourse.locator("[data-course-card-pricing]")).toContainText(
    "₹2,499",
  );
  await expect(figmaCourse.locator("[data-course-card-pricing]")).toContainText(
    "40% off",
  );
  await expect(
    figmaCourse.getByRole("button", { name: "View Curriculum" }),
  ).toBeVisible();
  await figmaCourse
    .getByRole("link", {
      name: "View curriculum for Figma UI Essentials",
    })
    .click();
  await expect(page).toHaveURL(/\/courses\/figma-ui-essentials\/overview$/);

  await openApp(page, "/courses");
  await page.evaluate(() =>
    localStorage.setItem("veolms-last-lesson-figma-ui-essentials", "5"),
  );
  await page
    .getByRole("article", { name: /Figma UI Essentials/ })
    .getByRole("button", {
      name: "Play free preview for Figma UI Essentials",
    })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/figma-ui-essentials\/the-beginning-of-a-design-journey\?from=courses$/,
  );
});

test("creator course cards keep playback, overview, editing, and preview independent", async ({
  page,
}) => {
  await page.evaluate(() => localStorage.setItem("veolms-role", "creator"));
  await openApp(page, "/courses");

  const course = page.getByRole("article", {
    name: /Complete Backend with Node.js/,
  });
  const play = course.getByRole("button", {
    name: "Play Complete Backend with Node.js",
  });
  await play.hover();
  const playBadge = play.locator("span.relative");
  await expect(playBadge).toHaveCSS("opacity", "1");
  await expect(playBadge.locator("svg")).toBeVisible();
  await play.click();
  await expect(page).toHaveURL(
    /\/learn\/backend-nodejs\/[^/?]+\?from=courses$/,
  );

  await openApp(page, "/courses");
  await page
    .getByRole("article", { name: /Complete Backend with Node.js/ })
    .getByRole("link", {
      name: "View curriculum for Complete Backend with Node.js",
    })
    .click();
  await expect(page).toHaveURL(/\/courses\/backend-nodejs\/overview$/);

  await openApp(page, "/courses");
  await page
    .getByRole("article", { name: /Complete Backend with Node.js/ })
    .getByRole("button", { name: "Edit Course" })
    .click();
  await expect(page).toHaveURL(/\/courses\/create\?edit=backend-nodejs$/);

  await openApp(page, "/courses");
  const refreshedCourse = page.getByRole("article", {
    name: /Complete Backend with Node.js/,
  });
  await refreshedCourse
    .getByRole("button", { name: "Actions for Complete Backend with Node.js" })
    .click();
  await page.getByRole("menuitem", { name: "Course Preview" }).click();

  await expect(page).toHaveURL(/\/courses\/backend-nodejs\/overview$/);
  await expect(
    page.getByRole("heading", { name: "Course curriculum", level: 2 }),
  ).toBeVisible();
});
