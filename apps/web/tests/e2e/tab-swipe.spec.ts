import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./app.fixture.ts";
import { installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
  await page.setViewportSize({ width: 1133, height: 753 });
});

const startTouchSwipe = async (
  page: Page,
  surface: Locator,
  deltaX: number,
) => {
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width * 0.58;
  const startY = box!.y + Math.min(72, box!.height * 0.28);
  const cdp = await page.context().newCDPSession(page);
  const timestamp = Date.now() / 1000;

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY }],
    timestamp,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: startX + deltaX, y: startY }],
    timestamp: timestamp + 0.12,
  });

  return async () => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
      timestamp: timestamp + 0.24,
    });
  };
};

test("settings content swipes between adjacent tabs without moving the sidebar", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");
  const app = page.locator(".courses-app");
  const panel = page.locator("#settings-tab-panel");
  const currentLayer = panel.locator(".swipeable-tab-panel__layer.is-current");
  const tablist = page.getByRole("tablist", { name: "Settings sections" });
  const indicator = tablist.locator(".page-tabs__indicator");
  const initialIndicator = await indicator.boundingBox();
  const mainBox = await page.locator(".courses-main").boundingBox();
  const panelBox = await panel.boundingBox();
  const currentRoot = currentLayer.locator(":scope > *");
  const initialRootBox = await currentRoot.boundingBox();
  const currentContentBox = await currentLayer
    .locator(":scope > .settings-content")
    .boundingBox();
  const tablistBox = await tablist.boundingBox();
  const firstSectionBox = await currentLayer
    .locator(".settings-section")
    .first()
    .boundingBox();

  expect(Math.abs(panelBox!.x - mainBox!.x)).toBeLessThan(1);
  expect(Math.abs(currentContentBox!.x - mainBox!.x)).toBeLessThan(1);
  expect(Math.abs(tablistBox!.x - firstSectionBox!.x)).toBeLessThan(1);
  expect(
    Math.abs(
      tablistBox!.x +
        tablistBox!.width -
        (firstSectionBox!.x + firstSectionBox!.width),
    ),
  ).toBeLessThan(1);

  await expect(panel.locator(".is-preview")).toHaveCount(0);
  await expect(panel).not.toHaveAttribute("data-tab-swipe-active", "");

  const finishSwipe = await startTouchSwipe(page, panel, -190);
  await expect(panel.locator(".is-preview.is-next")).toContainText(
    "Sidebar header",
  );
  expect(
    await currentLayer.evaluate(
      (element) =>
        new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
    ),
  ).toBeLessThan(-100);
  const movingRootBox = await currentRoot.boundingBox();
  expect(Math.abs(movingRootBox!.y - initialRootBox!.y)).toBeLessThan(1);
  const movingIndicator = await indicator.boundingBox();
  expect(movingIndicator!.x).toBeGreaterThan(initialIndicator!.x);
  await expect(app).not.toHaveClass(/courses-app--resizing/);

  await finishSwipe();
  await expect(page).toHaveURL(/\/settings\/sidebar$/);
  await expect(panel).toHaveAttribute("data-settings-tab", "sidebar");
  await expect(currentLayer).toContainText("Sidebar header");
  await expect(panel).not.toHaveAttribute("data-tab-swipe-active", "");
  expect(
    await currentLayer.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
  ).toBe("none");

  const finishReturnSwipe = await startTouchSwipe(page, panel, 190);
  await expect(panel.locator(".is-preview.is-previous")).toContainText(
    "Display mode",
  );
  await finishReturnSwipe();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
});

test("every Settings detail panel aligns with the tab content rail", async ({
  page,
}) => {
  const routes = [
    "/settings/profile",
    "/settings/learning",
    "/settings/notifications",
    "/settings/security",
    "/settings/account",
  ];

  for (const route of routes) {
    await openApp(page, route);
    const tablistBox = await page
      .getByRole("tablist", { name: "Settings sections" })
      .boundingBox();
    const contentBox = await page
      .locator("#settings-tab-panel .is-current > *")
      .boundingBox();

    expect(Math.abs(contentBox!.x - tablistBox!.x), route).toBeLessThan(1);
    expect(
      Math.abs(
        contentBox!.x + contentBox!.width - (tablistBox!.x + tablistBox!.width),
      ),
      route,
    ).toBeLessThan(1);
  }
});

test("the active Settings tab stays unobstructed on narrow mobile screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(page, "/settings/learning");

  const tablist = page.getByRole("tablist", { name: "Settings sections" });
  const learningTab = tablist.getByRole("tab", { name: "Learning" });
  await expect(learningTab).toBeVisible();
  await expect(learningTab).toHaveAttribute("aria-selected", "true");

  const overlayContent = await tablist.evaluate(
    (element) => getComputedStyle(element, "::after").content,
  );
  expect(overlayContent).toBe("none");

  const hitTarget = await learningTab.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return hit === element || element.contains(hit);
  });
  expect(hitTarget).toBe(true);
});

