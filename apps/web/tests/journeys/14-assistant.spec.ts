/**
 * The chat assistant ("Claude"), as an admin uses it: open it from Chats,
 * start a bug-fix request, follow its status card as the agent works, stop
 * it, and read the answer. The test plays the agent service through the
 * agent API (the real agent runs Claude Code on another server). A learner
 * never sees the assistant.
 */
import type { APIRequestContext } from "@playwright/test";

import { PORTS } from "./support/ports";
import { expect, test } from "./support/test";

/** The agent token the test API was started with (assistant-env.ts). */
const AGENT_TOKEN = "flow-agent-token-0123456789abcdef0123456789abcdef";
const API = `http://127.0.0.1:${PORTS.api}/v1`;
const headers = { authorization: `Assistant ${AGENT_TOKEN}` };

type InboxItem =
  | { kind: "message"; roomId: string; seq: number; body: string }
  | { kind: "stop"; roomId: string; cardId: string };

async function waitForInbox(
  request: APIRequestContext,
  match: (item: InboxItem) => boolean,
): Promise<InboxItem> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(
      `${API}/assistant/agent/inbox?waitSeconds=2`,
      {
        headers,
      },
    );
    expect(response.status()).toBe(200);
    const items = ((await response.json()) as { data: { items: InboxItem[] } })
      .data.items;
    const found = items.find(match);
    if (found) return found;
  }
  throw new Error("The agent's inbox never got the item");
}

async function agentCall(
  request: APIRequestContext,
  method: "post" | "patch",
  path: string,
  data: unknown,
) {
  const response = await request[method](`${API}${path}`, { headers, data });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(
    true,
  );
  return response;
}

test("an admin asks Claude to fix a bug, follows its card, stops it and reads the answer", async ({
  page,
  academy,
  request,
}) => {
  await academy.signInAsAdmin();
  await page.goto("/chat");

  await page.getByRole("button", { name: /Claude.*tap to start/u }).click();
  await expect(page.getByText(/Tell Claude what you need/u)).toBeVisible();

  // Picking a job type starts the message with it.
  await page.getByRole("button", { name: /Fix a bug/u }).click();
  const box = page.getByRole("textbox").last();
  await expect(box).toHaveValue("fix: ");
  await box.fill("fix: the quiz timer skips a second");
  await box.press("Enter");

  // The agent picks the message up, posts a card and works on it.
  const item = await waitForInbox(
    request,
    (i) =>
      i.kind === "message" && i.body === "fix: the quiz timer skips a second",
  );
  if (item.kind !== "message") throw new Error("expected a message");
  await agentCall(request, "post", "/assistant/agent/inbox/ack", {
    messages: [{ roomId: item.roomId, seq: item.seq }],
  });
  const cardId = crypto.randomUUID();
  await agentCall(request, "post", "/assistant/agent/cards", {
    id: cardId,
    roomId: item.roomId,
    requestSeq: item.seq,
    kind: "fix",
    title: "The quiz timer skips a second",
  });
  await agentCall(request, "patch", `/assistant/agent/cards/${cardId}`, {
    state: "running",
    steps: [
      { label: "Queued", state: "done" },
      { label: "Reading the code", state: "active" },
    ],
  });

  const card = page.getByRole("region", {
    name: "Bug fix: The quiz timer skips a second",
  });
  await expect(card).toBeVisible();
  await expect(card.getByText("Reading the code")).toBeVisible();
  await expect(card.getByText("Working")).toBeVisible();

  // Stop reaches the agent, which ends the job.
  await card.getByRole("button", { name: "Stop" }).click();
  await expect(card.getByRole("button", { name: /Stopping/u })).toBeVisible();
  const stop = await waitForInbox(
    request,
    (i) => i.kind === "stop" && i.cardId === cardId,
  );
  expect(stop.kind).toBe("stop");
  await agentCall(request, "post", "/assistant/agent/inbox/ack", {
    stops: [cardId],
  });
  await agentCall(request, "patch", `/assistant/agent/cards/${cardId}`, {
    state: "stopped",
    steps: [
      { label: "Queued", state: "done" },
      { label: "Reading the code", state: "skipped" },
    ],
  });
  await expect(card.getByText("Stopped")).toBeVisible();
  await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);

  // A written answer arrives as a normal message from Claude.
  await agentCall(
    request,
    "post",
    `/assistant/agent/rooms/${item.roomId}/messages`,
    {
      clientId: crypto.randomUUID(),
      body: "Stopped. The timer restarts when the tab loses focus.",
    },
  );
  await expect(
    page
      .getByRole("log", { name: "Messages" })
      .getByText("Stopped. The timer restarts when the tab loses focus."),
  ).toBeVisible();

  // Back in Chats, the assistant's chat is now a normal (pinned) chat.
  await page.goto("/chat");
  await expect(
    page.getByRole("button", { name: /Claude.*tap to start/u }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Chats" }).getByText("Claude"),
  ).toBeVisible();
});

test("a learner never sees Claude in Chats", async ({ page, academy }) => {
  await academy.signedInLearner("noclaude");
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "Chats", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/tap to start/u)).toHaveCount(0);
  await expect(page.getByText("Claude", { exact: true })).toHaveCount(0);
});

test("right-clicking a message near the composer keeps the chat input usable", async ({
  page,
  academy,
}) => {
  await academy.signInAsAdmin();
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "Chats", level: 1 }),
  ).toBeVisible();
  const startClaude = page.getByRole("button", {
    name: /Claude.*tap to start/u,
  });
  if (await startClaude.count()) {
    await startClaude.click();
    await expect(page.getByText(/Tell Claude what you need/u)).toBeVisible();
  } else {
    await page
      .getByRole("list", { name: "Chats" })
      .getByText("Claude", { exact: true })
      .click();
  }

  const log = page.getByRole("log", { name: "Messages" });
  await expect(log).toBeVisible();
  const composer = page.getByPlaceholder("Type a message");
  const menu = page.getByRole("menu", { name: "Message options" });
  const expectMenuAboveComposer = async () => {
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    const composerBox = await composer.boundingBox();
    if (!menuBox || !composerBox)
      throw new Error("missing menu or composer box");
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(composerBox.y);
  };
  const first = "menu layout check one";
  const middle = "menu layout check three";
  const last = "menu layout check five";
  const bodies = [
    first,
    "menu layout check two",
    middle,
    "menu layout check four",
    last,
  ];
  for (const body of bodies) {
    await composer.fill(body);
    await composer.press("Enter");
    await expect(log.getByText(body, { exact: true })).toBeVisible();
  }

  for (const body of [first, middle, last]) {
    const message = log.getByText(body, { exact: true });
    await message.scrollIntoViewIfNeeded();
    await message.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Reply" })).toBeVisible();
    await expectMenuAboveComposer();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Reply" })).toHaveCount(0);
  }

  const bottom = log.getByText(last, { exact: true });
  await bottom.scrollIntoViewIfNeeded();
  await bottom.click({ button: "right" });
  await expectMenuAboveComposer();
  await page.getByRole("menuitem", { name: "Reply" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel reply" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel reply" }).click();

  await bottom.click({ button: "right" });
  await expectMenuAboveComposer();
  await page.keyboard.press("Escape");
  await composer.click();
  await expect(composer).toBeFocused();
  await composer.fill("composer still works");
  await composer.press("Enter");
  await expect(
    log.getByText("composer still works", { exact: true }),
  ).toBeVisible();
});
