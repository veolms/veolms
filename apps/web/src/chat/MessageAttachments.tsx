import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type { ChatAttachment } from "@veolms/contracts";

import { useState } from "react";

import { chatService } from "../services/chat";
import { cn } from "../lib/utils";
import { formatBytes, formatDuration } from "./chatFormat";
import { ChatImage } from "./ChatImage";
import { FilePreview, previewKind } from "./FilePreview";
import { VoiceMessage } from "./VoiceMessage";

export interface ViewableMedia {
  url: string;
  kind: "image" | "video";
  name: string;
}

/**
 * The files of one message: a photo/video grid (up to 4 tiles, "+N" on the
 * last, as WhatsApp groups an album), voice messages and documents.
 * Space is reserved from the stored size so the list never jumps.
 */
export function MessageAttachments({
  attachments,
  outgoing,
  onOpenMedia,
}: {
  attachments: ChatAttachment[];
  outgoing: boolean;
  onOpenMedia: (items: ViewableMedia[], index: number) => void;
}) {
  const media = attachments.filter(
    (a) => a.kind === "image" || a.kind === "video",
  );
  const others = attachments.filter(
    (a) => a.kind === "audio" || a.kind === "file",
  );
  const viewable: ViewableMedia[] = media.map((a) => ({
    url: chatService.fileUrl(a),
    kind: a.kind as "image" | "video",
    name: a.name,
  }));

  return (
    <div className="flex flex-col gap-1">
      {media.length === 1 ? (
        <MediaTile
          attachment={media[0]!}
          single
          onOpen={() => onOpenMedia(viewable, 0)}
        />
      ) : media.length > 1 ? (
        <div className="grid w-72 max-w-full grid-cols-2 gap-1">
          {media.slice(0, 4).map((attachment, index) => (
            <MediaTile
              key={attachment.id}
              attachment={attachment}
              more={index === 3 && media.length > 4 ? media.length - 4 : 0}
              onOpen={() => onOpenMedia(viewable, index)}
            />
          ))}
        </div>
      ) : null}
      {others.map((attachment) =>
        attachment.kind === "audio" ? (
          <VoiceMessage
            key={attachment.id}
            src={chatService.fileUrl(attachment)}
            durationMs={attachment.durationMs}
            waveform={attachment.waveform}
            outgoing={outgoing}
          />
        ) : (
          <FileTile key={attachment.id} attachment={attachment} />
        ),
      )}
    </div>
  );
}

function MediaTile({
  attachment,
  single = false,
  more = 0,
  onOpen,
}: {
  attachment: ChatAttachment;
  single?: boolean;
  more?: number;
  onOpen: () => void;
}) {
  const ratio =
    attachment.width && attachment.height
      ? Math.min(1.6, Math.max(0.6, attachment.height / attachment.width))
      : 0.75;
  const url = chatService.fileUrl(attachment);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        attachment.kind === "video"
          ? `Play video ${attachment.name}`
          : `Open photo ${attachment.name}`
      }
      className={cn(
        "relative block cursor-pointer overflow-hidden rounded-lg border-0 bg-(--chat-input) p-0",
        single ? "w-72 max-w-full" : "aspect-square w-full",
      )}
      style={single ? { aspectRatio: `1 / ${ratio}` } : undefined}
    >
      {attachment.kind === "image" ? (
        <ChatImage
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <>
          <video
            src={url}
            preload="metadata"
            muted
            playsInline
            className="size-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white">
              <Play size={22} weight="fill" />
            </span>
          </span>
          {attachment.durationMs ? (
            <span className="absolute bottom-1.5 left-2 text-[0.72rem] font-semibold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
              {formatDuration(attachment.durationMs)}
            </span>
          ) : null}
        </>
      )}
      {more > 0 ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-bold text-white">
          +{more}
        </span>
      ) : null}
    </button>
  );
}

/** WhatsApp-style document colours by type. */
function fileTone(extension: string): string {
  if (extension === "PDF") return "bg-[#e5484d]";
  if (["DOC", "DOCX", "TXT", "MD"].includes(extension)) return "bg-[#2f6fde]";
  if (["XLS", "XLSX", "CSV"].includes(extension)) return "bg-[#1f9d55]";
  if (["PPT", "PPTX"].includes(extension)) return "bg-[#e8710a]";
  return "bg-[#7a8699]";
}

function FileTile({ attachment }: { attachment: ChatAttachment }) {
  const extension = attachment.name.split(".").pop()?.toUpperCase() ?? "FILE";
  const [previewing, setPreviewing] = useState(false);
  const canPreview = previewKind(attachment) !== null;
  return (
    <div className="flex w-72 max-w-full items-center rounded-lg bg-[color-mix(in_srgb,var(--text)_7%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_11%,transparent)]">
      <button
        type="button"
        onClick={() => setPreviewing(true)}
        aria-label={`${canPreview ? "Open" : "Show"} ${attachment.name}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent py-2.5 pl-2.5 text-left text-(--text)"
      >
        <span
          className={cn(
            "relative flex h-11 w-9 shrink-0 items-end justify-center rounded-md pb-1 text-[0.58rem] font-bold tracking-wide text-white",
            fileTone(extension),
          )}
          aria-hidden="true"
        >
          <FileText
            size={16}
            weight="fill"
            className="absolute top-1.5 opacity-60"
          />
          {extension.slice(0, 4)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.88rem] font-semibold">
            {attachment.name}
          </span>
          <span className="block text-[0.72rem] text-(--muted)">
            {extension} · {formatBytes(attachment.size)}
            {canPreview ? " · Tap to open" : ""}
          </span>
        </span>
      </button>
      <a
        href={chatService.fileUrl(attachment, true)}
        download={attachment.name}
        aria-label={`Download ${attachment.name}`}
        className="flex size-11 shrink-0 items-center justify-center text-(--muted) hover:text-(--text)"
      >
        <DownloadSimple size={20} />
      </a>
      {previewing ? (
        <FilePreview
          attachment={attachment}
          onClose={() => setPreviewing(false)}
        />
      ) : null}
    </div>
  );
}
