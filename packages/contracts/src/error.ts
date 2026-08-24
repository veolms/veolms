import { z } from "zod";

const validationIssueSchema = z.strictObject({
  path: z.string().meta({
    description: "Location of the offending value, e.g. `/slug`.",
  }),
  message: z.string().meta({ description: "What was wrong with that value." }),
});

/**
 * The shape of every non-2xx response the API returns.
 *
 * Lives here rather than in the API app because it is part of the published
 * contract: clients branch on `error.code`, so the set of shapes they must
 * handle belongs alongside the request and response schemas they already
 * import. The helpers that *construct* these payloads stay in the API.
 */
export const errorResponseSchema = z.strictObject({
  success: z.literal(false),
  statusCode: z.number().int().min(100).max(599),
  error: z.strictObject({
    code: z
      .string()
      .meta({ description: "Stable machine-readable error code." }),
    message: z.string().meta({ description: "Human-readable explanation." }),
    issues: z
      .array(validationIssueSchema)
      .optional()
      .meta({ description: "Only present when request validation failed." }),
  }),
});

z.globalRegistry.add(errorResponseSchema, {
  id: "ErrorResponse",
  description: "The shape of every non-2xx response this API returns.",
});

export type ErrorResponse = z.output<typeof errorResponseSchema>;
export type ValidationIssue = z.output<typeof validationIssueSchema>;
