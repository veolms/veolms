import { test, expect } from "./app.fixture.ts";
import { expectStoredValue, installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("lesson choice, curriculum width, and player preferences persist", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");
  await expect(
    page.getByRole("heading", {
      name: "The Beginning of a Design Journey",
      level: 1,
    }),
  ).toBeVisible();

  await page
    .getByRole("region", {
      name: /Lesson video player for The Beginning of a Design Journey/,
    })
    .getByRole("button", { name: "Mute" })
    .click();

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  await curriculum.getByRole("button", { name: /Usability Testing/ }).click();
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-last-lesson", "10");

  const resize = page.getByRole("separator", {
    name: "Resize course curriculum",
  });
  await expect(resize).toHaveAttribute("aria-valuenow", "400");
  await resize.press("End");
  await expect(resize).toHaveAttribute("aria-valuenow", "560");
  await expectStoredValue(page, "veolms-curriculum-width", "560");
  await resize.press("Home");
  await expect(resize).toHaveAttribute(
    "aria-valuetext",
    "Course curriculum collapsed",
  );
  await resize.press("ArrowLeft");
  await expect(resize).toHaveAttribute("aria-valuenow", "300");

  const player = page.getByRole("region", {
    name: /Lesson video player for Usability Testing/,
  });
  const lessonVideo = player.locator("video");
  await expect
    .poll(() =>
      lessonVideo.evaluate((video) => (video as HTMLVideoElement).paused),
    )
    .toBe(false);
  await expect(player.getByRole("switch", { name: /Autoplay/ })).toHaveCount(0);
  await player.getByRole("button", { name: "Toggle captions" }).click();
  await expect(
    player.getByRole("button", { name: "Toggle captions" }),
  ).toHaveAttribute("aria-pressed", "true");

  await player.getByRole("button", { name: "Player settings" }).click();
  await page.getByRole("button", { name: /Playback speed/ }).click();
  await page.getByRole("button", { name: "1.5x" }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.5);

  await player.getByRole("button", { name: "Enter theater mode" }).click();
  await expect(
    player.getByRole("button", { name: "Exit theater mode" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.reload();
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
});

test("curriculum keeps its minimum panel width while the collapse drag clips it out", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");

  const rail = page.getByRole("separator", {
    name: "Resize course curriculum",
  });
  const column = page.locator(".learning-workspace__curriculum-column");
  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const geometry = () =>
    page.evaluate(() => {
      const columnElement = document.querySelector<HTMLElement>(
        ".learning-workspace__curriculum-column",
      );
      const mainElement = document.querySelector<HTMLElement>(
        ".learning-workspace__main",
      );
      const curriculumElement = document.querySelector<HTMLElement>(
        ".learning-workspace__curriculum-column .learning-curriculum",
      );
      const viewportElement = document.querySelector<HTMLElement>(
        ".learning-workspace__curriculum-column .learning-curriculum__viewport",
      );
      if (
        !mainElement ||
        !columnElement ||
        !curriculumElement ||
        !viewportElement
      ) {
        throw new Error("Curriculum resize targets missing");
      }
      const mainRect = mainElement.getBoundingClientRect();
      const columnRect = columnElement.getBoundingClientRect();
      const curriculumRect = curriculumElement.getBoundingClientRect();
      return {
        mainRight: mainRect.right,
        columnLeft: columnRect.left,
        columnRight: columnRect.right,
        columnWidth: columnRect.width,
        panelLeft: curriculumRect.left,
        panelRight: curriculumRect.right,
        panelWidth: curriculumRect.width,
        clippedWidth: Math.max(
          0,
          Math.min(columnRect.right, curriculumRect.right) -
            Math.max(columnRect.left, curriculumRect.left),
        ),
        overflowX: getComputedStyle(columnElement).overflowX,
        viewportOverflowX: getComputedStyle(viewportElement).overflowX,
      };
    });

  await rail.press("Home");
  await rail.press("ArrowLeft");
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();
  const startX = railBox!.x + railBox!.width / 2;
  const dragY = railBox!.y + 180;
  const initialColumnWidth = (await column.boundingBox())!.width;
  expect(initialColumnWidth).toBeCloseTo(300, 0);

  await page.mouse.move(startX, dragY);
  await page.mouse.down();
  await page.mouse.move(startX + 20, dragY);

  await expect(rail).toHaveAttribute("aria-valuenow", "300");
  await expect(rail).toHaveAttribute(
    "aria-valuetext",
    "300 pixels wide, sliding closed",
  );
  const firstClip = await geometry();
  expect(firstClip.overflowX).toBe("visible");
  expect(firstClip.viewportOverflowX).toBe("hidden");
  expect(firstClip.columnRight).toBeCloseTo(firstClip.mainRight, 0);
  expect(firstClip.columnWidth).toBeCloseTo(initialColumnWidth - 20, 0);
  expect(firstClip.panelLeft).toBeCloseTo(firstClip.columnLeft, 0);
  expect(firstClip.panelWidth).toBeCloseTo(300, 0);
  expect(firstClip.panelRight - firstClip.columnRight).toBeCloseTo(20, 0);
  expect(firstClip.clippedWidth).toBeCloseTo(firstClip.columnWidth, 0);

  await page.mouse.move(startX + 120, dragY);
  const deeperClip = await geometry();
  expect(deeperClip.columnRight).toBeCloseTo(deeperClip.mainRight, 0);
  expect(deeperClip.columnWidth).toBeCloseTo(initialColumnWidth - 120, 0);
  expect(deeperClip.panelLeft).toBeCloseTo(deeperClip.columnLeft, 0);
  expect(deeperClip.panelWidth).toBeCloseTo(300, 0);
  expect(deeperClip.panelRight - deeperClip.columnRight).toBeCloseTo(120, 0);
  expect(deeperClip.clippedWidth).toBeCloseTo(deeperClip.columnWidth, 0);
  await page.mouse.up();

  await expect(rail).toHaveAttribute("aria-valuenow", "300");
  await expectStoredValue(page, "veolms-curriculum-width", "300");
  await expect(curriculum).toBeVisible();
});

test("curriculum rail rests at the edge, reveals, snaps at halfway, then grows", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");

  const rail = page.getByRole("separator", {
    name: "Resize course curriculum",
  });
  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  await rail.press("Home");
  await expect(rail).toHaveAttribute(
    "aria-valuetext",
    "Course curriculum collapsed",
  );

  const workspaceMain = page.locator(".learning-workspace__main");
  const collapsedColumn = page.locator(
    ".learning-workspace__curriculum-column.is-collapsed",
  );
  await expect(workspaceMain).toHaveCSS("padding-right", "0px");
  const workspaceBox = await workspaceMain.boundingBox();
  const collapsedColumnBox = await collapsedColumn.boundingBox();
  expect(workspaceBox).not.toBeNull();
  expect(collapsedColumnBox).not.toBeNull();
  expect(collapsedColumnBox!.width).toBeCloseTo(0, 0);

  const collapsedRailBox = await rail.boundingBox();
  expect(collapsedRailBox).not.toBeNull();
  const collapsedX = collapsedRailBox!.x + collapsedRailBox!.width - 1;
  expect(collapsedRailBox!.x + collapsedRailBox!.width).toBeCloseTo(
    workspaceBox!.x + workspaceBox!.width,
    0,
  );
  const dragY = collapsedRailBox!.y + 180;

  await page.mouse.move(collapsedX, dragY);
  await page.mouse.down();
  await expect(rail).toBeVisible();
  await expect(collapsedColumn).toHaveCSS("overflow-x", "visible");
  await page.mouse.move(collapsedX - 100, dragY);

  await expect(curriculum).toBeVisible();
  await expect
    .poll(async () => {
      const previewRailBox = await rail.boundingBox();
      return Math.abs(
        previewRailBox!.x + previewRailBox!.width - (collapsedX - 100),
      );
    })
    .toBeLessThan(1.1);

  await page.mouse.move(collapsedX - 150, dragY);
  await expect(curriculum).toBeVisible();
  await expect(rail).toHaveAttribute("aria-valuenow", "300");
  await expect
    .poll(async () => {
      const expandedRailBox = await rail.boundingBox();
      const railCenter = expandedRailBox!.x + expandedRailBox!.width / 2;
      return Math.abs(railCenter - (collapsedX - 150));
    })
    .toBeGreaterThan(100);

  await page.mouse.move(collapsedX - 190, dragY);
  await expect(curriculum).toBeVisible();
  await expect(rail).toHaveAttribute("aria-valuenow", "340");
  await page.mouse.up();

  await expect(rail).toHaveAttribute("aria-valuenow", "340");
  await expectStoredValue(page, "veolms-curriculum-width", "340");
});

test("curriculum rail double-click expands and its shortcut toggles the content panel", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");

  const rail = page.getByRole("separator", {
    name: "Resize course curriculum",
  });
  await expect(rail).toHaveAttribute(
    "aria-keyshortcuts",
    "Control+Alt+C Meta+Alt+C",
  );
  await expect(rail).toHaveAttribute(
    "title",
    "Resize course content | Ctrl+Alt+C",
  );
  const expandedWidth = await rail.getAttribute("aria-valuenow");
  expect(expandedWidth).not.toBeNull();

  await rail.press("Home");
  await expect(rail).toHaveAttribute(
    "aria-valuetext",
    "Course curriculum collapsed",
  );
  await rail.dblclick();
  await expect(rail).toHaveAttribute("aria-valuenow", expandedWidth!);

  await rail.dblclick();
  await expect(rail).toHaveAttribute(
    "aria-valuetext",
    "Course curriculum collapsed",
  );
  await rail.dblclick();
  await expect(rail).toHaveAttribute("aria-valuenow", expandedWidth!);

  await page.keyboard.press("Control+Alt+C");
  await expect(rail).toHaveAttribute(
    "aria-valuetext",
    "Course curriculum collapsed",
  );
  await page.keyboard.press("Control+Alt+C");
  await expect(rail).toHaveAttribute("aria-valuenow", expandedWidth!);

  const commentInput = page.getByPlaceholder("Add a comment...");
  await commentInput.focus();
  await page.keyboard.press("Control+Alt+C");
  await expect(rail).toHaveAttribute("aria-valuenow", expandedWidth!);
});

