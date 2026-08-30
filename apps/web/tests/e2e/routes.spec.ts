import { test, expect } from "./app.fixture.ts";
import {
  clickLearningBack,
  getApplicationScrollTop,
  installBaselineState,
  openApp,
  setApplicationScrollTop,
} from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("canonical home and direct routes preserve their titles", async ({
  page,
}) => {
  await openApp(page, "/");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/^Home .* ProCodrr$/);

  await page.goto("/home/");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/^Home .* ProCodrr$/);

  await page.goto("/settings/learning/");
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "learning",
  );

  await page.goto("/wishlist");
  await expect(
    page.getByRole("heading", { name: "Wishlist", level: 1 }),
  ).toBeVisible();
});

test("legacy student course URLs redirect to their renamed destinations", async ({
  page,
}) => {
  await openApp(page, "/my-learning");
  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    page.getByRole("heading", { name: "Courses", level: 1 }),
  ).toBeVisible();

  await page.goto("/courses");
  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    page.getByRole("heading", { name: "Courses", level: 1 }),
  ).toBeVisible();

  await page.goto("/courses/typescript-course/overview?ref=legacy");
  await expect(page).toHaveURL(
    /\/courses\/typescript-course\/overview\?ref=legacy$/,
  );
});

test("discussion tabs use canonical routes and browser history", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("veolms-page-tab-colors", "multicolor");
  });
  await page.setViewportSize({ width: 1440, height: 650 });
  await openApp(page, "/discussions/q-and-a");

  const tabs = page.getByRole("tablist", { name: "Discussion views" });
  const questions = tabs.getByRole("tab", { name: "Q&A" });
  const comments = tabs.getByRole("tab", { name: "Comments" });
  const mentions = tabs.getByRole("tab", { name: "Mentions" });

  await expect(questions).toHaveAttribute("aria-selected", "true");
  const questionStyle = await questions.evaluate((tab) => {
    const style = getComputedStyle(tab);
    return { color: style.color, indicator: style.borderBottomColor };
  });
  expect(questionStyle.indicator).toBe(questionStyle.color);
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-discussion-tab",
    "q-and-a",
  );

  await setApplicationScrollTop(page, 250);
  const discussionScrollPosition = await getApplicationScrollTop(page);
  expect(discussionScrollPosition).toBeGreaterThan(200);

  await comments.focus();
  await expect
    .poll(() => getApplicationScrollTop(page))
    .toBe(discussionScrollPosition);
  await comments.click();
  await expect(page).toHaveURL(/\/discussions\/comments$/);
  await expect(comments).toHaveAttribute("aria-selected", "true");
  expect(
    await comments.evaluate((tab) => getComputedStyle(tab).color),
  ).not.toBe(questionStyle.color);
  await expect
    .poll(() => getApplicationScrollTop(page))
    .toBe(discussionScrollPosition);

  await comments.press("ArrowRight");
  await expect(page).toHaveURL(/\/discussions\/mentions$/);
  await expect(mentions).toBeFocused();
  await expect(mentions).toHaveAttribute("aria-selected", "true");

  await page.goBack();
  await expect(page).toHaveURL(/\/discussions\/comments$/);
  await expect(comments).toHaveAttribute("aria-selected", "true");
  await expect(comments).toBeFocused();

  await comments.press("ArrowRight");
  await expect(page).toHaveURL(/\/discussions\/mentions$/);
  await page.goBack();
  await expect(comments).toBeFocused();

  await page.reload();
  await expect(comments).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveTitle(/^Discussions .* ProCodrr$/);
});

