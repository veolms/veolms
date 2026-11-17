/**
 * A timestamp typed in a comment seeks the lesson video. One past the end of
 * the video is still readable, but it is plain text, not a button.
 */
import {
  expect,
  expectVideoToPlay,
  openLesson,
  pauseVideo,
  test,
  videoPosition,
} from "./support/test";

test("a comment timestamp seeks the video, and one past the end stays plain", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({ title: "Timestamp comments" });
  const learner = await academy.signedInLearner("timestamp");
  await academy.giveCourse(learner, course);

  await openLesson(page, course, 1);
  await expectVideoToPlay(page);
  await pauseVideo(page);

  await page.getByRole("button", { name: "Open discussion composer" }).click();
  const editor = page.getByRole("textbox", { name: "Write a comment" });
  await editor.click();
  await page.keyboard.type("The funny part was at 00:05.");
  await page.keyboard.press("Enter");

  const seek = page.getByRole("button", {
    name: "Seek video to 0 minutes 5 seconds",
  });
  await expect(seek).toBeVisible();
  await seek.click();
  await expect
    .poll(() => videoPosition(page), {
      message: "the video seeks to 5 seconds (±0.5 s)",
    })
    .toBeCloseTo(5, 0);

  // The test course's video is 12 seconds long.
  await page.getByRole("button", { name: "Open discussion composer" }).click();
  const secondEditor = page.getByRole("textbox", { name: "Write a comment" });
  await secondEditor.click();
  await page.keyboard.type("This is past the end at 00:20.");
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("button", { name: "Seek video to 0 minutes 20 seconds" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("This is past the end at 00:20.").first(),
  ).toBeVisible();
});