test("player edge control collapses and expands course content with shortcut help", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course/the-design-mindset");

  const playerWrap = page.locator(".learning-workspace__player-wrap");
  const back = page.locator(".learning-workspace__back");
  const collapse = page.getByRole("button", {
    name: "Collapse course content",
  });
  const tooltip = page.getByRole("tooltip");
  const curriculumColumn = page.locator(
    ".learning-workspace__curriculum-column",
  );

  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(collapse).toHaveAttribute(
    "aria-keyshortcuts",
    "Control+Alt+C Meta+Alt+C",
  );
  await expect(
    collapse.locator("[data-sidebar-toggle-direction]"),
  ).toHaveAttribute("data-sidebar-toggle-direction", "right");
  await expect(tooltip).toBeHidden();
  await playerWrap.hover();

  const [wrapBox, backBox, collapseBox] = await Promise.all([
    playerWrap.boundingBox(),
    back.boundingBox(),
    collapse.boundingBox(),
  ]);
  expect(wrapBox).not.toBeNull();
  expect(backBox).not.toBeNull();
  expect(collapseBox).not.toBeNull();
  expect(collapseBox!.y - wrapBox!.y).toBeCloseTo(backBox!.y - wrapBox!.y, 1);
  expect(
    wrapBox!.x + wrapBox!.width - collapseBox!.x - collapseBox!.width,
  ).toBe(0);

  await collapse.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Collapse course content");
  await expect(tooltip.locator("kbd")).toHaveText("Ctrl+Alt+C");

  await collapse.click();
  const expand = page.getByRole("button", { name: "Expand course content" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(
    expand.locator("[data-sidebar-toggle-direction]"),
  ).toHaveAttribute("data-sidebar-toggle-direction", "left");
  await expect(curriculumColumn).toHaveClass(/is-collapsed/);
  await expand.hover();
  await expect(tooltip).toContainText("Expand course content");

  await expand.click();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(curriculumColumn).not.toHaveClass(/is-collapsed/);
});

test("course content panel slides symmetrically when opened and closed", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-reduce-animations", "false");
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openApp(page, "/learn/typescript-course");
  await page.evaluate(() => {
    window.localStorage.setItem("veolms-reduce-animations", "false");
    document.documentElement.dataset.reduceAnimations = "false";
  });

  const rail = page.getByRole("separator", {
    name: "Resize course curriculum",
  });
  const main = page.locator(".learning-workspace__main");
  const column = page.locator(".learning-workspace__curriculum-column");
  const panel = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const columnWidth = () =>
    column.evaluate((element) => element.getBoundingClientRect().width);
  const expandedWidth = await columnWidth();

  await expect(main).toHaveCSS(
    "transition-property",
    "--learning-curriculum-width",
  );
  await expect(main).toHaveCSS("transition-duration", "0.28s");
  const closingAnimations = await rail.evaluate(async (element) => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const mainElement = document.querySelector<HTMLElement>(
      ".learning-workspace__main",
    );
    if (!mainElement) return 0;
    const animations = mainElement.getAnimations();
    animations.forEach((animation) => {
      animation.pause();
      animation.currentTime = 140;
    });
    return animations.length;
  });
  await expect(rail).toHaveAttribute(
    "aria-valuetext",
    "Course curriculum collapsed",
  );
  expect(closingAnimations).toBe(1);
  const closingWidth = await columnWidth();
  expect(closingWidth).toBeGreaterThan(0);
  expect(closingWidth).toBeLessThan(expandedWidth);
  await main.evaluate((element) =>
    element.getAnimations().forEach((animation) => animation.finish()),
  );
  await expect.poll(columnWidth).toBeLessThan(1);

  const openingAnimations = await rail.evaluate(async (element) => {
    element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const mainElement = document.querySelector<HTMLElement>(
      ".learning-workspace__main",
    );
    if (!mainElement) return 0;
    const animations = mainElement.getAnimations();
    animations.forEach((animation) => {
      animation.pause();
      animation.currentTime = 140;
    });
    return animations.length;
  });
  await expect(rail).toHaveAttribute(
    "aria-valuenow",
    String(Math.round(expandedWidth)),
  );
  expect(openingAnimations).toBe(1);
  const openingWidth = await columnWidth();
  expect(openingWidth).toBeGreaterThan(0);
  expect(openingWidth).toBeLessThan(expandedWidth);
  await main.evaluate((element) =>
    element.getAnimations().forEach((animation) => animation.finish()),
  );
  await expect.poll(columnWidth).toBeCloseTo(expandedWidth, 0);
  await expect(panel).toBeVisible();
});

