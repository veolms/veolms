/**
 * A lesson holds a video, an audio file, an image and a document, and
 * learners see the one its creator selected. The creator switches a video
 * lesson to Doc, writes its reading with the formatting toolbar, and saves;
 * a learner reads it. The creator then uploads an audio file under Audio
 * and selects it; the learner listens. The video is kept throughout.
 *
 * The test API keeps uploaded files in memory (fake-object-storage.ts): a
 * browser's upload to the link the API signed is handed to it here, and a
 * signed link to read a file is answered with a short test sound.
 */
import type { BrowserContext, Page } from "@playwright/test";

import { CONTROL_URL } from "./support/ports";
import {
  expect,
  openCoursePage,
  openLesson,
  test,
  waitForProgressSave,
  type TestCourse,
} from "./support/test";

/** Three seconds of a quiet tone, as a WAV file. */
function testSound(): Buffer {
  const rate = 8000;
  const samples = rate * 3;
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    data.writeInt16LE(
      Math.round(Math.sin((index / rate) * 2 * Math.PI * 440) * 3000),
      index * 2,
    );
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A 2×2 red PNG. */
const TEST_PICTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==",
  "base64",
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

/** Stands in for object storage on the test API's signed links. */
async function serveStorage(context: BrowserContext) {
  const sound = testSound();
  // A lesson's files are stored privately and are not on the CDN: the
  // editor must not depend on it to show them (as it once did, showing an
  // empty frame), so here the CDN refuses them.
  await context.route("http://127.0.0.1:4190/protected/**", (route) =>
    route.fulfill({ status: 403, headers: CORS }),
  );
  await context.route("http://127.0.0.1:9/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers: CORS });
      return;
    }
    if (request.method() === "PUT") {
      const received = await fetch(`${CONTROL_URL}/storage/uploads`, {
        method: "POST",
        body: JSON.stringify({ url: request.url() }),
      });
      await route.fulfill({ status: received.ok ? 200 : 500, headers: CORS });
      return;
    }
    const isPicture = request.url().includes("/thumbnails/");
    await route.fulfill({
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": isPicture ? "image/png" : "audio/wav",
      },
      body: isPicture ? TEST_PICTURE : sound,
    });
  });
}

async function openLessonEditor(page: Page, course: TestCourse) {
  await page.goto(`/courses/${course.id}/edit/curriculum`);
  await page.getByText("1. RegEx Project Ideas").click({ timeout: 90_000 });
  await expect(page.getByRole("radio", { name: /^Doc/ })).toBeVisible();
}

function saveLesson(page: Page) {
  return page.getByRole("button", { name: "Save", exact: true }).click();
}

test("a creator writes a reading and adds audio to a video lesson, and learners see the one selected", async ({
  page,
  context,
  academy,
}) => {
  // Three trips through the editor and two through the lesson page.
  test.setTimeout(240_000);
  await serveStorage(context);
  const course = await academy.createCourse({
    title: "Regular Expressions",
    pricing: "free",
    lessons: [{ title: "RegEx Project Ideas", preview: true }],
  });
  await academy.signInAsAdmin();

  // Doc is open to choose; the video lesson becomes a written reading.
  await openLessonEditor(page, course);
  await page.getByRole("radio", { name: /^Doc/ }).click();
  await page.getByRole("radio", { name: "Write text" }).click();
  const editor = page.getByRole("textbox", { name: "Reading" });
  await editor.click();
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await page.keyboard.type("Project ideas");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("A log file parser");
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Project ideas", exact: true }),
  ).toBeVisible();

  const readingSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/contents/document") &&
      response.request().method() === "PUT",
  );
  await saveLesson(page);
  expect((await readingSaved).status()).toBe(200);

  // A learner reads it, as written.
  const learner = await academy.signedInLearner("reader");
  await academy.giveCourse(learner, course);
  await openLesson(page, course, 1);
  await expect(
    page.getByRole("heading", { name: "Project ideas", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("A log file parser")).toBeVisible();

  // The creator adds audio under Audio and selects it.
  await academy.signInAsAdmin();
  await openLessonEditor(page, course);
  await expect(
    page.getByRole("radio", { name: /^Doc, has content/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /^Video, has content/ }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /^Audio/ }).click();
  const attached = page.waitForResponse(
    (response) =>
      response.url().includes("/contents/audio") &&
      response.request().method() === "PUT",
  );
  await page.locator('input[aria-label="Upload lesson media"]').setInputFiles({
    name: "intro.wav",
    mimeType: "audio/wav",
    buffer: testSound(),
  });
  expect((await attached).status()).toBe(200);
  await expect(page.getByText("intro.wav")).toBeVisible();
  // The creator hears it before choosing it.
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const selected = page.waitForResponse(
    (response) =>
      /\/lessons\/[^/]+$/u.test(new URL(response.url()).pathname) &&
      response.request().method() === "PATCH",
  );
  await saveLesson(page);
  expect((await selected).ok()).toBe(true);

  // The learner now listens, in the lesson player itself; the reading
  // waits under Doc. Listening to the end finishes the lesson, as watching
  // a video does (opening it is not enough).
  await academy.signInAs(learner);
  await openLesson(page, course, 1);
  await expect(
    page.getByRole("region", { name: /^Lesson audio player/u }),
  ).toBeVisible({ timeout: 60_000 });
  const lessonId = course.lessons[0]!.id;
  const finished = waitForProgressSave(page, (lessons) =>
    lessons.some(
      (lesson) =>
        lesson.lessonId === lessonId && lesson.progressPercent === 100,
    ),
  );
  const playOrPause = page.getByRole("button", { name: /^(Play|Pause)$/u });
  await expect(playOrPause).toBeVisible();
  if (
    (await page.getByRole("button", { name: "Pause", exact: true }).count()) ===
    0
  ) {
    await playOrPause.click();
  }
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const media = [...document.querySelectorAll("video")].find(
            (element) => element.currentSrc !== "",
          );
          return media ? media.currentTime : -1;
        }),
      { timeout: 25_000 },
    )
    .toBeGreaterThan(1);
  await finished;

  // Back in the editor every kind still holds its content.
  await academy.signInAsAdmin();
  await openLessonEditor(page, course);
  for (const kind of ["Video", "Audio", "Doc"]) {
    await expect(
      page.getByRole("radio", { name: new RegExp(`^${kind}, has content`) }),
    ).toBeVisible();
  }
});

