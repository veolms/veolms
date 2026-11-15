import { z } from "zod";
import { mediaAssetStatusSchema } from "../media.ts";

/**
 * What a lesson can be. A lesson holds one piece of content per kind
 * (video, audio, image, document) and shows learners the kind its creator
 * selected; a quiz lesson holds questions instead.
 */
export const LESSON_CONTENT_KINDS = [
  "video",
  "audio",
  "image",
  "document",
] as const;
export const lessonContentKindSchema = z.enum(LESSON_CONTENT_KINDS);
export type LessonContentKind = z.infer<typeof lessonContentKindSchema>;

export const lessonContentTypeSchema = z.enum([
  ...LESSON_CONTENT_KINDS,
  "quiz",
]);
export type LessonContentType = z.infer<typeof lessonContentTypeSchema>;

/** The largest PDF a document lesson can hold: what the reader opens. */
export const LESSON_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;
/** The longest text a document lesson can hold (Markdown). */
export const LESSON_DOCUMENT_BODY_MAX_LENGTH = 200_000;

/**
 * The files each kind accepts, by type, as a browser plays or shows them
 * without conversion. A video goes through transcoding and accepts any.
 */
export const LESSON_CONTENT_MIME_TYPES = {
  audio: [
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/ogg",
    "audio/webm",
  ],
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  document: ["application/pdf"],
} as const satisfies Partial<Record<LessonContentKind, readonly string[]>>;

/** The file extensions a kind's file picker offers. */
export const LESSON_CONTENT_FILE_EXTENSIONS = {
  video: [".mp4", ".mov", ".m4v", ".webm", ".mkv"],
  audio: [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".weba"],
  image: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
  document: [".pdf"],
} as const satisfies Record<LessonContentKind, readonly string[]>;

/** The media asset type each kind's file is stored as. */
export const LESSON_CONTENT_MEDIA_TYPE = {
  video: "video",
  audio: "audio",
  image: "image",
  document: "document",
} as const satisfies Record<LessonContentKind, string>;

function baseMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/** Whether a file of this type may be a lesson's content of this kind. */
export function isLessonContentMimeType(
  kind: LessonContentKind,
  mimeType: string,
): boolean {
  const base = baseMimeType(mimeType);
  if (kind === "video") return base.startsWith("video/");
  return (LESSON_CONTENT_MIME_TYPES[kind] as readonly string[]).includes(base);
}

/** One kind's content, as the lesson editor shows it. */
export const lessonContentSchema = z.object({
  contentType: lessonContentKindSchema,
  mediaId: z.uuid().nullable(),
  /** A document's text (Markdown); null for every other kind. */
  body: z.string().nullable(),
  media: z
    .object({
      originalFilename: z.string(),
      mimeType: z.string(),
      sizeBytes: z.coerce.number().int().nonnegative(),
      status: mediaAssetStatusSchema,
      durationSeconds: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
});
export type LessonContent = z.infer<typeof lessonContentSchema>;

export const lessonContentParamsSchema = z.object({
  courseId: z.uuid(),
  lessonId: z.uuid(),
  contentType: lessonContentKindSchema,
});
export type LessonContentParams = z.infer<typeof lessonContentParamsSchema>;

/**
 * `PUT /courses/:courseId/lessons/:lessonId/contents/:contentType`: sets
 * what one kind holds. A field left out is kept; `null` clears it. Content
 * left with neither media nor text is removed.
 */
export const setLessonContentRequestSchema = z
  .object({
    mediaId: z.uuid().nullable().optional(),
    body: z.string().max(LESSON_DOCUMENT_BODY_MAX_LENGTH).nullable().optional(),
  })
  .refine((data) => data.mediaId !== undefined || data.body !== undefined, {
    message: "Give the media, the text, or both.",
  });
export type SetLessonContentRequest = z.infer<
  typeof setLessonContentRequestSchema
>;

/** Every kind's content of a lesson, after a change. */
export const lessonContentsResponseSchema = z.object({
  lessonId: z.uuid(),
  contentType: lessonContentTypeSchema,
  contentMediaId: z.uuid().nullable(),
  contents: z.array(lessonContentSchema),
});
export type LessonContentsResponse = z.infer<
  typeof lessonContentsResponseSchema
>;

/**
 * `GET /courses/:courseId/lessons/:lessonId/media-link`: a short-lived
 * address of an audio or image lesson's file, for whoever may open it.
 */
export const lessonMediaLinkResponseSchema = z.object({
  url: z.url(),
  mimeType: z.string(),
  expiresAt: z.iso.datetime(),
});
export type LessonMediaLinkResponse = z.infer<
  typeof lessonMediaLinkResponseSchema
>;
