/**
 * The comment box under a lesson: Enter posts a public comment straight
 * away, Shift+Enter adds a new line, and the arrow beside Post picks what is
 * posted (Q&A, note) and who sees it; the button says what it will do.
 */
import type { Page } from "@playwright/test";

import { expect, openLesson, test } from "./support/test";

/** Saves a picture of the page when SUPPORT_SCREENSHOTS names a folder. */
async function snap(page: Page, name: string) {
  const folder = process.env.SUPPORT_SCREENSHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${name}.png` });
}

test("Enter posts a comment, Shift+Enter adds a line, and the options change what is posted", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({ title: "Composer course" });
  const learner = await academy.signedInLearner("composer");
  await academy.giveCourse(learner, course);

  await openLesson(page, course, 1);
  await page.getByRole("button", { name: "Open discussion composer" }).click();
  const editor = page.getByRole("textbox", { name: "Write a comment" });
  await expect(editor).toBeVisible();

  // Nothing written: Post is off.
  const post = page.locator("[data-comment-post-button] button").first();
  await expect(post).toBeDisabled();
  await expect(post).toContainText("Comment");
  await snap(page, "composer-empty");

  await editor.click();
  await page.keyboard.type("First line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second line");
  await expect(post).toBeEnabled();
  await snap(page, "composer-typing");
  await page.keyboard.press("Enter");

  // Posted as a public comment, both lines kept.
  const posted = page.getByText("second line").first();
  await expect(posted).toBeVisible();
  await expect(page.getByText("First line").first()).toBeVisible();

  // Q&A from the options: the button says so, and Enter posts it.
  await page.getByRole("button", { name: "Open discussion composer" }).click();
  await page.getByRole("button", { name: "Post options" }).click();
  await snap(page, "composer-menu");
  await page.getByRole("radio", { name: /Q&A/u }).click();
  await expect(post).toContainText("Post Q&A");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("radio", { name: /Q&A/u })).toHaveCount(0);

  const questionEditor = page.getByRole("textbox", { name: "Write a Q&A" });
  await questionEditor.click();
  await page.keyboard.type("How do I shorten the prompt?");
  await snap(page, "composer-qa");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("How do I shorten the prompt?").first(),
  ).toBeVisible();
});

test("a learner can reply to a discussion on a phone", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    title: "Mobile discussion course",
  });
  const learner = await academy.signedInLearner("mobile-reply");
  await academy.giveCourse(learner, course);

  await openLesson(page, course, 1);
  await page.getByRole("button", { name: "Open discussion composer" }).click();
  await page
    .getByRole("textbox", { name: "Write a comment" })
    .fill("A question from my phone");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("A question from my phone").first(),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discussions/all");
  await page.getByText("A question from my phone").first().click();
  const reply = page.getByRole("textbox", { name: /Reply to/u });
  await reply.fill("A reply from my phone");
  await page.getByRole("button", { name: "Post reply" }).click();
  await expect(page.getByText("A reply from my phone")).toBeVisible();
});
