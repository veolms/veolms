import { expect, test } from "@playwright/test";
import { installBaselineState, openApp } from "./support.ts";

test.use({
  contextOptions: { reducedMotion: "no-preference" },
  hasTouch: true,
  viewport: { width: 375, height: 667 },
});

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

type RestoreMotionSample = {
  background: number;
  content: number | null;
  lessonMounted: boolean;
  videoBottomProgress: number;
};

test("hands off immediately from lesson content to the return page without overlap", async ({
  page,
}) => {
  await openApp(page, "/learn/backend-nodejs/the-design-mindset?from=courses");

  const player = page.getByRole("region", {
    name: "Lesson video player for The Design Mindset",
  });
  const playerBounds = await player.boundingBox();
  expect(playerBounds).not.toBeNull();
  expect(
    await player.evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("0px");
  const touchX = playerBounds!.x + playerBounds!.width / 2;
  const touchStartY = playerBounds!.y + Math.min(80, playerBounds!.height / 3);
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest("[data-video-player-root]") !==
        null,
      { x: touchX, y: touchStartY },
    ),
  ).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const readMotion = () =>
    page.locator("[data-learning-motion-stage]").evaluate((stage) => {
      const host = document.querySelector<HTMLElement>(
        "[data-learning-persistent-player]",
      );
      return {
        background: Number(
          (stage as HTMLElement).style.getPropertyValue(
            "--learning-background-reveal",
          ) || 0,
        ),
        content: Number(
          (stage as HTMLElement).style.getPropertyValue(
            "--learning-player-content-opacity",
          ) || 1,
        ),
        motionPhase: host?.dataset.learningPlayerMotionPhase ?? null,
        transform: host?.style.transform ?? "",
        videoBottomProgress:
          (host?.getBoundingClientRect().bottom ?? 0) / window.innerHeight,
      };
    });
  const moveTo = async (offsetY: number) => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: touchX, y: touchStartY + offsetY }],
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  };

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchX, y: touchStartY }],
  });

  await moveTo(35);
  let motion = await readMotion();
  expect(motion.motionPhase).toBe("dragging");
  expect(motion.transform).toContain("translate3d");
  expect(motion.videoBottomProgress).toBeLessThan(0.4);
  expect(motion.content).toBeGreaterThan(0);
  expect(motion.background).toBe(0);

  await moveTo(110);
  motion = await readMotion();
  expect(motion.videoBottomProgress).toBeGreaterThan(0.4);
  expect(motion.videoBottomProgress).toBeLessThan(0.6);
  expect(motion.content).toBe(0);
  expect(motion.background).toBeGreaterThan(0);
  expect(motion.background).toBeCloseTo(
    (motion.videoBottomProgress - 0.4) / 0.2,
    2,
  );
  await expect(page.locator("[data-learning-background-surface]")).toHaveCount(
    1,
  );
  expect(motion.content * motion.background).toBe(0);

  await moveTo(280);
  motion = await readMotion();
  expect(motion.videoBottomProgress).toBeGreaterThanOrEqual(0.6);
  expect(motion.content).toBe(0);
  expect(motion.background).toBe(1);

  await moveTo(35);
  motion = await readMotion();
  expect(motion.videoBottomProgress).toBeLessThan(0.4);
  expect(motion.content).toBeGreaterThan(0);
  expect(motion.background).toBe(0);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
});

test("restores the persistent player on the first touch without a synthesized click", async ({
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
  await page.addInitScript(() => {
    document.addEventListener(
      "click",
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-learning-mini-player-restore]")
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  });
  await openApp(page, "/learn/backend-nodejs/the-design-mindset?from=courses");
  await page.addStyleTag({
    content:
      '[data-learning-persistent-player] [role="alert"] { pointer-events: none !important; }',
  });

  const player = page.getByRole("region", {
    name: "Lesson video player for The Design Mindset",
  });
  const playerBounds = await player.boundingBox();
  expect(playerBounds).not.toBeNull();
  const touchX = playerBounds!.x + playerBounds!.width / 2;
  const touchStartY = playerBounds!.y + Math.min(80, playerBounds!.height / 3);
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchX, y: touchStartY }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchX, y: touchStartY + 390 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  const restore = page.getByRole("button", {
    name: "Return to The Design Mindset",
  });
  await expect(restore).toBeVisible();
  const restoreBounds = await restore.boundingBox();
  expect(restoreBounds).not.toBeNull();
  const restoreX = restoreBounds!.x + restoreBounds!.width / 2;
  const restoreY = restoreBounds!.y + restoreBounds!.height / 2;

  await page.evaluate(() => {
    const sampledWindow = window as typeof window & {
      __learningRestoreMotionSamples?: RestoreMotionSample[];
    };
    const samples: RestoreMotionSample[] = [];
    const startedAt = performance.now();
    sampledWindow.__learningRestoreMotionSamples = samples;

    const sample = () => {
      const host = document.querySelector<HTMLElement>(
        "[data-learning-persistent-player]",
      );
      const motionStage = document.querySelector<HTMLElement>(
        "[data-learning-motion-stage]",
      );
      const lessonContent = document.querySelector<HTMLElement>(
        "[data-learning-lesson-content]",
      );
      samples.push({
        background: Number(
          motionStage?.style.getPropertyValue("--learning-background-reveal") ||
            0,
        ),
        content: lessonContent
          ? Number(getComputedStyle(lessonContent).opacity)
          : null,
        lessonMounted: Boolean(lessonContent),
        videoBottomProgress:
          (host?.getBoundingClientRect().bottom ?? 0) / window.innerHeight,
      });

      if (performance.now() - startedAt < 500) requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: restoreX, y: restoreY }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  await expect(page).toHaveURL(
    /\/learn\/backend-nodejs\/the-design-mindset\?from=courses$/,
  );
  await expect(page.locator("[data-learning-mini-player]")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "The Design Mindset", level: 1 }),
  ).toBeVisible();

  await page.waitForTimeout(350);
  const restoreSamples = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __learningRestoreMotionSamples?: RestoreMotionSample[];
        }
      ).__learningRestoreMotionSamples ?? [],
  );
  const firstContentBoundaryFrame = restoreSamples.find(
    ({ videoBottomProgress }) => videoBottomProgress <= 0.4,
  );
  expect(firstContentBoundaryFrame?.lessonMounted).toBe(true);
  expect(firstContentBoundaryFrame?.background).toBe(0);
  expect(
    restoreSamples.some(
      ({ content, lessonMounted, videoBottomProgress }) =>
        lessonMounted &&
        videoBottomProgress <= 0.38 &&
        content !== null &&
        content > 0,
    ),
  ).toBe(true);
});
