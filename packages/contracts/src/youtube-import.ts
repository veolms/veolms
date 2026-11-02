import { z } from "zod";

// --- Import a lesson video from YouTube ---

export const YOUTUBE_IMPORT_STATUSES = [
  "queued",
  "resolving",
  "downloading",
  "packaging",
  "uploading",
  "finalizing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type YoutubeImportStatus = (typeof YOUTUBE_IMPORT_STATUSES)[number];

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The 11-character video id of a link to ONE YouTube video (watch, youtu.be,
 * shorts, live, embed), or null for anything else, playlists included.
 */
export function parseYoutubeVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(
      /^[a-z]+:\/\//i.test(input.trim())
        ? input.trim()
        : `https://${input.trim()}`,
    );
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") candidate = url.searchParams.get("v");
    else if (first && ["shorts", "live", "embed", "v"].includes(first))
      candidate = second ?? null;
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/** The canonical watch URL yt-dlp is given, whatever form was pasted. */
export function canonicalYoutubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export const youtubeVideoUrlSchema = z
  .string()
  .trim()
  .min(1, "Paste a YouTube link.")
  .max(2048)
  .refine((value) => parseYoutubeVideoId(value) !== null, {
    message: "Paste a link to a single YouTube video (not a playlist).",
  });

export const youtubeImportAvailabilityResponseSchema = z.strictObject({
  enabled: z.boolean(),
});

export const youtubeImportPreviewRequestSchema = z.strictObject({
  url: youtubeVideoUrlSchema,
});

export const youtubeImportPreviewResponseSchema = z.strictObject({
  youtubeId: z.string(),
  title: z.string(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  channel: z.string().nullable(),
  thumbnailUrl: z.string().url().nullable(),
  /** Qualities the import will produce, e.g. ["1080p", "720p"]. */
  qualities: z.array(z.string()),
  /** A finished import of the same video by this account, to reuse. */
  existingMediaId: z.string().uuid().nullable(),
});

export const youtubeImportRequestSchema = z
  .strictObject({
    url: youtubeVideoUrlSchema,
    /** The course the video is for, once it is saved. */
    courseId: z.string().uuid().optional(),
    /**
     * The saved lesson to attach the finished video to. Without one (a
     * lesson not saved yet) the editor attaches it, as it does an upload.
     */
    lessonId: z.string().uuid().optional(),
    /**
     * The person importing confirms the academy owns, or may use, the video.
     * Downloading other people's videos breaks YouTube's terms.
     */
    rightsConfirmed: z.literal(true),
  })
  .refine((value) => !value.lessonId || value.courseId, {
    message: "A lesson needs its course.",
    path: ["courseId"],
  });

export const youtubeImportResponseSchema = z.strictObject({
  mediaId: z.string().uuid(),
  jobId: z.string().uuid(),
  status: z.enum(YOUTUBE_IMPORT_STATUSES),
});

export const youtubeImportControlResponseSchema = z.strictObject({
  status: z.enum(YOUTUBE_IMPORT_STATUSES),
});

export const youtubeImportLessonQuerySchema = z.strictObject({
  courseId: z.string().uuid(),
  lessonId: z.string().uuid(),
});

/**
 * The lesson's import that the editor should show again when it is opened:
 * one still running, or one that failed and can be retried, as long as the
 * lesson still has the video it had when the import started.
 */
export const youtubeImportLessonResponseSchema = z.strictObject({
  import: z
    .strictObject({
      mediaId: z.string().uuid(),
      status: z.enum(YOUTUBE_IMPORT_STATUSES),
    })
    .nullable(),
});

export type YoutubeImportLessonQuery = z.infer<
  typeof youtubeImportLessonQuerySchema
>;
export type YoutubeImportLessonResponse = z.infer<
  typeof youtubeImportLessonResponseSchema
>;
export type YoutubeImportAvailabilityResponse = z.infer<
  typeof youtubeImportAvailabilityResponseSchema
>;
export type YoutubeImportPreviewRequest = z.infer<
  typeof youtubeImportPreviewRequestSchema
>;
export type YoutubeImportPreviewResponse = z.infer<
  typeof youtubeImportPreviewResponseSchema
>;
export type YoutubeImportRequest = z.infer<typeof youtubeImportRequestSchema>;
export type YoutubeImportResponse = z.infer<typeof youtubeImportResponseSchema>;
export type YoutubeImportControlResponse = z.infer<
  typeof youtubeImportControlResponseSchema
>;
