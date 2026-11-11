import {
  LESSON_CONTENT_FILE_EXTENSIONS,
  LESSON_CONTENT_MIME_TYPES,
  LESSON_DOCUMENT_MAX_BYTES,
  MEDIA_MAX_SIZES,
  isLessonContentMimeType,
  type LessonContentKind,
} from "@veolms/contracts";

/** What a kind's file picker offers: its types and its extensions. */
export function lessonContentAccept(kind: LessonContentKind): string {
  const types =
    kind === "video" ? ["video/*"] : [...LESSON_CONTENT_MIME_TYPES[kind]];
  return [...types, ...LESSON_CONTENT_FILE_EXTENSIONS[kind]].join(",");
}

/** The largest file a kind takes. */
export function lessonContentMaxBytes(kind: LessonContentKind): number {
  return kind === "document"
    ? LESSON_DOCUMENT_MAX_BYTES
    : MEDIA_MAX_SIZES[kind === "audio" ? "audio" : kind];
}

const KIND_NAMES: Record<LessonContentKind, string> = {
  video: "a video",
  audio: "an audio file (MP3, M4A, AAC, WAV, OGG or WebM)",
  image: "an image (JPEG, PNG, WebP or GIF)",
  document: "a PDF",
};

function formatLimit(bytes: number) {
  return bytes >= 1024 * 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
    : `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Why a file cannot be a lesson's content of this kind, or null when it
 * can. The server checks the same again; this says so before uploading.
 */
export function lessonContentFileProblem(
  kind: LessonContentKind,
  file: File,
): string | null {
  const extension = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
  const typeFits = file.type ? isLessonContentMimeType(kind, file.type) : false;
  const extensionFits = (
    LESSON_CONTENT_FILE_EXTENSIONS[kind] as readonly string[]
  ).includes(extension);
  if (!typeFits && !extensionFits) {
    if (kind === "document" && /\.(docx?|odt|pages|rtf)$/i.test(file.name)) {
      return "Export the document as a PDF and upload that.";
    }
    return `This lesson type takes ${KIND_NAMES[kind]}.`;
  }
  const limit = lessonContentMaxBytes(kind);
  if (file.size > limit) {
    return `The file is larger than ${formatLimit(limit)}.`;
  }
  return null;
}

/** The type to declare for an upload: the browser's, or the extension's. */
export function lessonContentMimeType(
  kind: LessonContentKind,
  file: File,
): string {
  if (file.type && isLessonContentMimeType(kind, file.type)) return file.type;
  const extension = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";
  const byExtension: Record<string, string> = {
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    weba: "audio/webm",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  return byExtension[extension] ?? (file.type || "application/octet-stream");
}
