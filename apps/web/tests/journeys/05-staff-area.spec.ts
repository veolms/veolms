/**
 * The staff area (Orders, Students, Analytics, Coupons, Platform, Team):
 * open to the administrator, closed to learners and visitors. The API
 * refuses their requests as well (see apps/api/test/flows); these tests
 * check what the screens do about it.
 */
import type { Page } from "@playwright/test";

import { WEB_URL } from "./support/ports";
import {
  expect,
  openCoursePage,
  openSecondBrowser,
  test,
} from "./support/test";

/** Staff pages and the heading each one opens with. */
const STAFF_PAGES = [
  { path: "/orders", heading: "Orders" },
  { path: "/students", heading: "Students" },
  { path: "/analytics", heading: "Analytics" },
  { path: "/coupons", heading: "Coupons" },
  { path: "/platform", heading: "Platform" },
  { path: "/team", heading: "Team" },
];

const STAFF_MENU = [
  "Orders",
  "Students",
  "Analytics",
  "Coupons",
  "Platform",
  "Team",
];

function sidebar(page: Page) {
  return page.getByRole("complementary", { name: /navigation$/u });
}

test("a learner has no staff menu, and staff pages send them home or say access denied", async ({
  page,
  academy,
}) => {
  await academy.signedInLearner("snoop");

  await page.goto("/");
  await expect(sidebar(page)).toHaveAccessibleName("Student navigation");
  for (const item of STAFF_MENU) {
    await expect(
      sidebar(page).getByRole("button", { name: item, exact: true }),
    ).toHaveCount(0);
  }

  for (const path of ["/students", "/analytics", "/coupons", "/platform"]) {
    await page.goto(path);
    await expect(page, `${path} sends the learner home`).toHaveURL(
      `${WEB_URL}/`,
    );
  }

  await page.goto("/team");
  await expect(page.getByText("Access denied")).toBeVisible();

  // "Orders" for a learner is their own purchases, never the academy's.
  await page.goto("/orders");
  await expect(
    page.getByRole("main", { name: "Purchase History" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Orders", exact: true }),
  ).toHaveCount(0);
});

test("a visitor opening a staff page is asked to sign in, and lands on it once the administrator signs in", async ({
  page,
  academy,
}) => {
  await page.goto("/platform");

  // Not shown the page: the sign-in window opens, remembering where to go.
  const signIn = page.getByRole("dialog");
  await expect(signIn.getByRole("textbox", { name: "Email" })).toBeVisible();
  await expect(page).toHaveURL(/returnTo=%2Fplatform/u);
  await expect(
    page.getByRole("heading", { name: "Platform", exact: true }),
  ).toHaveCount(0);

  await signIn.getByRole("textbox", { name: "Email" }).fill("admin@flow.test");
  await signIn.getByRole("button", { name: "Continue with email" }).click();
  // Read the code once the email has gone out, not an older one.
  await expect(
    signIn.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Verification code" })
    .fill(await academy.emailedCode("admin@flow.test"));

  await expect(page).toHaveURL(`${WEB_URL}/platform`);
  await expect(
    page.getByRole("heading", { name: "Platform", exact: true }),
  ).toBeVisible();
});

test("the administrator has the staff menu, and every staff page opens", async ({
  page,
  academy,
}) => {
  await academy.signInAsAdmin();

  await page.goto("/");
  await expect(sidebar(page)).toHaveAccessibleName("Creator navigation");
  for (const item of STAFF_MENU) {
    await expect(
      sidebar(page).getByRole("button", { name: item, exact: true }),
    ).toBeVisible();
  }

  for (const { path, heading } of STAFF_PAGES) {
    await page.goto(path);
    await expect(page, `${path} stays open`).toHaveURL(`${WEB_URL}${path}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
  }
});

test("a learner's purchase shows in the administrator's Orders, and the learner in Students", async ({
  page,
  academy,
  browser,
}) => {
  const course = await academy.createCourse({
    title: "Python for Data",
    price: 1499,
  });
  const learner = await academy.signedInLearner("customer");

  // The learner buys the course.
  await openCoursePage(page, course);
  await page.getByRole("button", { name: "Pay Now" }).click();
  const paymentWindow = page.getByRole("dialog", { name: "Payment window" });
  await paymentWindow.getByRole("button", { name: "Pay" }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${course.slug}/`, "u"));

  // The administrator, in their own browser.
  const admin = await openSecondBrowser(browser, await academy.adminSession());
  try {
    await admin.page.goto("/orders");
    const orders = admin.page.getByRole("main", { name: "Orders" });
    await expect(orders).toContainText("Python for Data");
    await expect(orders).toContainText("₹1,499");

    await admin.page.goto("/students");
    const students = admin.page.getByRole("main", { name: "Students List" });
    await expect(students).toContainText(learner.displayName);
    await expect(students).toContainText(learner.email);
  } finally {
    await admin.context.close();
  }
});
