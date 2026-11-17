/**
 * Bundles, bought inside checkout: the administrator makes one from a
 * course's Pricing step, and a learner picks it on that course's price card
 * instead of the course alone. Someone who owns part of it pays only for the
 * rest. The payment window is the stand-in for Razorpay's, as in
 * 03-buying-a-course.
 */
import type { Page } from "@playwright/test";

import {
  expect,
  expectVideoToPlay,
  openCoursePage,
  openLesson,
  test,
  type Academy,
  type TestCourse,
} from "./support/test";

function pricing(page: Page) {
  return page.getByRole("region", { name: "Course pricing and enrollment" });
}

function paymentWindow(page: Page) {
  return page.getByRole("dialog", { name: "Payment window" });
}

function whatToBuy(page: Page) {
  return pricing(page).getByRole("radiogroup", { name: "What to buy" });
}

/** As the administrator: a bundle of `courses`, made from the first one's Pricing step. */
async function makeBundle(
  page: Page,
  academy: Academy,
  title: string,
  courses: readonly TestCourse[],
  price: number,
) {
  const [first, ...others] = courses;
  await academy.signInAsAdmin();
  await page.goto(`/courses/${first!.id}/edit/pricing`);
  await page.getByRole("button", { name: "Make a bundle" }).click();
  await page.getByLabel("Bundle name").fill(title);
  for (const course of others) {
    await page
      .getByRole("checkbox", { name: new RegExp(course.title, "u") })
      .click();
  }
  await page.getByLabel("Bundle price").fill(String(price));
  await page.getByRole("button", { name: "Save bundle" }).click();
  // Saved: the Pricing step lists it, live.
  await expect(
    page.getByRole("listitem").filter({ hasText: title }),
  ).toContainText("Live");
  await page.context().clearCookies();
}

async function payInTheWindow(page: Page, amount: string) {
  await pricing(page).getByRole("button", { name: "Pay Now" }).click();
  await expect(paymentWindow(page)).toContainText(`Amount: ${amount}`);
  await paymentWindow(page).getByRole("button", { name: "Pay" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment successful" }),
  ).toBeVisible({ timeout: 15_000 });
}

test("a learner buys a bundle from a course's price card: they pay the bundle's price, and every course in it plays", async ({
  page,
  academy,
}) => {
  const backend = await academy.createCourse({
    title: "Bundle Backend",
    price: 1499,
  });
  const testing = await academy.createCourse({
    title: "Bundle Testing",
    price: 1999,
  });
  await makeBundle(
    page,
    academy,
    "Backend and Testing",
    [backend, testing],
    2499,
  );

  await academy.signedInLearner("bundle_buyer");
  await openCoursePage(page, backend);

  // The course alone is chosen first; the bundle is offered beside it with
  // what it saves.
  await expect(
    whatToBuy(page).getByRole("radio", { name: /^This course/u }),
  ).toBeChecked();
  const bundle = whatToBuy(page).getByRole("radio", {
    name: /Backend and Testing/u,
  });
  await expect(bundle).toContainText("₹2,499");
  await expect(bundle).toContainText("You save ₹999");

  await bundle.click();
  await expect(pricing(page)).toContainText("Total payable");
  await expect(pricing(page)).toContainText("₹2,499");
  await payInTheWindow(page, "₹2,499");

  // Both courses are open.
  for (const course of [backend, testing]) {
    await openLesson(page, course, 2);
    await expectVideoToPlay(page);
  }
});

test("a learner who owns one course of a bundle is offered the rest, pays only for it, and gets it", async ({
  page,
  academy,
}) => {
  const design = await academy.createCourse({
    title: "Owned Design",
    price: 1499,
  });
  const scaling = await academy.createCourse({
    title: "Owned Scaling",
    price: 1999,
  });
  await makeBundle(
    page,
    academy,
    "Design and Scaling",
    [design, scaling],
    2499,
  );

  // They bought the first course on its own, earlier.
  await academy.signedInLearner("bundle_owner");
  await openCoursePage(page, design);
  await payInTheWindow(page, "₹1,499");

  // On the other course: "Complete the bundle" for the rest. Their course's
  // share of the bundle price (₹1,071) comes off: ₹2,499 − ₹1,071.
  await openCoursePage(page, scaling);
  const rest = whatToBuy(page).getByRole("radio", {
    name: /Complete the bundle/u,
  });
  await expect(rest).toContainText("You own Owned Design");
  await expect(rest).toContainText("₹1,428");
  await rest.click();
  await payInTheWindow(page, "₹1,428");

  await openLesson(page, scaling, 2);
  await expectVideoToPlay(page);
});