test("settings and discussion tabs resume within one tab and reset in a new tab", async ({
  page,
  context,
}) => {
  await openApp(page, "/settings");

  const settingsPanel = page.getByRole("tabpanel");
  await expect(settingsPanel).toHaveAttribute("data-settings-tab", "profile");
  await page.getByRole("tab", { name: "Appearance" }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("veolms-session-settings-tab"),
      ),
    )
    .toBe("appearance");

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(settingsPanel).toHaveAttribute(
    "data-settings-tab",
    "appearance",
  );
  await page.goto("/settings");
  await expect(settingsPanel).toHaveAttribute(
    "data-settings-tab",
    "appearance",
  );

  await page.getByRole("button", { name: "Discussions", exact: true }).click();
  await expect(page).toHaveURL(/\/discussions\/q-and-a$/);
  const discussionPanel = page.getByRole("tabpanel");
  await page.getByRole("tab", { name: "Mentions" }).click();
  await expect(page).toHaveURL(/\/discussions\/mentions$/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("veolms-session-discussions-tab"),
      ),
    )
    .toBe("mentions");

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Discussions", exact: true }).click();
  await expect(page).toHaveURL(/\/discussions\/mentions$/);
  await expect(discussionPanel).toHaveAttribute(
    "data-discussion-tab",
    "mentions",
  );
  await page.goto("/discussions");
  await expect(discussionPanel).toHaveAttribute(
    "data-discussion-tab",
    "mentions",
  );

  const freshPage = await context.newPage();
  await freshPage.goto("/settings");
  await expect(freshPage.locator("#root")).not.toBeEmpty();
  await expect(freshPage.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "profile",
  );
  await freshPage.goto("/discussions");
  await expect(freshPage.getByRole("tabpanel")).toHaveAttribute(
    "data-discussion-tab",
    "q-and-a",
  );
  await freshPage.close();
});

test("unknown, nested, and case-mismatched URLs retain the Home fallback contract", async ({
  page,
}) => {
  for (const path of [
    "/not-a-route",
    "/COURSES",
    "/explore-courses/typescript-course/overview",
  ]) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: /Good evening, Ashi/ }),
      ).toBeVisible();
      await expect(page).toHaveTitle(/^Home .* ProCodrr$/);
      expect(new URL(page.url()).pathname).toBe(path);
    });
  }
});

test("deferred workspace routes use the clean empty state", async ({
  page,
}) => {
  test.setTimeout(60_000);

  for (const [path, title] of [
    ["/students", "Students"],
    ["/analytics", "Analytics"],
    ["/messages", "Messages"],
  ] as const) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: title, level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Nothing here yet", level: 2 }),
      ).toBeVisible();
    });
  }
});

test("mobile workspace routes share the Home page gutter", async ({ page }) => {
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/");

  const homeOrigin = await page.locator(".student-home").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y };
  });

  for (const path of [
    "/settings/appearance",
    "/discussions/q-and-a",
    "/courses/create",
    "/students",
    "/reviews",
    "/analytics",
    "/orders",
    "/messages",
    "/order-history",
    "/notifications",
    "/logout",
  ]) {
    await test.step(path, async () => {
      await page.goto(path);
      const wrapper = page.locator("#courses-main-scrollport > *").first();
      await expect(wrapper).toBeVisible();
      await expect(wrapper).toHaveCSS("padding-top", "0px");
      await expect(wrapper).toHaveCSS("padding-right", "0px");
      await expect(wrapper).toHaveCSS("padding-left", "0px");

      const origin = await wrapper.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y };
      });
      expect(origin.x).toBeCloseTo(homeOrigin.x, 1);
      expect(origin.y).toBeCloseTo(homeOrigin.y, 1);
    });
  }
});

