import type { FastifyInstance } from "fastify";

import {
  checkSessionBeforeValidation,
  rememberDeviceLimitedSignIns,
} from "./middlewares/auth.middleware.ts";

/**
 * The hooks every app built on core's routes needs, added before any route
 * is registered: this app passes it to `createVeoLMSApi` as `registerHooks`,
 * and an app that composes the factory itself (the cloud API) loads it with
 * api-core's `loadCoreAppHooks()`. A hook core's routes rely on goes here, so
 * it reaches every such app.
 */
export function registerAppHooks(app: FastifyInstance): void {
  checkSessionBeforeValidation(app);
  rememberDeviceLimitedSignIns(app);
}
