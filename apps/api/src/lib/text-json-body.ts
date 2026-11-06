import { createCorsMatcher } from "@veolms/api-core";
import type { FastifyReply, FastifyRequest } from "fastify";

import { config } from "../config.ts";
import { AppError } from "./errors.ts";

const corsMatcher = createCorsMatcher(config);

/**
 * Lets a route take its JSON body sent as `text/plain`.
 *
 * Why: a JSON POST to the API (another host than the site) makes the browser
 * send a CORS preflight first. On some students' computers the preflight got
 * through but the POST after it never reached Cloudflare's origin, so sign-in
 * showed "Can't reach our server" every time (2026-10/11 logs: 44 browsers,
 * mostly Windows). The same browsers' `text/plain` POSTs (analytics) always
 * arrived. A `text/plain` body is a "simple" request: no preflight.
 *
 * Simple requests can be sent by any website, so a `text/plain` body is only
 * accepted when the request's Origin is one the API allows (browsers always
 * send Origin on these POSTs). That keeps other sites from posting sign-in
 * forms in a visitor's name. A request without Origin (not a browser page)
 * gains nothing it could not already send as JSON.
 *
 * Fastify's built-in parser hands `text/plain` over as a string; this
 * `preValidation` hook turns it into the object the route schema checks.
 */
export async function acceptTextJsonBody(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("text/plain")) return;

  const origin = request.headers.origin;
  if (origin !== undefined && !corsMatcher.isAllowedOrigin(origin)) {
    throw new AppError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This request must come from the site itself.",
    );
  }

  if (typeof request.body !== "string") return;
  try {
    request.body = request.body.trim() === "" ? {} : JSON.parse(request.body);
  } catch {
    throw new AppError(
      400,
      "INVALID_JSON_BODY",
      "The request body is not valid JSON.",
    );
  }
}
