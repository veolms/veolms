import { test, expect } from "./app.fixture.ts";
import { expectStoredValue, installBaselineState, openApp } from "./support.ts";

const LEARNING_DESKTOP_VIEWPORT = { width: 1424, height: 678 } as const;

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("default palette darkens the course overview at rest and clears on hover", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("veolms-academy-theme", "codex");
    localStorage.setItem("veolms-academy-theme-version", "veo-onyx-default-v2");
  });
  await openApp(page, "/learn/typescript-course/the-design-mindset?from=home");

  const overviewAction = page.getByRole("button", {
    name: "View course overview for The Ultimate TypeScript Course",
  });
  await expect(page.locator("html")).toHaveAttribute("data-palette", "codex");
  await expect(overviewAction).toHaveCSS(
    "background-color",
    "rgba(13, 13, 15, 0.14)",
  );
  await overviewAction.hover();
  await expect(overviewAction).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});

test("non-default palettes retain a dark course overview hover overlay", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("veolms-academy-theme", "sunlit");
    localStorage.setItem("veolms-academy-theme-version", "veo-onyx-default-v2");
  });
  await openApp(
    page,
    "/learn/javascript-course/what-is-ui-ux-design?from=home",
  );

  const overviewAction = page.getByRole("button", {
    name: "View course overview for The Complete JavaScript Course",
  });
  await expect(page.locator("html")).toHaveAttribute("data-palette", "sunlit");
  await expect(overviewAction).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await overviewAction.hover();
  await expect(overviewAction).toHaveCSS(
    "background-color",
    "rgba(7, 17, 32, 0.32)",
  );
});

test("light themes soften the course overview overlay through hover", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("veolms-theme", "light");
    localStorage.setItem("veolms-academy-theme", "ember");
    localStorage.setItem("veolms-academy-theme-version", "veo-onyx-default-v2");
  });
  await openApp(page, "/learn/backend-nodejs/what-is-ui-ux-design?from=home");

  const overviewAction = page.getByRole("button", {
    name: "View course overview for Complete Backend with Node.js",
  });
  const hero = page.locator(".learning-curriculum__hero");
  const progressCopy = hero.locator(".learning-curriculum__progress-copy");
  const progressValue = progressCopy.locator("strong");
  const currentActions = hero.locator(".learning-curriculum__current-action");
  const searchTrigger = hero.getByRole("button", { name: "Search lessons" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(progressCopy).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(progressValue).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(currentActions.first()).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(currentActions.last()).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(searchTrigger).toHaveCSS("color", "rgb(11, 11, 13)");
  await expect
    .poll(() =>
      searchTrigger.evaluate(
        (element) => getComputedStyle(element, "::before").backgroundColor,
      ),
    )
    .toBe("rgb(255, 255, 255)");
  await expect
    .poll(() =>
      hero.evaluate((element) => {
        const style = getComputedStyle(element);
        return [
          style
            .getPropertyValue("--learning-curriculum-thumbnail-shade-top")
            .trim(),
          style
            .getPropertyValue("--learning-curriculum-thumbnail-shade-middle")
            .trim(),
          style
            .getPropertyValue("--learning-curriculum-thumbnail-shade-bottom")
            .trim(),
        ];
      }),
    )
    .toEqual([
      "rgba(4, 11, 23, 0.238)",
      "rgba(4, 11, 23, 0.434)",
      "rgba(4, 11, 23, 0.574)",
    ]);
  await expect(overviewAction).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await overviewAction.hover();
  await expect(overviewAction).toHaveCSS(
    "background-color",
    "rgba(7, 17, 32, 0.153)",
  );

  await page.locator("html").evaluate((root) => {
    root.dataset.palette = "codex";
  });
  await page.mouse.move(0, 0);
  await expect(overviewAction).toHaveCSS(
    "background-color",
    "rgba(13, 13, 15, 0.063)",
  );
  await overviewAction.hover();
  await expect(overviewAction).toHaveCSS(
    "background-color",
    "rgba(13, 13, 15, 0.016)",
  );
});

test("desktop learning video reaches the frame edges while content is inset", async ({
  page,
}) => {
  await page.setViewportSize(LEARNING_DESKTOP_VIEWPORT);
  await openApp(page, "/learn/typescript-course/the-design-mindset?from=home");
  await expect(
    page.getByRole("textbox", { name: "Add a comment" }),
  ).toBeVisible();
  const lessonContent = page.locator(
    "article.learning-workspace__lesson-content",
  );
  await expect(lessonContent).toHaveAttribute(
    "aria-labelledby",
    "learning-lesson-title",
  );
  await expect(lessonContent.locator("h1#learning-lesson-title")).toHaveCount(
    1,
  );
  await expect(
    lessonContent.locator(".learning-workspace__player-wrap"),
  ).toHaveCount(0);
  const desktopStickyState = await page.evaluate(() => ({
    discussionHeader: getComputedStyle(
      document.querySelector(".learning-discussion__header")!,
    ).position,
    playerWrap: getComputedStyle(
      document.querySelector(".learning-workspace__player-wrap")!,
    ).position,
  }));
  expect(desktopStickyState.playerWrap).toBe("relative");
  expect(desktopStickyState.discussionHeader).toBe("static");

  const geometry = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(
      ".learning-workspace__main",
    );
    const lesson = document.querySelector<HTMLElement>(
      ".learning-workspace__lesson-column",
    );
    const player = document.querySelector<HTMLElement>(
      ".learning-workspace__player-wrap",
    );
    const heading = document.querySelector<HTMLElement>(
      "#learning-course-content-trigger",
    );
    const title = heading?.querySelector<HTMLElement>("h1");
    const panel = document.querySelector<HTMLElement>(
      "#learning-discussion-tab-panel",
    );
    const curriculum = document.querySelector<HTMLElement>(
      ".learning-workspace__curriculum-column",
    );
    const pageScrollbar = Array.from(
      document.querySelectorAll<HTMLElement>(".floating-scrollbar"),
    ).find(
      (element) =>
        !element.classList.contains("floating-scrollbar--sidebar") &&
        !element.classList.contains("floating-scrollbar--curriculum"),
    );
    const card = document.querySelector<HTMLElement>(
      ".learning-comment-composer",
    );
    if (
      !main ||
      !lesson ||
      !player ||
      !heading ||
      !title ||
      !panel ||
      !curriculum ||
      !pageScrollbar ||
      !card
    ) {
      throw new Error("Learning discussion layout targets missing");
    }

    const mainRect = main.getBoundingClientRect();
    const lessonRect = lesson.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const curriculumRect = curriculum.getBoundingClientRect();
    const pageScrollbarRect = pageScrollbar.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    const curriculumStyle = getComputedStyle(curriculum);
    return {
      mainLeft: mainRect.left,
      mainRight: mainRect.right,
      lessonRight: lessonRect.right,
      playerLeft: playerRect.left,
      playerRight: playerRect.right,
      headingLeft: headingRect.left,
      headingRight: headingRect.right,
      titleLeft: titleRect.left,
      panelLeft: panelRect.left,
      panelRight: panelRect.right,
      curriculumLeft: curriculumRect.left,
      curriculumRight: curriculumRect.right,
      pageScrollbarLeft: pageScrollbarRect.left,
      pageScrollbarRight: pageScrollbarRect.right,
      curriculumTop: Number.parseFloat(curriculumStyle.top),
      curriculumHeight: curriculumRect.height,
      cardLeft: cardRect.left,
      cardRight: cardRect.right,
      mainColumnGap: Number.parseFloat(mainStyle.columnGap),
      playerRadius: Number.parseFloat(
        getComputedStyle(document.querySelector(".youtube-player")!)
          .borderTopLeftRadius,
      ),
      curriculumRadius: Number.parseFloat(
        getComputedStyle(document.querySelector(".learning-curriculum")!)
          .borderTopLeftRadius,
      ),
      mainPaddingTop: Number.parseFloat(mainStyle.paddingTop),
      mainPaddingLeft: Number.parseFloat(mainStyle.paddingLeft),
      mainPaddingRight: Number.parseFloat(mainStyle.paddingRight),
      mainPaddingBottom: Number.parseFloat(mainStyle.paddingBottom),
      panelOverflowX: getComputedStyle(panel).overflowX,
      lessonContentPaddingLeft: Number.parseFloat(
        getComputedStyle(
          document.querySelector(".learning-workspace__lesson-content")!,
        ).paddingLeft,
      ),
    };
  });

  expect(geometry.panelOverflowX).toBe("clip");
  expect(geometry.mainColumnGap).toBe(12);
  expect(geometry.playerRadius).toBe(0);
  expect(geometry.curriculumRadius).toBe(0);
  expect(geometry.mainPaddingTop).toBe(0);
  expect(geometry.mainPaddingRight).toBe(0);
  expect(geometry.mainPaddingBottom).toBe(0);
  expect(geometry.mainPaddingLeft).toBe(0);
  expect(geometry.curriculumTop).toBe(0);
  expect(geometry.curriculumHeight).toBeCloseTo(
    LEARNING_DESKTOP_VIEWPORT.height,
    0,
  );
  expect(geometry.mainRight - geometry.curriculumRight).toBeCloseTo(0, 0);
  expect(geometry.curriculumLeft - geometry.lessonRight).toBeCloseTo(5, 0);
  expect(geometry.pageScrollbarLeft - geometry.playerRight).toBeCloseTo(0, 0);
  expect(geometry.pageScrollbarRight - geometry.curriculumLeft).toBeCloseTo(
    1,
    0,
  );
  expect(geometry.headingLeft - geometry.playerLeft).toBeCloseTo(0, 0);
  expect(geometry.playerRight - geometry.headingRight).toBeCloseTo(0, 0);
  expect(geometry.panelLeft - geometry.mainLeft).toBeCloseTo(0, 0);
  expect(geometry.lessonRight - geometry.panelRight).toBeCloseTo(0, 0);
  expect(geometry.titleLeft - geometry.panelLeft).toBeCloseTo(
    geometry.lessonContentPaddingLeft,
    0,
  );
  expect(geometry.cardLeft - geometry.panelLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.panelRight - geometry.cardRight).toBeGreaterThanOrEqual(0);

  const lessonHeading = page.locator("#learning-course-content-trigger");
  await expect(lessonHeading).toHaveCSS("border-top-left-radius", "0px");
  await expect(lessonHeading).toHaveCSS("border-top-right-radius", "0px");
});

test("desktop learning page scrollbar hugs the curriculum edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1197, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  await expect(
    page.locator(
      '.floating-scrollbar[aria-controls="courses-main-scrollport"]',
    ),
  ).toHaveClass(/is-visible/);

  const geometry = await page.evaluate(() => {
    const lesson = document.querySelector<HTMLElement>(
      ".learning-workspace__lesson-column",
    );
    const curriculum = document.querySelector<HTMLElement>(
      ".learning-workspace__curriculum-column",
    );
    const pageScrollbar = document.querySelector<HTMLElement>(
      '.floating-scrollbar[aria-controls="courses-main-scrollport"]',
    );
    if (!lesson || !curriculum || !pageScrollbar) {
      throw new Error("Learning separator geometry targets missing");
    }

    const lessonRect = lesson.getBoundingClientRect();
    const curriculumRect = curriculum.getBoundingClientRect();
    const scrollbarRect = pageScrollbar.getBoundingClientRect();
    return {
      lessonRight: lessonRect.right,
      curriculumLeft: curriculumRect.left,
      scrollbarLeft: scrollbarRect.left,
      scrollbarRight: scrollbarRect.right,
      scrollbarWidth: scrollbarRect.width,
      thumbWidth:
        pageScrollbar
          .querySelector<HTMLElement>(".floating-scrollbar__thumb")
          ?.getBoundingClientRect().width ?? 0,
      scrollbarBorderRadius: getComputedStyle(pageScrollbar).borderRadius,
      thumbBorderRadius: getComputedStyle(
        pageScrollbar.querySelector<HTMLElement>(
          ".floating-scrollbar__thumb",
        ) as HTMLElement,
      ).borderRadius,
      scrollbarBackground: getComputedStyle(pageScrollbar).backgroundColor,
      scrollbarBoxShadow: getComputedStyle(pageScrollbar).boxShadow,
    };
  });

  expect(geometry.curriculumLeft - geometry.lessonRight).toBeCloseTo(12, 0);
  expect(geometry.scrollbarLeft).toBeGreaterThan(geometry.lessonRight);
  expect(geometry.scrollbarLeft - geometry.lessonRight).toBeCloseTo(7, 0);
  expect(geometry.scrollbarRight).toBeGreaterThanOrEqual(
    geometry.curriculumLeft,
  );
  expect(geometry.scrollbarRight - geometry.curriculumLeft).toBeLessThanOrEqual(
    2,
  );
  expect(geometry.scrollbarWidth).toBeCloseTo(geometry.thumbWidth, 1);
  expect(geometry.scrollbarBorderRadius).toBe("999px");
  expect(geometry.thumbBorderRadius).toBe("999px");
  expect(geometry.scrollbarBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(geometry.scrollbarBoxShadow).toBe("none");
});

