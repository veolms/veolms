import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper/types";
import "swiper/css";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../components/ui/drawer";
import {
  CommentActionMenu,
  InlineEditForm,
  shareDiscussionEntry,
  type Comment,
  type CommentReply,
} from "./CommentCard";
import { CommentFormattingToolbar } from "./CommentFormattingToolbar";
import {
  DiscussionEditor,
  type DiscussionEditorController,
} from "./discussion-editor/DiscussionEditor";
import { DiscussionMarkdown } from "./discussion-editor/DiscussionMarkdown";
import type { DiscussionFormattingState } from "./discussion-editor/commands";
import {
  createDiscussionDraft,
  createEmptyDiscussionDraft,
  hasDiscussionDraftContent,
  type DiscussionDraft,
} from "./discussion-editor/types";

const THREAD_PANEL_MIN_WIDTH = 440;
const THREAD_PANEL_MAX_WIDTH = 1080;
const THREAD_PANEL_DEFAULT_WIDTH = 860;
const THREAD_PANEL_WIDTH_KEY = "veolms-discussion-thread-panel-width";
const THREAD_PANEL_PHONE_QUERY = "(max-width: 639px)";

interface DiscussionThreadPanelProps {
  open: boolean;
  activeEntryId: number | null;
  entries: Comment[];
  focusComposerOnOpen?: boolean;
  onOpenChange: (open: boolean) => void;
  onActiveEntryChange: (entryId: number) => void;
  onLike: (id: number, liked: boolean) => void;
  onAddReply: (entryId: number, reply: CommentReply) => void;
  onEditEntry: (comment: Comment) => void;
  onDeleteEntry: (id: number) => void;
  onEditReply: (
    entryId: number,
    replyId: number,
    draft: DiscussionDraft,
  ) => void;
  onDeleteReply: (entryId: number, replyId: number) => void;
  onReport: (id: number) => void;
}

