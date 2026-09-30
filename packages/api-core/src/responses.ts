import { z } from "zod";

export function successEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.strictObject({
    success: z.literal(true),
    statusCode: z.number().int().min(100).max(599),
    data: dataSchema,
  });
}

export function jsonResponse<T extends z.ZodTypeAny>(
  description: string,
  schema: T,
) {
  return {
    description,
    content: {
      "application/json": {
        schema: successEnvelopeSchema(schema) as unknown as T,
      },
    },
  };
}

export function errorJsonResponse<T extends z.ZodTypeAny>(
  description: string,
  schema: T,
) {
  return {
    description,
    content: { "application/json": { schema } },
  };
}