test("desktop pages share the Home page main gutter", async ({ page }) => {
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 1247, height: 779 });
  await openApp(page, "/");

  const readPageGeometry = async () => {
    const main = page.locator("#courses-main-scrollport");
    await expect(main.locator(":scope > *").first()).toBeVisible();
    return main.evaluate((element) => {
      const main = element as HTMLElement;
      const child = main.firstElementChild as HTMLElement | null;
      const mainStyle = getComputedStyle(main);
      const mainBounds = main.getBoundingClientRect();
      const childBounds = child?.getBoundingClientRect();
      return {
        childLeftInset: childBounds ? childBounds.left - mainBounds.left : null,
        childTopInset: childBounds ? childBounds.top - mainBounds.top : null,
        padding: [
          mainStyle.paddingTop,
          mainStyle.paddingRight,
          mainStyle.paddingBottom,
          mainStyle.paddingLeft,
        ],
      };
    });
  };

  const homeGeometry = await readPageGeometry();
  expect(homeGeometry.padding).toEqual(["22px", "25px", "28px", "25px"]);

  for (const path of [
    "/courses",
    "/wishlist",
    "/settings/appearance",
    "/discussions/q-and-a",
    "/courses/create",
    "/students",
    "/reviews",
    "/orders",
    "/notifications",
    "/logout",
  ]) {
    await test.step(path, async () => {
      await page.goto(path);
      const geometry = await readPageGeometry();
      expect(geometry.padding).toEqual(homeGeometry.padding);
      expect(geometry.childLeftInset).toBeCloseTo(
        homeGeometry.childLeftInset ?? 0,
        1,
      );
      expect(geometry.childTopInset).toBeCloseTo(
        homeGeometry.childTopInset ?? 0,
        1,
      );
    });
  }
});

test("compact pages keep primary headings within the shared top gutter", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 424, height: 779 });
  await installBaselineState(page);

  const expectHeadingTop = async (path: string) => {
    await openApp(page, path);
    const main = page.locator("#courses-main-scrollport");
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    const headingOffset = await heading.evaluate((element) => {
      const main = document.querySelector<HTMLElement>(
        "#courses-main-scrollport",
      )!;
      return (
        element.getBoundingClientRect().top -
        main.getBoundingClientRect().top -
        Number.parseFloat(getComputedStyle(main).paddingTop)
      );
    });
    await expect(main).toHaveCSS("padding-top", "20px");
    expect(headingOffset).toBeGreaterThanOrEqual(0);
    expect(headingOffset).toBeLessThanOrEqual(4);
  };

  for (const path of [
    "/",
    "/courses",
    "/wishlist",
    "/discussions/q-and-a",
    "/settings/appearance",
    "/notifications",
    "/order-history",
  ]) {
    await test.step(path, async () => expectHeadingTop(path));
  }

  await page.evaluate(() => localStorage.setItem("veolms-role", "creator"));
  await test.step("creator home", async () => expectHeadingTop("/"));
  await test.step("creator courses", async () => expectHeadingTop("/courses"));
});

test("every creator create action opens the dedicated course editor", async ({
  page,
}) => {
  await openApp(page, "/");
  await page.evaluate(() => localStorage.setItem("veolms-role", "creator"));
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Creator navigation" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Creator navigation" })
      .getByRole("button", { name: "Messages", exact: true }),
  ).toHaveCount(0);

  const expectCreateCourseEditor = async () => {
    await expect(page).toHaveURL(/\/courses\/create$/);
    await expect(
      page.getByRole("heading", { name: "Create New Course", level: 1 }),
    ).toBeVisible();
  };

  await page
    .getByRole("button", { name: "Create Course", exact: true })
    .click();
  await expectCreateCourseEditor();

  await page.goBack();
  await page
    .getByRole("button", { name: "Create Course Build a new course" })
    .click();
  await expectCreateCourseEditor();

  await page.goBack();
  await openApp(page, "/courses");
  const catalogueCreate = page.getByRole("button", {
    name: "Create",
    exact: true,
  });
  const catalogueSearch = page.locator("#courses-search");
  const catalogueHeader = page.locator("main#courses-main-scrollport header");
  const [createBox, searchBox, headerBox] = await Promise.all([
    catalogueCreate.boundingBox(),
    catalogueSearch.boundingBox(),
    catalogueHeader.boundingBox(),
  ]);
  expect(createBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(createBox?.height).toBe(44);
  expect(searchBox?.height).toBe(44);
  expect(
    Math.abs((createBox?.y ?? 0) - (searchBox?.y ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(createBox?.x ?? 0).toBeGreaterThan(searchBox?.x ?? 0);
  expect(
    Math.abs(
      (createBox?.x ?? 0) +
        (createBox?.width ?? 0) -
        ((headerBox?.x ?? 0) + (headerBox?.width ?? 0)),
    ),
  ).toBeLessThanOrEqual(1);
  await catalogueCreate.click();
  await expectCreateCourseEditor();
});

test("framework navigation keeps the academy shell and transient catalogue state mounted", async ({
  page,
}) => {
  await openApp(page, "/courses");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const search = page.getByPlaceholder("Search courses...");

  const historyLength = await page.evaluate(() => window.history.length);
  await navigation.getByRole("button", { name: "Courses" }).click();
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

  await search.fill("Node.js");
  await expect(search).toHaveValue("Node.js");
  await navigation.getByRole("button", { name: "Courses" }).press("Control+,");
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "appearance",
  );

  await page.goBack();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByPlaceholder("Search courses...")).toHaveValue(
    "Node.js",
  );
});

