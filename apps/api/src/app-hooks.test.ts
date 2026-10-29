import assert from "node:assert/strict";
import { test } from "node:test";

import fastifyCookie from "@fastify/cookie";
import { loadCoreAppHooks } from "@veolms/api-core";
import Fastify from "fastify";

import { DEVICE_SIGN_IN_COOKIE } from "./modules/auth/shared/auth.constants.ts";
import { DeviceLimitReachedError } from "./modules/auth/session/session.service.ts";

/**
 * An app that composes the factory itself (the cloud API) gets core's hooks
 * from api-core's loader. Without them a sign-in at the device limit
 * answered 409 with no cookie, so the device list it opens always said the
 * sign-in had expired.
 */
await test("core's hooks, loaded as another app loads them, give a device-limited sign-in its cookie", async () => {
  const app = Fastify({ logger: false });
  (await loadCoreAppHooks())(app);
  await app.register(fastifyCookie);
  app.post("/sign-in", () => {
    throw new DeviceLimitReachedError("waiting-sign-in-token");
  });

  const response = await app.inject({ method: "POST", url: "/sign-in" });
  await app.close();

  assert.equal(response.statusCode, 409);
  const cookie = response.cookies.find(
    (entry) => entry.name === DEVICE_SIGN_IN_COOKIE,
  );
  assert.equal(cookie?.value, "waiting-sign-in-token");
  assert.equal(cookie?.httpOnly, true);
});
