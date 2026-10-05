import { z } from "zod";

import { avatarImageVariantSchema } from "./user.ts";
import { AVATAR_UPLOAD_CONTENT_TYPES } from "./avatar-rules.ts";

// The plain values live in avatar-rules.ts so dependency-light consumers
// (the web app's startup path) can use them without importing zod.
export {
  AVATAR_STYLES,
  AVATAR_UPLOAD_CONTENT_TYPES,
  DEFAULT_AVATAR_STYLE,
  DICEBEAR_BASE_URL,
  buildDicebearSvgUrl,
  isAvatarUploadContentType,
  type AvatarStyle,
} from "./avatar-rules.ts";

const AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export const avatarUploadContentTypeSchema = z.enum(
  AVATAR_UPLOAD_CONTENT_TYPES,
);

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
