/**
 * Short links (docs/short-links.md): staff (here an instructor) create,
 * check, pause, edit and delete them; the website Worker resolves them and counts visits. A path
 * the app or a profile uses is refused with a free one suggested, a
 * destination must be another site's https address, and a learner cannot
 * take a link's path as their username.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import { signedUpLearner, startFlowApp } from "./setup/flow-app.ts";

const flow = await startFlowApp();
// An instructor manages links (as the academy's own staff do), signed in
// with an account of their own: the admin's sign-in codes for the day are
// used up by the files before this one.
const staffAccount = await signedUpLearner(flow, "linkstaff");
await grantPlatformRole(flow.database, {
  userId: staffAccount.userId,
  roleId: SYSTEM_ROLES.instructor.id,
});
const staff = flow.visitor();
await staff.signIn(staffAccount.learner.email);
const { client: learner, learner: learnerAccount } = await signedUpLearner(
  flow,
  "links",
);
const visitor = flow.visitor();

interface Link {
  id: string;
  path: string;
  destination: string;
  mode: "redirect" | "rewrite";
  redirectStatus: 301 | 302;
  isActive: boolean;
  visitCount: number;
}

interface PathCheck {
  path: string | null;
  available: boolean;
  reason: string | null;
  suggestion: string | null;
}

function ok<T>(
  response: { status: number; body: { data?: T; error?: unknown } },
  status = 200,
): T {
  assert.equal(
    response.status,
    status,
    `answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );
  return response.body.data as T;
}

const suffix = `${process.pid}${Math.floor(Math.random() * 1e6)}`;
const resolve = async (path: string) =>
  ok<{ link: Link | null }>(
    await visitor.get(`/v1/links/resolve?path=${encodeURIComponent(path)}`),
  ).link;

test.after(async () => {
  await flow.close();
});

test("only staff with link.manage manage links", async () => {
  assert.equal((await visitor.get("/v1/links")).status, 401);
  assert.equal((await learner.get("/v1/links")).status, 403);
  assert.equal(
    (
      await learner.post("/v1/links", {
        path: `/l-${suffix}`,
        destination: "https://example.com",
      })
    ).status,
    403,
  );
});

test("the app's pages, reserved prefixes and profiles are refused, with a free path suggested", async () => {
  for (const [path, reason] of [
    ["/courses", /page of the app/],
    ["/Settings/x", /page of the app/],
    ["/api", /reserved/],
    [`/${learnerAccount.username}`, /profile/],
  ] as const) {
    const check = ok<PathCheck>(
      await staff.get(`/v1/links/check?path=${encodeURIComponent(path)}`),
    );
    assert.equal(check.available, false, path);
    assert.match(check.reason ?? "", reason, path);
    assert.ok(check.suggestion, `a suggestion for ${path}`);
    const free = ok<PathCheck>(
      await staff.get(
        `/v1/links/check?path=${encodeURIComponent(check.suggestion!)}`,
      ),
    );
    assert.equal(free.available, true, `${check.suggestion} is free`);
  }

  const refused = await staff.post("/v1/links", {
    path: "/courses",
    destination: "https://example.com",
  });
  assert.equal(refused.status, 409);

  const empty = ok<PathCheck>(await staff.get("/v1/links/check?path="));
  assert.match(empty.suggestion ?? "", /^\/[a-z0-9]+$/);
});

test("a destination must be another site's https address", async () => {
  for (const destination of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
    "https://127.0.0.1/x",
    "https://localhost/x",
  ]) {
    const response = await staff.post("/v1/links", {
      path: `/d-${suffix}`,
      destination,
    });
    assert.equal(response.status, 400, destination);
  }
});

test("a link is created case-insensitively, resolved, paused, edited and deleted", async () => {
  const path = `/Node-${suffix}.JS`;
  const normalized = path.toLowerCase();
  const link = ok<Link>(
    await staff.post("/v1/links", {
      path,
      destination: "https://procoder.example.org/node.js",
    }),
  );
  assert.equal(link.path, normalized);
  assert.equal(link.mode, "redirect");
  assert.equal(link.redirectStatus, 302);

  const taken = await staff.post("/v1/links", {
    path: normalized.toUpperCase(),
    destination: "https://example.com",
  });
  assert.equal(taken.status, 409);
  assert.match(JSON.stringify(taken.body.error), /Try \//);

  const resolved = await visitor.get(
    `/v1/links/resolve?path=${encodeURIComponent(path)}`,
  );
  assert.equal(
    (resolved.body.data as { link: Link }).link.destination,
    "https://procoder.example.org/node.js",
  );
  assert.match(String(resolved.headers["cache-control"]), /public/);
  assert.match(String(resolved.headers["cache-control"]), /s-maxage=\d+/);
  assert.equal(await resolve("/no-such-link-here"), null);

  ok(await visitor.post("/v1/links/visits", { id: link.id }));
  ok(await visitor.post("/v1/links/visits", { id: link.id }));

  ok(await staff.patch(`/v1/links/${link.id}`, { isActive: false }));
  assert.equal(await resolve(normalized), null);
  ok(await staff.patch(`/v1/links/${link.id}`, { isActive: true }));

  const moved = ok<Link>(
    await staff.patch(`/v1/links/${link.id}`, {
      path: `/n-${suffix}`,
      mode: "rewrite",
    }),
  );
  assert.equal(moved.mode, "rewrite");
  assert.equal(await resolve(normalized), null);
  assert.equal((await resolve(`/n-${suffix}`))?.mode, "rewrite");

  const listed = ok<{ links: Link[] }>(await staff.get("/v1/links")).links.find(
    (item) => item.id === link.id,
  );
  assert.equal(listed?.visitCount, 2);

  ok(await staff.delete(`/v1/links/${link.id}`));
  assert.equal(await resolve(`/n-${suffix}`), null);
  assert.equal((await staff.delete(`/v1/links/${link.id}`)).status, 404);
});

test("a learner cannot take a link's path as their username", async () => {
  const name = `taken_${suffix}`.slice(0, 24);
  const link = ok<Link>(
    await staff.post("/v1/links", {
      path: `/${name}`,
      destination: "https://example.com/page",
    }),
  );
  const response = await learner.patch("/v1/auth/me", { username: name });
  assert.equal(response.status, 400);
  assert.match(JSON.stringify(response.body.error), /USERNAME_TAKEN/);
  ok(await staff.delete(`/v1/links/${link.id}`));
});
