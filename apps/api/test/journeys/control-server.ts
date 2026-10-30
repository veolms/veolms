/**
 * Test helpers the browser tests call, on a port of their own. Nothing here
 * is part of the API: the web app never sees this port.
 *
 *   GET  /health                   the server is up
 *   GET  /emails/code?to=<email>   the sign-in code last emailed to <email>
 *   POST /courses                  writes a course (options of createCourse)
 *   POST /learners                 signs a new learner up; returns their session
 *   POST /sessions                 signs an existing learner in again (another device)
 *   POST /admin-session            signs the administrator in; returns the session
 *   POST /grants                   staff give a learner a course
 *   POST /revocations              staff take a course away from a learner
 *   POST /payments/pay             the fake gateway takes a payment for an order
 *   GET  /cdn/requests?mediaId=    what the test CDN was asked for that video
 *
 * A session is handed back as a cookie, which the test puts in its browser:
 * a learner who is "already signed in" without typing a code every time.
 * Signing in by code is itself tested through the screens.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";

import type { CdnRequest } from "./cdn-server.ts";
import {
  signedInAdmin,
  signedUpLearner,
  type FlowApp,
  type FlowClient,
} from "../flows/setup/flow-app.ts";
import {
  createCourse,
  type FlowCourseOptions,
} from "../flows/setup/flow-courses.ts";

const SESSION_COOKIE = "veolms-session";

async function readJson(request: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

function sessionOf(client: FlowClient) {
  const value = client.cookies.get(SESSION_COOKIE);
  if (!value) throw new Error("The sign-in left no session cookie.");
  return { name: SESSION_COOKIE, value };
}

export function startControlServer(
  port: number,
  flow: FlowApp,
  cdnRequests: CdnRequest[],
): Promise<Server> {
  // Staff actions are made by the administrator, signed in once.
  let admin: FlowClient | null = null;
  const staff = async () => (admin ??= await signedInAdmin(flow));

  const routes: Record<
    string,
    (url: URL, request: IncomingMessage) => Promise<unknown>
  > = {
    "GET /health": async () => ({ ok: true }),

    "GET /emails/code": async (url) => ({
      code: flow.email.lastCodeFor(url.searchParams.get("to") ?? ""),
    }),

    "POST /courses": async (_url, request) =>
      createCourse(flow, (await readJson(request)) as FlowCourseOptions),

    "POST /learners": async (_url, request) => {
      const { label } = await readJson(request);
      const { client, learner, userId } = await signedUpLearner(flow, label);
      return { ...learner, userId, session: sessionOf(client) };
    },

    "POST /sessions": async (_url, request) => {
      // The same learner signing in on another device: a session of its own.
      const { email } = await readJson(request);
      const client = flow.visitor();
      const response = await client.signIn(email);
      if (response.status !== 200) {
        throw new Error(`Signing in answered ${response.status}`);
      }
      return { session: sessionOf(client) };
    },

    "POST /admin-session": async () => {
      const client = await signedInAdmin(flow);
      return { session: sessionOf(client) };
    },

    "POST /grants": async (_url, request) => {
      const { userId, courseId } = await readJson(request);
      const response = await (
        await staff()
      ).post("/v1/access/grants", { userId, courseId });
      if (response.status !== 201) {
        throw new Error(`Granting answered ${response.status}`);
      }
      return { ok: true };
    },

    "POST /revocations": async (_url, request) => {
      const { userId, courseId } = await readJson(request);
      const response = await (
        await staff()
      ).delete(`/v1/access/users/${userId}/courses/${courseId}`);
      if (response.status !== 200) {
        throw new Error(`Revoking answered ${response.status}`);
      }
      return { ok: true };
    },

    "POST /payments/pay": async (_url, request) => {
      const { gatewayOrderId } = await readJson(request);
      return flow.gateway.pay(gatewayOrderId);
    },

    "GET /cdn/requests": async (url) => {
      const mediaId = url.searchParams.get("mediaId");
      return cdnRequests.filter((entry) => entry.mediaId === mediaId);
    },
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    const route = routes[`${request.method} ${url.pathname}`];
    if (!route) {
      response.writeHead(404).end();
      return;
    }
    try {
      const result = await route(url, request);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[control] ${request.method} ${url.pathname}: ${message}`);
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: message }));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
