/**
 * The Students page keeps its search in the address (`?q=`): opening a
 * student and coming back with "Back to Students" shows the same search and
 * results, and so does a reload.
 */
import { expect, test } from "./support/test";

test("the students search survives opening a student, Back and a reload", async ({
  page,
  academy,
}) => {
  const learner = await academy.createLearner("searchkeep");
  await academy.signInAsAdmin();

  await page.goto("/students");
  const search = page.locator("#students-search-input");
  await search.fill(learner.username);
  await expect(page).toHaveURL(
    new RegExp(`[?&]q=${learner.username}(&|$)`, "u"),
  );
  const row = page.getByText(learner.displayName, { exact: true }).first();
  await expect(row).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(
    new RegExp(`/students/${learner.username}$`, "u"),
  );
  await page.getByRole("button", { name: "Back to Students" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/students\\?q=${learner.username}$`, "u"),
  );
  await expect(search).toHaveValue(learner.username);
  await expect(
    page.getByText(learner.displayName, { exact: true }).first(),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator("#students-search-input")).toHaveValue(
    learner.username,
  );
});