test("top-level navigation stays direct while Learning Space owns the active course", async ({
  page,
}) => {
  await openApp(page, "/");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });

  await navigation.getByRole("button", { name: "Courses" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    page.getByRole("heading", { name: "Courses", level: 1 }),
  ).toBeVisible();

  await page.getByRole("article", { name: /UI\/UX Design Mastery/ }).click();
  await expect(page).toHaveURL(
    /\/learn\/ui-ux-design-mastery\/[^/?]+\?from=courses$/,
  );
  const coursesNavigation = navigation.getByRole("button", {
    name: "Courses",
  });
  const homeNavigation = navigation.getByRole("button", { name: "Home" });
  await expect(coursesNavigation).not.toHaveAttribute("aria-current");
  await expect(homeNavigation).not.toHaveAttribute("aria-current");
  await expect(
    page.getByRole("heading", {
      name: "The Beginning of a Design Journey",
      level: 1,
    }),
  ).toBeVisible();

  const learningSpace = navigation.getByRole("region", {
    name: "Learning Space",
  });
  const session = learningSpace.getByRole("button", {
    name: /Open UI\/UX Design Mastery/,
  });
  await expect(session).toHaveAttribute("aria-current", "page");

  await homeNavigation.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(session).not.toHaveAttribute("aria-current");
  await coursesNavigation.click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(coursesNavigation).toHaveAttribute("aria-current", "page");

  await session.click();
  await expect(page).toHaveURL(
    /\/learn\/ui-ux-design-mastery\/[^/?]+\?from=courses$/,
  );
  await expect(session).toHaveAttribute("aria-current", "page");

  await clickLearningBack(page, "Return to Courses");
  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    page.getByRole("heading", { name: "Courses", level: 1 }),
  ).toBeVisible();
  await expect(session).not.toHaveAttribute("aria-current");
});

test("Learning Space resumes the same paused lesson while Courses remains direct", async ({
  page,
}) => {
  await openApp(page, "/courses");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const course = page
    .getByRole("article")
    .filter({ hasText: "The Ultimate TypeScript Course" });

  await course.getByRole("button", { name: "Continue Learning" }).click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/[^/?]+\?from=courses$/,
  );
  await expect(
    navigation.getByRole("button", { name: "Courses" }),
  ).not.toHaveAttribute("aria-current");

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  await curriculum
    .getByRole("button", { name: /10\.\s*Usability Testing/ })
    .click();
  const player = page.getByRole("region", {
    name: /Lesson video player for Usability Testing/,
  });
  await expect
    .poll(() =>
      player
        .locator("video")
        .evaluate((video) => !(video as HTMLVideoElement).paused),
    )
    .toBe(true);
  await player.getByRole("button", { name: "Pause" }).click();
  await expect
    .poll(() =>
      player
        .locator("video")
        .evaluate((video) => (video as HTMLVideoElement).paused),
    )
    .toBe(true);

  await navigation.getByRole("button", { name: "Home" }).click();
  await navigation.getByRole("button", { name: "Courses" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await navigation
    .getByRole("region", { name: "Learning Space" })
    .getByRole("button", { name: /Open The Ultimate TypeScript Course/ })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/usability-testing\?from=courses$/,
  );
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video) => (video as HTMLVideoElement).paused),
    )
    .toBe(true);

  await page.reload();
  await expect(
    navigation.getByRole("button", { name: "Courses" }),
  ).not.toHaveAttribute("aria-current");
  await clickLearningBack(page, "Return to Courses");

  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    page.getByRole("heading", { name: "Courses", level: 1 }),
  ).toBeVisible();
});