test("player control icons stay fixed while pressed", async ({ page }) => {
  await page.setViewportSize(LEARNING_DESKTOP_VIEWPORT);
  await openApp(page, "/learn/typescript-course/the-design-mindset?from=home");

  const player = page.getByRole("region", {
    name: /Lesson video player for The Design Mindset/,
  });
  await player.hover();

  const visibleControls = player.locator("button.player-control:visible");
  await expect(visibleControls.first()).toBeVisible();
  const transitionProperties = await visibleControls.evaluateAll((controls) =>
    controls.map((control) => getComputedStyle(control).transitionProperty),
  );
  expect(
    transitionProperties.every(
      (transitionProperty) => !transitionProperty.includes("transform"),
    ),
  ).toBe(true);

  const settings = player.getByRole("button", { name: "Settings" });
  const settingsIcon = settings.locator("svg");
  const buttonBox = await settings.boundingBox();
  const iconBoxBeforePress = await settingsIcon.boundingBox();
  if (!buttonBox || !iconBoxBeforePress) {
    throw new Error("Settings control geometry is unavailable");
  }

  await page.mouse.move(
    buttonBox.x + buttonBox.width / 2,
    buttonBox.y + buttonBox.height / 2,
  );
  await page.mouse.down();
  const [pressedTransform, iconBoxWhilePressed] = await Promise.all([
    settings.evaluate((control) => getComputedStyle(control).transform),
    settingsIcon.boundingBox(),
  ]);
  await page.mouse.up();

  expect(pressedTransform).toBe("none");
  expect(iconBoxWhilePressed?.width).toBeCloseTo(iconBoxBeforePress.width, 2);
  expect(iconBoxWhilePressed?.height).toBeCloseTo(iconBoxBeforePress.height, 2);
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
  await expectStoredValue(page, "veolms-last-lesson-typescript-course", "10");

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
  await player.hover();
  await player.getByRole("button", { name: "Settings" }).click();
  const settingsMenu = page.getByRole("menu", { name: "Video settings" });
  await expect(
    player.getByRole("button", { name: "Toggle picture in picture" }),
  ).toHaveCount(0);
  await expect(
    settingsMenu.getByRole("menuitem", { name: /^Picture in picture/ }),
  ).toBeVisible();
  await expect(
    settingsMenu.getByRole("menuitem", { name: /^Captions\b/ }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await player.getByRole("button", { name: "Turn captions on" }).click();
  await expect
    .poll(() =>
      lessonVideo.evaluate((video) =>
        Array.from((video as HTMLVideoElement).textTracks).some(
          (track) => track.mode === "showing",
        ),
      ),
    )
    .toBe(true);

  await player.hover();
  await player.getByRole("button", { name: "Settings" }).click();
  await settingsMenu
    .getByRole("menuitem", { name: /^Playback speed\b/ })
    .click();
  await settingsMenu
    .getByRole("menuitemradio", { name: "1.75×", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.75);

  await player.hover();
  await player.getByRole("button", { name: "Settings" }).click();
  await settingsMenu
    .getByRole("menuitem", { name: /^Playback speed\b/ })
    .click();
  const customSpeed = settingsMenu.getByRole("slider", {
    name: "Custom playback speed",
  });
  await expect(customSpeed).toHaveAttribute("min", "0.25");
  await expect(customSpeed).toHaveAttribute("max", "4");
  await customSpeed.fill("3.25");
  await expect
    .poll(() =>
      lessonVideo.evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(3.25);
  await expect(settingsMenu).toBeVisible();
  await customSpeed.fill("1");
  await page.keyboard.press("Escape");

  await expect(
    player.getByRole("button", { name: /theater mode/i }),
  ).toHaveCount(0);

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
  expect(firstClip.mainRight - firstClip.columnRight).toBeCloseTo(0, 0);
  expect(firstClip.columnWidth).toBeCloseTo(initialColumnWidth - 20, 0);
  expect(firstClip.panelLeft).toBeCloseTo(firstClip.columnLeft, 0);
  expect(firstClip.panelWidth).toBeCloseTo(300, 0);
  expect(firstClip.panelRight - firstClip.columnRight).toBeCloseTo(20, 0);
  expect(firstClip.clippedWidth).toBeCloseTo(firstClip.columnWidth, 0);

  await page.mouse.move(startX + 120, dragY);
  const deeperClip = await geometry();
  expect(deeperClip.mainRight - deeperClip.columnRight).toBeCloseTo(0, 0);
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
  await expect(rail).toHaveAttribute("aria-keyshortcuts", "Alt+C");
  await expect(rail).toHaveAttribute("title", "Resize course content | Alt+C");
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

  await page.keyboard.press("Alt+C");
  await expect(rail).toHaveAttribute(
    "aria-valuetext",
    "Course curriculum collapsed",
  );
  await page.keyboard.press("Alt+C");
  await expect(rail).toHaveAttribute("aria-valuenow", expandedWidth!);

  const commentInput = page.getByPlaceholder("Add a comment...");
  await commentInput.focus();
  await page.keyboard.press("Alt+C");
  await expect(rail).toHaveAttribute("aria-valuenow", expandedWidth!);
});

test("player edge control uses a native title and the short content shortcut", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-theme", "light");
  });
  await openApp(page, "/learn/typescript-course/the-design-mindset");

  const playerWrap = page.locator(".learning-workspace__player-wrap");
  const back = page.locator(".learning-workspace__back");
  const collapse = page.getByRole("button", {
    name: "Collapse course content",
  });
  const curriculumColumn = page.locator(
    ".learning-workspace__curriculum-column",
  );

  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(collapse).toHaveAttribute("aria-keyshortcuts", "Alt+C");
  await expect(collapse).toHaveAttribute("title", "Collapse (Alt+C)");
  await expect(
    collapse.locator("[data-sidebar-toggle-direction]"),
  ).toHaveAttribute("data-sidebar-toggle-direction", "right");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(collapse).toHaveCSS("opacity", "0");
  await expect(collapse).toHaveCSS("pointer-events", "none");
  await playerWrap.hover();
  await expect(collapse).toHaveCSS("opacity", "1");
  await expect(collapse).toHaveCSS("pointer-events", "auto");
  await expect(collapse).toHaveCSS("color", "rgb(255, 255, 255)");

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

  await collapse.click();
  const expand = page.getByRole("button", { name: "Expand course content" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(expand).toHaveAttribute("title", "Expand (Alt+C)");
  await expect(
    expand.locator("[data-sidebar-toggle-direction]"),
  ).toHaveAttribute("data-sidebar-toggle-direction", "left");
  await expect(curriculumColumn).toHaveClass(/is-collapsed/);
  await expand.click();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(curriculumColumn).not.toHaveClass(/is-collapsed/);
});

test("a held second player press floats the desktop course content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const playerWrap = page.locator(".learning-workspace__player-wrap");
  const curriculumColumn = page.locator(
    ".learning-workspace__curriculum-column",
  );
  await playerWrap.hover();
  await page.getByRole("button", { name: "Collapse course content" }).click();

  const secondPress = page.getByRole("button", {
    name: "Expand course content",
  });
  const secondPressBounds = await secondPress.boundingBox();
  expect(secondPressBounds).not.toBeNull();
  await page.mouse.move(
    secondPressBounds!.x + secondPressBounds!.width / 2,
    secondPressBounds!.y + secondPressBounds!.height / 2,
  );
  await page.mouse.down();
  await expect(secondPress).toHaveAttribute(
    "data-second-press-holding",
    "true",
  );
  await page.waitForTimeout(520);

  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("backdrop-filter", /blur/);
  await expect(curriculumColumn).toHaveClass(/is-collapsed/);
  await page.mouse.up();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(curriculumColumn).toHaveClass(/is-collapsed/);
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
  await page.keyboard.press("Alt+C");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Alt+C");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("tablet player control opens a translucent floating course drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const toggle = page.getByRole("button", { name: "Expand course content" });
  const back = page.getByRole("button", { name: "Return to Courses" });
  const player = page.getByRole("region", {
    name: "Lesson video player for What is UI/UX Design?",
  });
  const video = player.locator("video");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(player).toHaveAttribute("data-playing", "false");
  await expect(toggle).toHaveCSS("opacity", "1");
  await expect(back).toHaveCSS("opacity", "1");

  await video.evaluate((element) =>
    element.dispatchEvent(new Event("play", { bubbles: true })),
  );
  await expect(player).toHaveAttribute("data-playing", "true");
  await expect(toggle).toHaveCSS("opacity", "0");
  await expect(toggle).toHaveCSS("pointer-events", "none");
  await expect(back).toHaveCSS("opacity", "0");
  await expect(back).toHaveCSS("pointer-events", "none");

  await video.evaluate((element) =>
    element.dispatchEvent(new Event("pause", { bubbles: true })),
  );
  await expect(player).toHaveAttribute("data-playing", "false");
  await expect(toggle).toHaveCSS("opacity", "1");
  await expect(back).toHaveCSS("opacity", "1");
  await toggle.click();

  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("backdrop-filter", /blur/);
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const color = getComputedStyle(element).backgroundColor;
        const rgbaAlpha = color.match(
          /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/,
        )?.[1];
        const colorFunctionAlpha = color.match(/\/\s*([\d.]+)\s*\)$/)?.[1];
        return Number(rgbaAlpha ?? colorFunctionAlpha ?? 1);
      }),
    )
    .toBeLessThan(1);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.setViewportSize({ width: 640, height: 844 });
  await expect(toggle).toBeHidden();
});

test("tablet curriculum scrollbar stays on the floating drawer edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 679, height: 779 });
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-hide-scrollbars", "false");
    window.localStorage.setItem("veolms-scrollbar-style", "theme");
    window.localStorage.setItem("veolms-floating-curriculum-width", "300");
  });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const toggle = page.getByRole("button", { name: "Expand course content" });
  await toggle.click({ force: true });
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  const curriculumScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="lesson-drawer-curriculum-scrollport"]',
  );
  await expect(dialog).toBeVisible();
  await expect(curriculumScrollbar).toBeVisible();

  await expect
    .poll(async () => {
      const [dialogBounds, scrollbarBounds, viewportWidth] = await Promise.all([
        dialog.boundingBox(),
        curriculumScrollbar.boundingBox(),
        page.evaluate(() => window.innerWidth),
      ]);
      if (!dialogBounds || !scrollbarBounds) return Number.POSITIVE_INFINITY;
      const visibleDialogRight = Math.min(
        viewportWidth,
        dialogBounds.x + dialogBounds.width,
      );
      return Math.abs(
        visibleDialogRight - (scrollbarBounds.x + scrollbarBounds.width),
      );
    })
    .toBeLessThanOrEqual(0.5);
});

test("tablet curriculum resize rail can drag the floating drawer closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 779 });
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-floating-curriculum-width", "300");
  });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const toggle = page.getByRole("button", { name: "Expand course content" });
  await toggle.click({ force: true });
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  const resizeRail = page.getByRole("separator", {
    name: "Resize floating course curriculum",
  });
  await expect(dialog).toBeVisible();
  await expect(resizeRail).toBeVisible();

  const railBounds = await resizeRail.boundingBox();
  expect(railBounds).not.toBeNull();
  const startX = railBounds!.x + railBounds!.width / 2;
  const startY = railBounds!.y + railBounds!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 180, startY, { steps: 6 });
  await expect
    .poll(async () => (await dialog.boundingBox())?.width ?? Infinity)
    .toBeLessThanOrEqual(150);
  await page.mouse.up();

  await expect(dialog).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("course drawer stays closed when a resize exits the compact workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openApp(page, "/learn/typescript-course");

  const trigger = page.getByRole("button", { name: "Open course lessons" });
  const dialog = page.getByRole("dialog", { name: "Course lessons" });

  await trigger.click();
  await expect(dialog).toBeVisible();

  await page.setViewportSize({ width: 1081, height: 900 });
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).not.toBeFocused();
  await expect(
    page.getByRole("complementary", { name: "Course curriculum" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 800, height: 900 });
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("course drawer aligns with the lesson column beside the sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 932, height: 724 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const trigger = page.getByRole("button", { name: "Open course lessons" });
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  await trigger.click();
  await expect(dialog).toBeVisible();

  const geometry = await page.evaluate(() => {
    const player = document.querySelector<HTMLElement>(
      ".learning-workspace__player-wrap",
    );
    const drawer = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Course lessons"]',
    );
    if (!player || !drawer) throw new Error("Lesson drawer geometry missing");

    const playerBounds = player.getBoundingClientRect();
    const drawerBounds = drawer.getBoundingClientRect();
    return {
      playerLeft: playerBounds.left,
      playerRight: playerBounds.right,
      drawerLeft: drawerBounds.left,
      drawerRight: drawerBounds.right,
    };
  });

  expect(geometry.drawerLeft).toBeCloseTo(geometry.playerLeft, 0);
  expect(geometry.drawerRight).toBeCloseTo(geometry.playerRight, 0);
});

