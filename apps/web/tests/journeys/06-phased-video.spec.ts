/** A playable first phase stays available while the remaining renditions run. */
import { expect, expectVideoToPlay, test } from "./support/test";

test("an author can save a playable video while other qualities process", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    status: "draft",
    lessons: [{ title: "Phased video", video: "ready" }],
  });
  const mediaId = course.lessons[0]!.mediaId!;
  await academy.signInAsAdmin();
  const progress = {
    status: "ready",
    progressPercent: 48,
    playbackReady: true,
    error: null,
  };
  await page.route(`**/media/${mediaId}/progress`, (route) =>
    route.fulfill({
      json: progress,
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:43917",
        "access-control-allow-credentials": "true",
      },
    }),
  );
  await page.route(`**/media/${mediaId}/progress/stream`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:43917",
        "access-control-allow-credentials": "true",
      },
      body: `event: progress\ndata: ${JSON.stringify(progress)}\n\n`,
    }),
  );
  await page.goto(`/courses/${course.id}/edit/curriculum`);
  const expandSection = page.getByRole("button", { name: "Expand section" });
  if (await expandSection.count()) await expandSection.first().click();
  await page
    .getByRole("button", { name: "Expand lesson editor" })
    .first()
    .click();
  await expect(
    page.getByText(
      /Video ready to play and save\. Other qualities are still processing/,
    ),
  ).toBeVisible();
  await expect(page.getByText(/48%/).first()).toBeVisible();
  await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible();
  await expectVideoToPlay(page);
  const save = page.getByRole("button", { name: "Save" }).first();
  await expect(save).toBeEnabled();
  await save.click();
});

test("an uploaded video stays with its lesson while transcoding is queued", async ({
  page,
  context,
  academy,
}) => {
  const course = await academy.createCourse({
    status: "draft",
    lessons: [
      { title: "New video lesson", video: "none" },
      { title: "Queued media fixture", video: "queued" },
    ],
  });
  const mediaId = course.lessons[1]!.mediaId!;
  await academy.signInAsAdmin();
  // Storage and transcoding are external. The real API persists the lesson;
  // only the multipart transfer is replaced with an already queued asset.
  const cors = {
    "access-control-allow-origin": "http://127.0.0.1:43917",
    "access-control-allow-credentials": "true",
  };
  await context.route("**/media/multipart/start", (route) =>
    route.fulfill({
      headers: cors,
      json: {
        success: true,
        data: { mediaAssetId: mediaId, partSize: 1024, totalParts: 1 },
      },
    }),
  );
  await context.route(`**/media/${mediaId}/multipart/parts`, (route) =>
    route.fulfill({
      headers: cors,
      json: {
        success: true,
        data: {
          parts: [
            { partNumber: 1, url: "http://127.0.0.1:43917/test-video-part" },
          ],
        },
      },
    }),
  );
  await context.route("**/test-video-part", (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
  await context.route(`**/media/${mediaId}/multipart/complete`, (route) =>
    route.fulfill({
      headers: cors,
      json: { success: true, data: { status: "uploaded" } },
    }),
  );

  await page.goto(`/courses/${course.id}/edit/curriculum`);
  const expandSection = page.getByRole("button", { name: "Expand section" });
  if (await expandSection.count()) await expandSection.first().click();
  await page
    .getByRole("button", { name: "Expand lesson editor" })
    .first()
    .click();
  await page
    .getByLabel("Choose a video file")
    .last()
    .setInputFiles({
      name: "queued-test.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("test video"),
    });
  await page.getByRole("button", { name: "Upload video", exact: true }).click();
  await expect(
    page.getByText("Processing", { exact: true }).first(),
  ).toBeVisible();

  // A second page reads the server state while the first editor remains open:
  // no unmount cleanup or lesson Save can hide a missing attachment.
  const reopened = await context.newPage();
  await reopened.goto(`/courses/${course.id}/edit/curriculum`);
  const reopenSection = reopened.getByRole("button", {
    name: "Expand section",
  });
  if (await reopenSection.count()) await reopenSection.first().click();
  await reopened
    .getByRole("button", { name: "Expand lesson editor" })
    .first()
    .click();
  await expect(
    reopened.getByText("Processing", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    reopened.getByText("Video attached", { exact: true }).first(),
  ).toBeVisible();
});

test("adding a lesson updates the link to the new lesson", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    status: "draft",
    lessons: [{ title: "Existing lesson", video: "none" }],
  });
  await academy.signInAsAdmin();
  await page.goto(`/courses/${course.id}/edit/curriculum`);
  const expandSection = page.getByRole("button", { name: "Expand section" });
  if (await expandSection.count()) await expandSection.first().click();
  await page
    .getByRole("button", { name: "Expand lesson editor" })
    .first()
    .click();
  const previousUrl = page.url();
  await page.getByRole("button", { name: "Add Lesson" }).first().click();
  await expect.poll(() => page.url()).not.toBe(previousUrl);
  const newLessonUrl = new URL(page.url());
  expect(newLessonUrl.searchParams.get("lessonId")).toBeTruthy();
  expect(newLessonUrl.searchParams.get("lessonId")).not.toBe(
    new URL(previousUrl).searchParams.get("lessonId"),
  );
  await page.reload();
  await expect(page.getByText("New Lesson 2").first()).toBeVisible();
});

