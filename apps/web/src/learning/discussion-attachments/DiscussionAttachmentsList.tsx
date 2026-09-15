import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileCodeIcon as FileCode } from "@phosphor-icons/react/FileCode";
import { FilePdfIcon as FilePdf } from "@phosphor-icons/react/FilePdf";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useRef, useState } from "react";
import {
  type DiscussionAttachmentItem,
  formatFileSize,
  getAttachmentCategory,
  getAttachmentVisualUrl,
} from "./types";

interface DiscussionAttachmentsListProps {
  attachments?: readonly DiscussionAttachmentItem[];
  className?: string;
}

export function DiscussionAttachmentsList({
  attachments,
  className = "",
}: DiscussionAttachmentsListProps) {
  const [viewerAttachment, setViewerAttachment] =
    useState<DiscussionAttachmentItem | null>(null);
  const viewerDialogRef = useRef<HTMLDialogElement>(null);
  const viewerTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const dialog = viewerDialogRef.current;
    if (!dialog) return;
    if (
      viewerAttachment &&
      !dialog.open &&
      typeof dialog.showModal === "function"
    ) {
      dialog.showModal();
    }
    if (!viewerAttachment && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
  }, [viewerAttachment]);

  if (!attachments || attachments.length === 0) return null;

  const closeViewer = () => {
    const dialog = viewerDialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") {
      dialog.close();
    } else {
      handleViewerClose();
    }
  };
  const handleViewerClose = () => {
    setViewerAttachment(null);
    viewerTriggerRef.current?.focus();
  };

  return (
    <>
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
            const visualUrl = getAttachmentVisualUrl(attachment);

            if (category === "image") {
              return (
                <div
                  key={attachment.clientId ?? attachment.id}
                  data-testid="discussion-attachment-item"
                  data-attachment-type="image"
                  className="group relative flex max-w-full flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] shadow-xs transition-shadow hover:shadow-md"
                >
                  <button
                    type="button"
                    disabled={!visualUrl}
                    onClick={(event) => {
                      viewerTriggerRef.current = event.currentTarget;
                      setViewerAttachment(attachment);
                    }}
                    className="relative flex max-h-80 max-w-md cursor-zoom-in items-center justify-center overflow-hidden bg-black/5 disabled:cursor-default dark:bg-white/5"
                    aria-label={`View image ${attachment.fileName}`}
                  >
                    {visualUrl ? (
                      <img
                        src={visualUrl}
                        alt={attachment.fileName}
                        loading="lazy"
                        className="block max-h-80 max-w-full object-contain"
                      />
                    ) : null}
                    <AttachmentUploadTreatment attachment={attachment} />
                  </button>
                  <AttachmentMetadata attachment={attachment} />
                </div>
              );
            }

            if (category === "video") {
              return (
                <div
                  key={attachment.clientId ?? attachment.id}
                  data-testid="discussion-attachment-item"
                  data-attachment-type="video"
                  className="relative flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] shadow-xs"
                >
                  <div className="relative flex max-h-80 w-full items-center justify-center bg-black">
                    {visualUrl ? (
                      <video
                        src={visualUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="max-h-80 w-full object-contain"
                        aria-label={`Video attachment: ${attachment.fileName}`}
                      >
                        Your browser does not support video playback.
                      </video>
                    ) : null}
                    <AttachmentUploadTreatment attachment={attachment} />
                  </div>
                  <AttachmentMetadata attachment={attachment} />
                </div>
              );
            }

            return (
              <GenericAttachmentCard
                key={attachment.clientId ?? attachment.id}
                attachment={attachment}
              />
            );
          })}
        </div>
      </div>

      <dialog
        ref={viewerDialogRef}
        aria-label={
          viewerAttachment
            ? `Image preview: ${viewerAttachment.fileName}`
            : "Image preview"
        }
        data-testid="discussion-image-viewer"
        className="fixed inset-0 z-150 m-auto max-h-[92dvh] max-w-[94vw] overflow-visible border-0 bg-transparent p-0 text-(--text) backdrop:bg-black/75 backdrop:backdrop-blur-xs"
        onCancel={(event) => {
          event.preventDefault();
          closeViewer();
        }}
        onClose={handleViewerClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeViewer();
        }}
      >
        {viewerAttachment && getAttachmentVisualUrl(viewerAttachment) && (
          <div className="relative flex max-h-[92dvh] max-w-[94vw] items-center justify-center">
            <img
              src={getAttachmentVisualUrl(viewerAttachment)}
              alt={viewerAttachment.fileName}
              className="max-h-[88dvh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
            />
            <button
              type="button"
              aria-label="Close image preview"
              onClick={closeViewer}
              className="absolute -top-3 -right-3 grid size-9 place-items-center rounded-full bg-(--surface) text-(--text) shadow-lg transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}

function AttachmentMetadata({
  attachment,
}: {
  attachment: DiscussionAttachmentItem;
}) {
  const visualUrl = getAttachmentVisualUrl(attachment);
  return (
    <div className="flex items-center justify-between gap-2 p-2.5 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-(--text)" title={attachment.fileName}>
          {attachment.fileName}
        </p>
        <p className="mt-0.5 text-(--muted)">
          {formatFileSize(attachment.fileSize)}
        </p>
      </div>
      {visualUrl && attachment.uploadState !== "uploading" && (
        <a
          href={visualUrl}
          download={attachment.fileName}
          aria-label={`Download ${attachment.fileName}`}
          title="Download file"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <DownloadSimple size={16} weight="bold" />
        </a>
      )}
    </div>
  );
}

function GenericAttachmentCard({
  attachment,
}: {
  attachment: DiscussionAttachmentItem;
}) {
  const category = getAttachmentCategory(attachment.mimeType, attachment.kind);
  const visualUrl = getAttachmentVisualUrl(attachment);
  const isPdf =
    attachment.mimeType === "application/pdf" ||
    attachment.fileName.toLowerCase().endsWith(".pdf");

  return (
    <div
      data-testid="discussion-attachment-item"
      data-attachment-type={category}
      className="relative flex w-fit max-w-full items-center gap-3 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-3.5 py-2.5 shadow-xs transition-colors hover:bg-[color-mix(in_srgb,var(--surface)_95%,transparent)]"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--text)">
        {isPdf ? (
          <FilePdf size={22} className="text-red-500" />
        ) : category === "code" ? (
          <FileCode size={22} className="text-emerald-500" />
        ) : (
          <FileText size={22} className="text-sky-500" />
        )}
      </div>
      <div className="min-w-0 max-w-[200px] sm:max-w-xs">
        <p className="truncate text-sm font-medium text-(--text)" title={attachment.fileName}>
          {attachment.fileName}
        </p>
        <p className="mt-0.5 text-xs text-(--muted)">
          {formatFileSize(attachment.fileSize)}
        </p>
      </div>
      {visualUrl && attachment.uploadState !== "uploading" && (
        <a
          href={visualUrl}
          download={attachment.fileName}
          aria-label={`Download ${attachment.fileName}`}
          title={`Download ${attachment.fileName}`}
          className="relative z-10 ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <DownloadSimple size={17} weight="bold" />
        </a>
      )}
      <AttachmentUploadTreatment attachment={attachment} />
    </div>
  );
}

function AttachmentUploadTreatment({
  attachment,
}: {
  attachment: DiscussionAttachmentItem;
}) {
  if (attachment.uploadState !== "uploading") return null;
  const progress = attachment.uploadProgress;
  const remainingWidth =
    typeof progress === "number"
      ? `${Math.max(0, 1 - progress) * 100}%`
      : "100%";

  return (
    <>
      <span
        aria-hidden="true"
        data-testid="attachment-upload-treatment"
        className="pointer-events-none absolute inset-y-0 right-0 bg-black/32 transition-[width] duration-200 dark:bg-black/45"
        style={{ width: remainingWidth }}
      />
      <span className="sr-only">Uploading attachment</span>
    </>
  );
}
