import {
  createLocalComposerAttachment,
  type LocalComposerAttachment,
} from "../../services/learning-interactions/attachment-model";

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

// The type the server expects for each allowed extension, used only when the
// browser reports no type for a file (it depends on what the device has
// registered for that extension).
const MIME_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".text": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
};

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

export async function selectDiscussionAttachment(
  file: File,
): Promise<DiscussionAttachmentResult> {
  const validationMessage = validateAttachment(file);
  if (validationMessage) return { accepted: false, message: validationMessage };

  return {
    accepted: true,
    message: null,
    attachment: await createLocalComposerAttachment(
      withTypeFromExtension(file),
    ),
  };
}

function getExtension(file: File): string {
  return "." + (file.name.split(".").pop() || "").toLowerCase();
}

/**
 * A file the browser gives no type for used to pass the check by its
 * extension and then go up as application/octet-stream, which the server
 * refuses — but only when the post was sent. It is given the type its
 * extension stands for instead, so what is checked here is what is sent.
 */
function withTypeFromExtension(file: File): File {
  if (file.type) return file;
  const type = MIME_TYPE_BY_EXTENSION[getExtension(file)];
  if (!type) return file;
  return new File([file], file.name, {
    type,
    lastModified: file.lastModified,
  });
}

function validateAttachment(file: File): string | null {
  const ext = getExtension(file);
  const mimeType = file.type.toLowerCase();

  const isMimeAllowed = ALLOWED_MIME_PATTERNS.includes(mimeType);
  const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);

  if (!isMimeAllowed && !isExtAllowed) {
    return "Choose a supported image, video, document, or code file.";
  }

  // With no type from the browser, the extension is all there is to send.
  if (!mimeType && !MIME_TYPE_BY_EXTENSION[ext]) {
    return "Choose a supported image, video, document, or code file.";
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "Files must be smaller than 50 MB.";
  }

  return null;
}