test("a new course keeps its draft when the curriculum is refreshed", async ({
  page,
  academy,
}) => {
  await academy.signInAsAdmin();
  await page.goto("/courses/create/basics");
  await page
    .getByRole("textbox", { name: "Course Title" })
    .fill("Refreshable draft course");
  await page.getByRole("textbox", { name: "Course Title" }).blur();
  await expect(
    page.getByRole("tab", { name: "Curriculum", exact: true }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: "Curriculum", exact: true }).click();
  await expect(page.getByText("New Lesson 1").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("New Lesson 1").first()).toBeVisible();
});

test("a replacement for a failed video stays attached while queued", async ({
  page,
  context,
  academy,
}) => {
  const course = await academy.createCourse({
    status: "draft",
    lessons: [
      { title: "Failed lesson", video: "queued" },
      { title: "Replacement fixture", video: "queued" },
    ],
  });
  const oldId = course.lessons[0]!.mediaId!;
  const newId = course.lessons[1]!.mediaId!;
  const headers = {
    "access-control-allow-origin": "http://127.0.0.1:43917",
    "access-control-allow-credentials": "true",
  };
  const failed = {
    status: "failed",
    progressPercent: 0,
    playbackReady: false,
    error: "Video processing failed.",
  };
  await academy.signInAsAdmin();
  await context.route(`**/media/${oldId}/progress`, (route) =>
    route.fulfill({ json: failed, headers }),
  );
  await context.route(`**/media/${oldId}/progress/stream`, (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      headers,
      body: `event: progress\ndata: ${JSON.stringify(failed)}\n\n`,
    }),
  );
  await context.route("**/media/multipart/start", (route) =>
    route.fulfill({
      headers,
      json: {
        success: true,
        data: { mediaAssetId: newId, partSize: 1024, totalParts: 1 },
      },
    }),
  );
  await context.route(`**/media/${newId}/multipart/parts`, (route) =>
    route.fulfill({
      headers,
      json: {
        success: true,
        data: {
          parts: [
            {
              partNumber: 1,
              url: "http://127.0.0.1:43917/test-replacement-part",
            },
          ],
        },
      },
    }),
  );
  await context.route("**/test-replacement-part", (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
  await context.route(`**/media/${newId}/multipart/complete`, (route) =>
    route.fulfill({
      headers,
      json: { success: true, data: { status: "uploaded" } },
    }),
  );
  await page.goto(`/courses/${course.id}/edit/curriculum`);
  const expandSection = page.getByRole("button", { name: "Expand section" });
  if (await expandSection.count()) await expandSection.first().click();
  await page
    .getByRole("button", { name: "Expand lesson editor" })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Choose Replacement Video" }),
  ).toBeVisible();
  await page
    .getByLabel("Choose a video file")
    .last()
    .setInputFiles({
      name: "replacement.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("test video"),
    });
  await page.getByRole("button", { name: "Upload video", exact: true }).click();
  await expect(
    page.getByText("Processing", { exact: true }).first(),
  ).toBeVisible();
  const reopened = await context.newPage();
  await reopened.goto(`/courses/${course.id}/edit/curriculum`);
  const reopenSection = reopened.getByRole("button", {
    name: "Expand section",
  });
  if (await reopenSection.count()) await reopenSection.first().click();
  await reopened
    .getByRole("button", { name: "Expand lesson editor" })
    .first()
    .click();
  await expect(
    reopened.getByText("Processing", { exact: true }).first(),
  ).toBeVisible();
});

test("an author can replace a failed lesson video", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    status: "draft",
    lessons: [{ title: "Failed video", video: "queued" }],
  });
  const mediaId = course.lessons[0]!.mediaId!;
  await academy.signInAsAdmin();
  const progress = {
    status: "failed",
    progressPercent: 0,
    playbackReady: false,
    error: "Video processing failed.",
  };
  const headers = {
    "access-control-allow-origin": "http://127.0.0.1:43917",
    "access-control-allow-credentials": "true",
  };
  await page.route(`**/media/${mediaId}/progress`, (route) =>
    route.fulfill({ json: progress, headers }),
  );
  await page.route(`**/media/${mediaId}/progress/stream`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers,
      body: `event: progress\ndata: ${JSON.stringify(progress)}\n\n`,
    }),
  );
  await page.goto(`/courses/${course.id}/edit/curriculum`);
  const expandSection = page.getByRole("button", { name: "Expand section" });
  if (await expandSection.count()) await expandSection.first().click();
  await page
    .getByRole("button", { name: "Expand lesson editor" })
    .first()
    .click();
  await expect(
    page.getByText("Video processing failed.").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose Replacement Video" }),
  ).toBeVisible();
});

test("the editor explains that a submitted video remains after cancel", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    status: "draft",
    lessons: [{ title: "Queued lesson", video: "queued" }],
  });
  await academy.signInAsAdmin();
  await page.goto(`/courses/${course.id}/edit/curriculum`);
  const expandSection = page.getByRole("button", { name: "Expand section" });
  if (await expandSection.count()) await expandSection.first().click();
  await page
    .getByRole("button", { name: "Expand lesson editor" })
    .first()
    .click();
  await expect(
    page.getByText(
      "This submitted video stays attached if you cancel editing.",
    ),
  ).toBeVisible();
});