test("a document takes a Markdown, text or HTML file as its reading, to edit, and keeps the text it replaced", async ({
  page,
  academy,
}) => {
  test.setTimeout(240_000);
  const course = await academy.createCourse({
    title: "Regular Expressions",
    pricing: "free",
    lessons: [{ title: "RegEx Project Ideas", preview: true }],
  });
  await academy.signInAsAdmin();
  await openLessonEditor(page, course);
  await page.getByRole("radio", { name: /^Doc/ }).click();

  // A Markdown file on the document's upload area becomes the reading.
  await page.locator('input[aria-label="Upload lesson media"]').setInputFiles({
    name: "ideas.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("## Project ideas\n\n- A log file parser\n"),
  });
  const editor = page.getByRole("textbox", { name: "Reading" });
  await expect(editor).toContainText("A log file parser");

  // A web page is imported over it as Markdown, its script dropped; the
  // text it replaced can be brought back.
  await page
    .locator('input[aria-label="Import a Markdown, text or HTML file"]')
    .setInputFiles({
      name: "page.html",
      mimeType: "text/html",
      buffer: Buffer.from(
        "<h2>From the web</h2><script>window.hacked = true</script><p>Hello <strong>there</strong></p>",
      ),
    });
  await expect(editor).toContainText("From the web");
  await expect(editor).not.toContainText("hacked");
  await expect(
    page.getByText("Imported page.html in place of your text."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore previous text" }).click();
  await expect(editor).toContainText("A log file parser");

  // A Word file is turned away with what to do instead.
  await page.locator('input[aria-label="Upload lesson media"]').setInputFiles({
    name: "notes.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("not really a docx"),
  });
  await expect(page.getByText(/Export the document as a PDF/u)).toBeVisible();

  const readingSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/contents/document") &&
      response.request().method() === "PUT",
  );
  await saveLesson(page);
  expect((await readingSaved).status()).toBe(200);

  await academy.signedInLearner("reader");
  await openLesson(page, course, 1);
  await expect(
    page.getByRole("heading", { name: "Project ideas", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
});

test("an image lesson shows its picture to the creator and, once selected, to learners", async ({
  page,
  context,
  academy,
}) => {
  test.setTimeout(240_000);
  await serveStorage(context);
  const course = await academy.createCourse({
    title: "Regular Expressions",
    pricing: "free",
    lessons: [{ title: "RegEx Project Ideas", preview: true }],
  });
  await academy.signInAsAdmin();
  await openLessonEditor(page, course);
  await page.getByRole("radio", { name: /^Image/ }).click();
  const attached = page.waitForResponse(
    (response) =>
      response.url().includes("/contents/image") &&
      response.request().method() === "PUT",
  );
  await page.locator('input[aria-label="Upload lesson media"]').setInputFiles({
    name: "diagram.png",
    mimeType: "image/png",
    buffer: TEST_PICTURE,
  });
  expect((await attached).status()).toBe(200);
  await expect(page.getByText("diagram.png")).toBeVisible();

  // The creator sees the picture itself, not an empty frame.
  const preview = page.getByRole("img", { name: "Lesson image preview" });
  await expect
    .poll(() =>
      preview.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);

  await saveLesson(page);
  await academy.signedInLearner("viewer");
  await openLesson(page, course, 1);
  const picture = page.getByRole("img", { name: "Lesson image" });
  await expect
    .poll(
      () => picture.evaluate((image: HTMLImageElement) => image.naturalWidth),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);

  // The course page lists it as an image lesson, not a video.
  await openCoursePage(page, course);
  await page.getByRole("button", { name: "Expand all sections" }).click();
  const lessonRow = page.getByRole("button", { name: /RegEx Project Ideas/u });
  await expect(lessonRow).toContainText("Image", { timeout: 60_000 });
  await expect(lessonRow).not.toContainText("Video");
});