test("hidden application sidebar preserves the independent course content layout", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("veolms-sidebar-mode", "hidden");
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await openApp(page, "/learn/typescript-course");

  const app = page.locator(".courses-app");
  const curriculum = page.locator(".learning-workspace__curriculum-column");
  const trigger = page.getByRole("button", { name: "Open course lessons" });
  const dialog = page.getByRole("dialog", { name: "Course lessons" });

  await expect(app).toHaveClass(/courses-app--hidden/);
  await expect(curriculum).toBeVisible();
  await expect(dialog).toBeHidden();

  const desktopGeometry = await page.evaluate(() => {
    const parent = document.querySelector<HTMLElement>(
      ".courses-main--learning",
    );
    const player = document.querySelector<HTMLElement>(".youtube-player");
    const curriculumColumn = document.querySelector<HTMLElement>(
      ".learning-workspace__curriculum-column",
    );
    if (!parent || !player || !curriculumColumn) return null;

    const parentRect = parent.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();
    const curriculumRect = curriculumColumn.getBoundingClientRect();
    return {
      playerCurriculumGap: Math.abs(playerRect.right - curriculumRect.left),
      curriculumRightGap: Math.abs(parentRect.right - curriculumRect.right),
      horizontalOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });

  expect(desktopGeometry).not.toBeNull();
  expect(desktopGeometry!.playerCurriculumGap).toBeLessThanOrEqual(1);
  expect(desktopGeometry!.curriculumRightGap).toBeLessThanOrEqual(1);
  expect(desktopGeometry!.horizontalOverflow).toBeLessThanOrEqual(1);

  await page.locator(".learning-workspace__player-wrap").hover();
  await page.getByRole("button", { name: "Collapse course content" }).click();
  await expect(curriculum).toHaveClass(/is-collapsed/);
  await expect(app).toHaveClass(/courses-app--hidden/);

  await trigger.click();
  await expect(curriculum).not.toHaveClass(/is-collapsed/);
  await expect(curriculum).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(app).toHaveClass(/courses-app--hidden/);

  await page.setViewportSize({ width: 1080, height: 900 });
  await expect(curriculum).toBeHidden();
  await expect(dialog).toBeHidden();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(app).toHaveClass(/courses-app--hidden/);
});

test("tablet browser back closes each bottom drawer before navigating", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await openApp(page, "/");
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  const learningUrl = page.url();
  const lessonTrigger = page.getByRole("button", {
    name: "Open course lessons",
  });
  const lessonDrawer = page.getByRole("dialog", { name: "Course lessons" });
  await lessonTrigger.click();
  await expect(lessonDrawer).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof window.history.state?.__veolmsOverlayHistoryEntry === "string",
      ),
    )
    .toBe(true);

  await page.goBack();
  await expect(lessonDrawer).toBeHidden();
  await expect(page).toHaveURL(learningUrl);

  const moreTrigger = page.getByRole("button", {
    name: "More navigation options",
  });
  const moreDrawer = page.getByRole("dialog", { name: /More/ });
  await moreTrigger.click();
  await expect(moreDrawer).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof window.history.state?.__veolmsOverlayHistoryEntry === "string",
      ),
    )
    .toBe(true);

  await page.goBack();
  await expect(moreDrawer).toBeHidden();
  await expect(page).toHaveURL(learningUrl);
});

test("browser back closes the topmost profile popup before its More drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await openApp(page, "/");
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  const learningUrl = page.url();
  const moreDrawer = page.getByRole("dialog", { name: /More/ });
  await page.getByRole("button", { name: "More navigation options" }).click();
  await expect(moreDrawer).toBeVisible();

  await moreDrawer.locator(".mobile-menu-sheet__profile").click();
  const profileMenu = page.locator("#mobile-profile-menu");
  await expect(profileMenu).toBeVisible();

  await page.goBack();
  await expect(profileMenu).toBeHidden();
  await expect(moreDrawer).toBeVisible();
  await expect(page).toHaveURL(learningUrl);

  await page.goBack();
  await expect(moreDrawer).toBeHidden();
  await expect(page).toHaveURL(learningUrl);
});

test("phone back closes the More profile popup without closing its drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  const learningUrl = page.url();
  const moreDrawer = page.getByRole("dialog", { name: /More/ });
  await page.getByRole("button", { name: "More navigation options" }).click();
  await moreDrawer.locator(".mobile-menu-sheet__profile").click();

  const profileMenu = page.locator("#mobile-profile-menu");
  await expect(profileMenu).toBeVisible();
  await page.goBack();

  await expect(profileMenu).toBeHidden();
  await expect(moreDrawer).toBeVisible();
  await expect(page).toHaveURL(learningUrl);

  await page.goBack();
  await expect(moreDrawer).toBeHidden();
  await expect(page).toHaveURL(learningUrl);
});

test("lesson title uses the responsive type scale and press-only surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/learn/typescript-course");

  const lessonHeading = page.locator("#learning-course-content-trigger");
  const lessonTitle = page.locator(".learning-workspace__lesson-heading h1");
  const mobileFontSize = await lessonTitle.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(mobileFontSize).toBe(18);
  await expect(lessonHeading).toHaveCSS("padding-top", "16px");
  await expect(lessonHeading).toHaveCSS("padding-left", "12px");
  await expect(lessonHeading).toHaveCSS("padding-right", "12px");
  await expect(lessonHeading).toHaveCSS("padding-bottom", "16px");
  await expect(lessonHeading).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const lessonHeadingWidth = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(
      "#learning-course-content-trigger",
    );
    const column = document.querySelector<HTMLElement>(
      ".learning-workspace__lesson-column",
    );
    return {
      heading: heading?.getBoundingClientRect().width ?? null,
      column: column?.getBoundingClientRect().width ?? null,
    };
  });
  expect(lessonHeadingWidth.heading).not.toBeNull();
  expect(lessonHeadingWidth.column).not.toBeNull();
  expect(
    Math.abs(lessonHeadingWidth.column! - lessonHeadingWidth.heading!),
  ).toBeLessThanOrEqual(1);

  const mobileContentGutters = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(
      ".learning-workspace__main",
    );
    const titleContent = document.querySelector<HTMLElement>(
      "#learning-course-content-trigger > div",
    );
    const tabList = document.querySelector<HTMLElement>(
      ".learning-discussion__header [role='tablist']",
    );
    const commentCard = document.querySelector<HTMLElement>(
      ".learning-comment-card",
    );
    const commentAvatar = commentCard?.querySelector<HTMLElement>(
      ".learning-comment-card__avatar",
    );

    return {
      mainLeft: main?.getBoundingClientRect().left ?? null,
      titleLeft: titleContent?.getBoundingClientRect().left ?? null,
      tabListLeft: tabList?.getBoundingClientRect().left ?? null,
      commentLeft: commentCard?.getBoundingClientRect().left ?? null,
      commentAvatarLeft: commentAvatar?.getBoundingClientRect().left ?? null,
    };
  });
  expect(mobileContentGutters.titleLeft).not.toBeNull();
  expect(mobileContentGutters.tabListLeft).not.toBeNull();
  expect(mobileContentGutters.commentLeft).not.toBeNull();
  expect(mobileContentGutters.commentAvatarLeft).not.toBeNull();
  expect(
    mobileContentGutters.tabListLeft! - mobileContentGutters.mainLeft!,
  ).toBeCloseTo(12, 0);
  expect(
    mobileContentGutters.commentLeft! - mobileContentGutters.mainLeft!,
  ).toBeCloseTo(0, 0);
  expect(
    mobileContentGutters.commentAvatarLeft! - mobileContentGutters.mainLeft!,
  ).toBeCloseTo(12, 0);
  expect(
    mobileContentGutters.titleLeft! - mobileContentGutters.mainLeft!,
  ).toBeCloseTo(12, 0);

  await lessonHeading.hover();
  await expect(lessonHeading).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const headingBounds = await lessonHeading.boundingBox();
  expect(headingBounds).not.toBeNull();
  await page.mouse.move(
    headingBounds!.x + headingBounds!.width / 2,
    headingBounds!.y + headingBounds!.height / 2,
  );
  await page.mouse.down();
  await expect
    .poll(() =>
      lessonHeading.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe("rgba(0, 0, 0, 0)");
  await page.mouse.up();
  await expect(lessonHeading).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 800, height: 1000 });
  await expect
    .poll(() =>
      lessonTitle.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    )
    .toBe(20);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect
    .poll(() =>
      lessonTitle.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    )
    .toBe(22);
});

test("lesson title surface aligns with the player at tablet width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 870, height: 779 });
  await openApp(page, "/learn/typescript-course");

  const bounds = await page.evaluate(() => {
    const heading = document
      .querySelector<HTMLElement>("#learning-course-content-trigger")
      ?.getBoundingClientRect();
    const player = document
      .querySelector<HTMLElement>(".learning-workspace__player-wrap")
      ?.getBoundingClientRect();
    return {
      headingLeft: heading?.left ?? null,
      headingRight: heading?.right ?? null,
      playerLeft: player?.left ?? null,
      playerRight: player?.right ?? null,
    };
  });

  expect(bounds.headingLeft).not.toBeNull();
  expect(bounds.headingRight).not.toBeNull();
  expect(bounds.playerLeft).not.toBeNull();
  expect(bounds.playerRight).not.toBeNull();
  expect(
    Math.abs(bounds.headingLeft! - bounds.playerLeft!),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(bounds.playerRight! - bounds.headingRight!),
  ).toBeLessThanOrEqual(1);
});

