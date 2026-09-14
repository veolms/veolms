import React from "react";
import { FileCodeIcon as FileCode } from "@phosphor-icons/react/FileCode";
import { FilePdfIcon as FilePdf } from "@phosphor-icons/react/FilePdf";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { ImageIcon as ImageIcon } from "@phosphor-icons/react/Image";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  type DiscussionAttachmentItem,
  formatFileSize,
  getAttachmentCategory,
} from "./types";

interface AttachmentComposerPreviewProps {
  attachments: DiscussionAttachmentItem[];
  onRemove: (id: string) => void;
  isUploading?: boolean;
  className?: string;
}

export function AttachmentComposerPreview({
  attachments,
  onRemove,
  isUploading = false,
  className = "",
}: AttachmentComposerPreviewProps) {
  if (attachments.length === 0 && !isUploading) {
    return null;
  }

  return (
    <div
      data-testid="attachment-composer-preview"
      className={`flex flex-wrap items-center gap-2 p-2.5 ${className}`}
    >
      {attachments.map((attachment) => {
        const category = getAttachmentCategory(
          attachment.mimeType,
          attachment.kind,
        );
        const isPdf =
          attachment.mimeType === "application/pdf" ||
          attachment.fileName.toLowerCase().endsWith(".pdf");

        return (
          <div
            key={attachment.id}
            data-testid="composer-attachment-item"
            className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_90%,var(--canvas))] py-1.5 pr-2 pl-2.5 text-xs text-(--text) shadow-xs transition-colors"
          >
            {category === "image" ? (
              <ImageIcon size={16} className="shrink-0 text-amber-500" />
            ) : category === "video" ? (
              <VideoCamera size={16} className="shrink-0 text-purple-500" />
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
      {isUploading && (
        <div
          data-testid="composer-uploading-indicator"
          className="flex items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-1.5 text-xs text-(--accent)"
        >
          <span className="size-3 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
          <span>Uploading attachment…</span>
        </div>
      )}
    </div>
  );
}
