/**
 * Support as the team's queue, in the browser: a learner's report is
 * assigned with the Assignee picker, its status changed with the keyboard
 * (S, then a number), and an internal note edited, pinned and deleted from
 * its own actions. The API's side is in apps/api/test/flows.
 */
import type { Page } from "@playwright/test";

import { PORTS } from "./support/ports";
import { expect, test } from "./support/test";

const API_URL = `http://127.0.0.1:${PORTS.api}/v1`;

/** Saves a picture of the page when SUPPORT_SCREENSHOTS names a folder. */
async function snap(page: Page, name: string) {
  const folder = process.env.SUPPORT_SCREENSHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${name}.png` });
}

test("staff assign a report, change its status and work its notes", async ({
  page,
  context,
  academy,
}) => {
  // A learner reports a problem.
  await academy.signedInLearner("reporter");
  const reported = await context.request.post(`${API_URL}/support/tickets`, {
    data: {
      kind: "problem",
      category: "video",
      content: "The video lags even with a good connection",
      pageLabel: "Settings",
    },
  });
  expect(reported.status()).toBe(201);
  const { data: ticket } = (await reported.json()) as {
    data: { id: string; number: number };
  };

  await context.clearCookies();
  await academy.signInAsAdmin();
  await page.goto(`/support-inbox?ticket=${ticket.id}`);

  const panel = page.locator('[aria-label="Report details"]');
  const properties = panel.getByRole("region", { name: "Properties" });
  await expect(
    panel.getByRole("heading", {
      name: "The video lags even with a good connection",
    }),
  ).toBeVisible();
  await expect(panel.getByText(`#${ticket.number}`).first()).toBeVisible();

  // Assigned to oneself from the picker.
  await properties.getByRole("button", { name: "Assignee" }).click();
  await snap(page, "assignee-picker");
  await page
    .getByRole("option", { name: /\(you\)/u })
    .first()
    .click();
  await expect(
    properties.getByRole("button", { name: "Assignee" }),
  ).toContainText("(you)");
  await expect(panel.getByText(/assigned this to themselves/u)).toBeVisible();

  // S opens Status; 2 picks "In progress".
  await panel.getByRole("heading", { level: 2 }).click();
  await page.keyboard.press("s");
  await expect(page.getByRole("listbox", { name: "Status" })).toBeVisible();
  await snap(page, "status-picker");
  await page.keyboard.press("2");
  await expect(
    properties.getByRole("button", { name: "Status" }),
  ).toContainText("In progress");
  await expect(panel.getByText(/changed status Open/u)).toBeVisible();

  // The card in the list carries the assignee.
  await expect(
    page.getByRole("button", { name: /The video lags/u }).first(),
  ).toContainText("Assigned to");

  // An internal note: added, edited, pinned, then deleted.
  await panel.getByRole("tab", { name: "Internal note" }).click();
  const editor = panel.getByRole("textbox", { name: "Internal note" });
  await editor.click();
  await page.keyboard.type("Reproduced at 1.5x speed");
  await panel.getByRole("button", { name: "Add note" }).click();
  const note = panel.locator("li[id^=support-note-]").first();
  await expect(note).toContainText("Reproduced at 1.5x speed");

  await note.hover();
  await note.getByRole("button", { name: "Edit note" }).click();
  const noteEditor = note.getByRole("textbox", { name: "Edit note" });
  await noteEditor.fill("Reproduced at 1.5x speed on 1080p");
  await page.keyboard.press("Control+Enter");
  await expect(note).toContainText("on 1080p");
  await expect(note).toContainText("(edited)");

  await note.hover();
  await note.getByRole("button", { name: "Pin to top" }).click();
  await expect(note).toContainText("Pinned");
  await snap(page, "activity");

  await note.hover();
  await note.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Delete note" }).click();
  await expect(note.getByRole("alertdialog")).toContainText("can't be undone");
  await snap(page, "delete-confirm");
  await note.getByRole("button", { name: "Delete note" }).click();
  await expect(panel.getByText("on 1080p")).toHaveCount(0);
  await expect(panel.getByText(/deleted a note/u)).toBeVisible();

  // "Assigned to me" lists it.
  await page.getByRole("button", { name: /Assigned to me/u }).click();
  await expect(
    page.getByRole("button", { name: /The video lags/u }).first(),
  ).toBeVisible();
  await snap(page, "list");
});
