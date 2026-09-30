// AppError and httpError now live in @veolms/api-core so cloud apps can use
// them too. Re-export here so every existing import path keeps working.
export { AppError, httpError } from "@veolms/api-core";
export type { ErrorResponse, ValidationIssue } from "@veolms/api-core";

import { errorResponseSchema } from "@veolms/contracts";
import { errorJsonResponse } from "./responses.ts";

export function errorResponse(description: string) {
  return errorJsonResponse(description, errorResponseSchema);
}
