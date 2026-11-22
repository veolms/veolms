/**
 * The speed a learner picks in the player is theirs. A browser extension
 * that holds every video at one speed set a learner's 2× back to 1× moments
 * after they picked it, and the page then saved that 1× as their speed: the
 * player looked broken, and every lesson opened at 1×.
 *
 * Here the page itself plays the extension: it sets the video's speed
 * straight on the video, as an extension's script does, never through the
 * player.
 */
import type { Page } from "@playwright/test";

import { expect, expectVideoToPlay, openLesson, test } from "./support/test";

/** The speed the lesson's video is playing at. */
function videoSpeed(page: Page) {
  return page.evaluate(
    () =>
      [...document.querySelectorAll("video")].find(
        (video) => video.currentSrc !== "",
      )?.playbackRate ?? null,
  );
}

/** Settings → Playback speed → `speed`, as a learner picks it. */
async function pickSpeed(page: Page, speed: string) {
  await page
    .getByRole("region", { name: /^Lesson video player/u })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /^Playback speed/u }).click();
  await page.getByRole("menuitemradio", { name: speed, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("a learner whose speed is changed by something outside the player is told so, and keeps the speed they picked", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse();

  await openLesson(page, course, 1);
  await expectVideoToPlay(page);
  await pickSpeed(page, "2×");
  await expect.poll(() => videoSpeed(page)).toBe(2);

  // An extension sets the playing video back to 1×.
  await page.evaluate(() => {
    const video = [...document.querySelectorAll("video")].find(
      (element) => element.currentSrc !== "",
    );
    if (video) video.playbackRate = 1;
  });

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Speed changed to 1× outside the player" }),
  ).toBeVisible();

  // The 1× was not taken as the learner's speed: the lesson opens again at 2×.
  await page.reload();
  await expectVideoToPlay(page);
  await expect.poll(() => videoSpeed(page)).toBe(2);
});