test("switching learning sessions preserves an unposted comment draft", async ({
  page,
}) => {
  await openApp(page, "/courses");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  await page
    .getByRole("article")
    .filter({ hasText: "The Ultimate TypeScript Course" })
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await page
    .getByRole("textbox", { name: "Add a comment" })
    .fill("Please post this before switching courses.");

  await navigation.getByRole("button", { name: "Courses" }).click();
  await page.getByRole("article", { name: /UI\/UX Design Mastery/ }).click();
  await expect(page).toHaveURL(
    /\/learn\/ui-ux-design-mastery\/[^/?]+\?from=courses$/,
  );
  await expect(
    page.getByRole("dialog", { name: "Post your comment first?" }),
  ).toHaveCount(0);

  const learningSpace = navigation.getByRole("region", {
    name: "Learning Space",
  });
  await expect(
    learningSpace.getByRole("button", {
      name: /Collapse Learning Space, 2 open sessions/,
    }),
  ).toBeVisible();
  await expect(
    learningSpace.getByRole("button", {
      name: /Open The Ultimate TypeScript Course/,
    }),
  ).toBeVisible();

  await learningSpace
    .getByRole("button", { name: /Open The Ultimate TypeScript Course/ })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/[^/?]+\?from=courses$/,
  );
  await expect(
    page.getByRole("textbox", { name: "Add a comment" }),
  ).toHaveValue("Please post this before switching courses.");
});

test("each Learning Space session keeps its launch page without top-level resume state", async ({
  page,
}) => {
  await openApp(page, "/");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const homeNavigation = navigation.getByRole("button", { name: "Home" });
  const coursesNavigation = navigation.getByRole("button", {
    name: "Courses",
  });
  const wishlistNavigation = navigation.getByRole("button", {
    name: "Wishlist",
  });

  await page
    .locator(".home-resume-card")
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/[^/?]+\?from=home$/,
  );
  const learningSpace = navigation.getByRole("region", {
    name: "Learning Space",
  });
  const typescriptSession = learningSpace.getByRole("button", {
    name: /Open The Ultimate TypeScript Course/,
  });
  await expect(typescriptSession).toHaveAttribute("aria-current", "page");
  await expect(homeNavigation).not.toHaveAttribute("aria-current");
  await expect(coursesNavigation).not.toHaveAttribute("aria-current");
  await expect(wishlistNavigation).not.toHaveAttribute("aria-current");
  await expect(
    navigation.locator(".courses-nav__resume-indicator"),
  ).toHaveCount(0);

  await homeNavigation.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(homeNavigation).toHaveAttribute("aria-current", "page");
  await expect(typescriptSession).not.toHaveAttribute("aria-current");

  await coursesNavigation.click();
  await page
    .getByRole("button", { name: "Add Figma UI Essentials to wishlist" })
    .click();
  await wishlistNavigation.click();
  await page
    .getByRole("button", {
      name: "Play free preview for Figma UI Essentials",
    })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/figma-ui-essentials\/[^/?]+\?from=wishlist$/,
  );

  const figmaSession = learningSpace.getByRole("button", {
    name: /Open Figma UI Essentials/,
  });
  await expect(figmaSession).toHaveAttribute("aria-current", "page");
  await expect(typescriptSession).not.toHaveAttribute("aria-current");
  await expect(wishlistNavigation).not.toHaveAttribute("aria-current");

  await typescriptSession.click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/[^/?]+\?from=home$/,
  );
  await clickLearningBack(page, "Return to Home");
  await expect(page).toHaveURL(/\/$/);

  await figmaSession.click();
  await expect(page).toHaveURL(
    /\/learn\/figma-ui-essentials\/[^/?]+\?from=wishlist$/,
  );
  await clickLearningBack(page, "Return to Wishlist");
  await expect(page).toHaveURL(/\/wishlist$/);
});

