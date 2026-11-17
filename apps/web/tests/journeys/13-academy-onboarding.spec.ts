/**
 * A creator signs up and launches an academy (creator-features/38): the
 * sign-up stage on the platform site, an emailed code, the academy's name
 * and address, the launch, and the hand-over that opens the new academy's
 * admin home, signed in, with its first five moves.
 *
 * Making an academy needs a deployment that serves many academies (VeoLMS
 * Cloud: its tenancy layer answers the sign-up), which this repo's own test
 * server is not. So this journey runs against one given by ONBOARDING_URL,
 * such as the cloud repo's local stack (scripts/local-academy-proxy.mjs):
 *
 *   ONBOARDING_URL=http://veolms.localhost:4243 ONBOARDING_CODE=123456 \
 *     pnpm test:browser 13-academy-onboarding
 *
 * ONBOARDING_CODE is the fixed code a local stack accepts (LOCAL_FIXED_OTP).
 */
import { expect, test } from "@playwright/test";

const ONBOARDING_URL = process.env.ONBOARDING_URL;
const CODE = process.env.ONBOARDING_CODE ?? "123456";

test.describe("starting an academy", () => {
  test.skip(
    !ONBOARDING_URL,
    "Needs a VeoLMS Cloud stack: set ONBOARDING_URL (see the comment above).",
  );
  // No intro, countdown or flash: the launch goes straight to Live.
  test.use({ reducedMotion: "reduce" });

  test("a creator signs up, names an academy, launches it and lands in its admin home", async ({
    page,
  }) => {
    const id = `${Date.now()}`.slice(-7);
    const email = `creator.${id}@example.com`;
    const name = `Journey Academy ${id}`;
    const slug = `journeyacademy${id}`;

    await page.goto(`${ONBOARDING_URL}/start`);
    await expect(
      page.getByRole("heading", { name: /Your academy\s*starts here\./u }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start your academy" }).click();

    // Step 1: email, then the code.
    await expect(
      page.getByRole("heading", { name: "How do we reach you?" }),
    ).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(
      page.getByRole("heading", { name: "Enter your code" }),
    ).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await page.getByLabel("6-digit code").fill(CODE);

    // Step 2: name and address; the address is checked as it is typed.
    await expect(
      page.getByRole("heading", { name: "Name your academy." }),
    ).toBeVisible();
    await page.getByLabel("Academy name").fill(name);
    await expect(page.getByLabel("Your address")).toHaveValue(slug);
    await expect(page.getByText("It’s yours")).toBeVisible();
    const proceed = page.getByRole("button", { name: "Continue" });
    await expect(proceed).toBeDisabled();
    // The tick box at the start of the line (the rest holds the policy links).
    const agree = page.getByRole("checkbox", { name: /I agree to the/u });
    await agree.locator("xpath=..").click({ position: { x: 9, y: 10 } });
    await expect(agree).toBeChecked();
    await proceed.click();

    // Step 3: launch.
    await expect(
      page.getByRole("heading", { name: "Ready to launch?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: `Launch ${name}` }).click();
    await expect(
      page.getByRole("heading", { name: `${name} is live.` }),
    ).toBeVisible({ timeout: 30_000 });

    // Into the new academy, on its own address, signed in as its owner.
    await page.getByRole("button", { name: "Enter my dashboard" }).click();
    await expect(page).toHaveURL(new RegExp(`//${slug}\\.`, "u"), {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "Your first five moves" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Add your logo and pick a colour"),
    ).toBeVisible();

    // Back on the platform site (still signed in there), it is listed
    // under "Welcome back".
    await page.goto(`${ONBOARDING_URL}/start`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("heading", { name: "Good to see you again." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(name, "u") }),
    ).toBeVisible();
  });
});
