import { z } from "zod";

/**
 * Links: short addresses on the site's own domain (docs/short-links.md).
 *
 * A path is one to three segments of lowercase letters, digits, `.`, `_` and
 * `-`, each starting with a letter or digit. The website Worker
 * (apps/web/cloudflare/spa-fallback-worker.js) normalises the same way; keep
 * the two in step.
 */
export const SHORT_LINK_PATH_PATTERN = /^(\/[a-z0-9][a-z0-9._-]{0,63}){1,3}$/u;
export const SHORT_LINK_PATH_MAX_LENGTH = 120;
export const SHORT_LINK_DESTINATION_MAX_LENGTH = 2048;

/**
 * Lowercased, trimmed, with one leading slash and no trailing one:
 * " Node.JS/ " is "/node.js". Returns null for anything that cannot be a
 * link path.
 */
export function normalizeShortLinkPath(value: string): string | null {
  let path = value.trim().toLowerCase();
  if (path.length === 0 || path.length > SHORT_LINK_PATH_MAX_LENGTH) {
    return null;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/+$/u, "");
  return SHORT_LINK_PATH_PATTERN.test(path) ? path : null;
}

export const shortLinkModeSchema = z
  .enum(["redirect", "rewrite"])
  .describe(
    "`redirect` sends the visitor to the destination; `rewrite` shows the destination's page under the link's own address.",
  );
export type ShortLinkMode = z.output<typeof shortLinkModeSchema>;

export const shortLinkRedirectStatusSchema = z
  .union([z.literal(301), z.literal(302)])
  .describe(
    "301 (permanent, browsers keep it for good) or 302 (temporary). Only used by redirects.",
  );

const destinationSchema = z
  .string()
  .trim()
  .min(1)
  .max(SHORT_LINK_DESTINATION_MAX_LENGTH)
  .describe("Where the link goes. Must be an https address on another site.");

const pathInputSchema = z
  .string()
  .max(SHORT_LINK_PATH_MAX_LENGTH)
  .describe(
    "The address on this site, such as `/nodejs`. Case does not matter. Empty: a free short path is chosen.",
  );

export const shortLinkSchema = z.object({
  id: z.uuid(),
  path: z.string(),
  destination: z.string(),
  mode: shortLinkModeSchema,
  redirectStatus: shortLinkRedirectStatusSchema,
  isActive: z.boolean(),
  visitCount: z.number().int().min(0),
  lastVisitedAt: z.string().nullable(),
  createdBy: z.object({ id: z.uuid(), name: z.string().nullable() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ShortLink = z.output<typeof shortLinkSchema>;

export const shortLinkListResponseSchema = z.object({
  links: z.array(shortLinkSchema),
});
export type ShortLinkListResponse = z.output<
  typeof shortLinkListResponseSchema
>;

export const createShortLinkRequestSchema = z.object({
  path: pathInputSchema.optional(),
  destination: destinationSchema,
  mode: shortLinkModeSchema.default("redirect"),
  redirectStatus: shortLinkRedirectStatusSchema.default(302),
});
export type CreateShortLinkRequest = z.input<
  typeof createShortLinkRequestSchema
>;

export const updateShortLinkRequestSchema = z
  .object({
    path: pathInputSchema,
    destination: destinationSchema,
    mode: shortLinkModeSchema,
    redirectStatus: shortLinkRedirectStatusSchema,
    isActive: z.boolean(),
  })
  .partial();
export type UpdateShortLinkRequest = z.input<
  typeof updateShortLinkRequestSchema
>;

export const shortLinkPathCheckQuerySchema = z.object({
  path: z.string().max(SHORT_LINK_PATH_MAX_LENGTH).optional(),
  /** The link being edited, so its own path counts as free. */
  linkId: z.uuid().optional(),
});
export type ShortLinkPathCheckQuery = z.output<
  typeof shortLinkPathCheckQuerySchema
>;

export const shortLinkPathCheckResponseSchema = z.object({
  /** The normalised path, or null when the input cannot be a path. */
  path: z.string().nullable(),
  available: z.boolean(),
  /** Why the path cannot be used, in words for the form. */
  reason: z.string().nullable(),
  /** A free path close to the one asked for (or a short new one). */
  suggestion: z.string().nullable(),
});
export type ShortLinkPathCheckResponse = z.output<
  typeof shortLinkPathCheckResponseSchema
>;

export const shortLinkResolveQuerySchema = z.object({
  path: z.string().max(SHORT_LINK_PATH_MAX_LENGTH),
});

/** What the website Worker needs to answer a visit to a link. */
export const shortLinkResolveResponseSchema = z.object({
  id: z.uuid(),
  path: z.string(),
  destination: z.string(),
  mode: shortLinkModeSchema,
  redirectStatus: shortLinkRedirectStatusSchema,
});
export type ShortLinkResolveResponse = z.output<
  typeof shortLinkResolveResponseSchema
>;

/** Always 200, so "no link here" is cached at the edge like a link is. */
export const shortLinkResolveResultSchema = z.object({
  link: shortLinkResolveResponseSchema.nullable(),
});

export const shortLinkVisitRequestSchema = z.object({
  id: z.uuid(),
});
