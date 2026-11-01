/**
 * Signing up and signing in with an emailed code, and what a session is
 * good for afterwards. Every request goes through the real API.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  newLearner,
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";

const flow = await startFlowApp();

await test("a new learner signs up with the code emailed to them and is signed in as a student", async () => {
  const learner = newLearner();
  const browser = flow.visitor();

  const sent = await browser.post("/v1/auth/otp/send", {
    email: learner.email,
  });
  assert.equal(sent.status, 200);
  const code = flow.email.lastCodeFor(learner.email);

  const signUp = await browser.post("/v1/auth/register", {
    email: learner.email,
    code,
    username: learner.username,
    displayName: learner.displayName,
  });
  assert.equal(signUp.status, 201);
  assert.ok(browser.signedIn, "the sign-up sets a session cookie");

  const me = await browser.get<{ email: string; roles: string[] }>(
    "/v1/auth/me",
  );
  assert.equal(me.status, 200);
  assert.equal(me.body.data?.email, learner.email);
  assert.deepEqual(me.body.data?.roles, ["student"]);
});

await test("a learner who signed up before signs in again with a new emailed code", async () => {
  const { learner, userId } = await signedUpLearner(flow);
  const laptop = flow.visitor();

  const signIn = await laptop.signIn(learner.email);

  assert.equal(signIn.status, 200);
  assert.equal(signIn.body.data?.user.id, userId);
  assert.equal(await laptop.whoAmI(), userId);
});

await test("a visitor who is not signed in is nobody, and is refused what needs an account", async () => {
  const visitor = flow.visitor();
  assert.equal(await visitor.whoAmI(), null);
  assert.equal((await visitor.get("/v1/auth/sessions")).status, 401);
  assert.equal((await visitor.get("/v1/enrollments/courses")).status, 401);
});

await test("a wrong code does not sign anyone in", async () => {
  const { learner } = await signedUpLearner(flow);
  const browser = flow.visitor();
  const code = await browser.requestCode(learner.email);
  const wrong = code === "000000" ? "111111" : "000000";

  const signIn = await browser.post("/v1/auth/login", {
    email: learner.email,
    code: wrong,
  });

  assert.equal(signIn.status, 401);
  assert.equal(signIn.body.error?.code, "INVALID_CODE");
  assert.equal(browser.signedIn, false);
});

await test("a code signs in once: the same code cannot be used a second time", async () => {
  const { learner } = await signedUpLearner(flow);
  const first = flow.visitor();
  const code = await first.requestCode(learner.email);
  assert.equal(
    (await first.post("/v1/auth/login", { email: learner.email, code })).status,
    200,
  );

  const second = flow.visitor();
  const reused = await second.post("/v1/auth/login", {
    email: learner.email,
    code,
  });

  assert.equal(reused.status, 401);
  assert.equal(second.signedIn, false);
});

await test("after five wrong guesses even the right code is refused", async () => {
  const { learner } = await signedUpLearner(flow);
  const browser = flow.visitor();
  const code = await browser.requestCode(learner.email);
  const wrong = code === "000000" ? "111111" : "000000";

  for (let guess = 0; guess < 5; guess += 1) {
    await browser.post("/v1/auth/login", { email: learner.email, code: wrong });
  }
  const right = await browser.post("/v1/auth/login", {
    email: learner.email,
    code,
  });

  assert.equal(right.status, 401);
  assert.equal(browser.signedIn, false);
});

await test("a code that has run out is refused", async () => {
  const { learner } = await signedUpLearner(flow);
  const browser = flow.visitor();
  const code = await browser.requestCode(learner.email);
  // Ten minutes pass (OTP_TTL_MINUTES).
  await flow.database
    .updateTable("otp_codes")
    .set({ expires_at: new Date(Date.now() - 1_000) })
    .where("identifier", "=", learner.email)
    .where("consumed_at", "is", null)
    .execute();

  const signIn = await browser.post("/v1/auth/login", {
    email: learner.email,
    code,
  });

  assert.equal(signIn.status, 401);
  assert.equal(browser.signedIn, false);
});

await test("asking for a new code retires the one sent before it", async () => {
  const { learner } = await signedUpLearner(flow);
  const browser = flow.visitor();
  const firstCode = await browser.requestCode(learner.email);
  // The resend wait (OTP_RESEND_COOLDOWN_SECONDS is 1 in these tests).
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const secondCode = await browser.requestCode(learner.email);

  if (firstCode !== secondCode) {
    const old = await browser.post("/v1/auth/login", {
      email: learner.email,
      code: firstCode,
    });
    assert.equal(old.status, 401);
  }
  const current = await browser.post("/v1/auth/login", {
    email: learner.email,
    code: secondCode,
  });
  assert.equal(current.status, 200);
});

await test("an email that already has an account cannot sign up again", async () => {
  const { learner } = await signedUpLearner(flow);
  const browser = flow.visitor();
  const code = await browser.requestCode(learner.email);

  const again = await browser.post("/v1/auth/register", {
    email: learner.email,
    code,
    username: `${learner.username.slice(0, 26)}_two`,
    displayName: "Someone else",
  });

  assert.equal(again.status, 400);
});

await test("signing out ends the session: the old cookie no longer works", async () => {
  const { client } = await signedUpLearner(flow);
  const oldCookies = new Map(client.cookies);

  const signOut = await client.post("/v1/auth/logout");
  assert.equal(signOut.status, 200);
  assert.equal(client.signedIn, false);

  // Someone who copied the cookie before the sign-out tries it.
  const copy = flow.visitor();
  for (const [name, value] of oldCookies) copy.cookies.set(name, value);
  assert.equal(await copy.whoAmI(), null);
  assert.equal((await copy.get("/v1/auth/sessions")).status, 401);
});

await test("signing out of every other device keeps this one and ends the rest", async () => {
  const { client: phone, learner } = await signedUpLearner(flow);
  const laptop = flow.visitor();
  assert.equal((await laptop.signIn(learner.email)).status, 200);

  const revoke = await phone.post("/v1/auth/sessions/revoke-all");
  assert.equal(revoke.status, 200);

  assert.notEqual(await phone.whoAmI(), null);
  assert.equal(await laptop.whoAmI(), null);
});

await test("active sessions require their own verified email code", async () => {
  const { client, learner } = await signedUpLearner(flow);

  const locked = await client.get("/v1/auth/sessions");
  assert.equal(locked.status, 403);
  assert.equal(
    locked.body.error?.code,
    "ACTIVE_SESSIONS_VERIFICATION_REQUIRED",
  );

  const loginCode = await client.requestCode(learner.email);
  const sent = await client.post("/v1/auth/sessions/verification/send");
  assert.equal(sent.status, 200);
  const verificationCode = flow.email.lastCodeFor(learner.email);

  const loginCodeRejected = await client.post(
    "/v1/auth/sessions/verification/verify",
    { code: loginCode },
  );
  assert.equal(loginCodeRejected.status, 400);
  assert.equal(loginCodeRejected.body.error?.code, "INVALID_CODE");

  const verified = await client.post("/v1/auth/sessions/verification/verify", {
    code: verificationCode,
  });
  assert.equal(verified.status, 200);
  const sessions = await client.get<{ id: string }[]>("/v1/auth/sessions");
  assert.equal(sessions.status, 200);
  const revoked = await client.post("/v1/auth/sessions/revoke-all");
  assert.equal(revoked.status, 200);
});

await test("with a limit of one device, a second device is held until the first signs out", async () => {
  const admin = await signedInAdmin(flow);
  const limit = await admin.patch("/v1/platform/settings", {
    security: { maxDevicesPerStudent: 1 },
  });
  assert.equal(limit.status, 200);
  try {
    const { client: phone, learner } = await signedUpLearner(flow);
    const laptop = flow.visitor();

    const held = await laptop.signIn(learner.email);
    assert.equal(held.status, 409);
    assert.equal(held.body.error?.code, "DEVICE_LIMIT_REACHED");
    assert.equal(await laptop.whoAmI(), null);

    await phone.post("/v1/auth/logout");
    const retry = await flow.visitor().signIn(learner.email);
    assert.equal(retry.status, 200);
  } finally {
    const reset = await admin.patch("/v1/platform/settings", {
      security: { maxDevicesPerStudent: null },
    });
    assert.equal(reset.status, 200);
  }
});

await flow.close();
