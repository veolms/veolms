import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { useBackDismiss } from "../navigation/useBackDismiss";
import { ChatVideoFrame } from "./ChatVideoFrame";
import { cn } from "../lib/utils";
import { ChatAvatar } from "./ChatAvatar";
import { dayLabel, formatBytes, messageTime } from "./chatFormat";
import { CHAT_THEME } from "./chatTheme";
import { ChatImage } from "./ChatImage";
import { DocumentView } from "./FilePreview";
import { fileTone, type ViewableMedia } from "./MessageAttachments";
import type { BubbleContext } from "./MessageBubble";
import { MediaViewerBar, type ViewerAction } from "./MediaViewerBar";
import { MessageText } from "./MessageText";
import { usePhoneLayout } from "./usePhoneLayout";
import { usePhotoZoom } from "./usePhotoZoom";
import { VideoThumb } from "./VideoThumb";

/**
 * Full screen photos, videos and documents (WhatsApp's media viewer): the
 * sender and time at the top with the message's actions (zoom, show in
 * chat, reply, star, pin, react, forward, download, more; see
 * MediaViewerBar), ‹ › or ← / → between every file of the chat, the
 * caption under the file, the chat's files along the foot, Esc or Back to
 * close. A photo zooms with a pinch, Ctrl + wheel, a double tap or the
 * bar's buttons (see usePhotoZoom); a PDF shows its pages one under
 * another (PdfPages).
 *
 * It lies under the chat's dialogs (z-250), so Forward, Delete or Report
 * opened from its bar appear over it.
 */
