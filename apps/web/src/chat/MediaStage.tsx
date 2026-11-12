import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { MusicNotesIcon as MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { XIcon as X } from "@phosphor-icons/react/X";
import { CHAT_MAX_ATTACHMENTS_PER_MESSAGE } from "@veolms/contracts";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import type { OutgoingFile } from "../services/chat";
import { formatBytes } from "./chatFormat";

/**
 * WhatsApp's media preview before sending: the picked file large, a strip
 * of thumbnails to switch between them, remove one, or add more; the
 * caption box and Send stay in the composer underneath. Covers the
 * messages (not the header) of the open chat.
 */
export function MediaStage({
  files,
  composerHeight,
  onRemove,
  onReorder,
  onClear,
  onAddMore,
}: {
  files: OutgoingFile[];
  composerHeight: number;
  onRemove: (localId: string) => void;
  /** Move a file in the order they are sent (drag a thumbnail). */
  onReorder: (from: number, to: number) => void;
  onClear: () => void;
  onAddMore: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = files.find((f) => f.localId === activeId) ?? files.at(-1);

  // A newly added file becomes the one shown.
  useEffect(() => {
    setActiveId(files.at(-1)?.localId ?? null);
  }, [files.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag a thumbnail to change the order they are sent in: at once with a
  // mouse, after a short hold on a touch screen (a swipe still scrolls).
  const stripRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    pointerId: number;
    started: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; dx: number } | null>(
    null,
  );
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    // Held on a phone: the finger moves the thumbnail, not the page.
    const stopScroll = (event: TouchEvent) => {
      if (drag.current?.started) event.preventDefault();
    };
    strip.addEventListener("touchmove", stopScroll, { passive: false });
    return () => strip.removeEventListener("touchmove", stopScroll);
  }, []);

  /** Where a dragged file lands: after every other file it passed. */
  function targetIndex(clientX: number, draggedId: string): number {
    const others = [
      ...(stripRef.current?.querySelectorAll<HTMLElement>("[data-thumb]") ??
        []),
    ].filter((thumb) => thumb.dataset.thumb !== draggedId);
    return others.filter((thumb) => {
      const box = thumb.getBoundingClientRect();
      return box.left + box.width / 2 < clientX;
    }).length;
  }

  function endDrag(clientX: number | null) {
    const current = drag.current;
    drag.current = null;
    if (current?.timer) clearTimeout(current.timer);
    setDragging(null);
    if (!current?.started || clientX === null) return;
    const from = files.findIndex((f) => f.localId === current.id);
    const to = targetIndex(clientX, current.id);
    if (from >= 0 && to !== from) onReorder(from, to);
  }

  if (!active) return null;
  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);
  const canAdd = files.length < CHAT_MAX_ATTACHMENTS_PER_MESSAGE;

  return (
    <div
      className="absolute inset-x-0 bottom-full z-30 flex flex-col bg-(--chat-bg)"
      style={{ height: `calc(100cqh - 4rem - ${composerHeight}px)` }}
      role="region"
      aria-label="Files to send"
    >
      <div className="flex h-14 shrink-0 items-center gap-3 px-3">
        <button
          type="button"
          onClick={onClear}
          aria-label="Discard files"
          className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:bg-(--chat-hover) hover:text-(--text)"
        >
          <X size={21} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.92rem] font-medium text-(--text)">
            {active.name}
          </div>
          <div className="text-[0.75rem] text-(--muted)">
            {files.length > 1
              ? `${files.length} files · ${formatBytes(totalBytes)}`
              : formatBytes(active.file.size)}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-4">
        {active.kind === "image" && active.previewUrl ? (
          <img
            src={active.previewUrl}
            alt={active.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-[0_8px_30px_rgb(0_0_0/0.25)]"
          />
        ) : active.kind === "video" && active.previewUrl ? (
          <video
            src={active.previewUrl}
            controls
            className="max-h-full max-w-full rounded-lg bg-black shadow-[0_8px_30px_rgb(0_0_0/0.25)]"
          />
        ) : (
          <div className="flex w-72 max-w-full flex-col items-center gap-3 rounded-2xl bg-(--chat-in) px-6 py-10 text-center shadow-[0_8px_30px_rgb(0_0_0/0.18)]">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-(--accent-ink)">
              {active.kind === "audio" ? (
                <MusicNotes size={32} />
              ) : (
                <FileText size={32} />
              )}
            </span>
            <span className="line-clamp-2 text-[0.95rem] font-medium break-all text-(--text)">
              {active.name}
            </span>
            <span className="text-[0.8rem] text-(--muted)">
              {formatBytes(active.file.size)} ·{" "}
              {(active.name.split(".").pop() ?? "file").toUpperCase()}
            </span>
            <span className="text-[0.78rem] text-(--muted)">
              No preview available
            </span>
          </div>
        )}
      </div>

      <div
        ref={stripRef}
        className="flex shrink-0 items-center justify-center gap-2 overflow-x-auto border-t border-solid border-(--chat-line) px-4 py-3"
      >
        {files.map((file, index) => (
          <div
            key={file.localId}
            data-thumb={file.localId}
            className={cn(
              "group/thumb relative shrink-0 select-none",
              dragging?.id === file.localId &&
                "z-10 scale-110 opacity-90 shadow-lg",
            )}
            style={
              dragging?.id === file.localId
                ? { transform: `translateX(${dragging.dx}px) scale(1.1)` }
                : undefined
            }
            onPointerDown={(event) => {
              if (files.length < 2 || event.button !== 0) return;
              const start = {
                id: file.localId,
                x: event.clientX,
                pointerId: event.pointerId,
                started: false,
                timer: null as ReturnType<typeof setTimeout> | null,
              };
              if (event.pointerType === "touch") {
                start.timer = setTimeout(() => {
                  start.started = true;
                  navigator.vibrate?.(10);
                  setDragging({ id: file.localId, dx: 0 });
                }, 260);
              }
              drag.current = start;
            }}
            onPointerMove={(event) => {
              const current = drag.current;
              if (!current || current.pointerId !== event.pointerId) return;
              const dx = event.clientX - current.x;
              if (!current.started) {
                if (event.pointerType === "touch") {
                  // Moved before the hold ended: it's a scroll.
                  if (Math.abs(dx) > 8) endDrag(null);
                  return;
                }
                if (Math.abs(dx) < 6) return;
                current.started = true;
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // Pointer already gone: the move still counts.
                }
              }
              setDragging({ id: current.id, dx });
            }}
            onPointerUp={(event) => endDrag(event.clientX)}
            onPointerCancel={() => endDrag(null)}
            // The browser would drag the picture itself (and cancel ours).
            onDragStart={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              // Alt + ← / → moves the file, for the keyboard.
              if (!event.altKey) return;
              if (event.key === "ArrowLeft" && index > 0) {
                event.preventDefault();
                onReorder(index, index - 1);
              } else if (
                event.key === "ArrowRight" &&
                index < files.length - 1
              ) {
                event.preventDefault();
                onReorder(index, index + 1);
              }
            }}
          >
            {files.length > 1 ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0.5 left-1 z-10 text-[0.65rem] font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]"
              >
                {index + 1}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (!dragging) setActiveId(file.localId);
              }}
              aria-label={`Show ${file.name}, ${index + 1} of ${files.length}${files.length > 1 ? ". Drag, or Alt + arrow keys, to reorder" : ""}`}
              aria-current={
                file.localId === active.localId ? "true" : undefined
              }
              className={cn(
                "flex size-14 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-solid bg-(--chat-in) p-0 text-(--muted)",
                file.localId === active.localId
                  ? "border-(--accent)"
                  : "border-transparent opacity-80 hover:opacity-100",
              )}
            >
              {file.kind === "image" && file.previewUrl ? (
                <img
                  src={file.previewUrl}
                  alt=""
                  draggable={false}
                  className="pointer-events-none size-full object-cover"
                />
              ) : file.kind === "video" && file.previewUrl ? (
                <video
                  src={file.previewUrl}
                  muted
                  className="pointer-events-none size-full object-cover"
                />
              ) : file.kind === "audio" ? (
                <MusicNotes size={22} />
              ) : (
                <FileText size={22} />
              )}
            </button>
            <button
              type="button"
              onClick={() => onRemove(file.localId)}
              aria-label={`Remove ${file.name}`}
              className="absolute -top-1.5 -right-1.5 inline-flex size-5 cursor-pointer items-center justify-center rounded-full border-0 bg-(--text) text-(--chat-bg) opacity-0 shadow transition-opacity group-hover/thumb:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <X size={11} weight="bold" />
            </button>
          </div>
        ))}
        {canAdd ? (
          <button
            type="button"
            onClick={onAddMore}
            aria-label="Add more files"
            className="flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-(--chat-line-strong) bg-transparent text-(--muted) hover:text-(--text)"
          >
            <Plus size={22} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