test("comments use edge-to-edge divider rows instead of cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1247, height: 779 });
  await openApp(page, "/learn/backend-nodejs/research-methods?from=courses");

  const lessonColumn = page.locator(".learning-workspace__lesson-column");
  const commentsSurface = page.locator(".learning-comments-surface");
  const composer = page.locator(".learning-comment-composer");
  const commentRows = page.locator(".learning-comment-card");
  await expect(commentRows).toHaveCount(5);

  const [columnBounds, surfaceBounds, firstBounds, secondBounds] =
    await Promise.all([
      lessonColumn.boundingBox(),
      commentsSurface.boundingBox(),
      commentRows.nth(0).boundingBox(),
      commentRows.nth(1).boundingBox(),
    ]);
  expect(columnBounds).not.toBeNull();
  expect(surfaceBounds).not.toBeNull();
  expect(firstBounds).not.toBeNull();
  expect(secondBounds).not.toBeNull();
  expect(Math.abs(surfaceBounds!.x - columnBounds!.x)).toBeLessThan(0.5);
  expect(
    Math.abs(
      surfaceBounds!.x +
        surfaceBounds!.width -
        (columnBounds!.x + columnBounds!.width),
    ),
  ).toBeLessThan(0.5);
  expect(
    Math.abs(secondBounds!.y - (firstBounds!.y + firstBounds!.height)),
  ).toBeLessThan(0.5);

  await expect(composer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(composer).toHaveCSS("border-radius", "0px");
  await expect(composer).toHaveCSS("box-shadow", "none");
  await expect(commentRows.first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(commentRows.first()).toHaveCSS("border-radius", "0px");
  await expect(commentRows.first()).toHaveCSS("border-bottom-width", "1px");
  await expect(commentRows.first()).toHaveCSS("box-shadow", "none");
});

test("mobile lesson playback and lesson tools stay pinned while content scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  const player = page.locator(".learning-workspace__player-wrap");
  const discussionHeader = page.locator(".learning-discussion__header");
  const lessonTools = page.getByRole("tablist", { name: "Lesson tools" });
  const firstComment = page.locator(".learning-comment-card").first();
  await expect(player).toBeVisible();
  await expect(discussionHeader).toBeVisible();
  await expect(lessonTools).toHaveCSS("scrollbar-width", "none");
  await expect
    .poll(() =>
      lessonTools.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    )
    .toBeGreaterThan(0);

  const initialPlayerHeight = await player.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  const initialCommentTop = await firstComment.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  const mobileStickyState = await page.evaluate(() => ({
    discussionHeader: getComputedStyle(
      document.querySelector(".learning-discussion__header")!,
    ).position,
    playerWrap: getComputedStyle(
      document.querySelector(".learning-workspace__player-wrap")!,
    ).position,
  }));
  expect(mobileStickyState.playerWrap).toBe("sticky");
  expect(mobileStickyState.discussionHeader).toBe("sticky");

  await page.evaluate(() => window.scrollTo(0, 360));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await expect
    .poll(
      async () => (await player.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    )
    .toBeLessThanOrEqual(1);
  await expect
    .poll(
      async () =>
        (await discussionHeader.boundingBox())?.y ?? Number.NEGATIVE_INFINITY,
    )
    .toBeGreaterThanOrEqual(initialPlayerHeight - 2);
  await expect
    .poll(
      async () =>
        (await discussionHeader.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    )
    .toBeLessThanOrEqual(initialPlayerHeight + 2);
  await expect
    .poll(
      async () =>
        (await firstComment.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    )
    .toBeLessThan(initialCommentTop - 40);

  const stickyStack = await page.evaluate(() => {
    const playerBounds = document
      .querySelector(".learning-workspace__player-wrap")!
      .getBoundingClientRect();
    const discussionBounds = document
      .querySelector(".learning-discussion__header")!
      .getBoundingClientRect();
    return {
      gap: Math.abs(discussionBounds.top - playerBounds.bottom),
      playerTop: playerBounds.top,
    };
  });
  expect(stickyStack.playerTop).toBeLessThanOrEqual(1);
  expect(stickyStack.gap).toBeLessThanOrEqual(2);
});

test("mobile lesson tab clicks preserve the lesson chrome at natural and sticky positions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 374, height: 724 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const player = page.locator(".learning-workspace__player-wrap");
  const discussionHeader = page.locator(".learning-discussion__header");
  const lessonTitle = page.locator("#learning-course-content-trigger");
  const commentsTab = page.getByRole("tab", { name: "Comments" });
  const notesTab = page.getByRole("tab", { name: "Notes" });
  const readChromePosition = () =>
    page.evaluate(() => {
      const playerBounds = document
        .querySelector<HTMLElement>(".learning-workspace__player-wrap")!
        .getBoundingClientRect();
      const titleBounds = document
        .querySelector<HTMLElement>("#learning-course-content-trigger")!
        .getBoundingClientRect();
      const discussionBounds = document
        .querySelector<HTMLElement>(".learning-discussion__header")!
        .getBoundingClientRect();
      return {
        scrollTop: window.scrollY,
        playerTop: playerBounds.top,
        titleTop: titleBounds.top,
        discussionTop: discussionBounds.top,
      };
    });
  const expectChromePosition = (
    after: Awaited<ReturnType<typeof readChromePosition>>,
    before: Awaited<ReturnType<typeof readChromePosition>>,
  ) => {
    expect(after.scrollTop).toBeCloseTo(before.scrollTop, 0);
    expect(after.playerTop).toBeCloseTo(before.playerTop, 0);
    expect(after.titleTop).toBeCloseTo(before.titleTop, 0);
    expect(after.discussionTop).toBeCloseTo(before.discussionTop, 0);
  };

  const naturalPosition = await readChromePosition();
  expect(naturalPosition.titleTop).toBeGreaterThanOrEqual(0);
  await notesTab.click();
  await expect(notesTab).toHaveAttribute("aria-selected", "true");
  expectChromePosition(await readChromePosition(), naturalPosition);

  await commentsTab.click();
  await expect(commentsTab).toHaveAttribute("aria-selected", "true");

  await page.evaluate(() => window.scrollTo(0, 360));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await expect
    .poll(async () => {
      const [playerBounds, discussionBounds] = await Promise.all([
        player.boundingBox(),
        discussionHeader.boundingBox(),
      ]);
      if (!playerBounds || !discussionBounds) return Number.POSITIVE_INFINITY;
      return Math.abs(
        discussionBounds.y - (playerBounds.y + playerBounds.height),
      );
    })
    .toBeLessThanOrEqual(2);

  const stickyPosition = await readChromePosition();
  await notesTab.evaluate((tab) => {
    tab.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        isPrimary: true,
        pointerId: 1,
        pointerType: "touch",
      }),
    );
    (tab as HTMLButtonElement).click();
    tab.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        isPrimary: true,
        pointerId: 1,
        pointerType: "touch",
      }),
    );
  });
  await expect(notesTab).toHaveAttribute("aria-selected", "true");
  const notesHeading = page.getByRole("heading", {
    name: "Your lesson notes",
  });
  await expect(notesHeading).toBeVisible();

  const stickyStateAfterSwitch = await page.evaluate(() => {
    const playerBounds = document
      .querySelector<HTMLElement>(".learning-workspace__player-wrap")!
      .getBoundingClientRect();
    const discussionBounds = document
      .querySelector<HTMLElement>(".learning-discussion__header")!
      .getBoundingClientRect();
    const titleBounds = document
      .querySelector<HTMLElement>("#learning-course-content-trigger")!
      .getBoundingClientRect();
    return {
      scrollTop: window.scrollY,
      playerTop: playerBounds.top,
      stickyGap: Math.abs(discussionBounds.top - playerBounds.bottom),
      titleBottom: titleBounds.bottom,
      playerBottom: playerBounds.bottom,
    };
  });

  const stickyPositionAfterSwitch = await readChromePosition();
  expect(stickyPositionAfterSwitch.playerTop).toBeCloseTo(
    stickyPosition.playerTop,
    0,
  );
  expect(stickyPositionAfterSwitch.discussionTop).toBeCloseTo(
    stickyPosition.discussionTop,
    0,
  );
  expect(stickyStateAfterSwitch.scrollTop).toBeGreaterThan(1);
  expect(stickyStateAfterSwitch.playerTop).toBeLessThanOrEqual(1);
  expect(stickyStateAfterSwitch.stickyGap).toBeLessThanOrEqual(2);
  expect(stickyStateAfterSwitch.titleBottom).toBeLessThanOrEqual(
    stickyStateAfterSwitch.playerBottom,
  );
  const [notesCardBounds, discussionBounds] = await Promise.all([
    notesHeading.locator("..").boundingBox(),
    discussionHeader.boundingBox(),
  ]);
  expect(notesCardBounds).not.toBeNull();
  expect(discussionBounds).not.toBeNull();
  expect(notesCardBounds!.y).toBeCloseTo(
    discussionBounds!.y + discussionBounds!.height + 12,
    0,
  );
});

test("real mobile tab clicks keep the sticky lesson stack pinned for short panels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const player = page.locator(".learning-workspace__player-wrap");
  const lessonTools = page.locator(".learning-discussion__header");
  const resourcesTab = page.getByRole("tab", {
    name: "Resources",
    exact: true,
  });
  const commentsTab = page.getByRole("tab", {
    name: "Comments",
    exact: true,
  });
  const readStickyStack = () =>
    page.evaluate(() => {
      const playerBounds = document
        .querySelector<HTMLElement>(".learning-workspace__player-wrap")!
        .getBoundingClientRect();
      const titleBounds = document
        .querySelector<HTMLElement>("#learning-course-content-trigger")!
        .getBoundingClientRect();
      const toolsBounds = document
        .querySelector<HTMLElement>(".learning-discussion__header")!
        .getBoundingClientRect();
      return {
        scrollTop: window.scrollY,
        playerTop: playerBounds.top,
        playerBottom: playerBounds.bottom,
        titleBottom: titleBounds.bottom,
        toolsTop: toolsBounds.top,
      };
    });

  await page.evaluate(() => window.scrollTo({ top: 160, behavior: "auto" }));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await expect
    .poll(async () => {
      const [playerBounds, toolsBounds] = await Promise.all([
        player.boundingBox(),
        lessonTools.boundingBox(),
      ]);
      if (!playerBounds || !toolsBounds) return Number.POSITIVE_INFINITY;
      return Math.abs(toolsBounds.y - (playerBounds.y + playerBounds.height));
    })
    .toBeLessThanOrEqual(2);

  const stickyPosition = await readStickyStack();
  expect(stickyPosition.titleBottom).toBeLessThanOrEqual(
    stickyPosition.playerBottom,
  );

  // Mobile Chromium can scroll a focused sticky tab toward its original flow
  // position before click dispatch. Reproduce that ordering and verify the
  // last pinned position wins before the shorter panel mounts.
  await resourcesTab.evaluate((tab) => {
    (tab as HTMLButtonElement).focus();
    window.scrollTo({ top: 0, behavior: "auto" });
    (tab as HTMLButtonElement).click();
  });
  await expect(resourcesTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Lesson resources" }),
  ).toBeVisible();

  const resourcesPosition = await readStickyStack();
  expect(resourcesPosition.scrollTop).toBeGreaterThan(1);
  expect(resourcesPosition.playerTop).toBeCloseTo(stickyPosition.playerTop, 0);
  expect(resourcesPosition.toolsTop).toBeCloseTo(stickyPosition.toolsTop, 0);
  expect(resourcesPosition.titleBottom).toBeLessThanOrEqual(
    resourcesPosition.playerBottom,
  );

  await commentsTab.click();
  await expect(commentsTab).toHaveAttribute("aria-selected", "true");
  const commentsPosition = await readStickyStack();
  expect(commentsPosition.scrollTop).toBeCloseTo(stickyPosition.scrollTop, 0);
  expect(commentsPosition.playerTop).toBeCloseTo(stickyPosition.playerTop, 0);
  expect(commentsPosition.toolsTop).toBeCloseTo(stickyPosition.toolsTop, 0);
  expect(commentsPosition.titleBottom).toBeLessThanOrEqual(
    commentsPosition.playerBottom,
  );
});

test("mobile supplemental tabs clear sticky spacing in the natural layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const commentsTab = page.getByRole("tab", { name: "Comments", exact: true });
  const notesTab = page.getByRole("tab", { name: "Notes", exact: true });
  const resourcesTab = page.getByRole("tab", {
    name: "Resources",
    exact: true,
  });
  const questionsTab = page.getByRole("tab", { name: "Q&A", exact: true });
  const readContentSpacing = () =>
    page.locator("#learning-discussion-tab-panel").evaluate((panel) => {
      const content = panel.querySelector<HTMLElement>(
        ".swiper-slide-active > :first-child",
      );
      const contentStart = content?.querySelector<HTMLElement>(
        ".learning-comment-composer__avatar, h3",
      );
      return {
        offset:
          Number.parseFloat(
            panel.style.getPropertyValue("--tab-destination-offset"),
          ) || 0,
        topGap: content
          ? content.getBoundingClientRect().top -
            panel.getBoundingClientRect().top
          : Number.POSITIVE_INFINITY,
        contentStartGap: contentStart
          ? contentStart.getBoundingClientRect().top -
            panel.getBoundingClientRect().top
          : Number.POSITIVE_INFINITY,
      };
    });

  const commentsSpacing = await readContentSpacing();

  await page.evaluate(() => window.scrollTo({ top: 180, behavior: "auto" }));
  await resourcesTab.click();
  await questionsTab.click();
  await notesTab.click();
  await commentsTab.click();

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);

  for (const tab of [notesTab, resourcesTab, questionsTab]) {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const spacing = await readContentSpacing();
    expect(spacing.offset).toBeCloseTo(0, 0);
    expect(spacing.topGap).toBeCloseTo(12, 0);
    expect(
      Math.abs(spacing.contentStartGap - commentsSpacing.contentStartGap),
    ).toBeLessThanOrEqual(1);
  }
});

test("lesson playback switches to the mobile sticky stack at 840px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 840, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  const player = page.locator(".learning-workspace__player-wrap");
  const discussionHeader = page.locator(".learning-discussion__header");
  const firstComment = page.locator(".learning-comment-card").first();
  const scrollport = page.locator("#courses-main-scrollport");
  const initialCommentTop = await firstComment.evaluate(
    (element) => element.getBoundingClientRect().top,
  );

  await expect(player).toHaveCSS("position", "sticky");
  await expect(discussionHeader).toHaveCSS("position", "sticky");
  await scrollport.evaluate((element) => element.scrollTo(0, 360));

  await expect
    .poll(() => scrollport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  await expect
    .poll(async () => {
      const [playerBounds, scrollportBounds] = await Promise.all([
        player.boundingBox(),
        scrollport.boundingBox(),
      ]);
      if (!playerBounds || !scrollportBounds) return Number.POSITIVE_INFINITY;
      return Math.abs(playerBounds.y - scrollportBounds.y);
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () => {
      const [playerBounds, discussionBounds] = await Promise.all([
        player.boundingBox(),
        discussionHeader.boundingBox(),
      ]);
      if (!playerBounds || !discussionBounds) return Number.POSITIVE_INFINITY;
      return Math.abs(
        discussionBounds.y - (playerBounds.y + playerBounds.height),
      );
    })
    .toBeLessThanOrEqual(2);
  await expect
    .poll(
      async () =>
        (await firstComment.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    )
    .toBeLessThan(initialCommentTop - 40);
  const tabletPositionBefore = {
    scrollTop: await scrollport.evaluate((element) => element.scrollTop),
    playerTop: (await player.boundingBox())!.y,
    discussionTop: (await discussionHeader.boundingBox())!.y,
  };

  await page.getByRole("tab", { name: "Notes" }).click();
  const tabletNotesHeading = page.getByRole("heading", {
    name: "Your lesson notes",
  });
  await expect(tabletNotesHeading).toBeVisible();
  expect(await scrollport.evaluate((element) => element.scrollTop)).toBeCloseTo(
    tabletPositionBefore.scrollTop,
    0,
  );
  expect((await player.boundingBox())!.y).toBeCloseTo(
    tabletPositionBefore.playerTop,
    0,
  );
  expect((await discussionHeader.boundingBox())!.y).toBeCloseTo(
    tabletPositionBefore.discussionTop,
    0,
  );
  await expect
    .poll(async () => {
      const [playerBounds, discussionBounds, notesBounds] = await Promise.all([
        player.boundingBox(),
        discussionHeader.boundingBox(),
        tabletNotesHeading.locator("..").boundingBox(),
      ]);
      if (!playerBounds || !discussionBounds || !notesBounds) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.max(
        Math.abs(discussionBounds.y - (playerBounds.y + playerBounds.height)),
        Math.abs(
          notesBounds.y - (discussionBounds.y + discussionBounds.height + 12),
        ),
      );
    })
    .toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 841, height: 779 });
  await expect(player).toHaveCSS("position", "relative");
  await expect(discussionHeader).toHaveCSS("position", "static");
});

