import { test, expect } from "./app.fixture.ts";
import {
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
  await expect(page).toHaveURL(/\/my-courses$/);
  await expect(
    page.getByRole("heading", { name: "My Courses", level: 1 }),
  ).toBeVisible();

  await page.goto("/courses");
  await expect(page).toHaveURL(/\/explore-courses$/);
  await expect(
    page.getByRole("heading", { name: "Explore Courses", level: 1 }),
  ).toBeVisible();

  await page.goto("/courses/typescript-course/overview?ref=legacy");
  await expect(page).toHaveURL(
    /\/explore-courses\/typescript-course\/overview\?ref=legacy$/,
  );
});

test("My Courses overview metrics render as separate responsive cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1160, height: 753 });
  await openApp(page, "/my-courses");

  const overview = page.getByRole("region", { name: "Learning overview" });
  const cards = overview.locator("article");
  await expect(cards).toHaveCount(4);
  await expect(overview).toHaveCSS("box-shadow", "none");
  expect(
    await overview.evaluate((element) => getComputedStyle(element).columnGap),
  ).toBe("12px");

  const desktopRects = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top };
    }),
  );
  expect(desktopRects[1]!.left - desktopRects[0]!.right).toBeGreaterThanOrEqual(
    11,
  );
  expect(desktopRects.every(({ top }) => top === desktopRects[0]!.top)).toBe(
    true,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileRects = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top };
    }),
  );
  expect(mobileRects[1]!.left - mobileRects[0]!.right).toBeGreaterThanOrEqual(
    9,
  );
  expect(mobileRects[2]!.top).toBeGreaterThan(mobileRects[0]!.top);
  expect(mobileRects[2]!.left).toBe(mobileRects[0]!.left);
});

