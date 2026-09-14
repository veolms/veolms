import type { DiscussionEditorCommands } from "./commands";
import {
  localDiscussionAttachmentStorage,
  type DiscussionAttachmentStorage,
  type StoredDiscussionAttachment,
} from "./image-storage";

const MAX_ATTACHMENT_BYTES = 50_000_000;

export interface DiscussionAttachmentResult {
  inserted: boolean;
  message: string | null;
  attachment?: StoredDiscussionAttachment;
}

const ALLOWED_MIME_PATTERNS = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
];

const ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".mp4",
  ".mov",
  ".webm",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".text",
  ".md",
  ".csv",
  ".json",
];

export function getClipboardMediaFiles(
  clipboardData: DataTransfer | null,
): File[] {
  if (!clipboardData) return [];

  const itemFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (itemFiles.length > 0) return itemFiles;
  return Array.from(clipboardData.files);
}

export async function insertDiscussionAttachment(
  commands: DiscussionEditorCommands,
  file: File,
  storage: DiscussionAttachmentStorage = localDiscussionAttachmentStorage,
): Promise<DiscussionAttachmentResult> {
  const validationMessage = validateAttachment(file);
  if (validationMessage) return { inserted: false, message: validationMessage };

  try {
    const stored = await storage.upload(file);
    const escapedName = escapeMarkdownLabel(
      file.name || stored.fileName || "attachment",
    );

    const isMedia =
      stored.mediaType === "image" ||
      stored.mediaType === "video" ||
      file.type.startsWith("image/") ||
      file.type.startsWith("video/");

    if (isMedia) {
      const isVideo =
        stored.mediaType === "video" || file.type.startsWith("video/");
      const alt = isVideo ? `video: ${escapedName}` : escapedName;
      commands.insertMarkdown(`\n![${alt}](${stored.url})\n`);
    } else {
      commands.insertMarkdown(`\n[${escapedName}](${stored.url})\n`);
    }

    return { inserted: true, message: null, attachment: stored };
  } catch {
    return {
      inserted: false,
      message: `Failed to upload "${file.name}". Please try again.`,
    };
  }
}

function validateAttachment(file: File): string | null {
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  const mimeType = file.type.toLowerCase();

  const isMimeAllowed = ALLOWED_MIME_PATTERNS.includes(mimeType);
  const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);

  if (!isMimeAllowed && !isExtAllowed) {
    return "Choose a supported image, video, document, or code file.";
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "Files must be smaller than 50 MB.";
  }

  return null;
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/[\\\[\]]/g, "\\$&");
}