test("discussion content and lesson tools use the same adjacent swipe behavior", async ({
  page,
}) => {
  await openApp(page, "/discussions/q-and-a");
  const discussionPanel = page.locator("#discussion-panel");
  const discussionMainBox = await page.locator(".courses-main").boundingBox();
  const discussionPanelBox = await discussionPanel.boundingBox();
  const discussionThreadBox = await discussionPanel
    .locator(".discussion-thread")
    .first()
    .boundingBox();
  expect(discussionMainBox).not.toBeNull();
  expect(discussionPanelBox).not.toBeNull();
  expect(discussionThreadBox).not.toBeNull();
  expect(Math.abs(discussionPanelBox!.x - discussionMainBox!.x)).toBeLessThan(
    1,
  );
  expect(
    Math.abs(
      discussionPanelBox!.x +
        discussionPanelBox!.width -
        (discussionMainBox!.x + discussionMainBox!.width),
    ),
  ).toBeLessThan(1);
  expect(discussionThreadBox!.x - discussionPanelBox!.x).toBeGreaterThan(20);
  const finishDiscussionSwipe = await startTouchSwipe(
    page,
    discussionPanel,
    -190,
  );
  await expect(discussionPanel.locator(".is-preview.is-next")).toContainText(
    "Help with MySQL joins",
  );
  await finishDiscussionSwipe();
  await expect(page).toHaveURL(/\/discussions\/comments$/);
  await expect(discussionPanel).toHaveAttribute(
    "data-discussion-tab",
    "comments",
  );

  await openApp(
    page,
    "/learn/typescript-course/the-design-mindset?from=my-courses",
  );
  const lessonPanel = page.locator("#learning-discussion-tab-panel");
  const lessonColumnBox = await page
    .locator(".learning-workspace__lesson-column")
    .boundingBox();
  const lessonPanelBox = await lessonPanel.boundingBox();
  const lessonComposerBox = await lessonPanel
    .locator(".learning-comment-composer")
    .boundingBox();
  expect(lessonColumnBox).not.toBeNull();
  expect(lessonPanelBox).not.toBeNull();
  expect(lessonComposerBox).not.toBeNull();
  // The panel intentionally extends beyond its lesson column on both sides so
  // elevated cards can cast an unclipped shadow at the page edges.
  expect(lessonPanelBox!.x - lessonColumnBox!.x).toBeCloseTo(-12, 0);
  expect(
    lessonColumnBox!.x +
      lessonColumnBox!.width -
      (lessonPanelBox!.x + lessonPanelBox!.width),
  ).toBeCloseTo(-10, 0);
  expect(lessonComposerBox!.x - lessonPanelBox!.x).toBeGreaterThanOrEqual(6);
  const finishLessonSwipe = await startTouchSwipe(page, lessonPanel, -190);
  await expect(lessonPanel.locator(".is-preview.is-next")).toContainText(
    "Your lesson notes",
  );
  await finishLessonSwipe();
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("discussion surfaces keep swipe clipping outside mobile content gutters", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [path, panelSelector, contentSelector] of [
    ["/discussions/q-and-a", "#discussion-panel", ".discussion-thread"],
    [
      "/learn/typescript-course/career-opportunities?from=home",
      "#learning-discussion-tab-panel",
      ".learning-comment-composer",
    ],
  ] as const) {
    await openApp(page, path);
    const panel = page.locator(panelSelector);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const mainBox = await page.locator(".courses-main").boundingBox();
    const panelBox = await panel.boundingBox();
    const contentBox = await panel
      .locator(contentSelector)
      .first()
      .boundingBox();
    expect(mainBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(contentBox).not.toBeNull();

    expect(Math.abs(panelBox!.x - mainBox!.x), path).toBeLessThan(1);
    expect(
      Math.abs(panelBox!.x + panelBox!.width - (mainBox!.x + mainBox!.width)),
      path,
    ).toBeLessThan(1);
    expect(contentBox!.x - panelBox!.x, path).toBeGreaterThanOrEqual(12);
  }
});

test("a short slow swipe springs back and an edge swipe stays inside the tab panel", async ({
  page,
}) => {
  await openApp(page, "/settings/profile");
  const app = page.locator(".courses-app");
  const panel = page.locator("#settings-tab-panel");
  await expect(panel.locator(".is-preview.is-previous")).toHaveCount(0);
  await expect(panel.locator(".is-preview.is-next")).toHaveCount(0);
  const finishEdgeSwipe = await startTouchSwipe(page, panel, 52);
  await expect(panel.locator(".is-preview.is-previous")).toHaveCount(0);
  await finishEdgeSwipe();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(app).not.toHaveClass(/courses-app--resizing/);
  await expect(panel).not.toHaveAttribute("data-tab-swipe-active", "");

  await openApp(page, "/settings/appearance");
  await expect(panel.locator(".is-preview")).toHaveCount(0);
  const finishShortSwipe = await startTouchSwipe(page, panel, -42);
  await expect(panel.locator(".is-preview.is-next")).toHaveCount(1);
  await finishShortSwipe();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(panel.locator(".is-preview")).toHaveCount(2);
  await expect(panel).not.toHaveAttribute("data-tab-swipe-active", "");
});
