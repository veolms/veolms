import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import {
  checkSessionBeforeValidation,
  createAuthMiddleware,
} from "./auth.middleware.ts";

const learner = {
  user: { id: "learner-1", roles: ["student"] },
  session: { mfa_verified: true },
};

async function buildApp() {
  const middleware = createAuthMiddleware({
    authenticate: async (cookie: string) =>
      cookie === "learner" ? learner : null,
  } as never);

  const order: string[] = [];
  const app = Fastify();
  // The cookie plugin is not needed to tell who is calling here.
  app.addHook("onRequest", async (request) => {
    order.length = 0;
    (request as { cookies: Record<string, string> }).cookies = {
      "veolms-session": String(request.headers["x-session"] ?? ""),
    };
  });
  checkSessionBeforeValidation(app);
  app.setValidatorCompiler(() => (data) => {
    order.push("validation");
    return (data as { title?: unknown }).title === "ok"
      ? { value: data }
      : { error: new Error("invalid body") };
  });

  // Stands for a permission check that looks a course up by its id.
  async function resourceGuard(_request: FastifyRequest, _reply: FastifyReply) {
    order.push("resource guard");
  }
  const body = { type: "object" };
  const handler = async () => ({ ok: true });

  app.post(
    "/signed-in",
    {
      schema: { body },
      preHandler: [
        middleware.authenticate,
        middleware.requireAuthenticated,
        middleware.requireMfaVerified,
        resourceGuard,
      ],
    },
    handler,
  );
  app.post(
    "/admin",
    {
      schema: { body },
      preHandler: [
        middleware.authenticate,
        middleware.requireAuthenticated,
        middleware.requireRoles(["admin"]),
      ],
    },
    handler,
  );
  app.post(
    "/guard-first",
    {
      schema: { body },
      preHandler: [resourceGuard, middleware.authenticate],
    },
    handler,
  );
  await app.ready();
  return { app, order };
}

const post = (url: string, session: string, title: unknown) => ({
  method: "POST" as const,
  url,
  headers: { "x-session": session },
  payload: { title },
});

await test("a caller who is not signed in gets 401, not what is wrong with the body", async () => {
  const { app, order } = await buildApp();
  const response = await app.inject(post("/signed-in", "", 5));
  assert.equal(response.statusCode, 401);
  assert.deepEqual(order, []);
  await app.close();
});

await test("a caller without the role gets 403 before the body is validated", async () => {
  const { app, order } = await buildApp();
  const response = await app.inject(post("/admin", "learner", 5));
  assert.equal(response.statusCode, 403);
  assert.deepEqual(order, []);
  await app.close();
});

await test("a signed-in caller's invalid request is refused before a resource guard runs", async () => {
  const { app, order } = await buildApp();
  const response = await app.inject(post("/signed-in", "learner", 5));
  assert.equal(response.statusCode, 400);
  assert.deepEqual(order, ["validation"]);
  await app.close();
});

await test("a valid request passes validation, then the resource guard", async () => {
  const { app, order } = await buildApp();
  const response = await app.inject(post("/signed-in", "learner", "ok"));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(order, ["validation", "resource guard"]);
  await app.close();
});

await test("guards listed after another guard are left where they are", async () => {
  const { app, order } = await buildApp();
  const response = await app.inject(post("/guard-first", "", 5));
  assert.equal(response.statusCode, 400);
  assert.deepEqual(order, ["validation"]);
  await app.close();
});
