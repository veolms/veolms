import { useRef, useState } from "react";
import { FileCodeIcon as FileCode } from "@phosphor-icons/react/FileCode";
import { FilePdfIcon as FilePdf } from "@phosphor-icons/react/FilePdf";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { ImageIcon as ImageIcon } from "@phosphor-icons/react/Image";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { XIcon as X } from "@phosphor-icons/react/X";
import { AttachmentViewerDialog } from "./AttachmentViewerDialog";
import {
  type AttachmentVisualItem,
  formatFileSize,
  getAttachmentCategory,
  getAttachmentVisualUrl,
} from "./types";

type ComposerAttachmentItem = AttachmentVisualItem & {
  /** The picked file, used to open documents that have no preview URL. */
  file?: File;
};

interface AttachmentComposerPreviewProps {
  attachments: readonly ComposerAttachmentItem[];
  onRemove: (id: string) => void;
  className?: string;
}

export function AttachmentComposerPreview({
  attachments,
  onRemove,
  className = "",
}: AttachmentComposerPreviewProps) {
  const [viewerAttachment, setViewerAttachment] =
    useState<ComposerAttachmentItem | null>(null);
  const viewerTriggerRef = useRef<HTMLButtonElement | null>(null);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div
        data-testid="attachment-composer-preview"
        className={`flex flex-wrap items-center gap-2 p-2.5 ${className}`}
      >
        {attachments.map((attachment) => {
          const category = getAttachmentCategory(
            attachment.mimeType,
            attachment.kind,
          );
          const visualUrl = getAttachmentVisualUrl(attachment);
          const isPdf =
            attachment.mimeType === "application/pdf" ||
            attachment.fileName.toLowerCase().endsWith(".pdf");
          // Images and videos open in the same viewer as posted attachments;
          // PDFs and plain text open in the browser's own viewer in a new tab.
          const isViewable =
            Boolean(visualUrl) &&
            (category === "image" || category === "video");
          const canOpen =
            isViewable ||
            (Boolean(attachment.file) &&
              (isPdf || canBrowserShowText(attachment.mimeType)));

          return (
            <div
              key={attachment.id}
              data-testid="composer-attachment-item"
              className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_90%,var(--canvas))] py-1.5 pr-2 pl-2.5 text-xs text-(--text) shadow-xs transition-colors"
            >
              <button
                type="button"
                disabled={!canOpen}
                onClick={(event) => {
                  if (isViewable) {
                    viewerTriggerRef.current = event.currentTarget;
                    setViewerAttachment(attachment);
                  } else if (attachment.file) {
                    openFileInNewTab(attachment.file);
                  }
                }}
                aria-label={`Open ${attachment.fileName}`}
                title={canOpen ? `Open ${attachment.fileName}` : undefined}
                className={`flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-default ${
                  isViewable ? "cursor-zoom-in" : "cursor-pointer"
                }`}
              >
                {category === "image" && visualUrl ? (
                  <img
                    src={visualUrl}
                    alt=""
                    className="h-12 w-16 shrink-0 rounded-md bg-black/5 object-cover dark:bg-white/5"
                  />
                ) : category === "video" ? (
                  visualUrl ? (
                    <video
                      src={visualUrl}
                      muted
                      preload="metadata"
                      className="h-12 w-16 shrink-0 rounded-md bg-black object-cover"
                      aria-label={`Video attachment: ${attachment.fileName}`}
                    />
                  ) : (
                    <VideoCamera
                      size={16}
                      className="shrink-0 text-purple-500"
                    />
                  )
                ) : category === "image" ? (
                  <ImageIcon size={16} className="shrink-0 text-amber-500" />
                ) : isPdf ? (
                  <FilePdf size={16} className="shrink-0 text-red-500" />
                ) : category === "code" ? (
                  <FileCode size={16} className="shrink-0 text-emerald-500" />
                ) : (
                  <FileText size={16} className="shrink-0 text-sky-500" />
                )}
                <span
                  className="max-w-[160px] truncate font-medium sm:max-w-[220px]"
                  title={attachment.fileName}
                >
                  {attachment.fileName}
                </span>
                <span className="text-(--muted)">
                  ({formatFileSize(attachment.fileSize)})
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(attachment.id)}
                aria-label={`Remove ${attachment.fileName}`}
                title="Remove attachment"
                className="ml-1 grid size-5 place-items-center rounded-full text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
              >
                <X size={12} weight="bold" />
              </button>
            </div>
          );
        })}
      </div>
      <AttachmentViewerDialog
        attachment={viewerAttachment}
        onClose={() => {
          setViewerAttachment(null);
          viewerTriggerRef.current?.focus();
        }}
      />
    </>
  );
}

function canBrowserShowText(mimeType: string): boolean {
  return mimeType.startsWith("text/") || mimeType === "application/json";
}

/** Long enough for the new tab to finish reading the file. */
const OPENED_FILE_URL_LIFETIME_MS = 60_000;

function openFileInNewTab(file: File) {
  const url = URL.createObjectURL(file);
  window.open(url, "_blank", "noopener");
  window.setTimeout(
    () => URL.revokeObjectURL(url),
    OPENED_FILE_URL_LIFETIME_MS,
  );
}
