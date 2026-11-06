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
