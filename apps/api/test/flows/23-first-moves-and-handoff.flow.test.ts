/**
 * A new academy's first hour (creator-features/38-onboarding-build-plan.md):
 *
 * - the admin home's "first five moves" tick themselves from the academy's
 *   own data, and only staff read them;
 * - the sign-in hand-over: a deployment that runs many academies hands a
 *   creator from its sign-up site to the academy's own address with a
 *   one-time token. Without a provider (a self-hosted install) the route
 *   does not exist; with one, a spent or unknown token signs no one in, an
 *   existing account is signed in, and a new one is made.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  setSignInHandoffProvider,
  type HandedOverPerson,
} from "@veolms/config";

import {
  newLearner,
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowResponse,
} from "./setup/flow-app.ts";
import { createCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

interface FirstMoves {
  moves: {
    look: boolean;
    payments: boolean;
    course: boolean;
    testPurchase: boolean;
    share: boolean;
  };
  launchReplay: boolean;
}

function ok<T>(response: FlowResponse<T>, status = 200): T {
  assert.equal(
    response.status,
    status,
    `answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );
  return response.body.data as T;
}

/** Tokens the stand-in provider answers, each once. */
const tokens = new Map<string, HandedOverPerson>();
const TOKEN = (n: number) => `handoff-token-${n}`.padEnd(40, "x");

test.after(async () => {
  setSignInHandoffProvider(null);
  await flow.database
    .updateTable("academy")
    .set({ link_shared_at: null })
    .execute();
  await flow.close();
});

test("only staff read the first moves", async () => {
  assert.equal(
    (await flow.visitor().get("/v1/academy/first-moves")).status,
    401,
  );
  const learner = await signedUpLearner(flow, "movelearner");
  assert.equal(
    (await learner.client.get("/v1/academy/first-moves")).status,
    403,
  );
  assert.equal(
    (await learner.client.post("/v1/academy/first-moves/share", {})).status,
    403,
  );
});

test("the first moves tick themselves from the academy's own data", async () => {
  await flow.database
    .updateTable("academy")
    .set({ link_shared_at: null })
    .execute();
  const before = ok<FirstMoves>(await admin.get("/v1/academy/first-moves"));
  assert.equal(before.moves.share, false);
  // Self-hosted: nothing was launched on a sign-up stage.
  assert.equal(before.launchReplay, false);

  await createCourse(flow, { title: "First moves course" });
  const withCourse = ok<FirstMoves>(await admin.get("/v1/academy/first-moves"));
  assert.equal(withCourse.moves.course, true);

  const shared = ok<FirstMoves>(
    await admin.post("/v1/academy/first-moves/share", {}),
  );
  assert.equal(shared.moves.share, true);
  // Sharing again keeps the first time.
  const first = await flow.database
    .selectFrom("academy")
    .select("link_shared_at")
    .executeTakeFirstOrThrow();
  ok<FirstMoves>(await admin.post("/v1/academy/first-moves/share", {}));
  const again = await flow.database
    .selectFrom("academy")
    .select("link_shared_at")
    .executeTakeFirstOrThrow();
  assert.deepEqual(again.link_shared_at, first.link_shared_at);
});

test("without a hand-over provider the route does not exist", async () => {
  setSignInHandoffProvider(null);
  const response = await flow
    .visitor()
    .post("/v1/auth/handoff", { token: TOKEN(0) });
  assert.equal(response.status, 404);
});

test("a hand-over token signs its person in once", async () => {
  setSignInHandoffProvider(async (token) => {
    const person = tokens.get(token) ?? null;
    tokens.delete(token);
    return person;
  });

  // An existing account: signed in, nothing new made.
  const existing = await signedUpLearner(flow, "handedover");
  tokens.set(TOKEN(1), {
    email: existing.learner.email,
    phoneNo: null,
    displayName: "Ignored for an existing account",
  });
  const browser = flow.visitor();
  const signedIn = ok<{ user: { id: string; roles: string[] } }>(
    await browser.post("/v1/auth/handoff", { token: TOKEN(1) }),
  );
  assert.equal(signedIn.user.id, existing.userId);
  const me = ok<{ id: string }>(await browser.get("/v1/auth/me"));
  assert.equal(me.id, existing.userId);

  // Spent: the same token again signs no one in.
  const reused = await flow
    .visitor()
    .post("/v1/auth/handoff", { token: TOKEN(1) });
  assert.equal(reused.status, 401);
  assert.equal(reused.body.error?.code, "HANDOFF_INVALID");

  // Unknown or malformed tokens.
  assert.equal(
    (await flow.visitor().post("/v1/auth/handoff", { token: TOKEN(99) }))
      .status,
    401,
  );
  assert.equal(
    (await flow.visitor().post("/v1/auth/handoff", { token: "short" })).status,
    400,
  );
});

test("a person new to the site gets an account with the verified email", async () => {
  const person = newLearner("newcomer");
  tokens.set(TOKEN(2), {
    email: person.email,
    phoneNo: null,
    displayName: "Neha Classes",
  });
  const browser = flow.visitor();
  const signedIn = ok<{ user: { id: string; roles: string[] } }>(
    await browser.post("/v1/auth/handoff", { token: TOKEN(2) }),
  );
  // The site already has its administrator, so a newcomer is a learner.
  assert.deepEqual(signedIn.user.roles, ["student"]);
  const row = await flow.database
    .selectFrom("users")
    .select(["display_name", "email_verified_at"])
    .where("id", "=", signedIn.user.id)
    .executeTakeFirstOrThrow();
  assert.equal(row.display_name, "Neha Classes");
  assert.ok(row.email_verified_at);
});

test("with a provider set, the first moves offer the launch replay", async () => {
  const moves = ok<FirstMoves>(await admin.get("/v1/academy/first-moves"));
  assert.equal(moves.launchReplay, true);
});
