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
 * A WebVTT subtitle track for the lesson's video. It sits in the video's
 * protected folder: request it with `segmentToken` like the segments.
 */
export const videoPlaybackSubtitleSchema = z.strictObject({
  url: z.string().min(1),
  /** BCP 47 language tag, such as `en`. */
  language: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["captions", "subtitles"]),
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
  /**
   * The manifest at `manifestUrl` (HLS master playlist or DASH MPD), so the
   * player can skip that
   * request. Sent only to callers that ask for it (`inlineManifest=1`): an
   * older page validates this object strictly and would reject the field.
   * Relative URIs in it are relative to `manifestUrl`.
   */
  inlinedMasterManifest: z.string().min(1).optional(),
  /**
   * The video's seek-preview storyboard index (sprite sheets made from the
   * video), when one has been made. Sent only to callers that ask for it
   * (`storyboard=1`), for the same reason as `inlinedMasterManifest`. Its
   * sheets are protected like the segments: request them with
   * `segmentToken`.
   */
  storyboardUrl: z.string().min(1).optional(),
  /**
   * Where the signed-in learner last was in this lesson's video and when,
   * saved from whichever device they watched it on. Sent only to callers
   * that ask for it (`resume=1`), for the same reason as
   * `inlinedMasterManifest`.
   */
  resumePosition: z
    .strictObject({
      seconds: z.number().int().min(0),
      savedAt: z.iso.datetime(),
    })
    .optional(),
  /**
   * The video's subtitle tracks. Sent only to callers that ask for them
   * (`subtitles=1`), for the same reason as `inlinedMasterManifest`.
   */
  subtitles: z.array(videoPlaybackSubtitleSchema).optional(),
});

/** Query of the playback bootstrap request. */
export const videoPlaybackBootstrapQuerySchema = z.object({
  /** `1` asks for `inlinedMasterManifest` when it can be read quickly. */
  inlineManifest: z.enum(["0", "1"]).optional(),
  /** `1` asks for `storyboardUrl` when the video has a storyboard. */
  storyboard: z.enum(["0", "1"]).optional(),
  /** `1` asks for `resumePosition`, the signed-in learner's last position. */
  resume: z.enum(["0", "1"]).optional(),
  /** `1` asks for `subtitles`, the video's subtitle tracks. */
  subtitles: z.enum(["0", "1"]).optional(),
});

/**
 * What the home page needs to play the video on its hero's laptop, which
 * may be a lesson's video or one uploaded for the home page alone.
 */
export const heroVideoPlaybackSchema = z.strictObject({
  mediaKey: z.string().min(1),
  manifestUrl: z.string().min(1),
  segmentToken: z.string().min(1).optional(),
  segmentTokenExpiresAt: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  title: z.string().min(1).optional(),
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

export type HeroVideoPlayback = z.infer<typeof heroVideoPlaybackSchema>;

export type VideoPlaybackChapter = z.infer<typeof videoPlaybackChapterSchema>;

export type VideoPlaybackSubtitle = z.infer<typeof videoPlaybackSubtitleSchema>;
