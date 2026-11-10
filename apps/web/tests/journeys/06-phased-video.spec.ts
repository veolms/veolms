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
