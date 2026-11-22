/**
 * Quick taps on a comment under a lesson: a double click likes it (and a
 * second one takes the like back), and a triple click opens its thread.
 * Clicks on the comment's buttons keep their own meaning.
 */
import type { Page } from "@playwright/test";

import { expect, openLesson, test } from "./support/test";

/** Saves a picture of the page when SUPPORT_SCREENSHOTS names a folder. */
async function snap(page: Page, name: string) {
  const folder = process.env.SUPPORT_SCREENSHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${name}.png` });
}

test("double click likes a comment, triple click opens its thread", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({ title: "Gestures course" });
  const learner = await academy.signedInLearner("gestures");
  await academy.giveCourse(learner, course);

  await openLesson(page, course, 1);
  await page.getByRole("button", { name: "Open discussion composer" }).click();
  await page.getByRole("textbox", { name: "Write a comment" }).click();
  await page.keyboard.type("Tap me twice to like me");
  await page.keyboard.press("Enter");

  const text = page.getByText("Tap me twice to like me").first();
  await expect(text).toBeVisible();
  const comment = page.locator("article[data-tap-gesture]", { has: text });
  const like = comment.locator("[data-comment-like]").first();
  await expect(like).toHaveAttribute("aria-pressed", "false");

  await text.dblclick();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await snap(page, "gesture-liked");

  await text.dblclick();
  await expect(like).toHaveAttribute("aria-pressed", "false");

  // Double clicking the like button itself is the button's: one like.
  await like.dblclick();
  await expect(like).toHaveAttribute("aria-pressed", "true");

  // A triple click opens the thread, and does not like on the way.
  await text.click({ clickCount: 3 });
  await expect(page.getByRole("textbox", { name: /Reply to/u })).toBeVisible();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await snap(page, "gesture-thread");
});