test("listing searches survive opening a player and returning explicitly", async ({
  page,
}) => {
  await openApp(page, "/courses");
  const myLearningSearch = page.getByPlaceholder("Search courses...");
  await myLearningSearch.fill("TypeScript");
  await page
    .getByRole("article")
    .filter({ hasText: "The Ultimate TypeScript Course" })
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await clickLearningBack(page, "Return to Courses");
  await expect(page.getByPlaceholder("Search courses...")).toHaveValue(
    "TypeScript",
  );

  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  await navigation.getByRole("button", { name: "Courses" }).click();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page
    .getByRole("button", { name: "Add Figma UI Essentials to wishlist" })
    .click();
  await navigation.getByRole("button", { name: /Wishlist/ }).click();
  const catalogueSearch = page.getByPlaceholder("Search courses...");
  await catalogueSearch.fill("Figma");
  await page
    .getByRole("button", {
      name: "Play free preview for Figma UI Essentials",
    })
    .click();
  await clickLearningBack(page, "Return to Wishlist");
  await expect(page.getByPlaceholder("Search courses...")).toHaveValue("Figma");
});

test("direct course player links return to Courses by default", async ({
  page,
}) => {
  await openApp(page, "/learn/ui-ux-design-mastery");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });

  await expect(
    navigation.getByRole("button", { name: "Courses" }),
  ).not.toHaveAttribute("aria-current");
  await expect(
    navigation
      .getByRole("region", { name: "Learning Space" })
      .getByRole("button", { name: /Open UI\/UX Design Mastery/ }),
  ).toHaveAttribute("aria-current", "page");
  await clickLearningBack(page, "Return to Courses");
  await expect(page).toHaveURL(/\/courses$/);
});

test("course overview launches return to the exact source URL", async ({
  page,
}) => {
  const sourcePath =
    "/courses/typescript-course/overview?ref=dashboard#curriculum";
  await openApp(page, sourcePath);

  await page.getByRole("button", { name: "Continue Learning" }).click();
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname.startsWith("/learn/typescript-course/") &&
      url.searchParams.get("from") === "courses" &&
      url.searchParams.get("returnTo") === sourcePath
    );
  });

  await clickLearningBack(page, "Return to Course Overview");
  await expect(page).toHaveURL((url) => {
    return `${url.pathname}${url.search}${url.hash}` === sourcePath;
  });
});

test("learning Back preserves validated source query and hash values", async ({
  page,
}) => {
  const sourcePath = "/settings?source=course-player#learning";
  const search = new URLSearchParams({
    from: "courses",
    returnTo: sourcePath,
  });
  await openApp(page, `/learn/typescript-course?${search.toString()}`);

  await clickLearningBack(page, "Return to the previous page");
  await expect(page).toHaveURL((url) => {
    return `${url.pathname}${url.search}${url.hash}` === sourcePath;
  });
});

test("lecture slugs are canonical and lecture IDs remain supported", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course/3?from=courses");
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/the-design-mindset\?from=courses$/,
  );
  await expect(
    page.getByRole("heading", { name: "The Design Mindset", level: 1 }),
  ).toBeVisible();

  await page
    .getByRole("complementary", { name: "Course curriculum" })
    .getByRole("button", { name: /10\.\s*Usability Testing/ })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/usability-testing\?from=courses$/,
  );

  await page.goBack();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/the-design-mindset\?from=courses$/,
  );
  await expect(
    page.getByRole("heading", { name: "The Design Mindset", level: 1 }),
  ).toBeVisible();
});

test("legacy course player links redirect to the canonical learning route", async ({
  page,
}) => {
  await openApp(page, "/courses/ui-ux-design-mastery/lesson-3?from=home");
  await expect(page).toHaveURL(
    /\/learn\/ui-ux-design-mastery\/the-design-mindset\?from=home$/,
  );
  await expect(
    page.getByRole("heading", {
      name: "The Design Mindset",
      level: 1,
    }),
  ).toBeVisible();
});
