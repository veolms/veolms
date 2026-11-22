import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useRef } from "react";
import { FileVideoPlayer } from "../../components/video";
import {
  type AttachmentVisualItem,
  getAttachmentCategory,
  getAttachmentVisualUrl,
} from "./types";

interface AttachmentViewerDialogProps {
  /** The image or video to show; null keeps the dialog closed. */
  attachment: AttachmentVisualItem | null;
  /** Called once the dialog has closed, by any route (Escape, backdrop, X). */
  onClose: () => void;
}

/**
 * Full-screen viewer for an image or video attachment. Shared by posted
 * attachments and the composer chips so both open the same way.
 */
export function AttachmentViewerDialog({
  attachment,
  onClose,
}: AttachmentViewerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (attachment && !dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
    if (!attachment && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
  }, [attachment]);

  const closeViewer = () => {
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") {
      dialog.close();
    } else {
      onClose();
    }
  };

  const visualUrl = attachment ? getAttachmentVisualUrl(attachment) : undefined;
  const isVideo =
    attachment !== null &&
    getAttachmentCategory(attachment.mimeType, attachment.kind) === "video";
  const label = isVideo ? "Video preview" : "Image preview";

  return (
    <dialog
      ref={dialogRef}
      aria-label={attachment ? `${label}: ${attachment.fileName}` : label}
      data-testid="discussion-image-viewer"
      className="fixed inset-0 z-150 m-auto max-h-[92dvh] max-w-[94vw] overflow-visible border-0 bg-transparent p-0 text-(--text) backdrop:bg-black/75 backdrop:backdrop-blur-xs"
      onCancel={(event) => {
        event.preventDefault();
        closeViewer();
      }}
      onClose={onClose}
      onKeyDown={(event) => {
        // React bubbles this through the component tree, so without this the
        // comment box around a composer chip would also close on Escape.
        if (event.key === "Escape") event.stopPropagation();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeViewer();
      }}
    >
      {attachment && visualUrl && (
        <div className="relative flex max-h-[92dvh] max-w-[94vw] items-center justify-center">
          {isVideo ? (
            // The app's player, at the video's shape inside the screen.
            <div
              className="aspect-video w-[min(92vw,calc(88dvh*16/9))] overflow-hidden rounded-xl bg-black shadow-2xl"
              onKeyDown={(event) => {
                // Esc still closes the dialog; the player's own keys stay
                // inside it.
                if (event.key !== "Escape") event.stopPropagation();
              }}
            >
              <FileVideoPlayer
                src={visualUrl}
                mimeType={attachment.mimeType}
                title={attachment.fileName}
                autoPlay
                downloadUrl={attachment.localPreviewUrl ? null : visualUrl}
              />
            </div>
          ) : (
            <img
              src={visualUrl}
              alt={attachment.fileName}
              decoding="async"
              className="max-h-[88dvh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
            />
          )}
          <button
            type="button"
            aria-label={`Close ${label.toLowerCase()}`}
            onClick={closeViewer}
            className="fixed top-4 right-4 z-10 grid size-10 place-items-center rounded-full border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-(--surface) text-(--text) shadow-xl transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
      )}
    </dialog>
  );
}
