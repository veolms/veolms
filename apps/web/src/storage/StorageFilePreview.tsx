import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import { formatStorageBytes, type StorageFile } from "@veolms/contracts";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { FileVideoPlayer } from "../components/video";
import { getApiRequestUrl } from "../lib/api-client";
import { useBackDismiss } from "../navigation/useBackDismiss";

/** Where the browser reads one of the learner's files. */
export function storageFileUrl(
  file: Pick<StorageFile, "url">,
  download = false,
): string | null {
  if (!file.url) return null;
  const url = /^https?:\/\//.test(file.url)
    ? file.url
    : getApiRequestUrl(file.url.replace(/^\/v1/, ""));
  if (!download) return url;
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

const roundButton =
  "inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 text-white hover:bg-white/20";

/**
 * One of the learner's files full screen (from Storage): the photo, the
 * video in the app's player, the voice message or the document's card,
 * with ‹ › (or a swipe, or ← →) to the next, Download and Delete. Esc,
 * Back or × closes it.
 */
export function StorageFilePreview({
  files,
  index,
  onIndex,
  onClose,
  onDelete,
  formatWhen,
}: {
  files: StorageFile[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onDelete: (file: StorageFile) => void;
  formatWhen: (file: StorageFile) => string;
}) {
  useBackDismiss({ open: true, onDismiss: onClose });
  const file = files[index];
  const rootRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onClose();
      } else if (event.key === "ArrowRight" && index < files.length - 1) {
        onIndex(index + 1);
      } else if (event.key === "ArrowLeft" && index > 0) {
        onIndex(index - 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [files.length, index, onClose, onIndex]);

  if (!file) return null;
  const url = storageFileUrl(file);
  const download = storageFileUrl(file, true);

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      tabIndex={-1}
      className="fixed inset-0 z-1150 flex flex-col bg-black/92 text-white outline-none"
      onClick={onClose}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">
            {file.name}
          </span>
          <span className="truncate text-xs text-white/70">
            {[
              formatStorageBytes(file.size),
              formatWhen(file),
              files.length > 1 ? `${index + 1} of ${files.length}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {download ? (
          <a
            href={download}
            download={file.name}
            className={roundButton}
            aria-label="Download"
            title="Download"
          >
            <DownloadSimple size={20} />
          </a>
        ) : null}
        <button
          type="button"
          className={roundButton}
          onClick={() => onDelete(file)}
          aria-label="Delete"
          title="Delete"
        >
          <Trash size={20} />
        </button>
        <button
          type="button"
          className={roundButton}
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <X size={20} />
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center p-4"
        // A finger swipe moves to the next or previous file.
        onPointerDown={(event) => {
          if (event.pointerType === "touch")
            swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start || event.pointerType !== "touch") return;
          const dx = event.clientX - start.x;
          if (
            Math.abs(dx) < 50 ||
            Math.abs(dx) < Math.abs(event.clientY - start.y)
          )
            return;
          if (dx < 0 && index < files.length - 1) onIndex(index + 1);
          if (dx > 0 && index > 0) onIndex(index - 1);
        }}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        {index > 0 ? (
          <button
            type="button"
            className={`${roundButton} absolute top-1/2 left-3 z-10 -translate-y-1/2 bg-[#2a2b2e]/90`}
            aria-label="Previous"
            onClick={(event) => {
              event.stopPropagation();
              onIndex(index - 1);
            }}
          >
            <CaretLeft size={22} />
          </button>
        ) : null}
        <div
          key={`${file.source}:${file.id}`}
          className="flex size-full items-center justify-center"
          onClick={(event) => {
            if (event.target !== event.currentTarget) event.stopPropagation();
          }}
        >
          {!url ? (
            <p className="m-0 text-sm text-white/80">
              This file wasn’t sent, so it can’t be opened.
            </p>
          ) : file.kind === "image" ? (
            <img
              src={url}
              alt={file.name}
              className="max-h-full max-w-full object-contain select-none"
              draggable={false}
            />
          ) : file.kind === "video" ? (
            <div className="aspect-video w-full max-w-4xl">
              <FileVideoPlayer
                src={url}
                mimeType={file.mimeType}
                title={file.name}
                autoPlay
                downloadUrl={download ?? undefined}
              />
            </div>
          ) : file.kind === "audio" ? (
            <audio
              src={url}
              controls
              autoPlay
              className="w-full max-w-md"
              aria-label={file.name}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <FileText size={56} weight="fill" className="text-white/80" />
              <p className="m-0 max-w-xs text-sm break-all">{file.name}</p>
              {download ? (
                <a
                  href={download}
                  download={file.name}
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-white/25"
                >
                  Download
                </a>
              ) : null}
            </div>
          )}
        </div>
        {index < files.length - 1 ? (
          <button
            type="button"
            className={`${roundButton} absolute top-1/2 right-3 z-10 -translate-y-1/2 bg-[#2a2b2e]/90`}
            aria-label="Next"
            onClick={(event) => {
              event.stopPropagation();
              onIndex(index + 1);
            }}
          >
            <CaretRight size={22} />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
