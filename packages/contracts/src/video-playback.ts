import { z } from "zod";

/**
 * A chapter derived from the lesson description. The description stays the
 * authoring source; this carries the extracted first-frame thumbnail.
 */
export const videoPlaybackChapterSchema = z.strictObject({
  title: z.string().min(1),
  startSeconds: z.number().int().nonnegative(),
  thumbnailUrl: z.string().min(1).optional(),
});

/**
 * Minimal runtime data needed to start a lesson video. Keep this separate
 * from course and lesson responses so it can be embedded or fetched without
 * pulling unrelated application state into the startup path.
 */
export const videoPlaybackBootstrapSchema = z.strictObject({
  version: z.literal(1),
  courseSlug: z.string().min(1),
  lessonId: z.union([z.string().min(1), z.number().int().positive()]),
  mediaKey: z.string().min(1),
  manifestUrl: z.string().min(1),
  segmentToken: z.string().min(1).optional(),
  segmentTokenExpiresAt: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  chapters: z.array(videoPlaybackChapterSchema).optional(),
  title: z.string().min(1).optional(),
  source: z.literal("paid-bootstrap-api"),
});

/** The minimal response used to renew a protected HLS segment token. */
export const videoPlaybackTokenSchema = z.strictObject({
  token: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

export type VideoPlaybackBootstrap = z.infer<
  typeof videoPlaybackBootstrapSchema
>;

export type VideoPlaybackToken = z.infer<typeof videoPlaybackTokenSchema>;

export type VideoPlaybackChapter = z.infer<typeof videoPlaybackChapterSchema>;
