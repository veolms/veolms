import { z } from "zod";

/** Query values shared by the affiliate lists (admin and affiliate). */

/** A page of a list: 1-based, 10, 25 or 50 to a page. */
export const page = z.coerce.number().int().min(1).max(10_000).default(1);
export const pageSize = z.coerce
  .number()
  .int()
  .refine((value) => [10, 25, 50].includes(value), "10, 25 or 50")
  .default(25);

/** `a,b,c` in a query string, each one of `values`; empty means none chosen. */
export function csvOf<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .max(1000)
    .transform((text, context) => {
      const items = [
        ...new Set(text.split(",").map((item) => item.trim())),
      ].filter(Boolean);
      for (const item of items) {
        if (!(values as readonly string[]).includes(item)) {
          context.addIssue({
            code: "custom",
            message: `Unknown value "${item}"`,
          });
          return z.NEVER;
        }
      }
      return items as T[number][];
    });
}

/** `id,id` in a query string: up to 50 ids. */
export const csvIds = z
  .string()
  .max(2000)
  .transform((text, context) => {
    const items = [
      ...new Set(text.split(",").map((item) => item.trim())),
    ].filter(Boolean);
    if (
      items.length > 50 ||
      items.some((item) => !z.uuid().safeParse(item).success)
    ) {
      context.addIssue({
        code: "custom",
        message: "Up to 50 ids, comma separated",
      });
      return z.NEVER;
    }
    return items;
  });