export function DiscussionThreadPanel({
  open,
  activeEntryId,
  entries,
  focusComposerOnOpen = false,
  onOpenChange,
  onActiveEntryChange,
  onLike,
  onAddReply,
  onEditEntry,
  onDeleteEntry,
  onEditReply,
  onDeleteReply,
  onReport,
}: DiscussionThreadPanelProps) {
  const isPhone = useThreadPanelPhoneLayout();
  const viewport = useVisualViewportBounds();
  const swiperRef = useRef<SwiperInstance | null>(null);
  const resizeRef = useRef<PanelResize | null>(null);
  const [panelWidth, setPanelWidth] = useState(getInitialPanelWidth);
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const activeIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === activeEntryId),
  );

  const clampPanelWidth = useCallback(
    (width: number) =>
      Math.min(
        Math.max(THREAD_PANEL_MIN_WIDTH, viewport.width - 28),
        Math.max(THREAD_PANEL_MIN_WIDTH, width),
      ),
    [viewport.width],
  );

  useEffect(() => {
    if (!open) return;
    swiperRef.current?.slideTo(activeIndex, 0);
    if (focusComposerOnOpen) {
      setComposerFocusRequest((current) => current + 1);
    }
  }, [activeIndex, focusComposerOnOpen, open]);

  useEffect(() => {
    if (isPhone) return;
    setPanelWidth((current) => clampPanelWidth(current));
  }, [clampPanelWidth, isPhone]);

  const commitPanelWidth = useCallback((width: number) => {
    const nextWidth = Math.min(
      THREAD_PANEL_MAX_WIDTH,
      Math.max(THREAD_PANEL_MIN_WIDTH, width),
    );
    setPanelWidth(nextWidth);
    try {
      window.localStorage.setItem(THREAD_PANEL_WIDTH_KEY, String(nextWidth));
    } catch {
      // The panel still resizes when storage is unavailable.
    }
  }, []);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isPhone) return;
    event.preventDefault();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setPanelWidth(
      Math.min(
        THREAD_PANEL_MAX_WIDTH,
        Math.max(0, resize.startWidth + (resize.startX - event.clientX)),
      ),
    );
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (panelWidth < THREAD_PANEL_MIN_WIDTH * 0.62) {
      onOpenChange(false);
      return;
    }
    commitPanelWidth(clampPanelWidth(panelWidth));
  };

  const panelInset = isPhone ? 0 : 14;
  const resolvedPanelWidth = isPhone
    ? viewport.width
    : Math.min(clampPanelWidth(panelWidth), viewport.width - panelInset * 2);
  const panelHeight = Math.max(1, viewport.height - panelInset * 2);
  const panelStyle = {
    "--drawer-content-width": `${resolvedPanelWidth}px`,
    "--drawer-content-height": `${panelHeight}px`,
    "--drawer-content-max-height": `${panelHeight}px`,
    top: `${viewport.top + panelInset}px`,
    right: `${panelInset}px`,
    bottom: "auto",
  } as CSSProperties;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection="right"
      modal
    >
      <DrawerContent
        aria-label="Discussion thread"
        initialFocus
        style={panelStyle}
        className="overflow-hidden border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--app-shell,var(--surface))_86%,transparent)] shadow-[0_30px_90px_rgba(0,0,0,0.55),0_0_0_1px_color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-2xl backdrop-saturate-[1.18] data-[swipe-axis=x]:flex-col! data-[swipe-direction=right]:rounded-none! sm:data-[swipe-direction=right]:rounded-xl!"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 -right-20 z-0 size-80 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_28%,transparent)_0%,color-mix(in_srgb,var(--accent)_9%,transparent)_38%,transparent_70%)] blur-3xl"
        />

        {!isPhone && (
          <div
            data-base-ui-swipe-ignore=""
            data-learning-swipe-ignore=""
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize discussion thread"
            aria-valuemin={THREAD_PANEL_MIN_WIDTH}
            aria-valuemax={THREAD_PANEL_MAX_WIDTH}
            aria-valuenow={Math.round(resolvedPanelWidth)}
            tabIndex={0}
            title="Resize or close discussion thread"
            className="group/resize absolute inset-y-0 left-0 z-30 flex w-5 cursor-ew-resize touch-none items-center justify-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onOpenChange(false);
                return;
              }
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              event.preventDefault();
              commitPanelWidth(
                clampPanelWidth(
                  panelWidth + (event.key === "ArrowLeft" ? 24 : -24),
                ),
              );
            }}
            onPointerDown={beginResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          >
            <span className="h-[calc(100%-28px)] w-0.5 rounded-full bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--accent)_54%,var(--border))_16%,color-mix(in_srgb,var(--accent)_54%,var(--border))_84%,transparent)] opacity-55 transition-[width,opacity,box-shadow] duration-160 group-hover/resize:w-0.75 group-hover/resize:opacity-100 group-hover/resize:shadow-[0_0_14px_color-mix(in_srgb,var(--accent)_42%,transparent)] group-focus-visible/resize:w-0.75 group-focus-visible/resize:opacity-100" />
          </div>
        )}

        <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 px-4 sm:h-18 sm:px-6">
          <button
            type="button"
            aria-label="Close discussion thread"
            onClick={() => onOpenChange(false)}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          >
            <ArrowLeft size={22} weight="bold" aria-hidden="true" />
          </button>
          <span
            aria-hidden="true"
            className="h-7 w-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          />
          <DrawerTitle className="text-base font-semibold sm:text-lg">
            Discussion thread
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Read the selected lesson discussion and write a reply.
          </DrawerDescription>
        </header>

        <div className="relative z-10 min-h-0 flex-1">
          <Swiper
            className="h-full"
            slidesPerView={1}
            initialSlide={activeIndex}
            speed={320}
            resistanceRatio={0.72}
            noSwiping
            noSwipingSelector="button,a,input,textarea,select,[contenteditable=true],[role=menu],[data-discussion-atomic-editor],.swiper-no-swiping"
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
              swiper.slideTo(activeIndex, 0);
            }}
            onSlideChange={(swiper) => {
              const entry = entries[swiper.activeIndex];
              if (entry) onActiveEntryChange(entry.id);
            }}
          >
            {entries.map((entry) => (
              <SwiperSlide key={entry.id} className="h-full!">
                <ThreadSlide
                  entry={entry}
                  active={entry.id === activeEntryId}
                  focusRequest={composerFocusRequest}
                  onFocusComposer={() =>
                    setComposerFocusRequest((current) => current + 1)
                  }
                  onLike={onLike}
                  onAddReply={onAddReply}
                  onEditEntry={(comment) => {
                    onOpenChange(false);
                    onEditEntry(comment);
                  }}
                  onDeleteEntry={(id) => {
                    onDeleteEntry(id);
                    onOpenChange(false);
                  }}
                  onEditReply={onEditReply}
                  onDeleteReply={onDeleteReply}
                  onReport={onReport}
                />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface ThreadSlideProps {
  entry: Comment;
  active: boolean;
  focusRequest: number;
  onFocusComposer: () => void;
  onLike: (id: number, liked: boolean) => void;
  onAddReply: (entryId: number, reply: CommentReply) => void;
  onEditEntry: (comment: Comment) => void;
  onDeleteEntry: (id: number) => void;
  onEditReply: (
    entryId: number,
    replyId: number,
    draft: DiscussionDraft,
  ) => void;
  onDeleteReply: (entryId: number, replyId: number) => void;
  onReport: (id: number) => void;
}

function ThreadSlide({
  entry,
  active,
  focusRequest,
  onFocusComposer,
  onLike,
  onAddReply,
  onEditEntry,
  onDeleteEntry,
  onEditReply,
  onDeleteReply,
  onReport,
}: ThreadSlideProps) {
  const replies = entry.thread ?? [];

  return (
    <div
      aria-hidden={active ? undefined : true}
      inert={active ? undefined : true}
      className="flex h-full min-h-0 flex-col px-3 pb-3 sm:px-6 sm:pb-5"
    >
      <div className="learning-comment-formatting-scrollport min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ThreadRootEntry
          entry={entry}
          onLike={onLike}
          onReply={onFocusComposer}
          onEdit={() => onEditEntry(entry)}
          onDelete={() => onDeleteEntry(entry.id)}
          onReport={() => onReport(entry.id)}
        />

        <div className="mx-auto max-w-4xl">
          {replies.length > 0 ? (
            replies.map((reply) => (
              <ThreadReplyEntry
                key={reply.id}
                parentId={entry.id}
                reply={reply}
                onReply={onFocusComposer}
                onEdit={onEditReply}
                onDelete={onDeleteReply}
                onReport={onReport}
              />
            ))
          ) : (
            <div className="px-4 py-12 text-center sm:py-16">
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_11%,transparent)] text-(--accent-ink,var(--accent))">
                <ChatCenteredDots size={22} aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-semibold text-(--text)">
                Start the conversation
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-(--muted)">
                Be the first to reply to {entry.name}.
              </p>
            </div>
          )}
        </div>
      </div>

      {active && (
        <ThreadReplyComposer
          entry={entry}
          focusRequest={focusRequest}
          onSubmit={(reply) => onAddReply(entry.id, reply)}
        />
      )}
    </div>
  );
}

function ThreadRootEntry({
  entry,
  onLike,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: {
  entry: Comment;
  onLike: (id: number, liked: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const [liked, setLiked] = useState(Boolean(entry.liked));
  const replyCount = Math.max(entry.replies ?? 0, entry.thread?.length ?? 0);

  return (
    <article className="mx-auto mb-3 max-w-4xl rounded-xl bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] p-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent),0_16px_44px_rgba(0,0,0,0.12)] sm:mb-4 sm:p-5">
      <div className="flex gap-3.5">
        <img
          src={entry.avatar}
          alt=""
          className="size-10 shrink-0 rounded-full object-cover sm:size-11"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-h-9 items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-[15px] font-semibold text-(--text) sm:text-base">
                {entry.name}
              </h2>
              <span aria-hidden="true" className="text-(--muted)">
                ·
              </span>
              <span className="text-xs text-(--muted) sm:text-sm">
                {entry.time}
              </span>
            </div>
            <CommentActionMenu
              name={entry.name}
              kind={
                entry.entryKind ?? (entry.isQuestion ? "question" : "comment")
              }
              isOwn={Boolean(entry.isOwn)}
              onEdit={onEdit}
              onShare={() =>
                void shareDiscussionEntry(entry.id, entry.name, entry.text)
              }
              onDelete={onDelete}
              onReport={onReport}
              className="relative z-20 shrink-0"
            />
          </div>
          <DiscussionMarkdown
            content={entry.content ?? createDiscussionDraft(entry.text)}
            label={`Discussion entry by ${entry.name}`}
            className="mt-1.5 max-w-3xl"
          />
          {entry.attachment && (
            <div className="mt-3 flex w-fit max-w-full items-center gap-3 rounded-lg bg-[color-mix(in_srgb,var(--canvas)_36%,transparent)] px-3 py-2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)]">
              <FileText size={24} className="shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-(--text)">
                  {entry.attachment.name}
                </p>
                <p className="text-xs text-(--muted)">
                  {entry.attachment.meta}
                </p>
              </div>
            </div>
          )}
          <div className="mt-2.5 flex min-h-9 items-center gap-3 text-xs text-(--muted) sm:text-sm">
            <button
              type="button"
              aria-pressed={liked}
              aria-label={liked ? "Unlike" : "Like"}
              onClick={() => {
                const nextLiked = !liked;
                setLiked(nextLiked);
                onLike(entry.id, nextLiked);
              }}
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${liked ? "text-(--accent-ink,var(--accent))" : ""}`}
            >
              <ThumbsUp size={19} weight={liked ? "fill" : "regular"} />
              {entry.likes}
            </button>
            <button
              type="button"
              onClick={onReply}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
            >
              <ChatCenteredDots size={18} />
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ThreadReplyEntry({
  parentId,
  reply,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: {
  parentId: number;
  reply: CommentReply;
  onReply: () => void;
  onEdit: (entryId: number, replyId: number, draft: DiscussionDraft) => void;
  onDelete: (entryId: number, replyId: number) => void;
  onReport: (id: number) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(
    reply.content ?? createDiscussionDraft(reply.text),
  );

  return (
    <article className="border-b px-3 py-4 [border-color:color-mix(in_srgb,var(--text)_9%,transparent)] sm:px-8 sm:py-5">
      <div className="flex gap-3.5">
        <img
          src={reply.avatar}
          alt=""
          className="size-9 shrink-0 rounded-full object-cover sm:size-10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-h-9 items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-(--text) sm:text-[15px]">
                {reply.name}
              </h3>
              <span aria-hidden="true" className="text-(--muted)">
                ·
              </span>
              <span className="text-xs text-(--muted) sm:text-sm">
                {reply.time}
              </span>
            </div>
            <CommentActionMenu
              name={reply.name}
              kind="reply"
              isOwn={Boolean(reply.isOwn)}
              onEdit={() => setEditing(true)}
              onShare={() =>
                void shareDiscussionEntry(reply.id, reply.name, reply.text)
              }
              onDelete={() => onDelete(parentId, reply.id)}
              onReport={() => onReport(reply.id)}
              className="relative z-20 shrink-0"
            />
          </div>
          {editing ? (
            <InlineEditForm
              documentId={`thread-reply-edit-${reply.id}`}
              label={`Edit reply by ${reply.name}`}
              value={editDraft}
              onChange={setEditDraft}
              onCancel={() => {
                setEditDraft(
                  reply.content ?? createDiscussionDraft(reply.text),
                );
                setEditing(false);
              }}
              onSave={() => {
                if (!hasDiscussionDraftContent(editDraft)) return;
                onEdit(parentId, reply.id, editDraft);
                setEditing(false);
              }}
            />
          ) : (
            <DiscussionMarkdown
              content={reply.content ?? createDiscussionDraft(reply.text)}
              label={`Reply by ${reply.name}`}
              className="mt-1 max-w-3xl"
            />
          )}
          <div className="mt-2 flex min-h-9 items-center gap-4 text-xs text-(--muted) sm:text-sm">
            <button
              type="button"
              aria-pressed={liked}
              aria-label={liked ? "Unlike reply" : "Like reply"}
              onClick={() => setLiked((current) => !current)}
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${liked ? "text-(--accent-ink,var(--accent))" : ""}`}
            >
              <ThumbsUp size={18} weight={liked ? "fill" : "regular"} />
              {reply.likes + (liked ? 1 : 0)}
            </button>
            <button
              type="button"
              onClick={onReply}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
            >
              <ChatCenteredDots size={17} />
              Reply
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ThreadReplyComposer({
  entry,
  focusRequest,
  onSubmit,
}: {
  entry: Comment;
  focusRequest: number;
  onSubmit: (reply: CommentReply) => void;
}) {
  const [draft, setDraft] = useState<DiscussionDraft>(
    createEmptyDiscussionDraft,
  );
  const [editorController, setEditorController] =
    useState<DiscussionEditorController | null>(null);
  const [formattingState, setFormattingState] =
    useState<DiscussionFormattingState>(EMPTY_FORMATTING_STATE);

  useEffect(() => {
    setDraft(createEmptyDiscussionDraft());
  }, [entry.id]);

  useEffect(() => {
    if (focusRequest <= 0) return;
    editorController?.focus();
  }, [editorController, focusRequest]);

  const canSubmit = hasDiscussionDraftContent(draft);
  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      id: Date.now(),
      name: "Ashi Singh",
      time: "Just now",
      avatar: "/assets/sofia-avatar-160.webp",
      text: draft.plainText.trim(),
      content: draft,
      likes: 0,
      isOwn: true,
    });
    setDraft(createEmptyDiscussionDraft());
    window.setTimeout(() => editorController?.focus(), 0);
  };

  return (
    <div className="mt-3 grid h-40 shrink-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent),0_14px_36px_rgba(0,0,0,0.2)] focus-within:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--accent)_52%,transparent),0_18px_42px_rgba(0,0,0,0.24)] sm:h-44">
      <DiscussionEditor
        documentId={`thread-reply-${entry.id}`}
        value={draft}
        label={`Reply to ${entry.name}`}
        placeholderText="Write a reply…"
        className="h-full min-h-0"
        onChange={setDraft}
        onControllerChange={setEditorController}
        onFormattingStateChange={setFormattingState}
      />
      <div className="flex min-h-14 items-center gap-1.5 bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] px-2.5 py-2 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text)_8%,transparent)] sm:gap-2 sm:px-3">
        <img
          src="/assets/sofia-avatar-160.webp"
          alt=""
          className="size-9 shrink-0 rounded-full object-cover sm:size-10"
        />
        {editorController && (
          <CommentFormattingToolbar
            editor={editorController}
            formattingState={formattingState}
          />
        )}
        <button
          type="button"
          aria-label="Post reply"
          disabled={!canSubmit}
          onClick={submit}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-(--accent) text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_62%,transparent)] transition-[background-color,opacity] hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:size-11"
        >
          <PaperPlaneTilt size={23} weight="fill" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface PanelResize {
  pointerId: number;
  startX: number;
  startWidth: number;
}

function getInitialPanelWidth() {
  if (typeof window === "undefined") return THREAD_PANEL_DEFAULT_WIDTH;
  try {
    const stored = Number(window.localStorage.getItem(THREAD_PANEL_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0
      ? stored
      : THREAD_PANEL_DEFAULT_WIDTH;
  } catch {
    return THREAD_PANEL_DEFAULT_WIDTH;
  }
}

function useThreadPanelPhoneLayout() {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(THREAD_PANEL_PHONE_QUERY);
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return isPhone;
}

function useVisualViewportBounds() {
  const getBounds = useCallback(() => {
    const visualViewport = window.visualViewport;
    const layoutWidth =
      document.body.clientWidth ||
      document.documentElement.clientWidth ||
      window.innerWidth;
    return {
      top: Math.max(0, Math.round(visualViewport?.offsetTop ?? 0)),
      height: Math.max(
        1,
        Math.round(
          visualViewport?.height ??
            document.documentElement.clientHeight ??
            window.innerHeight,
        ),
      ),
      width: Math.max(
        1,
        Math.round(Math.min(visualViewport?.width ?? layoutWidth, layoutWidth)),
      ),
    };
  }, []);
  const [bounds, setBounds] = useState(getBounds);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setBounds(getBounds()));
    };
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
    };
  }, [getBounds]);

  return bounds;
}

const EMPTY_FORMATTING_STATE: DiscussionFormattingState = {
  bold: false,
  italic: false,
  highlight: false,
  link: false,
  code: false,
  codeBlock: false,
  canUndo: false,
  canRedo: false,
  linkUrl: "",
};