export function MediaViewer({
  items,
  index,
  onIndex,
  onClose,
  onNearStart,
  ctx,
  onAction,
}: {
  items: ViewableMedia[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** The strip reached the chat's first loaded file: load earlier messages. */
  onNearStart?: () => void;
  /** The chat's rights and state (stars, reactions): without it, no actions. */
  ctx?: BubbleContext;
  /** An action from the bar, on the open file's message. */
  onAction?: (action: ViewerAction, item: ViewableMedia) => void;
}) {
  useBackDismiss({ open: true, onDismiss: onClose });
  const item = items[index];
  const phone = usePhoneLayout();
  // The viewer itself: its keys, and where its bar's menus open (above it).
  const rootRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const setRootRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRoot(node);
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const zoom = usePhotoZoom(
    stageRef,
    photoRef,
    `${index}:${item?.kind === "image" ? item.url : ""}`,
  );

  useEffect(() => {
    // First, and only: Esc closes the viewer, not the chat behind it.
    const onKey = (event: KeyboardEvent) => {
      // A dialog opened over it (Forward, Delete…) or one of its own menus
      // has the keys: Esc closes that first.
      const target = event.target instanceof Element ? event.target : null;
      const viewer = rootRef.current;
      if (
        target &&
        target !== document.body &&
        (!viewer?.contains(target) || target.closest('[role="menu"]'))
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      // On a video the arrows seek it (the player's keys), as in a lesson;
      // the buttons either side still move between items.
      if (items[index]?.kind === "video") return;
      if (event.key === "ArrowRight" && index < items.length - 1)
        onIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, items, onClose, onIndex]);

  // Focus moves into the viewer (its keys, a screen reader's place), and
  // back to what had it once the viewer closes, unless something else took
  // it on the way out (the message box, after Reply).
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      const lost = !now || now === document.body || !now.isConnected;
      if (lost && before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  if (!item) return null;
  // Over the photo or page beside them (they come before it in the page):
  // a click on them must reach them, not the space around the photo.
  // Dark and round, so they show on a white page as on a dark photo.
  const arrow =
    "absolute top-1/2 z-10 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[#2a2b2e]/90 text-white shadow-md hover:bg-[#3a3b3f]";
  const sender = item.senderName;
  const title =
    item.kind === "file"
      ? sender
        ? `${sender} · ${item.name}`
        : item.name
      : (sender ?? item.name);
  const when = item.sentAt
    ? `${dayLabel(item.sentAt)} at ${messageTime(item.sentAt)}`
    : item.kind === "file"
      ? formatBytes(item.attachment.size)
      : null;

  const caption = item.message?.body.trim() ? item.message.body : null;

  return createPortal(
    <div
      ref={setRootRef}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      tabIndex={-1}
      className={cn(
        "fixed inset-0 z-240 flex flex-col bg-black/92 outline-none",
        CHAT_THEME,
      )}
      onClick={onClose}
    >
      <div
        className="flex items-center gap-2 py-2 pr-2 pl-3 text-white sm:gap-3 sm:py-3 sm:pr-3 sm:pl-4"
        onClick={(e) => e.stopPropagation()}
      >
        {sender ? (
          <ChatAvatar
            name={item.senderAvatarName ?? sender}
            url={item.senderAvatarUrl}
            size={phone ? "sm" : "md"}
            className="text-white"
          />
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">{title}</span>
          <span className="truncate text-xs text-white/70">
            {[when, items.length > 1 ? `${index + 1} of ${items.length}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <MediaViewerBar
          item={item}
          ctx={ctx}
          phone={phone}
          zoom={item.kind === "image" ? zoom : null}
          menuContainer={root}
          onAction={(action) => onAction?.(action, item)}
          onClose={onClose}
        />
      </div>
      <div
        ref={stageRef}
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden",
          // The photo takes pinches and drags itself: the browser must not
          // zoom or scroll the page under it. A document scrolls as usual.
          item.kind === "image" ? "touch-none p-4" : "",
          item.kind === "video" ? "p-4" : "",
        )}
      >
        {index > 0 ? (
          <button
            type="button"
            className={`${arrow} left-3 sm:left-4`}
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
          <div
            ref={photoRef}
            key={item.url}
            className="flex size-full items-center justify-center"
            // The photo's own clicks stay here; one on the space around it
            // closes the viewer, as before.
            onClick={(e) => {
              if (e.target !== e.currentTarget) e.stopPropagation();
            }}
          >
            <ChatImage
              src={item.url}
              alt={item.name}
              className="max-h-full max-w-full object-contain select-none"
              draggable={false}
            />
          </div>
        ) : item.kind === "video" ? (
          // The app's player (download is in the bar above), as large as
          // the room allows at the video's own shape.
          <ChatVideoFrame
            key={item.url}
            src={item.url}
            mimeType={item.mimeType}
            title={item.name}
            width={item.width}
            height={item.height}
            autoPlay
          />
        ) : (
          // A document stays open whatever is clicked on it (WhatsApp).
          <div
            key={item.url}
            className="size-full"
            onClick={(e) => e.stopPropagation()}
          >
            <DocumentView attachment={item.attachment} />
          </div>
        )}
        {index < items.length - 1 ? (
          <button
            type="button"
            className={`${arrow} right-3 sm:right-4`}
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
      {caption ? (
        // The message's text under the file, as WhatsApp shows a caption.
        <div
          className="max-h-24 shrink-0 overflow-y-auto px-4 pb-3 text-center text-[0.92rem] leading-snug break-words whitespace-pre-wrap text-white/90 [scrollbar-width:thin]"
          onClick={(e) => e.stopPropagation()}
        >
          <MessageText text={caption} />
        </div>
      ) : null}
      {items.length > 1 || onNearStart ? (
        <MediaStrip
          items={items}
          index={index}
          onIndex={onIndex}
          onNearStart={onNearStart}
        />
      ) : null}
    </div>,
    document.body,
  );
}

/** Scrolled this close to the strip's start, earlier files are loaded. */
const NEAR_START_PX = 160;

/**
 * The row of the chat's files along the viewer's foot, as in WhatsApp: the
 * open one framed and kept in view, any other a tap away. A mouse wheel
 * scrolls it sideways; reaching its start loads earlier messages' files.
 */
function MediaStrip({
  items,
  index,
  onIndex,
  onNearStart,
}: {
  items: ViewableMedia[];
  index: number;
  onIndex: (index: number) => void;
  onNearStart?: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  const currentUrl = items[index]?.url;
  const nearStart = useRef(onNearStart);
  useEffect(() => {
    nearStart.current = onNearStart;
  }, [onNearStart]);

  // Kept in view when another file opens, not when earlier ones are added
  // in front of it (that would pull the strip away from where you scrolled).
  useEffect(() => {
    currentRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [currentUrl]);

  // Earlier files added in front keep what you see where it was (as older
  // messages do in the chat): the strip moves by the room they took.
  const anchor = useRef<{ url?: string; left: number }>({ left: 0 });
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const current = currentRef.current;
    if (!strip || !current) return;
    const before = anchor.current;
    if (before.url === currentUrl && current.offsetLeft !== before.left)
      strip.scrollLeft += current.offsetLeft - before.left;
    anchor.current = { url: currentUrl, left: current.offsetLeft };
  }, [items, currentUrl]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    // An up/down wheel (a mouse) scrolls the row sideways.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
        return;
      if (strip.scrollWidth <= strip.clientWidth) {
        // Nothing to scroll: rolling back still asks for earlier files.
        if (event.deltaY < 0) nearStart.current?.();
        return;
      }
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
      if (event.deltaY < 0 && strip.scrollLeft <= NEAR_START_PX)
        nearStart.current?.();
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, []);

  // Opened on (or moved to) one of the first files: earlier ones are
  // probably wanted next.
  useEffect(() => {
    if (index < 3) nearStart.current?.();
  }, [index]);

  return (
    <div
      ref={stripRef}
      className="flex shrink-0 justify-center-safe gap-1.5 overflow-x-auto overscroll-x-contain border-0 border-t border-solid border-white/10 px-4 py-2.5 [scrollbar-color:rgb(255_255_255/0.25)_transparent] [scrollbar-width:thin]"
      onClick={(e) => e.stopPropagation()}
      onScroll={(e) => {
        if (e.currentTarget.scrollLeft <= NEAR_START_PX) nearStart.current?.();
      }}
      role="listbox"
      aria-label="Photos, videos and documents in this chat"
    >
      {items.map((media, at) => {
        const current = at === index;
        return (
          <button
            key={media.url}
            ref={current ? currentRef : undefined}
            type="button"
            role="option"
            aria-selected={current}
            aria-label={`${media.kind === "video" ? "Video" : media.kind === "file" ? "Document" : "Photo"} ${media.name}`}
            title={media.name}
            onClick={() => onIndex(at)}
            className={cn(
              "relative size-14 shrink-0 cursor-pointer overflow-hidden rounded-md border-0 bg-white/10 p-0 transition-opacity sm:size-16",
              current
                ? "opacity-100 outline-2 outline-offset-1 outline-(--accent) outline-solid"
                : "opacity-60 hover:opacity-100",
            )}
          >
            <StripThumb media={media} root={stripRef} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * One file's picture in the strip, made only once it scrolls near the view
 * (a long chat has many videos; each would fetch its start).
 */
function StripThumb({
  media,
  root,
}: {
  media: ViewableMedia;
  root: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const box = ref.current;
    if (!box || media.kind === "file") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { root: root.current, rootMargin: "0px 400px" },
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, [media.kind, root]);

  if (media.kind === "file") {
    const extension = media.name.split(".").pop()?.toUpperCase() ?? "FILE";
    return (
      <span
        className={cn(
          "flex size-full flex-col items-center justify-center gap-0.5 text-[0.62rem] font-bold tracking-wide text-white",
          fileTone(extension),
        )}
      >
        <FileText size={20} weight="fill" className="opacity-80" />
        {extension.slice(0, 4)}
      </span>
    );
  }
  return (
    <span ref={ref} className="block size-full">
      {!near ? null : media.kind === "image" ? (
        <ChatImage
          src={media.url}
          alt=""
          draggable={false}
          className="size-full object-cover"
        />
      ) : (
        <>
          <VideoThumb src={media.url} className="size-full object-cover" />
          <span className="absolute inset-0 grid place-items-center text-white">
            <Play size={16} weight="fill" />
          </span>
        </>
      )}
    </span>
  );
}