test("compact lesson video reaches every available parent edge", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1080, height: 779 },
    { width: 1024, height: 779 },
    { width: 824, height: 779 },
    { width: 700, height: 779 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openApp(
      page,
      "/learn/backend-nodejs/career-opportunities-15?from=courses",
    );

    const geometry = await page.evaluate(() => {
      const parent = document.querySelector<HTMLElement>(
        ".courses-main--learning",
      );
      const player = document.querySelector<HTMLElement>(".youtube-player");
      if (!parent || !player) return null;

      const parentBounds = parent.getBoundingClientRect();
      const playerBounds = player.getBoundingClientRect();
      return {
        left: Math.abs(playerBounds.left - parentBounds.left),
        right: Math.abs(playerBounds.right - parentBounds.right),
        top: Math.abs(playerBounds.top - parentBounds.top),
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry!.left, `${viewport.width}px left edge`).toBeLessThanOrEqual(
      1,
    );
    expect(
      geometry!.right,
      `${viewport.width}px right edge`,
    ).toBeLessThanOrEqual(1);
    expect(geometry!.top, `${viewport.width}px top edge`).toBeLessThanOrEqual(
      1,
    );
  }
});

test("mobile More sheet anchors below lesson video and scrolls its navigation content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  const player = page.locator(".learning-workspace__player-wrap");
  await page.getByRole("button", { name: "More navigation options" }).click();

  const dialog = page.getByRole("dialog", { name: /More/ });
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const [dialogBounds, playerBounds] = await Promise.all([
        dialog.boundingBox(),
        player.boundingBox(),
      ]);
      if (!dialogBounds || !playerBounds) return Number.POSITIVE_INFINITY;
      return Math.abs(dialogBounds.y - (playerBounds.y + playerBounds.height));
    })
    .toBeLessThanOrEqual(2);

  const list = dialog.locator(".mobile-menu-sheet__list");
  const appearance = dialog.getByRole("group", {
    name: "Appearance controls",
  });
  const heading = dialog.locator(".mobile-menu-sheet__heading");
  const profile = dialog.locator(".mobile-menu-sheet__profile");
  const navigationItem = list.locator(":scope > button").first();
  const swipeHandle = dialog.locator('[data-slot="drawer-swipe-handle"]');
  await expect(appearance).toBeVisible();
  const [
    dialogBounds,
    listBounds,
    appearanceBounds,
    profileBounds,
    navigationItemBounds,
  ] = await Promise.all([
    dialog.boundingBox(),
    list.boundingBox(),
    appearance.boundingBox(),
    profile.boundingBox(),
    navigationItem.boundingBox(),
  ]);
  expect(dialogBounds).not.toBeNull();
  expect(listBounds).not.toBeNull();
  expect(appearanceBounds).not.toBeNull();
  expect(profileBounds).not.toBeNull();
  expect(navigationItemBounds).not.toBeNull();
  await expect(list.locator(":scope > button.is-active")).toHaveCount(0);
  expect(listBounds!.x).toBeCloseTo(dialogBounds!.x, 0);
  expect(listBounds!.x + listBounds!.width).toBeCloseTo(
    dialogBounds!.x + dialogBounds!.width,
    0,
  );
  expect(navigationItemBounds!.x).toBeCloseTo(profileBounds!.x, 0);
  expect(navigationItemBounds!.width).toBeCloseTo(profileBounds!.width, 0);
  expect(appearanceBounds!.y + appearanceBounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  expect(listBounds!.y + listBounds!.height).toBeLessThanOrEqual(
    appearanceBounds!.y,
  );
  const listGeometry = await list.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(listGeometry.scrollHeight).toBeGreaterThan(listGeometry.clientHeight);

  const [headingBefore, profileBefore, appearanceBefore] = await Promise.all([
    heading.boundingBox(),
    profile.boundingBox(),
    appearance.boundingBox(),
  ]);
  expect(headingBefore).not.toBeNull();
  expect(profileBefore).not.toBeNull();
  expect(appearanceBefore).not.toBeNull();
  await list.evaluate((element) => {
    element.scrollTop = 120;
  });
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const [headingAfter, profileAfter, appearanceAfter] = await Promise.all([
    heading.boundingBox(),
    profile.boundingBox(),
    appearance.boundingBox(),
  ]);
  expect(headingAfter).not.toBeNull();
  expect(profileAfter).not.toBeNull();
  expect(appearanceAfter).not.toBeNull();
  expect(headingAfter!.y).toBeCloseTo(headingBefore!.y, 0);
  expect(profileAfter!.y).toBeCloseTo(profileBefore!.y, 0);
  expect(appearanceAfter!.y).toBeCloseTo(appearanceBefore!.y, 0);

  const pullHandleBounds = await swipeHandle.boundingBox();
  expect(pullHandleBounds).not.toBeNull();
  const pullX = pullHandleBounds!.x + pullHandleBounds!.width / 2;
  const pullY = pullHandleBounds!.y + pullHandleBounds!.height / 2;
  await page.mouse.move(pullX, pullY);
  await page.mouse.down();
  await page.mouse.move(pullX, pullY + 28, { steps: 4 });
  const appearanceDuringPull = await appearance.boundingBox();
  expect(appearanceDuringPull).not.toBeNull();
  expect(
    appearanceDuringPull!.y + appearanceDuringPull!.height,
  ).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.mouse.up();
  await expect(dialog).toBeVisible();

  await profile.click();
  const profileMenu = page.locator("#mobile-profile-menu");
  const studentOption = profileMenu.getByRole("menuitemradio", {
    name: "Student",
  });
  await expect(profileMenu).toBeVisible();
  await expect(studentOption).toBeVisible();
  const [profileMenuBounds, studentOptionIsReachable] = await Promise.all([
    profileMenu.boundingBox(),
    studentOption.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return hitTarget === element || element.contains(hitTarget);
    }),
  ]);
  expect(profileMenuBounds).not.toBeNull();
  expect(profileMenuBounds!.height).toBeGreaterThan(120);
  expect(studentOptionIsReachable).toBe(true);

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
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(dialog).toHaveAttribute("data-expanded", "");
  await expect
    .poll(
      async () => (await dialog.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    )
    .toBeLessThanOrEqual(1);
});

test("mobile More sheet snaps back on a slow pull and closes on a fast pull", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  const player = page.locator(".learning-workspace__player-wrap");
  await page.getByRole("button", { name: "More navigation options" }).click();
  const dialog = page.getByRole("dialog", { name: /More/ });
  const swipeHandle = dialog.locator('[data-slot="drawer-swipe-handle"]');
  await expect(dialog).toBeVisible();

  const collapsedY = async () => {
    const [dialogBounds, playerBounds] = await Promise.all([
      dialog.boundingBox(),
      player.boundingBox(),
    ]);
    if (!dialogBounds || !playerBounds) return Number.POSITIVE_INFINITY;
    return Math.abs(dialogBounds.y - (playerBounds.y + playerBounds.height));
  };
  await expect.poll(collapsedY).toBeLessThanOrEqual(2);

  const slowHandleBounds = await swipeHandle.boundingBox();
  expect(slowHandleBounds).not.toBeNull();
  const slowStartX = slowHandleBounds!.x + slowHandleBounds!.width / 2;
  const slowStartY = slowHandleBounds!.y + slowHandleBounds!.height / 2;
  await page.mouse.move(slowStartX, slowStartY);
  await page.mouse.down();
  await page.mouse.move(slowStartX, slowStartY + 36, { steps: 6 });
  await page.mouse.up();

  await expect(dialog).toBeVisible();
  await expect(dialog).not.toHaveAttribute("data-expanded", "");
  await expect.poll(collapsedY).toBeLessThanOrEqual(2);

  const fastHandleBounds = await swipeHandle.boundingBox();
  expect(fastHandleBounds).not.toBeNull();
  const fastStartX = fastHandleBounds!.x + fastHandleBounds!.width / 2;
  const fastStartY = fastHandleBounds!.y + fastHandleBounds!.height / 2;
  await page.mouse.move(fastStartX, fastStartY);
  await page.mouse.down();
  await page.mouse.move(fastStartX, page.viewportSize()!.height - 4, {
    steps: 2,
  });
  await page.waitForTimeout(20);
  await page.mouse.up();

  await expect(dialog).toBeHidden();
});

test("mobile More sheet closes from a downward touch swipe on a navigation item", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  await page.getByRole("button", { name: "More navigation options" }).click();
  const dialog = page.getByRole("dialog", { name: /More/ });
  const home = dialog.getByRole("button", { name: "Home" });
  await expect(dialog).toBeVisible();
  const homeBounds = await home.boundingBox();
  expect(homeBounds).not.toBeNull();

  const startX = homeBounds!.x + homeBounds!.width / 2;
  const startY = homeBounds!.y + homeBounds!.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const timestamp = Date.now() / 1000;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY }],
    timestamp,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: startX, y: startY + 96 }],
    timestamp: timestamp + 0.04,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: startX, y: page.viewportSize()!.height - 4 }],
    timestamp: timestamp + 0.08,
  });
  await expect(dialog).toHaveAttribute("data-swiping", "");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
    timestamp: timestamp + 0.09,
  });

  await expect(dialog).toBeHidden();
});

test("expanded mobile More navigation keeps menu items at their fixed height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  await page.getByRole("button", { name: "More navigation options" }).click();
  const dialog = page.getByRole("dialog", { name: /More/ });
  const swipeHandle = dialog.locator('[data-slot="drawer-swipe-handle"]');
  const swipeHandleBounds = await swipeHandle.boundingBox();
  expect(swipeHandleBounds).not.toBeNull();
  const startX = swipeHandleBounds!.x + swipeHandleBounds!.width / 2;
  const startY = swipeHandleBounds!.y + swipeHandleBounds!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, 8, { steps: 8 });
  await page.mouse.up();
  await expect(dialog).toHaveAttribute("data-expanded", "");

  const itemHeights = await dialog
    .locator(".mobile-menu-sheet__list > button")
    .evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().height)),
    );
  expect(itemHeights.length).toBeGreaterThan(1);
  expect(
    Math.max(...itemHeights) - Math.min(...itemHeights),
  ).toBeLessThanOrEqual(1);
  expect(Math.max(...itemHeights)).toBeLessThanOrEqual(52);
});

test("mobile lesson search reuses the compact expandable search contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/learn/typescript-course");

  await page.getByRole("button", { name: "Open course lessons" }).click();
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  const searchToggle = dialog.getByRole("button", { name: "Search lessons" });
  await expect(searchToggle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(searchToggle).toHaveCSS("border-top-width", "0px");
  await searchToggle.click();

  const search = dialog.getByRole("searchbox", { name: "Search lessons" });
  const field = dialog.locator("[data-expandable-search-field]");
  await expect(search).toBeFocused();
  await expect(field).toHaveCSS("height", "40px");
  await expect(search).toHaveCSS("font-size", "15px");
  await expect(search).toHaveCSS("border-radius", "0px");
  expect(
    await field.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).borderRadius),
    ),
  ).toBeGreaterThanOrEqual(20);

  await search.fill("design");
  await dialog.getByRole("button", { name: "Clear search" }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();

  await dialog.getByRole("button", { name: "Back from lesson search" }).click();
  await expect(search).toBeHidden();
  await searchToggle.focus();
  await page.keyboard.press("Control+K");
  await expect(search).toBeFocused();
});