test("course content shortcut opens and closes the mobile lesson drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/learn/typescript-course");

  const trigger = page.getByRole("button", { name: "Open course lessons" });
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  await trigger.focus();
  await page.keyboard.press("Control+Alt+C");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Control+Alt+C");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("mobile lesson drawer closes with Escape and returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/learn/typescript-course");

  const trigger = page.getByRole("button", { name: "Open course lessons" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");
  await expect(page.locator("main.learning-workspace__main")).toHaveAttribute(
    "inert",
    "",
  );

  const focusable = dialog.locator(
    ".lesson-drawer-panel button:not([disabled]):not([tabindex='-1']):not([inert] *), .lesson-drawer-panel input:not([disabled]):not([inert] *), .lesson-drawer-panel [tabindex]:not([tabindex='-1']):not([inert] *)",
  );
  await expect(focusable.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(focusable.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(focusable.first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog
    .locator(".lesson-drawer-backdrop")
    .click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole("button", { name: /Usability Testing/ }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-last-lesson", "10");
});

test("curriculum search, section expansion, and lesson selection retain their current contracts", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const firstSection = curriculum.getByRole("button", {
    name: /Section 1: Introduction/,
  });
  await expect(firstSection).toHaveAttribute("aria-expanded", "true");
  await firstSection.click();
  await expect(firstSection).toHaveAttribute("aria-expanded", "false");
  await firstSection.click();
  await expect(firstSection).toHaveAttribute("aria-expanded", "true");

  await curriculum.getByRole("button", { name: "Search lessons" }).click();
  const lessonSearch = curriculum.getByRole("searchbox", {
    name: "Search lessons",
  });
  await expect(lessonSearch).toBeFocused();
  await lessonSearch.fill("usability");
  await expect(
    curriculum.getByRole("button", { name: /Section 2: User Research/ }),
  ).toBeVisible();
  await expect(
    curriculum.getByRole("button", { name: /Usability Testing/ }),
  ).toBeVisible();

  await lessonSearch.fill("no matching lesson");
  await expect(
    curriculum.getByRole("button", { name: /Section \d:/ }),
  ).toHaveCount(0);

  await lessonSearch.fill("usability");
  await curriculum.getByRole("button", { name: /Usability Testing/ }).click();
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-last-lesson", "10");
});

test("learning drafts and searches survive navigation away and resume", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openApp(page, "/learn/typescript-course?from=my-courses");

  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const commentDraft = page.getByRole("textbox", { name: "Add a comment" });
  const discussionSearch = page
    .locator(".learning-discussion__search")
    .getByRole("searchbox", { name: "Search comments" });
  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });

  await commentDraft.fill("Keep this unfinished thought for later.");
  await discussionSearch.fill("research workflow");
  await curriculum.getByRole("button", { name: "Search lessons" }).click();
  await curriculum
    .getByRole("searchbox", { name: "Search lessons" })
    .fill("usability");

  await navigation.getByRole("button", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await navigation.getByRole("button", { name: /My Courses/ }).click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/[^/?]+\?from=my-courses$/,
  );

  await expect(
    page.getByRole("textbox", { name: "Add a comment" }),
  ).toHaveValue("Keep this unfinished thought for later.");
  await expect(
    page
      .locator(".learning-discussion__search")
      .getByRole("searchbox", { name: "Search comments" }),
  ).toHaveValue("research workflow");
  await expect(
    page
      .getByRole("complementary", { name: "Course curriculum" })
      .getByRole("searchbox", { name: "Search lessons" }),
  ).toHaveValue("usability");

  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Add a comment" }),
  ).toHaveValue("Keep this unfinished thought for later.");
  await expect(
    page
      .locator(".learning-discussion__search")
      .getByRole("searchbox", { name: "Search comments" }),
  ).toHaveValue("research workflow");
  await expect(
    page
      .getByRole("complementary", { name: "Course curriculum" })
      .getByRole("searchbox", { name: "Search lessons" }),
  ).toHaveValue("usability");
});

