/** Active sessions stay hidden until email identity verification succeeds. */
import { expect, test } from "./support/test";
import { PORTS } from "./support/ports";

test("active sessions require email OTP verification", async ({
  page,
  academy,
}) => {
  const adminSession = await academy.adminSession();
  await academy.signInAs(adminSession);
  await page.goto("/settings/security");

  const sessions = page.getByRole("heading", { name: "Active sessions" });
  await expect(sessions).toBeVisible();
  await expect(page.getByText("Current", { exact: true })).toHaveCount(0);
  const verifyIdentity = page.getByRole("button", {
    name: "Verify identity to view sessions",
  });
  let verificationSendCount = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/v1/auth/sessions/verification/send"
    ) {
      verificationSendCount += 1;
    }
  });
  const sendCode = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        "/v1/auth/sessions/verification/send" &&
      response.ok(),
  );
  await verifyIdentity.click();
  await sendCode;
  await page.waitForTimeout(100);
  expect(verificationSendCount).toBe(1);

  const otpDialog = page.getByRole("dialog", { name: "Verify your identity" });
  await expect(otpDialog).toBeVisible();
  const sessionsBeforeOtp = await page.evaluate(async (apiPort) => {
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/v1/auth/sessions`,
      { credentials: "include" },
    );
    return {
      status: response.status,
      body: (await response.json()) as { error?: { code?: string } },
    };
  }, PORTS.api);
  expect(sessionsBeforeOtp.status).toBe(403);
  expect(sessionsBeforeOtp.body.error?.code).toBe(
    "ACTIVE_SESSIONS_VERIFICATION_REQUIRED",
  );

  const emailCode = await academy.emailedCode("admin@flow.test");
  await otpDialog
    .getByRole("textbox", { name: "Verification code" })
    .fill(emailCode);
  await expect(otpDialog).toBeHidden();
  await expect(page.getByText("Current", { exact: true })).toBeVisible();
  const sessionsAfterOtp = await page.evaluate(async (apiPort) => {
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/v1/auth/sessions`,
      { credentials: "include" },
    );
    return response.status;
  }, PORTS.api);
  expect(sessionsAfterOtp).toBe(200);
});
