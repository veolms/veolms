import type {
  CodingAiStreamEvent,
  GenerateCodingExerciseRequest,
  ReviseCodingExerciseRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../../lib/errors.ts";
import type { CodingAiService } from "./coding-ai.service.ts";

/** A blank line now and then keeps proxies from closing a quiet stream. */
const KEEPALIVE_MS = 10_000;

type Signed = FastifyRequest & { user: NonNullable<FastifyRequest["user"]> };

/**
 * Answers with one JSON object per line (NDJSON) while the work runs:
 * progress, then `done` or `error`. A question takes a minute or more,
 * longer than proxies wait for a silent response. Closing the request
 * stops the work and the AI call.
 */
export async function streamEvents<
  E extends { type: string } = CodingAiStreamEvent,
>(
  request: FastifyRequest,
  reply: FastifyReply,
  work: (emit: (event: E) => void, signal: AbortSignal) => Promise<unknown>,
  failureMessage = "Something went wrong while the AI wrote the question. Try again.",
) {
  // Fastify's CORS hook set these on the reply; the raw response below
  // would otherwise go out without them (as in the notification stream).
  const passed: Record<string, string> = {};
  for (const name of [
    "Access-Control-Allow-Origin",
    "Access-Control-Allow-Credentials",
    "Vary",
  ]) {
    const value = reply.getHeader(name);
    if (typeof value === "string") passed[name] = value;
  }
  reply.hijack();
  const response = reply.raw;
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    ...passed,
  });

  const controller = new AbortController();
  let ended = false;
  const write = (text: string) => {
    if (!ended && !response.writableEnded) response.write(text);
  };
  const emit = (event: E) => write(`${JSON.stringify(event)}\n`);
  const keepalive = setInterval(() => write("\n"), KEEPALIVE_MS);
  const onClose = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.on("close", onClose);

  try {
    await work(emit, controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) {
      const known = error instanceof AppError;
      if (!known) request.log.error({ err: error }, "AI request failed");
      emit({
        type: "error",
        code: known ? error.code : "AI_FAILED",
        message: known ? error.message : failureMessage,
      } as unknown as E);
    }
  } finally {
    ended = true;
    clearInterval(keepalive);
    response.off("close", onClose);
    if (!response.writableEnded) response.end();
  }
}

export function createCodingAiController(service: CodingAiService) {
  const actor = (request: FastifyRequest) => {
    const { user } = request as Signed;
    return { id: user.id, roles: user.roles };
  };
  return {
    generate: (request: FastifyRequest, reply: FastifyReply) =>
      streamEvents(request, reply, (emit, signal) =>
        service.generate(
          actor(request),
          (request.params as { courseId: string }).courseId,
          request.body as GenerateCodingExerciseRequest,
          emit,
          signal,
        ),
      ),
    revise: (request: FastifyRequest, reply: FastifyReply) =>
      streamEvents(request, reply, (emit, signal) =>
        service.revise(
          actor(request),
          (request.params as { id: string }).id,
          request.body as ReviseCodingExerciseRequest,
          emit,
          signal,
        ),
      ),
  };
}
