import React from "react";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileCodeIcon as FileCode } from "@phosphor-icons/react/FileCode";
import { FilePdfIcon as FilePdf } from "@phosphor-icons/react/FilePdf";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import {
  type DiscussionAttachmentItem,
  formatFileSize,
  getAttachmentCategory,
} from "./types";

interface DiscussionAttachmentsListProps {
  attachments?: DiscussionAttachmentItem[];
  className?: string;
}

export function DiscussionAttachmentsList({
  attachments,
  className = "",
}: DiscussionAttachmentsListProps) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="discussion-attachments-list"
      className={`mt-3 flex flex-col gap-2.5 ${className}`}
    >
      <div className="flex flex-wrap gap-2.5">
        {attachments.map((attachment) => {
          const category = getAttachmentCategory(
            attachment.mimeType,
            attachment.kind,
          );

          if (category === "image") {
            return (
              <div
                key={attachment.id}
                data-testid="discussion-attachment-item"
                data-attachment-type="image"
                className="group relative flex max-w-sm flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] shadow-xs transition-shadow hover:shadow-md"
              >
                <a
                  href={attachment.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block aspect-video w-full overflow-hidden bg-black/5 dark:bg-white/5"
                  aria-label={`View image ${attachment.fileName}`}
                >
                  <img
                    src={attachment.fileUrl}
                    alt={attachment.fileName}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </a>
                <div className="flex items-center justify-between gap-2 p-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate font-medium text-(--text)"
                      title={attachment.fileName}
                    >
                      {attachment.fileName}
                    </p>
                    <p className="mt-0.5 text-(--muted)">
                      {formatFileSize(attachment.fileSize)}
                    </p>
                  </div>
                  <a
                    href={attachment.fileUrl}
                    download={attachment.fileName}
                    aria-label={`Download ${attachment.fileName}`}
                    title="Download file"
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
                  >
                    <DownloadSimple size={16} weight="bold" />
                  </a>
                </div>
              </div>
            );
          }

          if (category === "video") {
            return (
              <div
                key={attachment.id}
                data-testid="discussion-attachment-item"
                data-attachment-type="video"
                className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] shadow-xs"
              >
                <div className="relative aspect-video w-full bg-black">
                  <video
                    src={attachment.fileUrl}
                    controls
                    preload="metadata"
                    className="size-full"
                    aria-label={`Video attachment: ${attachment.fileName}`}
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
                <div className="flex items-center justify-between gap-2 p-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate font-medium text-(--text)"
                      title={attachment.fileName}
                    >
                      {attachment.fileName}
                    </p>
                    <p className="mt-0.5 text-(--muted)">
                      {formatFileSize(attachment.fileSize)}
                    </p>
                  </div>
                  <a
                    href={attachment.fileUrl}
                    download={attachment.fileName}
                    aria-label={`Download ${attachment.fileName}`}
                    title="Download video"
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
                  >
                    <DownloadSimple size={16} weight="bold" />
                  </a>
                </div>
              </div>
            );
          }

          // Documents / Code / PDF
          const isPdf =
            attachment.mimeType === "application/pdf" ||
            attachment.fileName.toLowerCase().endsWith(".pdf");
          const isCode = category === "code";

          return (
            <div
              key={attachment.id}
              data-testid="discussion-attachment-item"
              data-attachment-type={category}
              className="flex w-fit max-w-full items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-3.5 py-2.5 shadow-xs transition-colors hover:bg-[color-mix(in_srgb,var(--surface)_95%,transparent)]"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--text)">
                {isPdf ? (
                  <FilePdf size={22} className="text-red-500" />
                ) : isCode ? (
                  <FileCode size={22} className="text-emerald-500" />
                ) : (
                  <FileText size={22} className="text-sky-500" />
                )}
              </div>
              <div className="min-w-0 max-w-[200px] sm:max-w-xs">
                <p
                  className="truncate text-sm font-medium text-(--text)"
                  title={attachment.fileName}
                >
                  {attachment.fileName}
                </p>
                <p className="mt-0.5 text-xs text-(--muted)">
                  {formatFileSize(attachment.fileSize)}
                </p>
              </div>
              <a
                href={attachment.fileUrl}
                download={attachment.fileName}
                aria-label={`Download ${attachment.fileName}`}
                title={`Download ${attachment.fileName}`}
                className="ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
              >
                <DownloadSimple size={17} weight="bold" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
