import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { useBackDismiss } from "../navigation/useBackDismiss";
import type { ViewableMedia } from "./MessageAttachments";

/**
 * Full-screen photos and videos (WhatsApp's media viewer): ← / → between
 * items, Esc or Back to close, download in the corner.
 */
export function MediaViewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: ViewableMedia[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  useBackDismiss({ open: true, onDismiss: onClose });
  const item = items[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < items.length - 1)
        onIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);

  if (!item) return null;
  const control =
    "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 text-white hover:bg-white/20";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      className="fixed inset-0 z-300 flex flex-col bg-black/92"
      onClick={onClose}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 flex-1 truncate text-sm">
          {item.name} · {index + 1} of {items.length}
        </span>
        <a
          href={`${item.url}?download=1`}
          className={control}
          aria-label="Download"
          download
        >
          <DownloadSimple size={20} />
        </a>
        <button
          type="button"
          className={control}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {index > 0 ? (
          <button
            type="button"
            className={`${control} absolute left-4`}
            aria-label="Previous"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
          >
            <CaretLeft size={22} />
          </button>
        ) : null}
        {item.kind === "image" ? (
          <img
            src={item.url}
            alt={item.name}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <video
            src={item.url}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {index < items.length - 1 ? (
          <button
            type="button"
            className={`${control} absolute right-4`}
            aria-label="Next"
            onClick={(e) => {
              e.stopPropagation();
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