test("lesson tools and discussion interactions retain their current contracts", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");
  await page.locator("html").evaluate((root) => {
    root.dataset.pageTabColors = "multicolor";
  });

  const discussion = page.locator("section.learning-discussion");
  const lessonTools = discussion.getByRole("tablist", { name: "Lesson tools" });
  const questionsTab = lessonTools.getByRole("tab", { name: "Q&A" });
  await questionsTab.click();
  await expect(questionsTab).toHaveAttribute("aria-selected", "true");
  const questionsColor = await questionsTab.evaluate(
    (tab) => getComputedStyle(tab).color,
  );
  await expect
    .poll(() =>
      questionsTab.evaluate((tab) =>
        Number.parseFloat(getComputedStyle(tab, "::after").height),
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await expect(
    page.getByRole("heading", { name: "Questions & answers", level: 3 }),
  ).toBeVisible();

  const commentsTab = lessonTools.getByRole("tab", { name: "Comments" });
  await commentsTab.click();
  await expect(commentsTab).toHaveAttribute("aria-selected", "true");
  const commentsColor = await commentsTab.evaluate(
    (tab) => getComputedStyle(tab).color,
  );
  expect(commentsColor).not.toBe(questionsColor);

  const commentSearch = discussion.getByRole("searchbox", {
    name: "Search comments",
  });
  await commentSearch.focus();
  await expect(commentSearch).toBeFocused();
  await commentSearch.fill("easing curve");
  await expect(discussion.getByRole("article")).toHaveCount(1);
  await expect(
    discussion
      .getByRole("article")
      .getByRole("heading", { name: "Ethan Park", level: 3 }),
  ).toBeVisible();

  await commentSearch.fill("no matching comment");
  await expect(page.getByText("No comments match that search")).toBeVisible();
  await expect(discussion.getByRole("article")).toHaveCount(0);
  await commentSearch.fill("");

  const composer = page.getByRole("textbox", { name: "Add a comment" });
  await composer.fill("   ");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Write a comment before sending.",
  );

  await composer.fill(
    "This discussion characterization should survive extraction.",
  );
  await composer.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Comment posted.");
  const postedComment = discussion.getByRole("article").filter({
    hasText: "This discussion characterization should survive extraction.",
  });
  await expect(
    postedComment.getByRole("heading", { name: "Sofia Chen", level: 3 }),
  ).toBeVisible();

  const ethanComment = discussion
    .getByRole("article")
    .filter({ hasText: "Ethan Park" });
  const like = ethanComment.getByRole("button", { name: "Like" });
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "false");
});

