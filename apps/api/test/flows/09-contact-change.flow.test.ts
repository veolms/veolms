/**
 * Changing one's own email address or mobile number: a code to the current
 * value first, then one to the new value. Every request goes through the
 * real API; codes are read from the captured email and text messages.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  newLearner,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";

const flow = await startFlowApp();

interface Change {
  id: string;
  channel: "email" | "phone";
  step: "prove_current" | "confirm_new";
  sentTo: string | null;
}

function start(client: FlowClient, channel: "email" | "phone") {
  return client.post<Change>("/v1/auth/me/contact-changes", { channel });
}

function proveCurrent(client: FlowClient, changeId: string, code: string) {
  return client.post<Change>(
    `/v1/auth/me/contact-changes/${changeId}/current`,
    { code },
  );
}

function sendToNew(client: FlowClient, changeId: string, value: string) {
  return client.post<Change>(`/v1/auth/me/contact-changes/${changeId}/new`, {
    value,
  });
}

function confirmNew(
  client: FlowClient,
  changeId: string,
  value: string,
  code: string,
) {
  return client.post<{ channel: string; value: string }>(
    `/v1/auth/me/contact-changes/${changeId}/confirm`,
    { value, code },
  );
}

/** A number no other test uses. */
function newNumber(): string {
  return `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
}

/** Gives the learner a mobile number they confirmed. */
async function confirmedNumber(userId: string, phone = newNumber()) {
  await flow.database
    .updateTable("users")
    .set({ phone_no: phone, phone_verified_at: new Date() })
    .where("id", "=", userId)
    .execute();
  return phone;
}

await test("a learner changes their email: the current address first, then the new one", async () => {
  const { client, learner } = await signedUpLearner(flow);
  const laptop = flow.visitor();
  assert.equal((await laptop.signIn(learner.email)).status, 200);
  const next = newLearner("moved").email;

  const started = await start(client, "email");
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.data?.step, "prove_current");
  assert.ok(
    started.body.data?.sentTo?.includes("*"),
    "the address is partly hidden",
  );
  const changeId = started.body.data!.id;

  const proven = await proveCurrent(
    client,
    changeId,
    flow.email.lastCodeFor(learner.email),
  );
  assert.equal(proven.status, 200, JSON.stringify(proven.body));
  assert.equal(proven.body.data?.step, "confirm_new");

  const sent = await sendToNew(client, changeId, next);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const done = await confirmNew(
    client,
    changeId,
    next,
    flow.email.lastCodeFor(next),
  );

  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.deepEqual(done.body.data, { channel: "email", value: next });
  const me = await client.get<{ email: string; emailVerified: boolean }>(
    "/v1/auth/me",
  );
  assert.equal(me.body.data?.email, next);
  assert.equal(me.body.data?.emailVerified, true);
  // The other device is signed out; this one stays.
  assert.equal(await laptop.whoAmI(), null);
  assert.notEqual(await client.whoAmI(), null);
  // The old address is told.
  const notice = flow.email.sent.findLast(
    (mail) => mail.to === learner.email.toLowerCase(),
  );
  assert.match(notice?.subject ?? "", /email address was changed/);
  // And the new address signs in.
  assert.equal((await flow.visitor().signIn(next)).status, 200);
});

await test("a learner changes their mobile number: the current number first", async () => {
  const { client, userId } = await signedUpLearner(flow);
  const current = await confirmedNumber(userId);
  const next = newNumber();

  const started = await start(client, "phone");
  assert.equal(started.body.data?.step, "prove_current");
  assert.equal(started.body.data?.sentTo?.slice(-4), current.slice(-4));
  const changeId = started.body.data!.id;
  assert.equal(
    (await proveCurrent(client, changeId, flow.sms.lastCodeFor(current)))
      .status,
    200,
  );
  assert.equal((await sendToNew(client, changeId, next)).status, 200);
  const done = await confirmNew(
    client,
    changeId,
    next,
    flow.sms.lastCodeFor(next),
  );

  assert.equal(done.status, 200, JSON.stringify(done.body));
  const row = await flow.database
    .selectFrom("users")
    .select(["phone_no", "phone_verified_at", "mobile_public"])
    .where("id", "=", userId)
    .executeTakeFirstOrThrow();
  assert.equal(row.phone_no, next);
  assert.ok(row.phone_verified_at);
  assert.equal(row.mobile_public, false);
});

await test("the new value cannot be chosen before the current one is proven", async () => {
  const { client } = await signedUpLearner(flow);
  const started = await start(client, "email");

  const skipped = await sendToNew(
    client,
    started.body.data!.id,
    newLearner("skip").email,
  );

  assert.equal(skipped.status, 400);
  assert.equal(skipped.body.error?.code, "CONTACT_CHANGE_OUT_OF_ORDER");
});

await test("a wrong code for the current value proves nothing", async () => {
  const { client, learner } = await signedUpLearner(flow);
  const started = await start(client, "email");
  const right = flow.email.lastCodeFor(learner.email);
  const wrong = right === "000000" ? "111111" : "000000";

  const refused = await proveCurrent(client, started.body.data!.id, wrong);

  assert.equal(refused.status, 400);
  assert.equal(
    (await sendToNew(client, started.body.data!.id, newLearner("x").email)).body
      .error?.code,
    "CONTACT_CHANGE_OUT_OF_ORDER",
  );
});

await test("an address another account uses is refused, and no code is sent to it", async () => {
  const { client, learner } = await signedUpLearner(flow);
  const { learner: other } = await signedUpLearner(flow);
  const started = await start(client, "email");
  await proveCurrent(
    client,
    started.body.data!.id,
    flow.email.lastCodeFor(learner.email),
  );
  const mailsToOther = flow.email.sent.filter(
    (mail) => mail.to === other.email.toLowerCase(),
  ).length;

  const refused = await sendToNew(client, started.body.data!.id, other.email);

  assert.equal(refused.status, 409);
  assert.equal(refused.body.error?.code, "EMAIL_TAKEN");
  assert.equal(
    flow.email.sent.filter((mail) => mail.to === other.email.toLowerCase())
      .length,
    mailsToOther,
  );
});

await test("a change left open past 15 minutes has to be started again", async () => {
  const { client, learner } = await signedUpLearner(flow);
  const started = await start(client, "email");
  await flow.database
    .updateTable("contact_changes")
    .set({ expires_at: new Date(Date.now() - 1000) })
    .where("id", "=", started.body.data!.id)
    .execute();

  const late = await proveCurrent(
    client,
    started.body.data!.id,
    flow.email.lastCodeFor(learner.email),
  );

  assert.equal(late.status, 400);
  assert.equal(late.body.error?.code, "CONTACT_CHANGE_EXPIRED");
});

await test("a number nobody confirmed needs no proof: the change goes to the new number", async () => {
  const { client, userId } = await signedUpLearner(flow);
  await flow.database
    .updateTable("users")
    .set({ phone_no: newNumber(), phone_verified_at: null })
    .where("id", "=", userId)
    .execute();

  const started = await start(client, "phone");

  assert.equal(started.body.data?.step, "confirm_new");
  assert.equal(started.body.data?.sentTo, null);
});

await test("another learner's change cannot be used", async () => {
  const { client } = await signedUpLearner(flow);
  const { client: stranger } = await signedUpLearner(flow);
  const started = await start(client, "email");

  const response = await proveCurrent(
    stranger,
    started.body.data!.id,
    "123456",
  );

  assert.equal(response.status, 404);
  assert.equal(response.body.error?.code, "CONTACT_CHANGE_NOT_FOUND");
});

await test("a confirmed number is not replaced through the add-a-number route", async () => {
  const { client, userId } = await signedUpLearner(flow);
  const current = await confirmedNumber(userId);

  const replace = await client.post("/v1/auth/me/phone/otp/send", {
    phoneNo: newNumber(),
  });
  const reconfirm = await client.post("/v1/auth/me/phone/otp/send", {
    phoneNo: current,
  });

  assert.equal(replace.status, 409);
  assert.equal(replace.body.error?.code, "PHONE_CHANGE_NEEDS_PROOF");
  assert.equal(reconfirm.status, 200, JSON.stringify(reconfirm.body));
});

/** Proves the learner's email and sends a code to `next`; returns the change id. */
async function emailChangeUpToNewCode(
  client: FlowClient,
  email: string,
  next: string,
) {
  const started = await start(client, "email");
  const changeId = started.body.data!.id;
  await proveCurrent(client, changeId, flow.email.lastCodeFor(email));
  assert.equal((await sendToNew(client, changeId, next)).status, 200);
  return changeId;
}

async function emailOf(userId: string) {
  const row = await flow.database
    .selectFrom("users")
    .select("email")
    .where("id", "=", userId)
    .executeTakeFirstOrThrow();
  return row.email;
}

await test("a number confirmed after its code was sent is not replaced by verifying the code", async () => {
  const { client, userId } = await signedUpLearner(flow);
  const asked = newNumber();
  assert.equal(
    (await client.post("/v1/auth/me/phone/otp/send", { phoneNo: asked }))
      .status,
    200,
  );
  // A different number is confirmed on the account meanwhile.
  const confirmed = await confirmedNumber(userId);

  const verify = await client.post("/v1/auth/me/phone/otp/verify", {
    phoneNo: asked,
    code: flow.sms.lastCodeFor(asked),
  });

  assert.equal(verify.status, 409);
  assert.equal(verify.body.error?.code, "PHONE_CHANGE_NEEDS_PROOF");
  const row = await flow.database
    .selectFrom("users")
    .select("phone_no")
    .where("id", "=", userId)
    .executeTakeFirstOrThrow();
  assert.equal(row.phone_no, confirmed);
});

await test("a change that runs out after the new code is sent is not completed", async () => {
  const { client, learner, userId } = await signedUpLearner(flow);
  const next = newLearner("late").email;
  const changeId = await emailChangeUpToNewCode(client, learner.email, next);
  await flow.database
    .updateTable("contact_changes")
    .set({ expires_at: new Date(Date.now() - 1000) })
    .where("id", "=", changeId)
    .execute();

  const done = await confirmNew(
    client,
    changeId,
    next,
    flow.email.lastCodeFor(next),
  );

  assert.equal(done.status, 400);
  assert.equal(done.body.error?.code, "CONTACT_CHANGE_EXPIRED");
  assert.equal(await emailOf(userId), learner.email);
});

await test("an email changed by staff meanwhile is not overwritten by the learner's change", async () => {
  const { client, learner, userId } = await signedUpLearner(flow);
  const next = newLearner("mine").email;
  const changeId = await emailChangeUpToNewCode(client, learner.email, next);
  const byStaff = newLearner("staff").email;
  await flow.database
    .updateTable("users")
    .set({ email: byStaff })
    .where("id", "=", userId)
    .execute();

  const done = await confirmNew(
    client,
    changeId,
    next,
    flow.email.lastCodeFor(next),
  );

  assert.equal(done.status, 409);
  assert.equal(done.body.error?.code, "CONTACT_CHANGED_MEANWHILE");
  assert.equal(await emailOf(userId), byStaff);
});

await test("a change that skipped proof stops once the number is confirmed", async () => {
  const { client, userId } = await signedUpLearner(flow);
  const unconfirmed = newNumber();
  await flow.database
    .updateTable("users")
    .set({ phone_no: unconfirmed, phone_verified_at: null })
    .where("id", "=", userId)
    .execute();
  const started = await start(client, "phone");
  assert.equal(started.body.data?.step, "confirm_new");
  // The owner confirms the number while the change is open.
  await confirmedNumber(userId, unconfirmed);

  const sent = await sendToNew(client, started.body.data!.id, newNumber());

  assert.equal(sent.status, 409);
  assert.equal(sent.body.error?.code, "CONTACT_CHANGED_MEANWHILE");
});

await test("two starts at once leave one change open", async () => {
  const { client, userId } = await signedUpLearner(flow);
  // An unconfirmed number: no code is sent, so neither start waits on one.
  await flow.database
    .updateTable("users")
    .set({ phone_no: newNumber(), phone_verified_at: null })
    .where("id", "=", userId)
    .execute();

  const both = await Promise.all([
    start(client, "phone"),
    start(client, "phone"),
  ]);

  assert.deepEqual(
    both.map((response) => response.status),
    [200, 200],
  );
  const open = await flow.database
    .selectFrom("contact_changes")
    .select("id")
    .where("user_id", "=", userId)
    .where("completed_at", "is", null)
    .where("expires_at", ">", new Date())
    .execute();
  assert.equal(open.length, 1);
});

await flow.close();
