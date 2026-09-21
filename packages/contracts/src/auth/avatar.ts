import { z } from "zod";

import { avatarImageVariantSchema } from "./user.ts";

const AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export const avatarUploadContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const avatarUploadFileSizeSchema = z
  .number()
  .int()
  .positive()
  .max(AVATAR_UPLOAD_MAX_BYTES);

/** Shared request used by both the presign and upload-complete avatar calls. */
export const avatarUploadPresignRequestSchema = z.strictObject({
  contentType: avatarUploadContentTypeSchema,
  fileSize: avatarUploadFileSizeSchema,
});

export const avatarUploadCompleteRequestSchema =
  avatarUploadPresignRequestSchema.extend({
    uploadId: z.uuid(),
  });

export const avatarUploadPresignResponseSchema = z.strictObject({
  uploadId: z.uuid(),
  uploadUrl: z.url().max(20_000),
});

export const userAvatarSourceSchema = z.enum(["upload", "google"]);

export const userAvatarSchema = z.strictObject({
  id: z.uuid(),
  avatarDataUrl: z.string().max(3_000_000),
  avatarSrcSet: z.array(avatarImageVariantSchema),
  source: userAvatarSourceSchema,
  createdAt: z.iso.datetime(),
  isCurrent: z.boolean(),
  canDelete: z.boolean(),
});

export const userAvatarListResponseSchema = z.array(userAvatarSchema);

export const selectAvatarRequestSchema = z.strictObject({
  avatarId: z.uuid(),
});

export type AvatarUploadContentType = z.infer<
  typeof avatarUploadContentTypeSchema
>;
export type AvatarUploadPresignRequest = z.input<
  typeof avatarUploadPresignRequestSchema
>;
export type AvatarUploadCompleteRequest = z.input<
  typeof avatarUploadCompleteRequestSchema
>;
export type AvatarUploadPresignResponse = z.output<
  typeof avatarUploadPresignResponseSchema
>;
export type UserAvatarSource = z.infer<typeof userAvatarSourceSchema>;
export type UserAvatar = z.output<typeof userAvatarSchema>;
export type UserAvatarListResponse = z.output<
  typeof userAvatarListResponseSchema
>;
export type SelectAvatarRequest = z.input<typeof selectAvatarRequestSchema>;

/**
 * Helpers for DiceBear's public HTTP API
 * (https://www.dicebear.com/how-to-use/http-api/). No authentication is
 * required, so both the browser (style picker previews) and the server
 * (default avatar generated at signup) call the same endpoint shape.
 */
export const DICEBEAR_BASE_URL = "https://api.dicebear.com/10.x";

/**
 * Small curated subset of DiceBear's styles, good enough for a profile
 * picture picker without listing every style the API supports.
 */
export const AVATAR_STYLES = [
  "lorelei",
  "notionists",
  "adventurer",
  "micah",
  "bottts",
  "pixel-art",
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number];

/** Style used for the deterministic avatar generated automatically at signup. */
export const DEFAULT_AVATAR_STYLE: AvatarStyle = AVATAR_STYLES[0];

/**
 * Builds the SVG endpoint URL for a given style + seed. The seed is
 * URL-encoded since it may contain characters DiceBear doesn't expect
 * (e.g. a shuffled seed like "<userId>-3").
 */
export function buildDicebearSvgUrl(style: AvatarStyle, seed: string): string {
  return `${DICEBEAR_BASE_URL}/${style}/svg?seed=${encodeURIComponent(seed)}`;
}
