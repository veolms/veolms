import { z } from "zod";

export const discussionUploadResponseSchema = z.object({
  url: z.string().min(1),
  fileName: z.string().min(1),
  mediaType: z.enum(["image", "video"]),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export type DiscussionUploadResponse = z.infer<
  typeof discussionUploadResponseSchema
>;