test("mobile lesson drawer closes with Escape and returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(page, "/learn/typescript-course");

  const trigger = page.locator("#learning-course-content-trigger");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  await expect(dialog).toBeVisible();
  const player = page.locator(".learning-workspace__player-wrap");
  const curriculum = dialog.getByRole("complementary", {
    name: "Course curriculum",
  });
  const curriculumHero = curriculum.locator(".learning-curriculum__hero");
  const curriculumScrollbar = page.locator(
    '.floating-scrollbar[aria-controls="lesson-drawer-curriculum-scrollport"]',
  );
  await expect(curriculumScrollbar).toHaveClass(/is-visible/);
  await expect(curriculumScrollbar).toHaveAttribute("aria-hidden", "false");
  await expect(curriculum).toHaveCSS("scrollbar-width", "none");
  await expect(
    curriculumScrollbar.locator(".floating-scrollbar__thumb"),
  ).toHaveCSS("width", "6px");
  await expect(
    curriculumScrollbar.locator(".floating-scrollbar__thumb"),
  ).toHaveCSS("border-radius", "999px");
  await expect
    .poll(async () => {
      const [dialogBounds, playerBounds] = await Promise.all([
        dialog.boundingBox(),
        player.boundingBox(),
      ]);
      if (!dialogBounds || !playerBounds) return Number.POSITIVE_INFINITY;
      return Math.abs(dialogBounds.y - (playerBounds.y + playerBounds.height));
    })
    .toBeLessThanOrEqual(1);

  const [dialogBounds, curriculumBounds, heroBounds] = await Promise.all([
    dialog.boundingBox(),
    curriculum.boundingBox(),
    curriculumHero.boundingBox(),
  ]);
  expect(dialogBounds).not.toBeNull();
  expect(curriculumBounds).not.toBeNull();
  expect(heroBounds).not.toBeNull();
  expect(curriculumBounds!.x).toBeCloseTo(0, 0);
  expect(curriculumBounds!.width).toBeCloseTo(page.viewportSize()!.width, 0);
  expect(Math.abs(curriculumBounds!.y - dialogBounds!.y)).toBeLessThanOrEqual(
    1,
  );
  const drawerRadius = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      topLeft: Number.parseFloat(style.borderTopLeftRadius),
      topRight: Number.parseFloat(style.borderTopRightRadius),
    };
  });
  const titleRadius = await trigger.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      topLeft: Number.parseFloat(style.borderTopLeftRadius),
      topRight: Number.parseFloat(style.borderTopRightRadius),
      bottomLeft: Number.parseFloat(style.borderBottomLeftRadius),
      bottomRight: Number.parseFloat(style.borderBottomRightRadius),
    };
  });
  expect(drawerRadius.topLeft).toBeGreaterThan(0);
  expect(drawerRadius.topLeft).toBe(titleRadius.topLeft);
  expect(drawerRadius.topRight).toBe(titleRadius.topRight);
  expect(titleRadius.bottomLeft).toBe(0);
  expect(titleRadius.bottomRight).toBe(0);
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");
  await expect(page.locator("main.learning-workspace__main")).toHaveAttribute(
    "inert",
    "",
  );
  await expect(
    dialog.getByRole("button", { name: "Close lesson list" }),
  ).toHaveCount(0);

  const focusable = dialog.locator(
    "button:not([disabled]):not([tabindex='-1']):not([inert] *), input:not([disabled]):not([inert] *), [tabindex]:not([tabindex='-1']):not([inert] *)",
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
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  const swipeHandle = dialog.locator('[data-slot="drawer-swipe-handle"]');
  await expect
    .poll(async () => {
      const bounds = await swipeHandle.boundingBox();
      return bounds ? bounds.y + bounds.height : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(heroBounds!.y + heroBounds!.height);
  const swipeHandleBounds = await swipeHandle.boundingBox();
  expect(swipeHandleBounds).not.toBeNull();
  expect(swipeHandleBounds!.y).toBeGreaterThanOrEqual(heroBounds!.y - 1);
  expect(swipeHandleBounds!.y + swipeHandleBounds!.height).toBeLessThan(
    heroBounds!.y + heroBounds!.height,
  );
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

  const expandedSwipeHandleBounds = await swipeHandle.boundingBox();
  expect(expandedSwipeHandleBounds).not.toBeNull();
  await page.mouse.move(
    expandedSwipeHandleBounds!.x + expandedSwipeHandleBounds!.width / 2,
    expandedSwipeHandleBounds!.y + expandedSwipeHandleBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    expandedSwipeHandleBounds!.x + expandedSwipeHandleBounds!.width / 2,
    expandedSwipeHandleBounds!.y + expandedSwipeHandleBounds!.height / 2 + 160,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(dialog).not.toHaveAttribute("data-expanded", "");
  await expect
    .poll(async () => {
      const [nextDialogBounds, playerBounds] = await Promise.all([
        dialog.boundingBox(),
        player.boundingBox(),
      ]);
      if (!nextDialogBounds || !playerBounds) return Number.POSITIVE_INFINITY;
      return Math.abs(
        nextDialogBounds.y - (playerBounds.y + playerBounds.height),
      );
    })
    .toBeLessThanOrEqual(1);

  await dialog.getByRole("button", { name: /Usability Testing/ }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-last-lesson-typescript-course", "10");
});

test("mobile lesson drawer exposes its full curriculum without expanding", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  await page.locator("#learning-course-content-trigger").click();
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  const curriculum = dialog.getByRole("complementary", {
    name: "Course curriculum",
  });
  const scrollTopButton = curriculum.locator(".elastic-scroller__button");

  const initialMetrics = await curriculum.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(initialMetrics.scrollHeight).toBeGreaterThan(
    initialMetrics.clientHeight,
  );

  await curriculum.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
  });
  await expect
    .poll(() => curriculum.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(scrollTopButton).toBeVisible();
  await expect(scrollTopButton).toHaveAttribute(
    "aria-label",
    "Scroll curriculum to bottom",
  );

  const bottomGeometry = await page.evaluate(() => {
    const curriculum = document.querySelector<HTMLElement>(
      "#lesson-drawer-curriculum-scrollport",
    );
    const sectionToggles = curriculum?.querySelectorAll<HTMLElement>(
      ".learning-curriculum__section-toggle",
    );
    const lastSection = sectionToggles?.[sectionToggles.length - 1];
    const scrollTopButton = curriculum?.querySelector<HTMLElement>(
      ".elastic-scroller__button",
    );
    if (!curriculum || !lastSection || !scrollTopButton) return null;
    const curriculumBounds = curriculum.getBoundingClientRect();
    const lastSectionBounds = lastSection.getBoundingClientRect();
    const scrollTopBounds = scrollTopButton.getBoundingClientRect();
    const dialog = curriculum.closest<HTMLElement>('[role="dialog"]');
    return {
      lastSectionBottom: lastSectionBounds.bottom,
      curriculumBottom: curriculumBounds.bottom,
      scrollTopBottom: scrollTopBounds.bottom,
      curriculumTop: curriculumBounds.top,
      viewportBottom: window.innerHeight,
    };
  });
  expect(bottomGeometry).not.toBeNull();
  expect(bottomGeometry!.lastSectionBottom).toBeLessThanOrEqual(
    bottomGeometry!.curriculumBottom + 1,
  );
  expect(bottomGeometry!.curriculumBottom).toBeLessThanOrEqual(
    bottomGeometry!.viewportBottom + 1,
  );
  expect(bottomGeometry!.lastSectionBottom).toBeLessThanOrEqual(
    bottomGeometry!.viewportBottom + 1,
  );
  expect(bottomGeometry!.scrollTopBottom).toBeLessThanOrEqual(
    bottomGeometry!.curriculumBottom,
  );
  expect(bottomGeometry!.scrollTopBottom).toBeGreaterThan(
    bottomGeometry!.curriculumTop,
  );
});

test("mobile curriculum scroll control owns diagonal gestures inside its drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  await page.locator("#learning-course-content-trigger").click();
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  const curriculum = dialog.getByRole("complementary", {
    name: "Course curriculum",
  });
  const gestureBoundary = curriculum.locator(".elastic-scroller");
  const scrollControl = gestureBoundary.locator(".elastic-scroller__button");

  await curriculum.evaluate((element) => {
    element.scrollTop = Math.min(
      140,
      element.scrollHeight - element.clientHeight,
    );
  });
  await expect(scrollControl).toBeVisible();
  await expect(gestureBoundary).toHaveAttribute(
    "data-base-ui-swipe-ignore",
    "true",
  );
  await expect(gestureBoundary).toHaveAttribute(
    "data-learning-swipe-ignore",
    "true",
  );
  await expect(gestureBoundary).toHaveAttribute(
    "data-sidebar-swipe-ignore",
    "true",
  );

  const initialBounds = await scrollControl.boundingBox();
  expect(initialBounds).not.toBeNull();
  const startX = initialBounds!.x + initialBounds!.width / 2;
  const startY = initialBounds!.y + initialBounds!.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const timestamp = Date.now() / 1000;

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY }],
    timestamp,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: startX + 92, y: startY + 112 }],
    timestamp: timestamp + 0.08,
  });

  await expect(scrollControl).toHaveAttribute("data-scroll-mode", "drag");
  await expect(dialog).not.toHaveAttribute("data-swiping", "");
  const draggedBounds = await scrollControl.boundingBox();
  expect(draggedBounds).not.toBeNull();
  expect(draggedBounds!.x).toBeCloseTo(initialBounds!.x, 0);
  expect(draggedBounds!.y).toBeGreaterThan(initialBounds!.y + 40);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
    timestamp: timestamp + 0.1,
  });

  await expect(dialog).toBeVisible();
  await expect(scrollControl).toHaveAttribute("data-scroll-mode", "idle");
  await expect
    .poll(async () => (await scrollControl.boundingBox())?.x)
    .toBeCloseTo(initialBounds!.x, 0);
});

test("curriculum scroll control follows direction, stops, and accelerates with drag distance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1197, height: 779 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );
  await page.addStyleTag({
    content:
      ".learning-curriculum__section-lessons { transition: none !important; }",
  });

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const scrollControl = curriculum.locator(".elastic-scroller__button");
  const scrollControlIcon = scrollControl.locator(".elastic-scroller__icon");
  const scrollProgressPuck = curriculum.locator(
    ".elastic-scroller__progress-puck",
  );
  const scrollProgressRing = curriculum.locator(
    ".elastic-scroller__progress-ring",
  );
  const readScrollMetrics = () =>
    curriculum.evaluate((element) => ({
      top: element.scrollTop,
      maximum: element.scrollHeight - element.clientHeight,
    }));

  await expect(scrollControl).toBeHidden();
  await curriculum.evaluate((element) => {
    element
      .querySelectorAll<HTMLButtonElement>(
        '.learning-curriculum__section-toggle[aria-expanded="false"]',
      )
      .forEach((button) => button.click());
  });
  await expect
    .poll(async () => (await readScrollMetrics()).maximum)
    .toBeGreaterThan(700);
  const progressCircumference = 2 * Math.PI * 17.5;
  await curriculum.evaluate((element) => {
    const maximumScrollTop = element.scrollHeight - element.clientHeight;
    element.scrollTop = maximumScrollTop / 2;
  });
  await expect
    .poll(async () =>
      Number(await scrollProgressRing.getAttribute("stroke-dashoffset")),
    )
    .toBeCloseTo(progressCircumference / 2, 1);
  await curriculum.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  await curriculum.evaluate((element) => {
    element.scrollTop = 110;
  });
  await expect(scrollControl).toBeVisible();
  await expect(scrollControl).toHaveAttribute("data-direction", "down");
  await expect(scrollControl).toHaveAttribute(
    "aria-label",
    "Scroll curriculum to bottom",
  );
  await expect(scrollControlIcon).toHaveCSS("rotate", "180deg");

  await scrollControl.click();
  await expect(scrollControl).toHaveAttribute("data-scroll-mode", "edge");
  await page.waitForTimeout(70);
  await scrollControl.click();
  await expect(scrollControl).toHaveAttribute("data-scroll-mode", "idle");
  const stoppedPosition = (await readScrollMetrics()).top;
  await page.waitForTimeout(180);
  expect((await readScrollMetrics()).top).toBeCloseTo(stoppedPosition, 0);
  expect(stoppedPosition).toBeLessThan((await readScrollMetrics()).maximum - 1);

  await expect(scrollControl).toHaveAttribute("data-direction", "down");
  await scrollControl.click();
  await expect
    .poll(async () => {
      const metrics = await readScrollMetrics();
      return Math.abs(metrics.maximum - metrics.top);
    })
    .toBeLessThanOrEqual(1);

  const curriculumBounds = await curriculum.boundingBox();
  expect(curriculumBounds).not.toBeNull();
  await page.mouse.move(
    curriculumBounds!.x + curriculumBounds!.width / 2,
    curriculumBounds!.y + curriculumBounds!.height / 2,
  );
  await page.mouse.wheel(0, -90);
  await expect(scrollControl).toHaveAttribute("data-direction", "up");
  await expect(scrollControl).toHaveAttribute(
    "aria-label",
    "Scroll curriculum to top",
  );
  await expect(scrollControlIcon).toHaveCSS("rotate", "none");
  await scrollControl.click();
  await expect
    .poll(() => curriculum.evaluate((element) => element.scrollTop))
    .toBeLessThanOrEqual(1);
  await expect(scrollControl).toBeHidden({ timeout: 4000 });

  await page.mouse.wheel(0, 40);
  await expect(scrollControl).toHaveAttribute("data-direction", "down");
  const controlBounds = await scrollControl.boundingBox();
  expect(controlBounds).not.toBeNull();
  await page.mouse.move(
    controlBounds!.x + controlBounds!.width / 2,
    controlBounds!.y + controlBounds!.height / 2,
  );
  await page.mouse.down();
  await expect(scrollControl).toHaveAttribute("data-scroll-mode", "drag", {
    timeout: 1000,
  });
  await expect(scrollControl).toHaveCSS("cursor", "pointer");
  await page.mouse.move(
    controlBounds!.x + controlBounds!.width / 2,
    controlBounds!.y + controlBounds!.height / 2 + 18,
  );
  await expect(scrollControl).toHaveAttribute("data-drag-distance", "18");
  const slowStart = (await readScrollMetrics()).top;
  await page.waitForTimeout(240);
  const slowEnd = (await readScrollMetrics()).top;
  const movedControlBounds = await scrollControl.boundingBox();
  const movedControlTransformY = await scrollControl.evaluate(
    (element) => new DOMMatrix(getComputedStyle(element).transform).m42,
  );
  expect(movedControlBounds).not.toBeNull();
  expect(movedControlTransformY).toBeCloseTo(18, 0);
  expect(movedControlBounds!.y - controlBounds!.y).toBeGreaterThan(14);
  const movedPuckTransformY = await scrollProgressPuck.evaluate(
    (element) => new DOMMatrix(getComputedStyle(element).transform).m42,
  );
  expect(movedPuckTransformY).toBeCloseTo(-18, 0);

  await page.mouse.move(
    controlBounds!.x + controlBounds!.width / 2,
    controlBounds!.y + controlBounds!.height / 2 + 88,
  );
  await expect(scrollControl).toHaveAttribute("data-drag-distance", "88");
  const fastStart = (await readScrollMetrics()).top;
  await page.waitForTimeout(240);
  const fastEnd = (await readScrollMetrics()).top;
  expect(slowEnd - slowStart).toBeGreaterThan(0);
  expect(fastEnd - fastStart).toBeGreaterThan(slowEnd - slowStart);
  await page.mouse.move(
    controlBounds!.x + controlBounds!.width / 2,
    controlBounds!.y + controlBounds!.height / 2 + 176,
  );
  await expect(scrollControl).toHaveAttribute("data-drag-distance", "176");
  await page.mouse.up();
  await expect(scrollControl).toHaveAttribute("data-scroll-mode", "idle");
  await expect(scrollControl).toHaveAttribute("data-drag-distance", "0");
  await expect
    .poll(() =>
      scrollControl.evaluate(
        (element) => new DOMMatrix(getComputedStyle(element).transform).m42,
      ),
    )
    .toBeCloseTo(0, 0);
  await expect
    .poll(() =>
      scrollProgressPuck.evaluate(
        (element) => new DOMMatrix(getComputedStyle(element).transform).m42,
      ),
    )
    .toBeCloseTo(0, 0);
  const releasedPosition = (await readScrollMetrics()).top;
  await page.waitForTimeout(180);
  expect((await readScrollMetrics()).top).toBeCloseTo(releasedPosition, 0);
});

