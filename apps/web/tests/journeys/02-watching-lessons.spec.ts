/**
 * Who can watch which lesson. Each course here has a free preview lesson
 * (lesson 1) and two locked ones (lessons 2 and 3), unless a test says
 * otherwise.
 *
 * "The video plays" means it really plays in Chrome: the player fetched the
 * video from the (test) CDN with its playback token, and the clock moved
 * past 2 seconds. "No video" means the page has no player at all, and the
 * CDN was never asked for that lesson's video.
 */
import {
  expect,
  expectNoVideo,
  expectVideoToPlay,
  lessonInList,
  openLesson,
  test,
} from "./support/test";

test("a visitor watches the free preview lesson, and the other lessons show as locked", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    title: "React Mastery",
    price: 1299,
  });

  await openLesson(page, course, 1);
  await expectVideoToPlay(page);

  await expect(lessonInList(page, 1)).not.toContainText("locked");
  await expect(lessonInList(page, 2)).toContainText("locked");
  await expect(lessonInList(page, 3)).toContainText("locked");

  // The CDN refuses a segment without the playback token (403), so
  // segments it served prove the player sent the token.
  const segments = (await academy.videoFilesRequested(course, 1)).filter(
    (request) => request.file.endsWith(".m4s"),
  );
  expect(segments.length).toBeGreaterThan(0);
  for (const segment of segments) {
    expect(segment.status, `${segment.file} was served`).toBe(200);
  }
});

test("a visitor opening a locked lesson is asked to log in, and gets no video", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse();

  await openLesson(page, course, 2);

  const lock = page.getByRole("alert");
  await expect(
    lock.getByRole("heading", { name: "Log in to dive in" }),
  ).toBeVisible();
  await expectNoVideo(page);
  expect(await academy.videoFilesRequested(course, 2)).toEqual([]);

  // "Log in" opens the sign-in window.
  await lock.getByRole("button", { name: "Log in" }).click();
  await expect(
    page.getByRole("dialog").getByRole("textbox", { name: "Email" }),
  ).toBeVisible();
});

test("a learner who has not bought the course is asked to unlock it, gets no video, and is taken to its price", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    title: "Node.js in Depth",
    price: 1299,
  });
  await academy.signedInLearner("not_bought");

  for (const lessonNumber of [2, 3]) {
    await openLesson(page, course, lessonNumber);
    const lock = page.getByRole("alert");
    await expect(
      lock.getByRole("heading", { name: "Ready to dive in?" }),
    ).toBeVisible();
    await expectNoVideo(page);
    expect(await academy.videoFilesRequested(course, lessonNumber)).toEqual([]);
  }

  // The preview lesson still plays for them.
  await openLesson(page, course, 1);
  await expectVideoToPlay(page);

  // "Unlock the course" leads to the course's page and its price.
  await openLesson(page, course, 2);
  await page.getByRole("button", { name: "Unlock the course" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/courses/${course.slug}/overview$`, "u"),
  );
  const pricing = page.getByRole("region", {
    name: "Course pricing and enrollment",
  });
  await expect(pricing).toContainText("₹1,299");
  await expect(pricing.getByRole("button", { name: "Pay Now" })).toBeVisible();
});

test("a learner who has the course watches its locked lessons, and nothing shows as locked", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse();
  const learner = await academy.signedInLearner("has_course");
  await academy.giveCourse(learner, course);

  await openLesson(page, course, 2);
  await expectVideoToPlay(page);
  for (const lessonNumber of [1, 2, 3]) {
    await expect(lessonInList(page, lessonNumber)).not.toContainText("locked");
  }

  await openLesson(page, course, 3);
  await expectVideoToPlay(page);
});

test("when staff take the course away, its lessons lock again for that learner", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse();
  const learner = await academy.signedInLearner("losing_course");
  await academy.giveCourse(learner, course);
  await openLesson(page, course, 2);
  await expectVideoToPlay(page);

  await academy.takeCourseAway(learner, course);

  await openLesson(page, course, 2);
  await expect(
    page.getByRole("alert").getByRole("heading", { name: "Ready to dive in?" }),
  ).toBeVisible();
  await expectNoVideo(page);
});

test("one learner's course does not open it for another learner", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse();
  const owner = await academy.createLearner("owner");
  await academy.giveCourse(owner, course);
  await academy.signedInLearner("someone_else");

  await openLesson(page, course, 2);
  await expect(
    page.getByRole("alert").getByRole("heading", { name: "Ready to dive in?" }),
  ).toBeVisible();
  await expectNoVideo(page);
});

test("a lesson whose video is still being prepared says so, instead of a broken player", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    lessons: [{ preview: true }, { video: "processing" }],
  });
  const learner = await academy.signedInLearner("early");
  await academy.giveCourse(learner, course);

  await openLesson(page, course, 2);

  const notice = page.getByRole("alert");
  await expect(
    notice.getByRole("heading", { name: "Video not ready yet" }),
  ).toBeVisible();
  await expect(notice).toContainText("still being prepared");
  await expect(notice.getByRole("button", { name: "Try again" })).toBeVisible();
  await expectNoVideo(page);
});

test("a draft course is not found by learners, neither its page nor its lessons", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    title: "Unfinished Course",
    status: "draft",
  });
  await academy.signedInLearner("curious");

  await page.goto(`/courses/${course.slug}/overview`);
  await expect(page.getByText("Course not found")).toBeVisible();
  await expect(page.getByText("Unfinished Course")).toHaveCount(0);

  await openLesson(page, course, 1);
  await expect(page.getByText("Course not found")).toBeVisible();
  await expectNoVideo(page);
  expect(await academy.videoFilesRequested(course, 1)).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a learner who taps their course on the home page sees the lesson opening at once, then watches it", async ({
    page,
    academy,
  }) => {
    // Its own name: other tests' courses are on the home page too, under
    // "Explore More Courses".
    const course = await academy.createCourse();
    const learner = await academy.signedInLearner("on_a_phone");
    await academy.giveCourse(learner, course);

    // A slow phone on a slow network: the lesson page's code has not
    // arrived yet when the learner taps. It is held back until the test has
    // seen what the tap shows in the meantime.
    let releaseLessonCode = () => {};
    const lessonCodeHeld = new Promise<void>((resolve) => {
      releaseLessonCode = resolve;
    });
    await page.route(/\/src\/routes\/learning\.tsx/u, async (route) => {
      await lessonCodeHeld;
      await route.continue();
    });

    await page.goto("/");
    // On a phone the whole course card on the home page is one way into
    // the lesson; the course's name is where a finger lands on it.
    const courseName = page.getByRole("heading", {
      name: course.title,
      level: 2,
    });
    await expect(courseName).toBeVisible();
    const box = await courseName.boundingBox();
    if (!box) throw new Error("The course's name has no place on the screen");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    // The tap is answered at once, before the lesson page is there.
    const opening = page.getByRole("status", { name: "Opening lesson" });
    await expect(opening).toBeVisible({ timeout: 2_000 });

    releaseLessonCode();
    await expect(page).toHaveURL(
      new RegExp(`/learn/${course.slug}/lecture-\\d+$`, "u"),
    );
    await expect(opening).toHaveCount(0);
    // A tap on the course means "watch it": the lesson opens playing, with
    // no Play to press.
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await expectVideoToPlay(page);
  });
});
