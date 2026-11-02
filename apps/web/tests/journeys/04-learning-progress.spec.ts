/**
 * What the app remembers about a learner's watching: finished lessons,
 * the course's progress, and where to carry on, on this device or another.
 *
 * Every lesson's video is 12 seconds long, so "watching to the end" takes
 * 12 seconds of real playback, the way a learner finishes a lesson.
 *
 * The lesson page keeps progress in the browser first and sends it to the
 * API every 15 seconds, when a lesson ends, and when the learner moves on
 * in the app. The tests wait for that save (`waitForProgressSave`) before
 * checking anything another page or device reads from the API.
 */
import type { Page } from "@playwright/test";

import {
  expect,
  expectVideoToPlay,
  lessonInList,
  openCoursePage,
  openLesson,
  openSecondBrowser,
  pauseVideo,
  test,
  videoPosition,
  waitForProgressSave,
  type Academy,
  type TestCourse,
} from "./support/test";

/** A learner, signed in, who has been given a three-lesson course. */
async function learnerWithCourse(academy: Academy, label: string) {
  const course = await academy.createCourse({ title: "CSS Layouts" });
  const learner = await academy.signedInLearner(label);
  await academy.giveCourse(learner, course);
  return { course, learner };
}

/** Plays lesson N to its end and waits until the API has it as complete. */
async function watchToTheEnd(
  page: Page,
  course: TestCourse,
  lessonNumber: number,
) {
  const lessonId = course.lessons[lessonNumber - 1]!.id;
  await expectVideoToPlay(page);
  // Listening from here: the video is playing, its end is 10 s away.
  const saved = waitForProgressSave(page, (lessons) =>
    lessons.some(
      (lesson) =>
        lesson.lessonId === lessonId && lesson.progressPercent === 100,
    ),
  );
  await expect(lessonInList(page, lessonNumber)).toContainText("completed", {
    timeout: 30_000,
  });
  await saved;
}

/** The course page's "Your progress in this course" box. */
function progressBox(page: Page) {
  return page.getByRole("region", { name: "Your progress in this course" });
}

test("watching a lesson to the end marks it complete, counts it in the course's progress, and starts the next one", async ({
  page,
  academy,
}) => {
  const { course } = await learnerWithCourse(academy, "finisher");

  await openLesson(page, course, 1);
  await watchToTheEnd(page, course, 1);

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  await expect(curriculum).toContainText("1 of 3 lessons completed");
  // "Autoplay next lesson" is on: lesson 2 follows by itself.
  await expect(page).toHaveURL(
    new RegExp(`/learn/${course.slug}/lecture-2$`, "u"),
    {
      timeout: 20_000,
    },
  );

  // The course's page agrees, and "Continue Learning" goes to lesson 2.
  await openCoursePage(page, course);
  await expect(progressBox(page)).toContainText("1 of 3 lessons");
  await expect(progressBox(page)).toContainText("33.00%");
  await expect(progressBox(page)).toContainText("Up next");
  await progressBox(page)
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/learn/${course.slug}/lecture-2$`, "u"),
  );
});

test("a lesson watched halfway is saved as started, not as complete", async ({
  page,
  academy,
}) => {
  const { course } = await learnerWithCourse(academy, "halfway");
  const lessonId = course.lessons[0]!.id;

  await openLesson(page, course, 1);
  const saved = waitForProgressSave(page, (lessons) =>
    lessons.some(
      (lesson) => lesson.lessonId === lessonId && lesson.progressPercent >= 40,
    ),
  );
  await expectVideoToPlay(page, 6);
  await pauseVideo(page);
  // Within 15 seconds the page sends what was watched.
  await saved;

  await page.reload();
  const row = lessonInList(page, 1);
  await expect(row).toContainText(/\d+% complete/u);
  await expect(row).not.toContainText("completed");

  await openCoursePage(page, course);
  await expect(progressBox(page)).toContainText("0 of 3 lessons");
});

test("on another device, a half-watched lesson starts a few seconds before where the learner stopped", async ({
  page,
  academy,
  browser,
}) => {
  const { course, learner } = await learnerWithCourse(academy, "resumer");
  const lessonId = course.lessons[0]!.id;

  await openLesson(page, course, 1);
  await expectVideoToPlay(page, 8);
  await pauseVideo(page);
  const stoppedAt = await videoPosition(page);

  // They leave the lesson for the course's page, from the lesson list.
  const saved = waitForProgressSave(page, (lessons) =>
    lessons.some(
      (lesson) =>
        lesson.lessonId === lessonId && (lesson.positionSeconds ?? 0) >= 7,
    ),
  );
  await page
    .getByRole("button", { name: `View course overview for ${course.title}` })
    .click();
  await saved;

  // Their phone (another browser, signed in on its own), which has never
  // played this lesson. The player rewinds 5 seconds, to pick the thread
  // up again.
  const phone = await openSecondBrowser(
    browser,
    await academy.onAnotherDevice(learner),
  );
  try {
    await openLesson(phone.page, course, 1);
    await expect(
      phone.page.getByRole("region", { name: /^Lesson video player/u }),
    ).toBeVisible();
    const expectedStart = Math.floor(stoppedAt) - 5;
    await expect
      .poll(() => videoPosition(phone.page), {
        message: `the video opens at about ${expectedStart} s`,
      })
      .toBeGreaterThanOrEqual(expectedStart - 1);
    expect(await videoPosition(phone.page)).toBeLessThan(stoppedAt);
  } finally {
    await phone.context.close();
  }
});

// A known gap, found while writing these tests (2026-10-29). When the
// learner leaves a lesson by loading another page in full (reload, a typed
// address, a bookmark) rather than through the app, the page's last save is
// a beacon the browser accepts but which never reaches the API (a JSON
// beacon to the API's own origin, which needs a CORS preflight the closing
// page does not wait for). The progress waits in that browser until a
// lesson is opened there again, so their other devices do not see it.
// Remove `.fixme` once that is fixed.
test.fixme("on another device, a half-watched lesson resumes even when the learner left by reloading the page", async ({
  page,
  academy,
  browser,
}) => {
  const { course, learner } = await learnerWithCourse(academy, "reloader");

  await openLesson(page, course, 1);
  await expectVideoToPlay(page, 8);
  await pauseVideo(page);
  await openCoursePage(page, course);

  const phone = await openSecondBrowser(
    browser,
    await academy.onAnotherDevice(learner),
  );
  try {
    await openLesson(phone.page, course, 1);
    await expect
      .poll(() => videoPosition(phone.page), {
        message: "the video opens near 3 s",
      })
      .toBeGreaterThanOrEqual(2);
  } finally {
    await phone.context.close();
  }
});

test("progress never goes backwards: replaying the start of a finished lesson keeps it complete", async ({
  page,
  academy,
}) => {
  const { course } = await learnerWithCourse(academy, "rewatcher");
  const lessonId = course.lessons[0]!.id;

  await openLesson(page, course, 1);
  await watchToTheEnd(page, course, 1);

  // Back to lesson 1 for a few seconds. The page sends that replay too,
  // with less than 100%: the API must keep the higher one.
  await openLesson(page, course, 1);
  const replaySaved = waitForProgressSave(page, (lessons) =>
    lessons.some(
      (lesson) => lesson.lessonId === lessonId && lesson.progressPercent < 100,
    ),
  );
  await expectVideoToPlay(page, 3);
  await pauseVideo(page);
  await replaySaved;

  await page.reload();
  await expect(lessonInList(page, 1)).toContainText("completed");
  await openCoursePage(page, course);
  await expect(progressBox(page)).toContainText("1 of 3 lessons");
});
