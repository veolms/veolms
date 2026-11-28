import type { Locator, Page } from "@playwright/test";

import { PORTS } from "./support/ports";
import { Academy, expect, test, type TestLearner } from "./support/test";

const API = `http://127.0.0.1:${PORTS.api}/v1`;

async function setCaret(box: Locator, position: number) {
  await box.evaluate((element, at) => {
    const area = element as HTMLTextAreaElement;
    area.focus();
    area.setSelectionRange(at, at);
  }, position);
}

async function openChat(page: Page, academy: Academy, labels: string[] = []) {
  const course = await academy.createCourse({
    title: "Emoji Shortcode Course",
    pricing: "free",
  });
  const learners = await Promise.all(
    labels.map((label) => academy.createLearner(label)),
  );
  await Promise.all(
    learners.map((learner) => academy.giveCourse(learner, course)),
  );

  await academy.signInAsAdmin();
  const created = await page.request.post(
    `${API}/chat/courses/${course.id}/room`,
  );
  const body = await created.text();
  expect(created.ok(), body).toBe(true);
  const roomId = (JSON.parse(body) as { data: { room: { id: string } } }).data
    .room.id;

  for (const learner of learners) {
    const opened = await page.request.get(`${API}/chat/rooms/${roomId}`, {
      headers: { cookie: `${learner.session.name}=${learner.session.value}` },
    });
    const openedBody = await opened.text();
    expect(opened.ok(), openedBody).toBe(true);
  }

  await page.goto(`/chat/${roomId}`);
  const box = page.getByRole("textbox", { name: "Type a message" });
  await expect(box).toBeVisible();
  return { box, learners };
}

function emojiOptions(page: Page) {
  return page
    .getByRole("listbox", { name: "Emoji suggestions" })
    .getByRole("option");
}

async function optionEmoji(option: Locator) {
  const emoji = (await option.textContent())?.trim();
  expect(Boolean(emoji)).toBe(true);
  return emoji!;
}

test("a person inserts an emoji with its shortcode and keeps writing", async ({
  page,
  academy,
}) => {
  const { box } = await openChat(page, academy);
  await box.pressSequentially(":funny", { delay: 10 });

  const options = emojiOptions(page);
  await expect(options.first()).toBeVisible();
  const emoji = await optionEmoji(options.first());

  await box.press("Enter");
  await expect(box).toHaveValue(emoji);
  await expect(options).toHaveCount(0);

  await box.pressSequentially(" great");
  await expect(box).toHaveValue(`${emoji} great`);
});

test("a bare colon offers popular emoji and Escape keeps the colon", async ({
  page,
  academy,
}) => {
  const { box } = await openChat(page, academy);
  await box.press(":");

  const options = emojiOptions(page);
  await expect(options).toHaveCount(8);
  await box.press("Escape");
  await expect(options).toHaveCount(0);
  await expect(box).toHaveValue(":");
});

test("arrow keys change the highlighted emoji and a click keeps later text", async ({
  page,
  academy,
}) => {
  const { box } = await openChat(page, academy);
  await box.pressSequentially(":funny", { delay: 10 });

  const options = emojiOptions(page);
  await expect(options.nth(1)).toBeVisible();
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await box.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  const highlighted = await optionEmoji(options.nth(1));
  await box.press("Enter");
  await expect(box).toHaveValue(highlighted);

  await box.fill("Hi  please review");
  await setCaret(box, 3);
  await box.pressSequentially(":fire", { delay: 10 });
  await expect(options.first()).toBeVisible();
  const picked = await optionEmoji(options.first());
  await options.first().click();
  await expect(box).toHaveValue(`Hi ${picked} please review`);
});

test("a person can pick a skin-tone emoji by shortcode", async ({
  page,
  academy,
}) => {
  const { box } = await openChat(page, academy);
  await box.pressSequentially(":thumbsupskintone4", { delay: 5 });

  const options = emojiOptions(page);
  await expect(options.first()).toBeVisible();
  const tone = await optionEmoji(options.first());
  expect(tone).toContain("👍");

  await box.press("Enter");
  await expect(box).toHaveValue(tone);
});

test("colons in links and times do not open shortcode suggestions", async ({
  page,
  academy,
}) => {
  const { box } = await openChat(page, academy);
  await box.fill("See https://example.com:8080 at 12:30");

  const options = emojiOptions(page);
  await expect(options).toHaveCount(0);

  await box.pressSequentially(" :fi", { delay: 10 });
  await expect(options.first()).toBeVisible();
  await expect(box).toHaveValue("See https://example.com:8080 at 12:30 :fi");

  await box.fill("See https://example.com:8080 at 12:30 :P");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toHaveAttribute(
    "aria-label",
    "face with tongue",
  );
});

test("emoji suggestions stay separate from mentions and the full picker", async ({
  page,
  academy,
}) => {
  const { box, learners } = await openChat(page, academy, ["JohnSmith"]);
  const mention = page.getByRole("button", {
    name: `@${learners[0]!.displayName}`,
    exact: true,
  });

  await box.pressSequentially("@smith", { delay: 10 });
  await expect(mention).toBeVisible();
  await box.press(" ");

  const options = emojiOptions(page);
  await expect(options).toHaveCount(0);
  await box.pressSequentially(":fi", { delay: 10 });
  await expect(options.first()).toBeVisible();
  await expect(mention).toHaveCount(0);

  await page.getByRole("button", { name: "Emoji", exact: true }).click();
  await expect(options).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Emoji" })).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("Enter inserts the highlighted emoji instead of sending", async ({
    page,
    academy,
  }) => {
    const { box } = await openChat(page, academy);
    await box.pressSequentially(":funny", { delay: 10 });

    const options = emojiOptions(page);
    await expect(options.first()).toBeVisible();
    const emoji = await optionEmoji(options.first());
    await box.press("Enter");
    await expect(box).toHaveValue(emoji);
  });
});
