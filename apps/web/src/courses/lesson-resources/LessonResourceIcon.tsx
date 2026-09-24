import type { Icon } from "@phosphor-icons/react";
import { FileArchiveIcon as FileArchive } from "@phosphor-icons/react/FileArchive";
import { FileAudioIcon as FileAudio } from "@phosphor-icons/react/FileAudio";
import { FileCodeIcon as FileCode } from "@phosphor-icons/react/FileCode";
import { FileCsvIcon as FileCsv } from "@phosphor-icons/react/FileCsv";
import { FileDocIcon as FileDoc } from "@phosphor-icons/react/FileDoc";
import { FileImageIcon as FileImage } from "@phosphor-icons/react/FileImage";
import { FilePdfIcon as FilePdf } from "@phosphor-icons/react/FilePdf";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { FileVideoIcon as FileVideo } from "@phosphor-icons/react/FileVideo";
import { FileXlsIcon as FileXls } from "@phosphor-icons/react/FileXls";

interface LessonResourceIconProps {
  name?: string;
  type?: string;
  mimeType?: string;
  size?: number;
  className?: string;
}

interface ResourceIconMeta {
  Icon: Icon;
  colorClass: string;
}

export function LessonResourceIcon({
  name,
  type,
  mimeType,
  size = 16,
  className,
}: LessonResourceIconProps) {
  const { Icon, colorClass } = getResourceIconMeta(name, type, mimeType);

  return (
    <Icon
      size={size}
      weight="fill"
      className={[colorClass, className].filter(Boolean).join(" ")}
    />
  );
}

function getResourceIconMeta(
  name?: string,
  type?: string,
  mimeType?: string,
): ResourceIconMeta {
  const normalizedType = normalizeType(type || getFileExtension(name));
  const normalizedMimeType = mimeType?.toLowerCase().trim() || "";

  if (normalizedMimeType.startsWith("image/") || IMAGE_TYPES.has(normalizedType)) {
    return { Icon: FileImage, colorClass: "text-emerald-400" };
  }

  if (normalizedMimeType.startsWith("audio/") || AUDIO_TYPES.has(normalizedType)) {
    return { Icon: FileAudio, colorClass: "text-violet-400" };
  }

  if (normalizedMimeType.startsWith("video/") || VIDEO_TYPES.has(normalizedType)) {
    return { Icon: FileVideo, colorClass: "text-sky-400" };
  }

  if (ARCHIVE_TYPES.has(normalizedType)) {
    return { Icon: FileArchive, colorClass: "text-amber-400" };
  }

  if (SPREADSHEET_TYPES.has(normalizedType)) {
    return { Icon: FileXls, colorClass: "text-green-400" };
  }

  if (normalizedType === "csv") {
    return { Icon: FileCsv, colorClass: "text-green-400" };
  }

  if (normalizedType === "pdf") {
    return { Icon: FilePdf, colorClass: "text-red-400" };
  }

  if (DOCUMENT_TYPES.has(normalizedType)) {
    return { Icon: FileDoc, colorClass: "text-blue-400" };
  }

  if (CODE_TYPES.has(normalizedType)) {
    return { Icon: FileCode, colorClass: "text-cyan-400" };
  }

  return { Icon: FileText, colorClass: "text-(--accent)" };
}

function getFileExtension(name?: string): string {
  return name?.split(".").pop() || "";
}

function normalizeType(type: string): string {
  return type.toLowerCase().trim().replace(/^\./, "");
}

const IMAGE_TYPES = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg"]);
const AUDIO_TYPES = new Set(["mp3", "wav", "m4a", "ogg", "aac", "flac"]);
const VIDEO_TYPES = new Set(["mp4", "mov", "avi", "webm", "mkv"]);
const ARCHIVE_TYPES = new Set(["zip", "rar", "7z", "tar", "gz"]);
const SPREADSHEET_TYPES = new Set(["xls", "xlsx"]);
const DOCUMENT_TYPES = new Set(["doc", "docx", "rtf"]);
const CODE_TYPES = new Set([
  "md",
  "txt",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "html",
  "css",
  "xml",
]);
