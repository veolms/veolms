import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { MusicNotesIcon as MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { XIcon as X } from "@phosphor-icons/react/X";
import { CHAT_MAX_ATTACHMENTS_PER_MESSAGE } from "@veolms/contracts";
import { useEffect, useState } from "react";

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
  onClear,
  onAddMore,
}: {
  files: OutgoingFile[];
  composerHeight: number;
  onRemove: (localId: string) => void;
  onClear: () => void;
  onAddMore: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = files.find((f) => f.localId === activeId) ?? files.at(-1);

  // A newly added file becomes the one shown.
  useEffect(() => {
    setActiveId(files.at(-1)?.localId ?? null);
  }, [files.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

      <div className="flex shrink-0 items-center justify-center gap-2 overflow-x-auto border-t border-solid border-(--chat-line) px-4 py-3">
        {files.map((file) => (
          <div key={file.localId} className="group/thumb relative shrink-0">
            <button
              type="button"
              onClick={() => setActiveId(file.localId)}
              aria-label={`Show ${file.name}`}
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
                  className="size-full object-cover"
                />
              ) : file.kind === "video" && file.previewUrl ? (
                <video
                  src={file.previewUrl}
                  muted
                  className="size-full object-cover"
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
              className="absolute -top-1.5 -right-1.5 inline-flex size-5 cursor-pointer items-center justify-center rounded-full border-0 bg-(--text) text-(--chat-bg) opacity-0 shadow transition-opacity group-hover/thumb:opacity-100 focus-visible:opacity-100"
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