test("curriculum section carets rotate from down to up when expanded", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-reduce-animations", "false");
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openApp(
    page,
    "/learn/javascript-course/what-is-ui-ux-design?from=home",
  );

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const closedSection = curriculum
    .locator(".learning-curriculum__section-toggle")
    .filter({ hasText: "Section 3: Information Architecture" });
  const caret = closedSection.locator(".learning-curriculum__section-arrow");

  await expect(closedSection).toHaveAttribute("aria-expanded", "false");
  await expect(caret).not.toHaveClass(/is-open/);
  await expect(caret).toHaveCSS("transition-property", "transform");
  await expect(caret).toHaveCSS("transition-duration", "0.24s");
  await expect(caret).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");

  await closedSection.click();

  await expect(closedSection).toHaveAttribute("aria-expanded", "true");
  await expect(caret).toHaveClass(/is-open/);
  await expect
    .poll(() =>
      caret.evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("matrix(-1, 0, 0, -1, 0, 0)");
});

test("curriculum sections and lessons form an edge-to-edge continuous list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1247, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/understanding-your-users?from=courses",
  );

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const activeSection = curriculum
    .locator(".learning-curriculum__section-toggle")
    .filter({ hasText: "Section 2: User Research" });
  const activeLesson = curriculum.locator(
    ".learning-curriculum__lesson.is-active",
  );

  await expect(curriculum).toHaveCSS("border-top-width", "0px");
  await expect(curriculum).toHaveCSS("border-right-width", "0px");
  await expect(curriculum).toHaveCSS("border-bottom-width", "0px");
  await expect(curriculum).toHaveCSS("border-left-width", "0px");
  await expect(activeSection).toHaveCSS("border-radius", "0px");
  await expect(activeLesson).toHaveCSS("border-radius", "0px");

  const geometry = await activeLesson.evaluate((lesson) => {
    const sectionToggle = lesson
      .closest(".learning-curriculum__section")
      ?.querySelector<HTMLElement>(".learning-curriculum__section-toggle");
    if (!sectionToggle) throw new Error("Active section toggle missing");
    const lessonBounds = lesson.getBoundingClientRect();
    const sectionBounds = sectionToggle.getBoundingClientRect();
    const indicator = getComputedStyle(lesson, "::before");
    return {
      lessonLeft: lessonBounds.left,
      lessonRight: lessonBounds.right,
      lessonTop: lessonBounds.top,
      sectionLeft: sectionBounds.left,
      sectionRight: sectionBounds.right,
      sectionBottom: sectionBounds.bottom,
      indicatorWidth: Number.parseFloat(indicator.width),
      indicatorTop: Number.parseFloat(indicator.top),
      indicatorBottom: Number.parseFloat(indicator.bottom),
    };
  });

  expect(geometry.lessonLeft).toBeCloseTo(geometry.sectionLeft, 0);
  expect(geometry.lessonRight).toBeCloseTo(geometry.sectionRight, 0);
  expect(geometry.lessonTop).toBeCloseTo(geometry.sectionBottom, 0);
  expect(geometry.indicatorWidth).toBe(3);
  expect(geometry.indicatorTop).toBe(0);
  expect(geometry.indicatorBottom).toBe(0);
});

test("curriculum search, section expansion, and lesson selection retain their current contracts", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const firstSection = curriculum
    .locator(".learning-curriculum__section-toggle")
    .filter({ hasText: "Section 1: Introduction" });
  await expect(firstSection).toHaveAttribute("aria-expanded", "true");
  await firstSection.click();
  await expect(firstSection).toHaveAttribute("aria-expanded", "false");
  await firstSection.click();
  await expect(firstSection).toHaveAttribute("aria-expanded", "true");

  const lessonSearchToggle = curriculum.getByRole("button", {
    name: "Search lessons",
  });
  await expect(lessonSearchToggle).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(lessonSearchToggle).toHaveCSS("border-top-width", "0px");
  await expect(lessonSearchToggle).toHaveCSS("border-radius", "999px");
  const lessonSearchTriggerVisuals = await lessonSearchToggle.evaluate(
    (button) => {
      const icon = button.querySelector("svg");
      const iconBounds = icon?.getBoundingClientRect();
      return {
        iconWidth: iconBounds?.width ?? 0,
        surfaceBackground: getComputedStyle(button, "::before").backgroundColor,
      };
    },
  );
  expect(lessonSearchTriggerVisuals.iconWidth).toBeCloseTo(21.375, 0);
  expect(lessonSearchTriggerVisuals.surfaceBackground).not.toBe(
    "rgba(0, 0, 0, 0)",
  );
  const lessonSearchTriggerBounds = await lessonSearchToggle.boundingBox();
  expect(lessonSearchTriggerBounds).not.toBeNull();
  await page.mouse.move(
    lessonSearchTriggerBounds!.x + lessonSearchTriggerBounds!.width / 2,
    lessonSearchTriggerBounds!.y + lessonSearchTriggerBounds!.height / 2,
  );
  await page.mouse.down();
  await expect
    .poll(() =>
      lessonSearchToggle.evaluate(
        (button) => getComputedStyle(button, "::before").animationName,
      ),
    )
    .toBe("learning-curriculum-search-press");
  await page.mouse.up();
  const lessonSearch = curriculum.getByRole("searchbox", {
    name: "Search lessons",
  });
  await expect(lessonSearch).toBeFocused();
  await expect(lessonSearch).toHaveCSS("border-radius", "0px");
  await expect(lessonSearch).toHaveCSS("outline-style", "none");
  await expect(
    curriculum.getByRole("heading", {
      name: "The Ultimate TypeScript Course",
      level: 2,
    }),
  ).toBeHidden();
  await expect(curriculum.locator(".learning-curriculum__search")).toHaveCount(
    0,
  );
  const lessonSearchField = curriculum.locator(
    "[data-expandable-search-field]",
  );
  await expect(lessonSearchField).toHaveCSS("height", "40px");
  const lessonSearchLayout = await lessonSearch.evaluate((input) => {
    const field = input.closest("[data-expandable-search-field]");
    const shell = input.closest("[data-expandable-search-shell]");
    const titleRow = input.closest(".learning-curriculum__title-row");
    return {
      fieldRadius: field
        ? Number.parseFloat(getComputedStyle(field).borderRadius)
        : 0,
      shellTop: shell?.getBoundingClientRect().top ?? -1,
      titleRowTop: titleRow?.getBoundingClientRect().top ?? -2,
    };
  });
  expect(lessonSearchLayout.fieldRadius).toBeGreaterThanOrEqual(20);
  expect(
    Math.abs(lessonSearchLayout.shellTop - lessonSearchLayout.titleRowTop),
  ).toBeLessThanOrEqual(1);

  const lessonSearchBack = curriculum.getByRole("button", {
    name: "Back from lesson search",
  });
  await expect(lessonSearchBack).toHaveCSS("border-top-width", "0px");
  await expect(lessonSearchBack).toHaveCSS("border-radius", "999px");
  const lessonSearchBackSurface = await lessonSearchBack.evaluate(
    (button) => getComputedStyle(button, "::before").backgroundColor,
  );
  expect(lessonSearchBackSurface).not.toBe("rgba(0, 0, 0, 0)");

  await page.keyboard.press("Escape");
  await expect(lessonSearch).toBeHidden();
  await expect(page).toHaveURL(/\/learn\/typescript-course/);

  await lessonSearchToggle.click();
  await expect(lessonSearch).toBeFocused();
  await curriculum
    .getByRole("button", { name: "Close lesson search" })
    .click({ position: { x: 160, y: 108 } });
  await expect(lessonSearch).toBeHidden();
  await expect(page).toHaveURL(/\/learn\/typescript-course/);

  await lessonSearchToggle.click();
  await expect(lessonSearch).toBeFocused();
  await curriculum
    .getByRole("button", { name: "Back from lesson search" })
    .click();
  await expect(lessonSearch).toBeHidden();
  await lessonSearchToggle.focus();
  await page.keyboard.press("Control+K");
  await expect(lessonSearch).toBeFocused();
  await lessonSearch.fill("usability");
  await expect(
    curriculum.getByRole("button", { name: "Clear search" }),
  ).toBeVisible();
  await curriculum.getByRole("button", { name: "Clear search" }).click();
  await expect(lessonSearch).toHaveValue("");
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
    curriculum.locator(".learning-curriculum__section-toggle"),
  ).toHaveCount(0);

  await lessonSearch.fill("usability");
  await curriculum.getByRole("button", { name: /Usability Testing/ }).click();
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-last-lesson-typescript-course", "10");
});

test("curriculum overview, section, and chapter zones keep their actions separate", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openApp(page, "/learn/backend-nodejs/the-design-mindset?from=courses");

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const sectionAction = curriculum.getByRole("button", {
    name: "Go to current section, Section 1: Introduction",
  });
  const chapterAction = curriculum.getByRole("button", {
    name: "Go to current chapter, Chapter 3: The Design Mindset",
  });
  const overviewAction = curriculum.getByRole("button", {
    name: "View course overview for Complete Backend with Node.js",
  });
  await expect(overviewAction).toHaveAttribute("title", "View");
  const lessonSearchButton = curriculum.getByRole("button", {
    name: "Search lessons",
  });
  const scrollTopButton = curriculum.locator(".elastic-scroller__button");

  await expect(scrollTopButton).toBeHidden();
  await curriculum.evaluate((container) => container.scrollTo({ top: 160 }));
  await expect(scrollTopButton).toBeVisible();
  await expect(scrollTopButton).toHaveAttribute(
    "aria-label",
    "Scroll curriculum to bottom",
  );
  await expect(scrollTopButton).toHaveCSS("border-radius", "999px");
  const scrollTopAlignment = await scrollTopButton.evaluate((button) => {
    const curriculum = button.closest(".learning-curriculum");
    const buttonRect = button.getBoundingClientRect();
    const curriculumRect = curriculum?.getBoundingClientRect();
    return {
      centerDelta: curriculumRect
        ? buttonRect.left +
          buttonRect.width / 2 -
          (curriculumRect.left + curriculumRect.width / 2)
        : Number.POSITIVE_INFINITY,
      bottomInset: curriculumRect
        ? curriculumRect.bottom - buttonRect.bottom
        : Number.POSITIVE_INFINITY,
    };
  });
  expect(Math.abs(scrollTopAlignment.centerDelta)).toBeLessThanOrEqual(1);
  expect(scrollTopAlignment.bottomInset).toBeGreaterThanOrEqual(227);
  expect(scrollTopAlignment.bottomInset).toBeLessThanOrEqual(229);
  await curriculum.evaluate((container) => {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  });
  await expect(scrollTopButton).toHaveAttribute(
    "aria-label",
    "Scroll curriculum to top",
  );
  await scrollTopButton.click();
  await expect
    .poll(async () => curriculum.evaluate((container) => container.scrollTop))
    .toBe(0);
  await expect(scrollTopButton).toBeHidden();

  await expect(overviewAction).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await overviewAction.hover();
  await expect(overviewAction).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );

  await lessonSearchButton.click();
  await expect(
    curriculum.getByRole("searchbox", { name: "Search lessons" }),
  ).toBeFocused();
  await expect(page).toHaveURL(/\/learn\/backend-nodejs\/the-design-mindset/);
  await curriculum
    .getByRole("button", { name: "Back from lesson search" })
    .click();

  await expect(sectionAction).toBeVisible();
  await expect(chapterAction).toBeVisible();
  await expect(sectionAction).toHaveCSS("min-height", "40px");
  await expect(chapterAction).toHaveCSS("min-height", "40px");
  await expect(sectionAction).toContainText("S1:");
  await expect(chapterAction).toContainText("L3:");
  await expect(sectionAction).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await sectionAction.hover();
  await expect(sectionAction).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await sectionAction.click();
  await expect
    .poll(async () =>
      curriculum.evaluate((container) => {
        const section = container.querySelector(
          ".learning-curriculum__section",
        );
        if (!section) return Number.POSITIVE_INFINITY;
        return Math.abs(
          section.getBoundingClientRect().top -
            container.getBoundingClientRect().top,
        );
      }),
    )
    .toBeLessThanOrEqual(72);

  await curriculum.evaluate((container) => container.scrollTo({ top: 0 }));
  await chapterAction.click();
  await expect
    .poll(async () =>
      curriculum.evaluate((container) => {
        const chapter = container.querySelector(
          ".learning-curriculum__lesson.is-active",
        );
        if (!chapter) return Number.POSITIVE_INFINITY;
        return Math.abs(
          chapter.getBoundingClientRect().top -
            container.getBoundingClientRect().top,
        );
      }),
    )
    .toBeLessThanOrEqual(72);

  await curriculum.evaluate((container) => container.scrollTo({ top: 0 }));
  const progressTrack = curriculum.getByRole("progressbar", {
    name: "Course progress: 52 percent",
  });
  const progressBox = await progressTrack.boundingBox();
  expect(progressBox).not.toBeNull();
  await page.mouse.click(
    progressBox!.x + progressBox!.width / 2,
    progressBox!.y + progressBox!.height / 2,
  );
  await expect(page).toHaveURL(/\/courses\/backend-nodejs\/overview$/);
});

