/**
 * Buying a course and joining a free one, on the course's page.
 *
 * The payment window is a stand-in for Razorpay's (see
 * support/fake-razorpay-checkout.js), but everything around it is real: the
 * order is made by the API, the payment is signed with the gateway's
 * secret, and the API checks that signature before it opens the course.
 */
import type { Page } from "@playwright/test";

import {
  expect,
  expectNoVideo,
  expectVideoToPlay,
  lessonInList,
  openCoursePage,
  openLesson,
  test,
  type TestCourse,
} from "./support/test";

function pricing(page: Page) {
  return page.getByRole("region", { name: "Course pricing and enrollment" });
}

function paymentWindow(page: Page) {
  return page.getByRole("dialog", { name: "Payment window" });
}

/** On the lesson page, every lesson of the course is open. */
async function expectWholeCourseOpen(page: Page, course: TestCourse) {
  await expect(page).toHaveURL(new RegExp(`/learn/${course.slug}/`, "u"));
  for (const lessonNumber of [1, 2, 3]) {
    await expect(lessonInList(page, lessonNumber)).not.toContainText("locked");
  }
}

test("a learner buys a paid course: the payment window asks for its price, and after paying every lesson plays", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    title: "TypeScript Pro",
    price: 1299,
  });
  await academy.signedInLearner("buyer");

  await openCoursePage(page, course);
  await expect(pricing(page)).toContainText("₹1,299");
  await pricing(page).getByRole("button", { name: "Pay Now" }).click();

  // The gateway is asked for exactly the course's price.
  await expect(paymentWindow(page)).toContainText("Amount: ₹1,299");
  await paymentWindow(page).getByRole("button", { name: "Pay" }).click();

  // Paid: the app takes the learner into the course, all of it open.
  await expectWholeCourseOpen(page, course);
  await openLesson(page, course, 2);
  await expectVideoToPlay(page);
});

test("after buying, the course is in the learner's courses and purchases, and is not offered for sale again", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    title: "Docker Essentials",
    price: 799,
  });
  await academy.signedInLearner("owner");
  await openCoursePage(page, course);
  await pricing(page).getByRole("button", { name: "Pay Now" }).click();
  await paymentWindow(page).getByRole("button", { name: "Pay" }).click();
  await expectWholeCourseOpen(page, course);

  // The course's page now shows their progress, not a price.
  await openCoursePage(page, course);
  await expect(
    page.getByRole("region", { name: "Your progress in this course" }),
  ).toBeVisible();
  await expect(pricing(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pay Now" })).toHaveCount(0);

  // Courses → Enrolled lists it.
  await page.goto("/courses/enrolled");
  await expect(
    page.getByRole("heading", { name: "Docker Essentials" }),
  ).toBeVisible();

  // Purchase History has the payment.
  await page.goto("/purchase-history");
  const purchases = page.getByRole("main", { name: "Purchase History" });
  await expect(purchases).toContainText("Docker Essentials");
  await expect(purchases).toContainText("₹799");
  await expect(purchases).toContainText("Completed");
  await expect(purchases).toContainText("Invoice");
});

test("closing the payment window charges nothing: the course stays locked, and the learner can still buy it", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({ price: 499 });
  await academy.signedInLearner("changed_mind");

  await openCoursePage(page, course);
  await pricing(page).getByRole("button", { name: "Pay Now" }).click();
  await paymentWindow(page).getByRole("button", { name: "Cancel" }).click();

  // Still on the course's page, still for sale, still locked.
  await expect(paymentWindow(page)).toBeHidden();
  await expect(
    pricing(page).getByRole("button", { name: "Pay Now" }),
  ).toBeEnabled();
  await openLesson(page, course, 2);
  await expect(
    page.getByRole("alert").getByRole("heading", { name: "Ready to dive in?" }),
  ).toBeVisible();
  await expectNoVideo(page);

  // Purchase History shows the attempt, with no money taken.
  await page.goto("/purchase-history");
  const purchases = page.getByRole("main", { name: "Purchase History" });
  await expect(purchases).toContainText(course.title);
  await expect(purchases).toContainText("No payment taken");
  await expect(purchases).not.toContainText("Completed");

  // They come back and pay this time.
  await openCoursePage(page, course);
  await pricing(page).getByRole("button", { name: "Pay Now" }).click();
  await paymentWindow(page).getByRole("button", { name: "Pay" }).click();
  await expectWholeCourseOpen(page, course);
});

test("a free course: 'Enroll for Free' opens every lesson at once, with no payment window", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    title: "Git Basics",
    pricing: "free",
  });
  await academy.signedInLearner("free_rider");

  await openCoursePage(page, course);
  await expect(pricing(page)).toContainText("Free");
  await pricing(page).getByRole("button", { name: "Enroll for Free" }).click();

  await expectWholeCourseOpen(page, course);
  await expect(paymentWindow(page)).toHaveCount(0);
  await openLesson(page, course, 3);
  await expectVideoToPlay(page);
});

test("a visitor who presses 'Pay Now' is asked to sign in first, and no payment window opens", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({ price: 999 });

  await openCoursePage(page, course);
  await pricing(page).getByRole("button", { name: "Pay Now" }).click();

  await expect(
    page.getByRole("dialog").getByRole("textbox", { name: "Email" }),
  ).toBeVisible();
  await expect(paymentWindow(page)).toHaveCount(0);
});

test("a course only staff can give is neither for sale nor free to join", async ({
  page,
  academy,
}) => {
  const course = await academy.createCourse({
    title: "Invite Only",
    pricing: "free",
    access: "restricted",
  });
  await academy.signedInLearner("uninvited");

  await openCoursePage(page, course);
  await expect(
    page.getByRole("heading", { name: "Invite Only" }),
  ).toBeVisible();
  // The price box says how to get in instead of offering a way to pay.
  await expect(pricing(page)).toContainText(
    "Enrollment in this course is by invitation.",
  );
  await expect(page.getByRole("button", { name: "Pay Now" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enroll for Free" }),
  ).toHaveCount(0);

  await openLesson(page, course, 2);
  await expect(page.getByRole("alert")).toBeVisible();
  await expectNoVideo(page);
});
