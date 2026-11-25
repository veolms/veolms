import type { APIRequestContext, Page } from "@playwright/test";

import { PORTS } from "./support/ports";
import { Academy, expect, test } from "./support/test";

const API = `http://127.0.0.1:${PORTS.api}/v1`;
const isMemberRequest = (url: URL) =>
  url.pathname.includes("/chat/rooms/") && url.pathname.endsWith("/members");

async function openGroupChat(
  page: Page,
  request: APIRequestContext,
  academy: Academy,
  labels: string[],
) {
  const course = await academy.createCourse({
    title: "Mention Course",
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
    const opened = await request.get(`${API}/chat/rooms/${roomId}`, {
      headers: {
        cookie: `${learner.session.name}=${learner.session.value}`,
      },
    });
    const openedBody = await opened.text();
    expect(opened.ok(), openedBody).toBe(true);
  }

  await page.goto(`/chat/${roomId}`);
  const box = page.getByRole("textbox", { name: "Type a message" });
  await expect(box).toBeVisible();
  return { box, learners };
}

test("an admin finds group members with reordered multiword fuzzy mentions", async ({
  page,
  request,
  academy,
}) => {
  const { box, learners } = await openGroupChat(page, request, academy, [
    "JohnSmith",
    "JohnDoe",
    "SaraKhan",
    "SaraAli",
    "Nodejs",
    "ExtraOne",
    "ExtraTwo",
  ]);
  const person = (label: string) =>
    learners.find((learner) => learner.displayName.includes(label))!;
  const suggestion = (name: string) =>
    page.getByRole("button", { name: `@${name}`, exact: true });
  const memberSuggestions = page.getByRole("button", { name: /^@Flow /u });

  await box.pressSequentially("@smith john", { delay: 10 });
  await expect(suggestion(person("JohnSmith").displayName)).toBeVisible();
  await expect(suggestion(person("JohnDoe").displayName)).toHaveCount(0);

  await box.fill("");
  await box.pressSequentially("@khan sara", { delay: 10 });
  await expect(suggestion(person("SaraKhan").displayName)).toBeVisible();
  await expect(suggestion(person("SaraAli").displayName)).toHaveCount(0);

  await box.fill("");
  await box.pressSequentially("@nodejs", { delay: 10 });
  await expect(suggestion(person("Nodejs").displayName)).toBeVisible();

  await box.fill("");
  await box.pressSequentially("@", { delay: 10 });
  await expect(page.getByRole("button", { name: /@everyone/u })).toBeVisible();
  const count = await memberSuggestions.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(6);

  await box.fill("");
  await box.pressSequentially("@zzzznotfound", { delay: 10 });
  await expect(memberSuggestions).toHaveCount(0);
  await expect(page.getByText("No members found")).toBeVisible();
});

test("an admin inserts a multiword mention with Enter and keeps writing", async ({
  page,
  request,
  academy,
}) => {
  const { box, learners } = await openGroupChat(page, request, academy, [
    "JohnSmith",
    "JohnDoe",
  ]);
  const john = learners.find((learner) =>
    learner.displayName.includes("JohnSmith"),
  )!;
  const memberSuggestions = page.getByRole("button", { name: /^@Flow /u });
  const suggestion = (name: string) =>
    page.getByRole("button", { name: `@${name}`, exact: true });

  await box.pressSequentially("@smith john", { delay: 10 });
  await expect(suggestion(john.displayName)).toBeVisible();
  await box.press("Enter");
  await expect(box).toHaveValue(`@${john.displayName} `);
  await expect(memberSuggestions).toHaveCount(0);

  await box.pressSequentially("is here", { delay: 10 });
  await expect(box).toHaveValue(`@${john.displayName} is here`);
  await expect(memberSuggestions).toHaveCount(0);

  await box.fill("");
  await box.pressSequentially("@smith john", { delay: 10 });
  await expect(memberSuggestions).not.toHaveCount(0);
  await box.press(" ");
  await expect(memberSuggestions).toHaveCount(0);
  await box.pressSequentially("j", { delay: 10 });
  await expect(suggestion(john.displayName)).toBeVisible();
});

test("an admin sees no member suggestions while the group list loads", async ({
  page,
  request,
  academy,
}) => {
  const { box } = await openGroupChat(page, request, academy, ["JohnSmith"]);
  const memberSuggestions = page.getByRole("button", { name: /^@Flow /u });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => isMemberRequest(url),
    async (route) => {
      await gate;
      await route.continue();
    },
  );

  const memberRequest = page.waitForRequest((candidate) =>
    isMemberRequest(new URL(candidate.url())),
  );
  await box.pressSequentially("@", { delay: 10 });
  await memberRequest;
  await expect(memberSuggestions).toHaveCount(0);
  await expect(page.getByText("No members found")).toHaveCount(0);
  release();
  await expect(memberSuggestions).not.toHaveCount(0);
});

test("an admin cancels the mention picker with Escape without losing a reply", async ({
  page,
  request,
  academy,
}) => {
  const { box } = await openGroupChat(page, request, academy, ["JohnSmith"]);
  const memberSuggestions = page.getByRole("button", { name: /^@Flow /u });

  await box.fill("seed message");
  await box.press("Enter");
  const message = page
    .getByRole("log", { name: "Messages" })
    .getByText("seed message", { exact: true });
  await expect(message).toBeVisible();

  await message.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Reply" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel reply" }),
  ).toBeVisible();

  await box.pressSequentially("@", { delay: 10 });
  await expect(memberSuggestions).not.toHaveCount(0);
  await box.press("Escape");
  await expect(memberSuggestions).toHaveCount(0);
  await expect(box).toHaveValue("@");
  await expect(
    page.getByRole("button", { name: "Cancel reply" }),
  ).toBeVisible();

  await box.press("Escape");
  await expect(page.getByRole("button", { name: "Cancel reply" })).toHaveCount(
    0,
  );
});