test("discussion tabs use canonical routes and browser history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 650 });
  await openApp(page, "/discussions/q-and-a");

  const tabs = page.getByRole("tablist", { name: "Discussion views" });
  const questions = tabs.getByRole("tab", { name: "Q&A" });
  const comments = tabs.getByRole("tab", { name: "Comments" });
  const mentions = tabs.getByRole("tab", { name: "Mentions" });

  await page.locator("html").evaluate((root) => {
    root.dataset.pageTabColors = "multicolor";
  });

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
  for (const path of ["/not-a-route", "/COURSES"]) {
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
    ["/courses/create", "Create Course"],
    ["/explore-courses/typescript-course/overview", "Course Overview"],
    ["/students", "Students"],
    ["/reviews", "Reviews"],
    ["/analytics", "Analytics"],
    ["/orders", "Orders"],
    ["/messages", "Messages"],
    ["/order-history", "Order History"],
    ["/notifications", "Notifications"],
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

  for (const [path, selector] of [
    ["/settings/appearance", ".settings-page"],
    ["/discussions/q-and-a", ".discussion-hub"],
    ["/courses/create", ".courses-placeholder-page"],
    ["/students", ".courses-placeholder-page"],
    ["/reviews", ".courses-placeholder-page"],
    ["/analytics", ".courses-placeholder-page"],
    ["/orders", ".courses-placeholder-page"],
    ["/messages", ".courses-placeholder-page"],
    ["/order-history", ".courses-placeholder-page"],
    ["/notifications", ".courses-placeholder-page"],
    ["/logout", ".workspace-page"],
  ] as const) {
    await test.step(path, async () => {
      await page.goto(path);
      const wrapper = page.locator(selector);
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

test("every creator Create Course action opens the dedicated empty route", async ({
  page,
}) => {
  await openApp(page, "/");
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  await sidebar
    .getByRole("button", { name: "Open role and appearance menu" })
    .click();
  await page.getByRole("menuitemradio", { name: "Creator" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Creator navigation" })
      .getByRole("button", { name: "Messages", exact: true }),
  ).toHaveCount(0);

  const expectEmptyCreateCourseRoute = async () => {
    await expect(page).toHaveURL(/\/courses\/create$/);
    await expect(
      page.getByRole("heading", { name: "Create Course", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nothing here yet", level: 2 }),
    ).toBeVisible();
  };

  await page
    .getByRole("button", { name: "Create Course", exact: true })
    .click();
  await expectEmptyCreateCourseRoute();

  await page.goBack();
  await page
    .getByRole("button", { name: "Create Course Build a new course" })
    .click();
  await expectEmptyCreateCourseRoute();

  await page.goBack();
  await page
    .getByRole("complementary", { name: "Creator navigation" })
    .getByRole("button", { name: "Courses" })
    .click();
  await page
    .getByRole("button", { name: "Create Course", exact: true })
    .click();
  await expectEmptyCreateCourseRoute();
});

test("framework navigation keeps the academy shell and transient catalogue state mounted", async ({
  page,
}) => {
  await openApp(page, "/explore-courses");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const search = page.getByPlaceholder("Search your courses...");

  const historyLength = await page.evaluate(() => window.history.length);
  await navigation.getByRole("button", { name: "Explore Courses" }).click();
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

  await search.fill("Node.js");
  await expect(search).toHaveValue("Node.js");
  await navigation
    .getByRole("button", { name: "Explore Courses" })
    .press("Control+,");
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "appearance",
  );

  await page.goBack();
  await expect(page).toHaveURL(/\/explore-courses$/);
  await expect(page.getByPlaceholder("Search your courses...")).toHaveValue(
    "Node.js",
  );
});

test("Explore Courses navigation resumes its player until explicit player back", async ({
  page,
}) => {
  await openApp(page, "/");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });

  await navigation.getByRole("button", { name: "Explore Courses" }).click();
  await expect(page).toHaveURL(/\/explore-courses$/);
  await expect(
    page.getByRole("heading", { name: "Explore Courses", level: 1 }),
  ).toBeVisible();

  await page.getByRole("article", { name: /UI\/UX Design Mastery/ }).click();
  await expect(page).toHaveURL(
    /\/learn\/ui-ux-design-mastery\/[^/?]+\?from=explore-courses$/,
  );
  await expect(
    navigation.getByRole("button", { name: "Explore Courses" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", {
      name: "The Beginning of a Design Journey",
      level: 1,
    }),
  ).toBeVisible();

  await navigation.getByRole("button", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await navigation.getByRole("button", { name: "Explore Courses" }).click();
  await expect(page).toHaveURL(
    /\/learn\/ui-ux-design-mastery\/[^/?]+\?from=explore-courses$/,
  );

  await page.getByRole("button", { name: "Return to Explore Courses" }).click();
  await expect(page).toHaveURL(/\/explore-courses$/);
  await expect(
    page.getByRole("heading", { name: "Explore Courses", level: 1 }),
  ).toBeVisible();

  await navigation.getByRole("button", { name: "Home" }).click();
  await navigation.getByRole("button", { name: "Explore Courses" }).click();
  await expect(page).toHaveURL(/\/explore-courses$/);
  await expect(
    navigation.getByRole("button", { name: "Explore Courses" }),
  ).toHaveAttribute("aria-current", "page");
});

test("My Courses resumes the same paused lesson until explicit player back", async ({
  page,
}) => {
  await openApp(page, "/my-courses");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const course = page
    .getByRole("article")
    .filter({ hasText: "The Ultimate TypeScript Course" });

  await course.getByRole("button", { name: "Continue Learning" }).click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/[^/?]+\?from=my-courses$/,
  );
  await expect(
    navigation.getByRole("button", { name: "My Courses" }),
  ).toHaveAttribute("aria-current", "page");

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
  await navigation.getByRole("button", { name: "My Courses" }).click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/usability-testing\?from=my-courses$/,
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
    navigation.getByRole("button", { name: "My Courses" }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Return to My Courses" }).click();

  await expect(page).toHaveURL(/\/my-courses$/);
  await expect(
    page.getByRole("heading", { name: "My Courses", level: 1 }),
  ).toBeVisible();

  await navigation.getByRole("button", { name: "Home" }).click();
  await navigation.getByRole("button", { name: "My Courses" }).click();
  await expect(page).toHaveURL(/\/my-courses$/);
});

test("switching the single learning session protects an unposted comment", async ({
  page,
}) => {
  await openApp(page, "/my-courses");
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

  await navigation.getByRole("button", { name: "Explore Courses" }).click();
  await page.getByRole("article", { name: /UI\/UX Design Mastery/ }).click();

  const dialog = page.getByRole("dialog", {
    name: "Post your comment first?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("The Ultimate TypeScript Course");
  await expect(dialog).toContainText("UI/UX Design Mastery");
  await expect(dialog).toContainText(
    "Please post this before switching courses.",
  );
  await dialog.getByRole("button", { name: "Keep learning" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/explore-courses$/);
  await expect(
    navigation
      .getByRole("button", { name: /My Courses/ })
      .locator(".courses-nav__resume-indicator"),
  ).toBeVisible();

  await page.getByRole("article", { name: /UI\/UX Design Mastery/ }).click();
  await page
    .getByRole("dialog", { name: "Post your comment first?" })
    .getByRole("button", { name: "Post & switch" })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/ui-ux-design-mastery\/[^/?]+\?from=explore-courses$/,
  );
  await expect(
    navigation
      .getByRole("button", { name: /My Courses/ })
      .locator(".courses-nav__resume-indicator"),
  ).toHaveCount(0);
  await expect(
    navigation
      .getByRole("button", { name: "Explore Courses" })
      .locator(".courses-nav__resume-indicator"),
  ).toBeVisible();

  await navigation.getByRole("button", { name: /My Courses/ }).click();
  await page
    .getByRole("article")
    .filter({ hasText: "The Ultimate TypeScript Course" })
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await expect(
    page.getByText("Please post this before switching courses."),
  ).toBeVisible();
});

test("opening a new course moves the single resumable session and navigation indicator", async ({
  page,
}) => {
  await openApp(page, "/");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const homeNavigation = navigation.getByRole("button", { name: "Home" });

  await page
    .locator(".home-resume-card")
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/[^/?]+\?from=home$/,
  );
  await expect(homeNavigation).toHaveAttribute("aria-current", "page");
  await expect(
    homeNavigation.locator(".courses-nav__resume-indicator"),
  ).toBeVisible();
  const resumeIndicator = homeNavigation.locator(
    ".courses-nav__resume-indicator",
  );

  await navigation
    .getByRole("group", { name: "Appearance controls" })
    .getByRole("button", { name: /Switch to light mode/ })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(() =>
      resumeIndicator.evaluate((indicator) => {
        const style = getComputedStyle(indicator);
        const accentProbe = document.createElement("span");
        accentProbe.style.color = "var(--accent)";
        document.body.append(accentProbe);
        const accentColor = getComputedStyle(accentProbe).color;
        accentProbe.remove();
        return {
          backgroundMatchesAccent: style.backgroundColor === accentColor,
          boxShadow: style.boxShadow,
        };
      }),
    )
    .toMatchObject({
      backgroundMatchesAccent: true,
      boxShadow: expect.not.stringContaining("0px 0px 0px 2px"),
    });

  const indicatorFitsInsideNavigation = async () => {
    const navigationBox = await homeNavigation.boundingBox();
    const indicatorBox = await homeNavigation
      .locator(".courses-nav__resume-indicator")
      .boundingBox();
    expect(navigationBox).not.toBeNull();
    expect(indicatorBox).not.toBeNull();
    return (
      indicatorBox!.x >= navigationBox!.x &&
      indicatorBox!.y >= navigationBox!.y &&
      indicatorBox!.x + indicatorBox!.width <=
        navigationBox!.x + navigationBox!.width &&
      indicatorBox!.y + indicatorBox!.height <=
        navigationBox!.y + navigationBox!.height
    );
  };
  const indicatorInset = async () => {
    const navigationBox = await homeNavigation.boundingBox();
    const indicatorBox = await homeNavigation
      .locator(".courses-nav__resume-indicator")
      .boundingBox();
    expect(navigationBox).not.toBeNull();
    expect(indicatorBox).not.toBeNull();
    return {
      x: indicatorBox!.x - navigationBox!.x,
      y: indicatorBox!.y - navigationBox!.y,
    };
  };
  const indicatorGeometry = async () =>
    homeNavigation
      .locator(".courses-nav__resume-indicator")
      .evaluate((indicator) => {
        const glyph = indicator.querySelector("svg");
        if (!glyph) {
          throw new Error("Resume indicator is missing its play glyph");
        }

        const indicatorRect = indicator.getBoundingClientRect();
        const glyphRect = glyph.getBoundingClientRect();
        return {
          indicatorAspectDelta: Math.abs(
            indicatorRect.width - indicatorRect.height,
          ),
          glyphAspectDelta: Math.abs(glyphRect.width - glyphRect.height),
          glyphCenterXDelta: Math.abs(
            glyphRect.left +
              glyphRect.width / 2 -
              (indicatorRect.left + indicatorRect.width / 2),
          ),
          glyphCenterYDelta: Math.abs(
            glyphRect.top +
              glyphRect.height / 2 -
              (indicatorRect.top + indicatorRect.height / 2),
          ),
        };
      });
  const expectIndicatorGeometry = async () => {
    const geometry = await indicatorGeometry();
    expect(geometry.indicatorAspectDelta).toBeLessThan(0.02);
    expect(geometry.glyphAspectDelta).toBeLessThan(0.02);
    expect(geometry.glyphCenterXDelta).toBeLessThan(0.02);
    expect(geometry.glyphCenterYDelta).toBeLessThan(0.02);
  };
  expect(await indicatorFitsInsideNavigation()).toBe(true);
  await expectIndicatorGeometry();
  const expandedInset = await indicatorInset();
  expect(expandedInset.x).toBeGreaterThanOrEqual(1.5);
  expect(expandedInset.y).toBeGreaterThanOrEqual(1.5);
  const expandedIndicatorX = (await homeNavigation
    .locator(".courses-nav__resume-indicator")
    .boundingBox())!.x;

  await navigation.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(
    homeNavigation.locator(".courses-nav__resume-indicator"),
  ).toBeVisible();
  expect(await indicatorFitsInsideNavigation()).toBe(true);
  await expectIndicatorGeometry();
  const collapsedInset = await indicatorInset();
  expect(collapsedInset.x).toBeGreaterThanOrEqual(1.5);
  expect(collapsedInset.y).toBeGreaterThanOrEqual(1.5);
  const collapsedIndicatorX = (await homeNavigation
    .locator(".courses-nav__resume-indicator")
    .boundingBox())!.x;
  expect(collapsedIndicatorX).toBeCloseTo(expandedIndicatorX, 2);

  await navigation.getByRole("button", { name: "Explore Courses" }).click();
  await page
    .getByRole("button", { name: "Add UI/UX Design Mastery to wishlist" })
    .click();
  await navigation.getByRole("button", { name: /Wishlist/ }).click();
  await page.getByRole("button", { name: "Open UI/UX Design Mastery" }).click();
  await expect(page).toHaveURL(
    /\/learn\/ui-ux-design-mastery\/[^/?]+\?from=wishlist$/,
  );

  const wishlistNavigation = navigation.getByRole("button", {
    name: /Wishlist/,
  });
  await expect(wishlistNavigation).toHaveAttribute("aria-current", "page");
  await expect(
    wishlistNavigation.locator(".courses-nav__resume-indicator"),
  ).toBeVisible();
  await expect(
    homeNavigation.locator(".courses-nav__resume-indicator"),
  ).toHaveCount(0);

  await homeNavigation.click();
  await wishlistNavigation.click();
  await expect(page).toHaveURL(
    /\/learn\/ui-ux-design-mastery\/[^/?]+\?from=wishlist$/,
  );
  await page.getByRole("button", { name: "Return to Wishlist" }).click();
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(
    wishlistNavigation.locator(".courses-nav__resume-indicator"),
  ).toHaveCount(0);
});

test("listing searches survive opening a player and returning explicitly", async ({
  page,
}) => {
  await openApp(page, "/my-courses");
  const myLearningSearch = page.getByPlaceholder("Search my courses...");
  await myLearningSearch.fill("TypeScript");
  await page
    .getByRole("article")
    .filter({ hasText: "The Ultimate TypeScript Course" })
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await page.getByRole("button", { name: "Return to My Courses" }).click();
  await expect(page.getByPlaceholder("Search my courses...")).toHaveValue(
    "TypeScript",
  );

  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  await navigation.getByRole("button", { name: "Explore Courses" }).click();
  await page
    .getByRole("button", { name: "Add UI/UX Design Mastery to wishlist" })
    .click();
  await navigation.getByRole("button", { name: /Wishlist/ }).click();
  const catalogueSearch = page.getByPlaceholder("Search your courses...");
  await catalogueSearch.fill("UI/UX");
  await page.getByRole("button", { name: "Open UI/UX Design Mastery" }).click();
  await page.getByRole("button", { name: "Return to Wishlist" }).click();
  await expect(page.getByPlaceholder("Search your courses...")).toHaveValue(
    "UI/UX",
  );
});

test("direct course player links return to Explore Courses by default", async ({
  page,
}) => {
  await openApp(page, "/learn/ui-ux-design-mastery");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });

  await expect(
    navigation.getByRole("button", { name: "Explore Courses" }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Return to Explore Courses" }).click();
  await expect(page).toHaveURL(/\/explore-courses$/);
});

test("lecture slugs are canonical and lecture IDs remain supported", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course/3?from=my-courses");
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/the-design-mindset\?from=my-courses$/,
  );
  await expect(
    page.getByRole("heading", { name: "The Design Mindset", level: 1 }),
  ).toBeVisible();

  await page
    .getByRole("complementary", { name: "Course curriculum" })
    .getByRole("button", { name: /10\.\s*Usability Testing/ })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/usability-testing\?from=my-courses$/,
  );

  await page.goBack();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/the-design-mindset\?from=my-courses$/,
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