test("core player controls, shortcuts, seek state, and ambient preference remain functional", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");
  const player = page.getByRole("region", {
    name: /Lesson video player for The Beginning of a Design Journey/,
  });
  const video = player.locator("video");
  const positionSlider = player.getByRole("slider", {
    name: "Video position",
  });
  const volumeSlider = player.getByRole("slider", { name: "Volume" });

  await expect(positionSlider).toHaveClass(/app-slider--player/);
  await expect(volumeSlider).toHaveClass(/app-slider--volume/);
  await expect(volumeSlider).toHaveCSS("--app-slider-progress", "100%");

  await player.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();

  await player.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Unmute", exact: true }),
  ).toBeVisible();
  await player.focus();
  await page.keyboard.press("m");
  await expect(
    player.getByRole("button", { name: "Mute", exact: true }),
  ).toBeVisible();

  await video.evaluate((element) => {
    (element as HTMLVideoElement).currentTime = 10;
    element.dispatchEvent(new Event("timeupdate"));
  });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThanOrEqual(15);
  await video.evaluate((element) => {
    element.dispatchEvent(new Event("pause"));
  });
  await expectStoredValue(
    page,
    "veolms-watch-01 introduction to veolms.mp4",
    "15",
  );

  await player.getByRole("button", { name: "Player settings" }).click();
  const ambient = page.getByRole("button", { name: "Ambient mode" });
  await ambient.click();
  await expectStoredValue(page, "veolms-player-ambient", "on");
});

