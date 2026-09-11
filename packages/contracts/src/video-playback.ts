import { z } from "zod";

export const videoPlaybackTrackSchema = z.strictObject({
  src: z.string().min(1),
  language: z.string().min(1),
  label: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
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
  duration: z.number().nonnegative().optional(),
  title: z.string().min(1).optional(),
  posterUrl: z.string().min(1).optional(),
  resumeAt: z.number().nonnegative().optional(),
  tracks: z.array(videoPlaybackTrackSchema).optional(),
  source: z.enum(["ssg", "public-cdn", "paid-bootstrap-api"]),
});

export type VideoPlaybackBootstrap = z.infer<
  typeof videoPlaybackBootstrapSchema
>;

export type VideoPlaybackTrack = z.infer<typeof videoPlaybackTrackSchema>;
