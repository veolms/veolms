/**
 * Signing up, signing in and signing out, through the sign-in window as a
 * learner uses it. The code is the real one: the API makes a random code,
 * "emails" it (the test server catches the email), and the test types it.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "./support/test";

/** The sign-in window: the email step, then the code step. */
async function askForCode(page: Page, email: string) {
  await page.goto("/login");
  const signIn = page.getByRole("dialog");
  await signIn.getByRole("textbox", { name: "Email" }).fill(email);
  await signIn.getByRole("button", { name: "Continue with email" }).click();
  await expect(
    signIn.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
}

/** The learner's name on the sidebar's profile button: they are signed in. */
function profileButton(page: Page, name: string) {
  return page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("button", {
      name: new RegExp(`^${name}, .*Open profile menu$`, "u"),
    });
}

/** The sidebar's "Login" button: nobody is signed in. */
function loginButton(page: Page) {
  return page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("button", { name: /^Login/u });
}

test("a new learner signs up with the code from their email and is signed in", async ({
  page,
  academy,
}) => {
  const email = `neha.${Date.now()}@flow.test`;

  await askForCode(page, email);
  // The 6th digit sends the code by itself.
  await page
    .getByRole("textbox", { name: "Verification code" })
    .fill(await academy.emailedCode(email));

  // A new email: the window asks for a name to finish the account.
  const signUp = page.getByRole("dialog");
  await expect(
    signUp.getByText("Let's finish setting up your account"),
  ).toBeVisible();
  await signUp.getByRole("textbox", { name: "Your name" }).fill("Neha Sharma");
  await signUp.getByRole("button", { name: "Create account" }).click();

  await expect(signUp).toBeHidden();
  await expect(profileButton(page, "Neha Sharma")).toBeVisible();

  // Still signed in after a reload: the session is real, not just the screen.
  await page.reload();
  await expect(profileButton(page, "Neha Sharma")).toBeVisible();
});

test("a returning learner signs in with a new code and goes straight in", async ({
  page,
  academy,
}) => {
  const learner = await academy.createLearner("ravi");

  await askForCode(page, learner.email);
  await page
    .getByRole("textbox", { name: "Verification code" })
    .fill(await academy.emailedCode(learner.email));

  // No "finish setting up" step for an account that exists.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(profileButton(page, learner.displayName)).toBeVisible();
});

test("a wrong code is refused with a message, and the learner stays signed out until the right one", async ({
  page,
  academy,
}) => {
  const learner = await academy.createLearner("wrong_code");

  await askForCode(page, learner.email);
  const code = await academy.emailedCode(learner.email);
  const wrongCode = code === "111111" ? "222222" : "111111";
  const codeBox = page.getByRole("textbox", { name: "Verification code" });

  await codeBox.fill(wrongCode);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Verification code is invalid",
  );
  await expect(codeBox).toHaveAttribute("aria-invalid", "true");
  // Nobody is signed in: the window is still asking for the code.
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();

  // The right code still works after one wrong try.
  await codeBox.fill(code);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(profileButton(page, learner.displayName)).toBeVisible();
});

test("after 'Resend code' only the newest code works", async ({
  page,
  academy,
}) => {
  const learner = await academy.createLearner("resend");

  await askForCode(page, learner.email);
  const firstCode = await academy.emailedCode(learner.email);

  // The resend button opens after a short wait (1 s in these tests).
  const resend = page.getByRole("button", { name: "Resend code" });
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect
    .poll(() => academy.emailedCode(learner.email), {
      message: "a second code is emailed",
    })
    .not.toBe(firstCode);
  const newCode = await academy.emailedCode(learner.email);

  const codeBox = page.getByRole("textbox", { name: "Verification code" });
  await codeBox.fill(firstCode);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Verification code is invalid",
  );

  await codeBox.fill(newCode);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(profileButton(page, learner.displayName)).toBeVisible();
});

test("signing out ends the session: the learner is a visitor again, even after a reload", async ({
  page,
  academy,
}) => {
  const learner = await academy.signedInLearner("leaving");
  await page.goto("/");
  await expect(profileButton(page, learner.displayName)).toBeVisible();

  await profileButton(page, learner.displayName).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  // The app asks first.
  const confirm = page.getByRole("dialog", { name: "Sign out?" });
  await confirm.getByRole("button", { name: "Sign out" }).click();

  await expect(loginButton(page)).toBeVisible();
  await page.reload();
  await expect(loginButton(page)).toBeVisible();
  await expect(profileButton(page, learner.displayName)).toHaveCount(0);
});

test("pressing Cancel on 'Sign out?' keeps the learner signed in", async ({
  page,
  academy,
}) => {
  const learner = await academy.signedInLearner("staying");
  await page.goto("/");

  await profileButton(page, learner.displayName).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await page
    .getByRole("dialog", { name: "Sign out?" })
    .getByRole("button", { name: "Cancel" })
    .click();

  await page.reload();
  await expect(profileButton(page, learner.displayName)).toBeVisible();
});
