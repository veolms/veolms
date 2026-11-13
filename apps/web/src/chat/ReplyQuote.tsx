import { CameraIcon as Camera } from "@phosphor-icons/react/Camera";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { MicrophoneIcon as Microphone } from "@phosphor-icons/react/Microphone";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/VideoCamera";
import type { ChatAttachment, ChatUploadKind } from "@veolms/contracts";
import { useState } from "react";

import { chatService } from "../services/chat";
import { formatDuration } from "./chatFormat";

/** The quoted message's first file, as a quote shows it. */
export interface QuoteMedia {
  kind: ChatUploadKind;
  url: string;
  name: string;
  durationMs: number | null;
  count: number;
}

/** A message's files as a quote needs them (its first one, and how many). */
export function quoteMediaOf(
  attachments: readonly ChatAttachment[],
): QuoteMedia | null {
  const first = attachments[0];
  if (!first) return null;
  return {
    kind: first.kind,
    url: first.url,
    name: first.name,
    durationMs: first.durationMs,
    count: attachments.length,
  };
}

const ICONS = {
  image: Camera,
  video: VideoCamera,
  audio: Microphone,
  file: FileText,
} as const;

/** "Photo", "Video (0:06)", "Voice message (0:18)", or the file's name. */
function mediaLabel(media: QuoteMedia): string {
  const time = media.durationMs ? ` (${formatDuration(media.durationMs)})` : "";
  const many = media.count > 1 ? ` · ${media.count}` : "";
  switch (media.kind) {
    case "image":
      return `Photo${many}`;
    case "video":
      return `Video${time}${many}`;
    case "audio":
      return `Voice message${time}`;
    default:
      return media.name;
  }
}

/**
 * What a quote shows, as in WhatsApp: who wrote it, then its text (or
 * "📷 Photo", "🎥 Video (0:06)"…) with the kind's icon, and the photo or
 * video's thumbnail on the right.
 */
export function ReplyQuoteBody({
  title,
  text,
  media,
  deleted = false,
}: {
  title: string;
  text: string;
  media: QuoteMedia | null | undefined;
  deleted?: boolean;
}) {
  const Icon = media && !deleted ? ICONS[media.kind] : null;
  const shown = deleted
    ? "This message was deleted"
    : text || (media ? mediaLabel(media) : "Message");
  return (
    <span className="flex min-w-0 items-stretch gap-2">
      <span className="min-w-0 flex-1 py-0.5">
        <span className="block truncate text-[0.76rem] font-semibold text-(--accent-ink)">
          {title}
        </span>
        <span className="flex min-w-0 items-start gap-1 text-[0.8rem] text-(--text-secondary)">
          {Icon ? (
            <Icon
              size={14}
              weight="fill"
              className="mt-0.5 shrink-0 opacity-80"
              aria-hidden="true"
            />
          ) : null}
          <span className="line-clamp-2 min-w-0">{shown}</span>
        </span>
      </span>
      {media &&
      !deleted &&
      (media.kind === "image" || media.kind === "video") ? (
        <QuoteThumb media={media} />
      ) : null}
    </span>
  );
}

function QuoteThumb({ media }: { media: QuoteMedia }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const url = chatService.fileUrl({ url: media.url });
  return (
    <span className="-my-1 -mr-2 block size-12 shrink-0 overflow-hidden rounded-r-md bg-(--chat-input)">
      {media.kind === "image" ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <video
          src={url}
          preload="metadata"
          muted
          playsInline
          onError={() => setFailed(true)}
          className="pointer-events-none size-full object-cover"
        />
      )}
    </span>
  );
}
