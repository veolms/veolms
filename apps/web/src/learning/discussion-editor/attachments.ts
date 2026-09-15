import {
  createLocalComposerAttachment,
  type LocalComposerAttachment,
} from "../../services/learning-interactions";

const MAX_ATTACHMENT_BYTES = 50_000_000;

export interface DiscussionAttachmentResult {
  accepted: boolean;
  message: string | null;
  attachment?: LocalComposerAttachment;
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

export function selectDiscussionAttachment(
  file: File,
): DiscussionAttachmentResult {
  const validationMessage = validateAttachment(file);
  if (validationMessage) return { accepted: false, message: validationMessage };

  return {
    accepted: true,
    message: null,
    attachment: createLocalComposerAttachment(file),
  };
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