test("player shortcuts work page-wide outside editors and mute persists across lessons and reloads", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openApp(page, "/learn/typescript-course");
  const player = page.getByRole("region", {
    name: /Lesson video player for The Beginning of a Design Journey/,
  });
  const video = player.locator("video");

  await page.locator("body").focus();
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).paused),
    )
    .toBe(false);
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).paused),
    )
    .toBe(true);

  await page.keyboard.press("m");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).muted),
    )
    .toBe(true);
  await expectStoredValue(page, "veolms-player-muted", "true");

  await page.keyboard.press("c");
  await expect(
    player.getByRole("button", { name: "Toggle captions" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("t");
  await expect(
    player.getByRole("button", { name: "Exit theater mode" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("t");
  await expect(
    player.getByRole("button", { name: "Enter theater mode" }),
  ).toHaveAttribute("aria-pressed", "false");

  const shell = page.locator(".video-shell");
  await shell.evaluate((element) => {
    Object.defineProperty(element, "requestFullscreen", {
      configurable: true,
      value: async () =>
        element.setAttribute("data-fullscreen-requested", "true"),
    });
  });
  await page.keyboard.press("f");
  await expect(shell).toHaveAttribute("data-fullscreen-requested", "true");

  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).duration),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press("Alt+5");
  await expect
    .poll(() =>
      video.evaluate((element) => {
        const media = element as HTMLVideoElement;
        return media.duration ? media.currentTime / media.duration : 0;
      }),
    )
    .toBeGreaterThan(0.49);
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/the-beginning-of-a-design-journey\?from=explore-courses$/,
  );

  const commentInput = page.getByPlaceholder("Add a comment...");
  await commentInput.focus();
  await page.keyboard.type("mct 1");
  await expect(commentInput).toHaveValue("mct 1");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).muted),
    )
    .toBe(true);
  await expect(
    player.getByRole("button", { name: "Toggle captions" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    player.getByRole("button", { name: "Enter theater mode" }),
  ).toHaveAttribute("aria-pressed", "false");

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  await curriculum.getByRole("button", { name: /Usability Testing/ }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((element) => (element as HTMLVideoElement).muted),
    )
    .toBe(true);

  await page.reload();
  const reloadedVideo = page.locator("video");
  await expect
    .poll(() =>
      reloadedVideo.evaluate((element) => (element as HTMLVideoElement).muted),
    )
    .toBe(true);
  await page.locator("body").focus();
  await page.keyboard.press("m");
  await expectStoredValue(page, "veolms-player-muted", "false");
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((element) => (element as HTMLVideoElement).muted),
    )
    .toBe(false);

  await page.keyboard.press("1");
  await expect(page).toHaveURL(/\/$/);
});
