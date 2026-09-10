import { expect, test } from "@playwright/test";
import { installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page, {
    local: {
      "veolms-sidebar-mode": "hidden",
      "veolms-sidebar-width": "252",
    },
  });
});

test("desktop player stays inside the main scrollport and wheel scrolling remains native", async ({
  page,
}) => {
  await page.route("**/course-hls/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("master.m3u8")
      ? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nstream.m3u8\n"
      : "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-ENDLIST\n";
    await route.fulfill({
      body,
      contentType: "application/vnd.apple.mpegurl",
      status: 200,
    });
  });
  await page.setViewportSize({ width: 1117, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const main = page.locator(".courses-main--learning");
  const player = page.locator("[data-learning-persistent-player]");
  await expect(main).toBeVisible();
  await expect(player).toBeVisible();

  const before = await page.evaluate(() => {
    const mainElement = document.querySelector<HTMLElement>(
      ".courses-main--learning",
    );
    const playerElement = document.querySelector<HTMLElement>(
      "[data-learning-persistent-player]",
    );
    if (!mainElement || !playerElement) {
      throw new Error("Expected desktop learning scrollport and player");
    }
    const mainBounds = mainElement.getBoundingClientRect();
    const playerBounds = playerElement.getBoundingClientRect();
    return {
      contained:
        playerBounds.top >= mainBounds.top &&
        playerBounds.left >= mainBounds.left &&
        playerBounds.right <= mainBounds.right &&
        playerBounds.bottom <= mainBounds.bottom,
      mainPosition: getComputedStyle(mainElement).position,
      playerTop: playerBounds.top,
      scrollTop: mainElement.scrollTop,
    };
  });
  expect(before.contained).toBe(true);
  expect(before.mainPosition).toBe("relative");

  const playerBounds = await player.boundingBox();
  expect(playerBounds).not.toBeNull();
  await page.mouse.move(
    playerBounds!.x + playerBounds!.width / 2,
    playerBounds!.y + playerBounds!.height / 2,
  );
  await page.mouse.wheel(0, 360);

  await expect
    .poll(() => main.evaluate((element) => (element as HTMLElement).scrollTop))
    .toBeGreaterThan(before.scrollTop);
  const afterPlayerTop = await player.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(afterPlayerTop).toBeLessThan(before.playerTop);

  await page.goto("about:blank");
});

test("floating student navigation stays above the persistent lesson player", async ({
  page,
}) => {
  await page.route("**/course-hls/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("master.m3u8")
      ? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nstream.m3u8\n"
      : "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-ENDLIST\n";
    await route.fulfill({
      body,
      contentType: "application/vnd.apple.mpegurl",
      status: 200,
    });
  });
  await page.setViewportSize({ width: 1117, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities?from=courses",
  );

  const app = page.locator(".courses-app");
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const player = page.locator("[data-learning-persistent-player]");

  await expect(app).toHaveClass(/courses-app--hidden/);
  await expect(player).toBeVisible();

  await page.mouse.move(2, 180);
  await expect(app).toHaveClass(/courses-app--edge-open/);
  await expect(sidebar).toBeVisible();

  const coursesButton = sidebar.getByRole("button", { name: "Courses" });
  await expect(coursesButton).toBeVisible();

  const stacking = await page.evaluate(() => {
    const sidebarElement =
      document.querySelector<HTMLElement>(".courses-sidebar");
    const playerElement = document.querySelector<HTMLElement>(
      "[data-learning-persistent-player]",
    );
    const coursesControl = [
      ...document.querySelectorAll<HTMLElement>(
        ".courses-sidebar .courses-nav button",
      ),
    ].find((button) => button.textContent?.trim().startsWith("Courses"));

    if (!sidebarElement || !playerElement || !coursesControl) {
      throw new Error("Expected floating sidebar and persistent player");
    }

    const sidebarBounds = sidebarElement.getBoundingClientRect();
    const playerBounds = playerElement.getBoundingClientRect();
    const controlBounds = coursesControl.getBoundingClientRect();
    const controlCenter = {
      x: controlBounds.left + controlBounds.width / 2,
      y: controlBounds.top + controlBounds.height / 2,
    };
    const hitTarget = document.elementFromPoint(
      controlCenter.x,
      controlCenter.y,
    );
    const paintedElements = document.elementsFromPoint(
      controlCenter.x,
      controlCenter.y,
    );

    return {
      controlCenterOverlapsPlayer:
        controlCenter.x >= playerBounds.left &&
        controlCenter.x <= playerBounds.right &&
        controlCenter.y >= playerBounds.top &&
        controlCenter.y <= playerBounds.bottom,
      hitTargetIsInSidebar:
        hitTarget !== null && sidebarElement.contains(hitTarget),
      overlapHeight: Math.max(
        0,
        Math.min(sidebarBounds.bottom, playerBounds.bottom) -
          Math.max(sidebarBounds.top, playerBounds.top),
      ),
      overlapWidth: Math.max(
        0,
        Math.min(sidebarBounds.right, playerBounds.right) -
          Math.max(sidebarBounds.left, playerBounds.left),
      ),
      playerZIndex: Number.parseInt(getComputedStyle(playerElement).zIndex, 10),
      playerPaintIndex: paintedElements.findIndex(
        (element) =>
          element === playerElement || playerElement.contains(element),
      ),
      sidebarZIndex: Number.parseInt(
        getComputedStyle(sidebarElement).zIndex,
        10,
      ),
      sidebarPaintIndex: paintedElements.findIndex(
        (element) =>
          element === sidebarElement || sidebarElement.contains(element),
      ),
    };
  });

  expect(stacking.overlapWidth).toBeGreaterThan(0);
  expect(stacking.overlapHeight).toBeGreaterThan(0);
  expect(stacking.controlCenterOverlapsPlayer).toBe(true);
  expect(stacking.sidebarZIndex).toBeGreaterThan(stacking.playerZIndex);
  expect(stacking.sidebarPaintIndex).toBeGreaterThanOrEqual(0);
  expect(stacking.playerPaintIndex).toBeGreaterThanOrEqual(0);
  expect(stacking.sidebarPaintIndex).toBeLessThan(stacking.playerPaintIndex);
  expect(stacking.hitTargetIsInSidebar).toBe(true);
  await page.goto("about:blank");
});

test("visible sidebar resize rail stays above the persistent lesson player", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("veolms-sidebar-mode", "expanded");
  });
  await page.route("**/course-hls/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("master.m3u8")
      ? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nstream.m3u8\n"
      : "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-ENDLIST\n";
    await route.fulfill({
      body,
      contentType: "application/vnd.apple.mpegurl",
      status: 200,
    });
  });
  await page.setViewportSize({ width: 1117, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities?from=courses",
  );

  const app = page.locator(".courses-app");
  const sidebar = page.locator(".courses-sidebar");
  const resizeRail = page.getByRole("separator", { name: "Resize sidebar" });
  const player = page.locator("[data-learning-persistent-player]");

  await expect(app).not.toHaveClass(/courses-app--hidden/);
  await expect(sidebar).toBeVisible();
  await expect(resizeRail).toBeVisible();
  await expect(player).toBeVisible();

  const stacking = await page.evaluate(() => {
    const appElement = document.querySelector<HTMLElement>(".courses-app");
    const sidebarElement =
      document.querySelector<HTMLElement>(".courses-sidebar");
    const resizeElement = document.querySelector<HTMLElement>(
      ".sidebar-resize-handle",
    );
    const playerElement = document.querySelector<HTMLElement>(
      "[data-learning-persistent-player]",
    );

    if (!appElement || !sidebarElement || !resizeElement || !playerElement) {
      throw new Error("Expected visible sidebar resize rail and player");
    }

    return {
      appIsolation: getComputedStyle(appElement).isolation,
      resizeRailZIndex: Number.parseInt(
        getComputedStyle(resizeElement).zIndex,
        10,
      ),
      sidebarZIndex: Number.parseInt(
        getComputedStyle(sidebarElement).zIndex,
        10,
      ),
      playerZIndex: Number.parseInt(getComputedStyle(playerElement).zIndex, 10),
    };
  });

  expect(stacking.appIsolation).toBe("auto");
  expect(stacking.resizeRailZIndex).toBeGreaterThan(stacking.playerZIndex);
  expect(stacking.sidebarZIndex).toBeGreaterThan(stacking.playerZIndex);

  await page.goto("about:blank");
});
