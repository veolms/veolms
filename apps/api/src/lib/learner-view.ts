import {
  LEARNER_VIEW_HEADER,
  LEARNER_VIEW_HEADER_VALUE,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

/**
 * Whether the request asks to be answered as a learner would be: sent by an
 * account that manages courses while it is in its Student view (see
 * `LEARNER_VIEW_HEADER`). It only ever narrows what the viewer is shown.
 */
export function isLearnerViewRequest(request: FastifyRequest): boolean {
  return request.headers[LEARNER_VIEW_HEADER] === LEARNER_VIEW_HEADER_VALUE;
}