test("learning drafts and curriculum search survive navigation away and resume", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openApp(page, "/learn/typescript-course?from=courses");

  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const commentDraft = page.getByRole("textbox", { name: "Add a comment" });
  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });

  await commentDraft.fill("Keep this unfinished thought for later.");
  await curriculum.getByRole("button", { name: "Search lessons" }).click();
  await curriculum
    .getByRole("searchbox", { name: "Search lessons" })
    .fill("usability");

  await navigation.getByRole("button", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await navigation.getByRole("button", { name: /Courses/ }).click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/[^/?]+\?from=courses$/,
  );

  await expect(
    page.getByRole("textbox", { name: "Add a comment" }),
  ).toHaveValue("Keep this unfinished thought for later.");
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
      .getByRole("complementary", { name: "Course curriculum" })
      .getByRole("searchbox", { name: "Search lessons" }),
  ).toHaveValue("usability");
});

test("lesson tools and discussion interactions retain their current contracts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("veolms-page-tab-colors", "multicolor");
  });
  await openApp(page, "/learn/typescript-course");

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

  await expect(
    discussion.locator("#learning-discussion-search-input"),
  ).toHaveCount(0);

  const composer = page.getByRole("textbox", { name: "Add a comment" });
  const composerSurface = discussion.locator(".learning-comment-composer");
  const composerField = composerSurface.locator(
    ".learning-comment-composer__field",
  );
  const composerLabel = composerSurface.locator(
    ".learning-comment-composer__comment",
  );
  const sendComment = composerSurface.getByRole("button", {
    name: "Post comment",
  });

  await composer.click();
  await expect(composerSurface).toHaveCSS("border-bottom-width", "0px");
  await expect(composerLabel).toHaveCSS("border-bottom-width", "0px");
  await expect(composerField).not.toHaveCSS("border-bottom-width", "0px");
  const composerFieldGeometry = await composerField.evaluate((field) => {
    const send = field.querySelector<HTMLElement>(
      ".learning-comment-composer__send",
    );
    if (!send) throw new Error("Comment send button missing from field");
    const fieldBounds = field.getBoundingClientRect();
    const sendBounds = send.getBoundingClientRect();
    return {
      sendInsideInline:
        sendBounds.left >= fieldBounds.left - 1 &&
        sendBounds.right <= fieldBounds.right + 1,
      sendInsideBlock:
        sendBounds.top >= fieldBounds.top - 1 &&
        sendBounds.bottom <= fieldBounds.bottom + 1,
    };
  });
  expect(composerFieldGeometry).toEqual({
    sendInsideInline: true,
    sendInsideBlock: true,
  });

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
    postedComment.getByRole("heading", { name: "Sofia Chen", level: 2 }),
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

test("learning comment search stays out of the phone layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 424, height: 779 });
  await openApp(page, "/learn/typescript-course");

  await expect(
    page.getByRole("button", { name: "Search comments" }),
  ).toBeHidden();
  await expect(page.locator("#learning-comment-search-input")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Post comment" }),
  ).toBeVisible();
});

test("lesson video loads directly without a thumbnail poster", async ({
  page,
}) => {
  await openApp(page, "/learn/backend-nodejs/the-design-mindset?from=courses");

  const initialPlayer = page.getByRole("region", {
    name: "Lesson video player for The Design Mindset",
  });
  const initialVideo = initialPlayer.locator("video");
  await expect
    .poll(() =>
      initialVideo.evaluate((video) => (video as HTMLVideoElement).currentSrc),
    )
    .not.toBe("");
  const initialSource = await initialVideo.evaluate(
    (video) => (video as HTMLVideoElement).currentSrc,
  );

  await expect(initialVideo).toHaveAttribute("preload", "auto");
  await expect(initialVideo).not.toHaveAttribute("poster");

  await page
    .getByRole("complementary", { name: "Course curriculum" })
    .getByRole("button", { name: /Tools Overview/ })
    .click();

  const nextVideo = page
    .getByRole("region", {
      name: "Lesson video player for Tools Overview",
    })
    .locator("video");

  await expect(nextVideo).toHaveAttribute("preload", "auto");
  await expect(nextVideo).not.toHaveAttribute("poster");
  await expect
    .poll(() =>
      nextVideo.evaluate((video) => (video as HTMLVideoElement).currentSrc),
    )
    .not.toBe(initialSource);
});

test("custom player controls, timeline preview and seek, fullscreen shell, and ambient preference remain functional", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");
  const player = page.getByRole("region", {
    name: /Lesson video player for The Beginning of a Design Journey/,
  });
  const video = player.locator("video");
  const timeline = player.getByRole("slider", {
    name: "Video timeline",
  });
  const volumeSlider = player.getByRole("slider", { name: "Volume" });

  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).duration),
    )
    .toBeGreaterThan(0);
  await player.hover();
  await expect(timeline).toHaveAttribute("aria-valuetext", /of/);
  await expect(volumeSlider).toHaveValue("1");

  await player.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();

  const timelineBounds = await timeline.boundingBox();
  if (!timelineBounds) throw new Error("Video timeline geometry missing");
  await timeline.hover({
    position: {
      x: Math.floor(timelineBounds.width / 2),
      y: Math.floor(timelineBounds.height / 2),
    },
  });
  await expect(player.locator("[data-video-player-preview]")).toContainText(
    "00:09",
  );
  await timeline.click({
    position: {
      x: Math.floor(timelineBounds.width * 0.75),
      y: Math.floor(timelineBounds.height / 2),
    },
  });
  await expect
    .poll(() =>
      video.evaluate((element) => {
        const media = element as HTMLVideoElement;
        return media.duration ? media.currentTime / media.duration : 0;
      }),
    )
    .toBeGreaterThan(0.7);
  await expect
    .poll(() =>
      video.evaluate((element) => {
        const media = element as HTMLVideoElement;
        return media.duration ? media.currentTime / media.duration : 1;
      }),
    )
    .toBeLessThan(0.8);

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
    .toBeGreaterThanOrEqual(20);
  await video.evaluate((element) => {
    element.dispatchEvent(new Event("pause"));
  });
  await expectStoredValue(
    page,
    "veolms-watch-typescript-course-lesson-1",
    "20",
  );

  const shell = page.locator(".video-shell").filter({ has: player });
  await shell.evaluate((element) => {
    Object.defineProperty(element, "requestFullscreen", {
      configurable: true,
      value: async () =>
        element.setAttribute("data-fullscreen-requested", "true"),
    });
  });
  await player.hover();
  await player.getByRole("button", { name: "Toggle fullscreen" }).click();
  await expect(shell).toHaveAttribute("data-fullscreen-requested", "true");

  await player.hover();
  const ambient = player.getByRole("button", { name: "Enable ambient mode" });
  await ambient.click();
  await expectStoredValue(page, "veolms-player-ambient", "on");

  const inlineProjection = shell.locator("[data-ambient-inline-projection]");
  await expect(inlineProjection).toHaveClass(/ambient-canvas--visible/);
  await expect
    .poll(() =>
      inlineProjection.evaluate((canvas) => {
        const shell = canvas.closest(".video-shell");
        const player = shell?.querySelector(".youtube-player");
        const video = player?.querySelector("video");
        const canvasStyle = getComputedStyle(canvas);
        const playerStyle = player ? getComputedStyle(player) : null;
        const videoStyle = video ? getComputedStyle(video) : null;
        return {
          parentIsShell: canvas.parentElement === shell,
          outsideForegroundPlayer: player ? !player.contains(canvas) : false,
          canvasPosition: canvasStyle.position,
          canvasPointerEvents: canvasStyle.pointerEvents,
          canvasZIndex: canvasStyle.zIndex,
          playerZIndex: playerStyle?.zIndex,
          videoFilter: videoStyle?.filter,
        };
      }),
    )
    .toEqual({
      parentIsShell: true,
      outsideForegroundPlayer: true,
      canvasPosition: "absolute",
      canvasPointerEvents: "none",
      canvasZIndex: "0",
      playerZIndex: "10",
      videoFilter: "none",
    });

  const shellProjection = page.locator("[data-ambient-shell-projection]");
  await expect(shellProjection).toHaveClass(/ambient-canvas--visible/);
  await expect
    .poll(() =>
      shellProjection.evaluate((canvas) => {
        const main = document.querySelector(".courses-main");
        const projectionBounds = canvas.getBoundingClientRect();
        const mainBounds = main?.getBoundingClientRect();
        const style = getComputedStyle(canvas);
        return {
          parentIsApp: canvas.parentElement?.classList.contains("courses-app"),
          reachesPastMainInlineStart: mainBounds
            ? projectionBounds.left < mainBounds.left
            : false,
          reachesPastMainBlockStart: mainBounds
            ? projectionBounds.top < mainBounds.top
            : false,
          pointerEvents: style.pointerEvents,
          position: style.position,
        };
      }),
    )
    .toEqual({
      parentIsApp: true,
      reachesPastMainInlineStart: true,
      reachesPastMainBlockStart: true,
      pointerEvents: "none",
      position: "fixed",
    });
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

  const gestureSurface = player.getByRole("button", {
    name: "Play or pause video",
  });
  await gestureSurface.focus();
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

  const lessonTitle = page.getByRole("button", {
    name: /Open course lessons for The Beginning of a Design Journey/,
  });
  await lessonTitle.focus();
  await page.keyboard.press("m");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).muted),
    )
    .toBe(true);
  await expectStoredValue(page, "veolms-player-muted", "true");

  await expect
    .poll(() =>
      video.evaluate(
        (element) => (element as HTMLVideoElement).textTracks.length,
      ),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press("c");
  await expect
    .poll(() =>
      video.evaluate((element) =>
        Array.from((element as HTMLVideoElement).textTracks).some(
          (track) => track.mode === "showing",
        ),
      ),
    )
    .toBe(true);

  const workspace = page.locator(".learning-workspace");
  await expect(
    player.getByRole("button", { name: /theater mode/i }),
  ).toHaveCount(0);
  await page.keyboard.press("t");
  await expect(workspace).not.toHaveClass(/is-theater/);

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
    /\/learn\/typescript-course\/the-beginning-of-a-design-journey\?from=courses$/,
  );

  await page.getByRole("button", { name: "Open discussion composer" }).click();
  const commentInput = page.getByRole("textbox", { name: "Write a comment" });
  await commentInput.focus();
  await page.keyboard.type("mct 1");
  await expect(commentInput).toContainText("mct 1");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).muted),
    )
    .toBe(true);
  await expect
    .poll(() =>
      video.evaluate((element) =>
        Array.from((element as HTMLVideoElement).textTracks).some(
          (track) => track.mode === "showing",
        ),
      ),
    )
    .toBe(true);
  await expect(workspace).not.toHaveClass(/is-theater/);

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
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((element) =>
          Array.from((element as HTMLVideoElement).textTracks).some(
            (track) => track.mode === "showing",
          ),
        ),
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
