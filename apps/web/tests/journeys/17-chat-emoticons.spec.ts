import type { Locator, Page } from "@playwright/test";

import { PORTS } from "./support/ports";
import { Academy, expect, test } from "./support/test";

const API = `http://127.0.0.1:${PORTS.api}/v1`;

async function setCaret(box: Locator, position: number) {
  await box.evaluate((element, at) => {
    const area = element as HTMLTextAreaElement;
    area.focus();
    area.setSelectionRange(at, at);
  }, position);
}

async function openChat(page: Page, academy: Academy) {
  const course = await academy.createCourse({
    title: "Emoticon Course",
    pricing: "free",
  });
  await academy.signInAsAdmin();
  const created = await page.request.post(
    `${API}/chat/courses/${course.id}/room`,
  );
  const body = await created.text();
  expect(created.ok(), body).toBe(true);
  const roomId = (JSON.parse(body) as { data: { room: { id: string } } }).data
    .room.id;

  await page.goto(`/chat/${roomId}`);
  const box = page.getByRole("textbox", { name: "Type a message" });
  await expect(box).toBeVisible();
  return box;
}

function emojiListbox(page: Page) {
  return page.getByRole("listbox", { name: "Emoji suggestions" });
}

function emojiOptions(page: Page) {
  return emojiListbox(page).getByRole("option");
}

test("a person picks common emoticons explicitly", async ({
  page,
  academy,
}) => {
  const box = await openChat(page, academy);
  const cases = [
    [":)", "🙂"],
    [":-)", "🙂"],
    [":D", "😃"],
    [":-D", "😃"],
    [":(", "🙁"],
    [":-(", "🙁"],
    [":|", "😐"],
    [":-|", "😐"],
    [";)", "😉"],
    [":P", "😛"],
    [":-P", "😛"],
    [":O", "😮"],
    [":o", "😮"],
    [":/", "😕"],
    ["<3", "❤️"],
    [`:'(`, "😢"],
    [`:'-(`, "😢"],
    ["XD", "🤣"],
    ["xd", "🤣"],
  ] as const;

  const options = emojiOptions(page);
  for (const [emoticon, emoji] of cases) {
    await box.fill("");
    await box.pressSequentially(emoticon, { delay: 5 });
    await expect(box).toHaveValue(emoticon);
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveText(emoji);
    await box.press("Enter");
    await expect(box).toHaveValue(emoji);
    await expect(options).toHaveCount(0);
  }
});

test("an emoticon replaces only its text in the middle of a message", async ({
  page,
  academy,
}) => {
  const box = await openChat(page, academy);
  await box.fill("Hello  everyone");
  await setCaret(box, 6);

  const options = emojiOptions(page);
  await box.pressSequentially(":)");
  await expect(options).toHaveCount(1);
  await box.press("Enter");
  await expect(box).toHaveValue("Hello 🙂 everyone");
});

test("arrows, mouse selection and Escape work with emoticon suggestions", async ({
  page,
  academy,
}) => {
  const box = await openChat(page, academy);
  const options = emojiOptions(page);

  await box.pressSequentially(";)");
  await expect(options.first()).toBeVisible();
  const listboxId = await emojiListbox(page).getAttribute("id");
  const optionId = await options.first().getAttribute("id");
  expect(listboxId && optionId).toBeTruthy();
  await expect(box).toHaveAttribute("aria-controls", listboxId!);
  await expect(box).toHaveAttribute("aria-activedescendant", optionId!);
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await box.press("ArrowDown");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await expect(box).toHaveAttribute("aria-activedescendant", optionId!);
  await options.first().click();
  await expect(box).toHaveValue("😉");

  await box.fill("bye :P");
  await expect(options.first()).toBeVisible();
  await box.press("Escape");
  await expect(options).toHaveCount(0);
  await expect(box).not.toHaveAttribute("aria-controls");
  await expect(box).not.toHaveAttribute("aria-activedescendant");
  await expect(box).toHaveValue("bye :P");
});

test("URLs, word colons and incomplete expressions do not suggest emoticons", async ({
  page,
  academy,
}) => {
  const box = await openChat(page, academy);
  const options = emojiOptions(page);

  await box.fill(":");
  await expect(options).toHaveCount(8);

  await box.fill("Visit https://example.com:8080 and meet at 12:30 note:this");
  await expect(options).toHaveCount(0);

  await box.fill(":-");
  await expect(options).toHaveCount(0);
  await box.pressSequentially("D");
  await expect(options).toHaveCount(1);
  await box.press("Enter");
  await expect(box).toHaveValue("😃");
});

test("shortcode autocomplete still works alongside emoticons", async ({
  page,
  academy,
}) => {
  const box = await openChat(page, academy);
  await box.pressSequentially(":funny", { delay: 10 });

  const options = emojiOptions(page);
  await expect(options.first()).toBeVisible();
  expect(await options.count()).toBeGreaterThan(1);
  await box.press("Enter");
  await expect(box).not.toHaveValue(":funny");
  await expect(options).toHaveCount(0);
});
