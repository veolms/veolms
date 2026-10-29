import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { LearningReply } from "@veolms/contracts";
import { DiscussionAvatar } from "../learning/DiscussionAvatar";
import { ThreadReplyComposer } from "../learning/ThreadReplyComposer";
import {
  DiscussionEditor,
  preloadDiscussionEditor,
} from "../learning/discussion-editor/DiscussionEditor";
import {
  createDiscussionDraft,
  hasDiscussionDraftContent,
  type DiscussionDraft,
} from "../learning/discussion-editor/types";
import { useCurrentUser } from "../services/auth";
import {
  learningInteractionKeys,
  learningInteractionsService,
  useCreateReply,
  useNoteDetails,
  useThreadDetails,
  useThreadReplies,
  useUpdateNote,
  useUpdateReply,
  useUpdateThread,
} from "../services/learning-interactions";
import type { LocalComposerAttachment } from "../services/learning-interactions/attachment-model";
import { DiscussionWorkspaceActionMenu } from "./DiscussionWorkspaceActionMenu";
import { DiscussionLikeButton } from "./DiscussionLikeButton";
import { useDiscussionTextScale } from "./discussionTextScale";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";
import { useDiscussionWorkspaceCardActions } from "./useDiscussionWorkspaceCardActions";
import { useDiscussionReplyFocus } from "./discussionReplyFocus";
import { TimeAgo } from "../components/TimeAgo";
import { DiscussionCourseThumbnail } from "./DiscussionCourseThumbnail";
import { DiscussionAttachmentsList } from "../learning/discussion-attachments/DiscussionAttachmentsList";
import { DiscussionStaffActions } from "./DiscussionStaffActions";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";

/** The thread's replies as the replies query keeps them. */
type RepliesPages = InfiniteData<{ replies: LearningReply[] }>;

/** Thin lines between the panel's parts. */
const LINE = "border-[color-mix(in_srgb,var(--text)_8%,transparent)]";

const ghostIconButtonClasses =
  "grid size-8 shrink-0 place-items-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-(--accent)";

// Instructors are marked beside their name; admins are not.
function RoleBadge({ role }: { role?: string }) {
  if (role !== "Instructor") return null;
  return (
    <span className="rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-(--accent) uppercase">
      {role}
    </span>
  );
}

function KindBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-(--muted) uppercase">
      {label}
    </span>
  );
}

function PostBody({
  content,
  label,
  size = "base",
}: {
  content: string;
  label: string;
  size?: "base" | "sm";
}) {
  const [textScale] = useDiscussionTextScale();
  // The post: marked important, as the renderer's own size (14px on phones, 15px wider)
  // otherwise wins. 15px on every screen, the size the list's comment text
  // has on a phone.
  const textClass =
    size === "base"
      ? "text-[0.9375rem]! leading-relaxed"
      : "text-[0.9375rem] leading-relaxed";
  return (
    // The viewer's text size ("Aa" beside the author) scales the post as a
    // whole: text, line height and what is embedded in it, such as a link
    // preview, keep their proportions.
    <div style={textScale === 1 ? undefined : { zoom: textScale }}>
      <DiscussionMarkdown
        content={{
          format: "markdown",
          markdown: content,
          plainText: content,
        }}
        label={label}
        className={`max-w-none wrap-anywhere text-(--text) ${textClass}`}
      />
    </div>
  );
}

interface PanelEditHandlers {
  saving: boolean;
  onCancel: () => void;
  onSave: (content: string) => void;
}

/**
 * The post's text in the discussion editor, in place of the text itself.
 * Escape leaves the edit, not the panel; Ctrl/⌘+Enter saves.
 */
function PanelEditForm({
  documentId,
  initialContent,
  label,
  saving,
  onCancel,
  onSave,
}: PanelEditHandlers & {
  documentId: string;
  initialContent: string;
  label: string;
}) {
  const [draft, setDraft] = useState<DiscussionDraft>(() =>
    createDiscussionDraft(initialContent),
  );
  const save = () => {
    const content = draft.markdown.trim();
    if (!hasDiscussionDraftContent(draft) || saving) return;
    if (content === initialContent.trim()) onCancel();
    else onSave(content);
  };
  const onKeyDownCapture = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  };

  return (
    <div
      onKeyDownCapture={onKeyDownCapture}
      className="flex flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-(--surface)"
    >
      <DiscussionEditor
        documentId={documentId}
        value={draft}
        label={label}
        placeholderText="Write something…"
        autoFocus
        autoGrow
        maxHeight="50dvh"
        className="min-h-24"
        mentionsEnabled
        onChange={setDraft}
      />
      <div
        className={`flex items-center justify-end gap-1.5 border-t ${LINE} px-2 py-2`}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex h-8 items-center rounded-lg px-3 text-[0.8125rem] font-semibold text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!hasDiscussionDraftContent(draft) || saving}
          className="inline-flex h-8 items-center rounded-lg bg-(--accent) px-3.5 text-[0.8125rem] font-bold text-(--on-accent) transition-opacity disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function PanelReply({
  reply,
  highlighted,
  onLike,
  edit,
}: {
  reply: LearningReply;
  /** The reply the panel was opened for. */
  highlighted: boolean;
  onLike: (reply: LearningReply) => void;
  /** Given, the reply's text is shown in the editor to change it. */
  edit?: PanelEditHandlers;
}) {
  return (
    <article
      className={`flex gap-3 rounded-xl ${
        highlighted
          ? "-mx-3 bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] px-3 py-3"
          : ""
      }`}
    >
      <DiscussionAvatar
        src={reply.author.avatarUrl ?? null}
        className="size-8 shrink-0 rounded-full object-cover"
        width={32}
        height={32}
        loading="lazy"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-bold text-(--text)">
            {reply.isOwn
              ? `${reply.author.displayName || "You"} (You)`
              : reply.author.displayName}
          </span>
          <RoleBadge role={reply.author.role} />
          <TimeAgo value={reply.createdAt} className="text-xs text-(--muted)" />
        </div>
        {edit ? (
          <PanelEditForm
            {...edit}
            documentId={`discussions-panel-edit-reply-${reply.id}`}
            initialContent={reply.content}
            label="Edit reply"
          />
        ) : (
          <PostBody content={reply.content} label="Reply" size="sm" />
        )}
        {!edit && reply.attachments && reply.attachments.length > 0 && (
          <DiscussionAttachmentsList attachments={reply.attachments} />
        )}
        <div className="-ml-2.5">
          <DiscussionLikeButton
            liked={Boolean(reply.isLiked)}
            count={reply.likesCount}
            onToggle={() => onLike(reply)}
            noun="reply"
            iconSize={14}
          />
        </div>
      </div>
    </article>
  );
}

export type DiscussionPanelVariant = "desktop" | "tablet" | "phone";

/**
 * The open panel when the list beside it has nothing to show (an empty tab,
 * or filters that leave nothing): it stays open and says so, rather than
 * closing and opening again with the next tab.
 */
export function DiscussionPanelEmpty({
  message,
  onClose,
}: {
  message: string;
  /** Desktop only, as in the panel's bar. */
  onClose?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`flex h-14 shrink-0 items-center border-b ${LINE} px-2.5`}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            title="Close (Esc)"
            className={ghostIconButtonClasses}
          >
            <X size={17} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="grid flex-1 place-items-center px-6 pb-14 text-center">
        <div>
          <ChatsCircle
            size={30}
            weight="duotone"
            className="mx-auto text-(--muted)"
            aria-hidden="true"
          />
          <p className="mt-3 mb-0 text-sm font-semibold text-(--text)">
            {message}
          </p>
          <p className="mt-1 mb-0 text-xs text-(--muted)">
            Pick another tab or clear a filter.
          </p>
        </div>
      </div>
    </div>
  );
}

export interface DiscussionPanelStep {
  /** Where the open discussion is in the list, from 0. */
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}

export interface DiscussionPanelContentProps {
  card: DiscussionWorkspaceCard;
  destination: string | null;
  variant: DiscussionPanelVariant;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Desktop only: the panel there is part of the page and has a close
   * button. Elsewhere it closes by pressing outside or swiping it away. */
  onClose?: () => void;
  /** Called on Escape, where the container does not handle it itself. */
  onEscape?: () => void;
  onOpenInCourse: (path: string) => void;
  onReport?: (card: DiscussionWorkspaceCard) => void;
  setNotice?: (message: string) => void;
  step?: DiscussionPanelStep;
  /** The course's thumbnail, shown small beside the course and lesson. */
  courseThumbnail?: { url?: string | null; mediaId?: string | null };
}

/**
 * What the Discussions page's panel shows, whatever holds it: a bar with the
 * way out and through the list on the left and the menu alone on the right,
 * the post in full, its replies, and the reply box.
 */
export function DiscussionPanelContent({
  card,
  destination,
  variant,
  editing,
  onEditingChange,
  onClose,
  onEscape,
  onOpenInCourse,
  onReport,
  setNotice,
  step,
  courseThumbnail,
}: DiscussionPanelContentProps) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const isNote = card.itemType === "note" || card.kind === "note";
  const isReplyCard = card.itemType === "reply";
  // A reply or mention opens the discussion it belongs to.
  const threadId = isNote
    ? undefined
    : isReplyCard
      ? (card.parentThreadId ?? undefined)
      : card.id;
  const thread = useThreadDetails(threadId);
  const note = useNoteDetails(isNote ? card.id : undefined);
  const replies = useThreadReplies(threadId);
  const createReply = useCreateReply(
    threadId,
    card.courseId && card.lessonId
      ? { courseId: card.courseId, lessonId: card.lessonId }
      : undefined,
  );
  const updateThread = useUpdateThread(threadId);
  const updateReply = useUpdateReply(threadId);
  const updateNote = useUpdateNote(isNote ? card.id : undefined);
  const postActions = useDiscussionWorkspaceCardActions({
    card,
    destination,
    setNotice,
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  // "Reply" on the row: the box takes focus; pressed again while this is
  // open, the reply area also pulses once, softly, as a linked comment
  // under a lesson video does.
  const [replyFlash, setReplyFlash] = useState(false);
  const replyFlashTimers = useRef<number[]>([]);
  useEffect(
    () => () => replyFlashTimers.current.forEach(window.clearTimeout),
    [],
  );
  // Once the thread's request has finished, so a locked one (no reply
  // box) is known; a thread that could not be loaded still shows the box.
  const replyBoxShown =
    !isNote && Boolean(threadId) && !thread.isPending && !thread.data?.isLocked;
  useDiscussionReplyFocus(card.id, replyBoxShown, ({ pulse }) => {
    setComposerFocusRequest((request) => request + 1);
    replyFlashTimers.current.forEach(window.clearTimeout);
    if (!pulse) {
      setReplyFlash(false);
      return;
    }
    setReplyFlash(true);
    replyFlashTimers.current = [
      window.setTimeout(() => setReplyFlash(false), 450),
    ];
  });

  const kindName = isNote
    ? "Note"
    : thread.data?.kind === "question" || card.kind === "question"
      ? "Q&A"
      : "Comment";
  const kindLabel =
    kindName === "Q&A" && card.status === "solved"
      ? "Q&A · Solved"
      : kindName === "Q&A" && card.status === "answered"
        ? "Q&A · Answered"
        : kindName;
  const replyList = replies.data?.pages.flatMap((page) => page.replies) ?? [];
  const post = isNote ? note.data : thread.data;
  const author = thread.data?.author;
  const isOwnPost = isNote ? card.isOwn : Boolean(thread.data?.isOwn);
  const baseAuthorName = isNote
    ? card.author
    : (author?.displayName ?? card.author);
  const authorName = isOwnPost
    ? `${baseAuthorName || "You"} (You)`
    : baseAuthorName;
  const postContent = post?.content ?? card.content;

  // The editor's code is fetched while the reader reads, not when they
  // start to write.
  useEffect(() => {
    if (!isNote) preloadDiscussionEditor();
  }, [isNote]);

  // A new discussion starts at its top, and keyboard users land in the
  // panel (unless "Edit" has already put them in the editor).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true });
    }
  }, [card.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        onEscape?.();
        return;
      }
      // The arrows step through the list, except while typing.
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [contenteditable=true], .cm-editor",
        )
      )
        return;
      // Enter opens the lesson, unless a control that answers Enter itself
      // (a button, a link, a menu item) has the focus.
      if (
        event.key === "Enter" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        destination &&
        !(
          target instanceof Element &&
          target.closest(
            "button, a, [role=button], [role=menuitem], [role=tab], [role=option], [role=separator]",
          )
        )
      ) {
        event.preventDefault();
        onOpenInCourse(destination);
        return;
      }
      // Only while the focus is in this panel; elsewhere on the page the
      // arrows move between the tabs (useSettingsTabShortcuts).
      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !panelRef.current?.contains(document.activeElement)
      )
        return;
      if (event.key === "ArrowLeft" && step && step.index > 0) step.onPrev();
      else if (
        event.key === "ArrowRight" &&
        step &&
        step.index < step.count - 1
      )
        step.onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [destination, onEscape, onOpenInCourse, step]);

  const refreshAfterChange = () => {
    if (threadId) {
      void queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadReplies(threadId),
      });
    }
    // The list's row, and the lesson's own lists when next shown.
    void queryClient.invalidateQueries({
      queryKey: learningInteractionKeys.all,
      refetchType: "none",
    });
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[1] === "discussions-workspace",
    });
  };

  const isEditingReply = editing && isReplyCard;
  const isEditingPost = editing && !isEditingReply;
  const stopEditing = () => onEditingChange(false);
  const afterEdit = {
    onSuccess: () => {
      stopEditing();
      setNotice?.("Changes saved");
      if (threadId) {
        void queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.threadDetails(threadId),
        });
      }
      if (isNote) {
        void queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.noteDetails(card.id),
        });
      }
      refreshAfterChange();
    },
    onError: () => setNotice?.("Couldn't save your changes"),
  };
  const editHandlers: PanelEditHandlers = {
    saving:
      updateThread.isPending || updateReply.isPending || updateNote.isPending,
    onCancel: stopEditing,
    onSave: (content) => {
      if (isEditingReply) {
        updateReply.mutate(
          { replyId: card.id, payload: { content } },
          afterEdit,
        );
      } else if (isNote) {
        updateNote.mutate({ content }, afterEdit);
      } else {
        updateThread.mutate({ content }, afterEdit);
      }
    },
  };

  // The count changes at once; the server's answer then refreshes it, and
  // a failure puts it back.
  const likeReply = (reply: LearningReply) => {
    if (!threadId) return;
    const repliesKey = learningInteractionKeys.threadReplies(threadId);
    const liked = !reply.isLiked;
    const before = queryClient.getQueriesData<RepliesPages>({
      queryKey: repliesKey,
    });
    queryClient.setQueriesData<RepliesPages>(
      { queryKey: repliesKey },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                replies: page.replies.map((item) =>
                  item.id === reply.id
                    ? {
                        ...item,
                        isLiked: liked,
                        likesCount: Math.max(
                          0,
                          item.likesCount + (liked ? 1 : -1),
                        ),
                      }
                    : item,
                ),
              })),
            }
          : data,
    );
    void learningInteractionsService
      .toggleLike({ targetType: "reply", targetId: reply.id })
      .then(refreshAfterChange)
      .catch(() => {
        for (const [key, data] of before) queryClient.setQueryData(key, data);
        setNotice?.("Couldn't update like");
      });
  };

  const submitReply = async (
    draft: DiscussionDraft,
    attachments?: LocalComposerAttachment[],
  ): Promise<boolean> => {
    if (!threadId) return false;
    try {
      await createReply.mutateAsync({
        content: draft.markdown || draft.plainText.trim(),
        __localAttachments: attachments ?? [],
      });
      refreshAfterChange();
      // The new reply is at the end of the list.
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        }),
      );
      return true;
    } catch {
      return false;
    }
  };

  const firstName = (authorName ?? "").split(" ")[0] || "them";
  const showStepButtons = step && variant !== "phone";
  const canReply = !isNote && Boolean(threadId);
  const isLocked = Boolean(thread.data?.isLocked);

  const actionMenu = (
    <DiscussionWorkspaceActionMenu
      card={card}
      destination={destination}
      textSize
      setNotice={setNotice}
      onEdit={() => onEditingChange(true)}
      onReport={onReport}
    />
  );
  const hasLessonInfo = Boolean(card.course || card.lesson);
  const lessonPressRef = useRef<{ x: number; y: number } | null>(null);
  const lessonInBar = variant === "phone" && hasLessonInfo;
  // The course and lesson are the way to the lesson (Enter does the same);
  // there is no separate button for it.
  const renderLessonLink = (className: string) => {
    if (!hasLessonInfo) return null;
    const lessonInfo = (
      <>
        {/* The course's picture first (none when it has none), then the
            course and lesson, and the play mark at the end: the row opens
            the lesson. */}
        <DiscussionCourseThumbnail
          thumbnail={courseThumbnail}
          className="aspect-video h-9 w-auto shrink-0 rounded-md object-cover"
        />
        <div className="min-w-0 flex-1">
          {card.course && (
            <p className="m-0 truncate text-xs font-semibold text-(--muted)">
              {card.course}
            </p>
          )}
          {card.lesson && (
            <p className="m-0 truncate text-sm font-semibold text-(--text)">
              {card.lesson}
            </p>
          )}
        </div>
      </>
    );
    return destination ? (
      <a
        href={destination}
        // A drag here moves the sheet (or nothing), not the link itself.
        draggable={false}
        aria-keyshortcuts="Enter"
        title="Open lesson (Enter)"
        onPointerDown={(event) => {
          lessonPressRef.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={(event) => {
          event.preventDefault();
          // The end of a drag of the sheet is not a press of the link.
          const press = lessonPressRef.current;
          lessonPressRef.current = null;
          if (
            press &&
            Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6
          )
            return;
          onOpenInCourse(destination);
        }}
        className={`@container flex items-center gap-3 px-5 py-3 no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent) ${className}`}
      >
        {lessonInfo}
      </a>
    ) : (
      <div
        className={`@container flex items-center gap-3 px-5 py-3 ${className}`}
      >
        {lessonInfo}
      </div>
    );
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      data-arrow-keys-owner
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      {lessonInBar ? (
        // A phone has no ✕ and no steps (a swipe steps, the sheet closes
        // itself), so the course and lesson are the top row, the menu on
        // their right.
        <div
          // Pointing at the course and lesson lights the whole row, behind
          // the menu too; the menu keeps its own hover.
          className={`flex shrink-0 items-center gap-1 border-b ${LINE} rounded-t-[inherit] pt-0 pr-2.5 transition-colors has-[>a:hover]:bg-(--hover) [&>div:last-child]:mt-2`}
        >
          {renderLessonLink("min-w-0 flex-1 pt-5")}
          {actionMenu}
        </div>
      ) : (
        // The bar: out and through the list on the left, the menu alone on
        // the right, so neither is pressed for the other.
        <div
          className={`flex h-14 shrink-0 items-center justify-between gap-2 border-b ${LINE} px-2.5`}
        >
          <div className="flex min-w-0 items-center gap-1">
            {onClose && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close panel"
                  title="Close (Esc)"
                  className={ghostIconButtonClasses}
                >
                  <X size={17} weight="bold" aria-hidden="true" />
                </button>
                {showStepButtons && (
                  <span
                    className="mx-1 h-5 w-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                    aria-hidden="true"
                  />
                )}
              </>
            )}
            {showStepButtons && (
              <>
                <button
                  type="button"
                  onClick={step.onPrev}
                  disabled={step.index <= 0}
                  aria-label="Previous discussion"
                  title="Previous (←)"
                  className={ghostIconButtonClasses}
                >
                  <CaretLeft size={15} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={step.onNext}
                  disabled={step.index >= step.count - 1}
                  aria-label="Next discussion"
                  title="Next (→)"
                  className={ghostIconButtonClasses}
                >
                  <CaretRight size={15} weight="bold" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          {actionMenu}
        </div>
      )}

      <div
        ref={scrollRef}
        // pan-y: a sideways swipe on a phone moves through the list.
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
      >
        {!lessonInBar &&
          renderLessonLink(`border-b ${LINE} hover:bg-(--hover)`)}

        <article className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <DiscussionAvatar
              src={
                (isNote ? card.avatar : author?.avatarUrl) ||
                card.avatar ||
                null
              }
              className="size-10 shrink-0 rounded-full object-cover"
              width={40}
              height={40}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[0.9375rem] font-bold text-(--text)">
                  {authorName}
                </span>
                <RoleBadge role={author?.role} />
                <KindBadge label={kindLabel} />
              </div>
              {post ? (
                <TimeAgo
                  value={post.createdAt}
                  className="text-xs text-(--muted)"
                />
              ) : (
                <TimeAgo
                  value={card.activityAt}
                  label={card.activity}
                  className="text-xs text-(--muted)"
                />
              )}
            </div>
          </div>

          {post?.title && (
            <h2 className="mt-4 mb-0 text-lg leading-snug font-bold text-(--text)">
              {post.title}
            </h2>
          )}
          <div className="mt-3">
            {isEditingPost ? (
              <PanelEditForm
                key={card.id}
                {...editHandlers}
                documentId={`discussions-panel-edit-${card.id}`}
                initialContent={postContent}
                label={`Edit ${kindName === "Q&A" ? "question" : kindName.toLowerCase()}`}
              />
            ) : (
              <PostBody content={postContent} label={kindName} />
            )}
            {/* The images and files posted with it, as under the video. */}
            {!editing && post?.attachments && post.attachments.length > 0 && (
              <DiscussionAttachmentsList
                attachments={post.attachments}
                className="mt-3"
              />
            )}
          </div>

          {!isReplyCard && postActions.canLike && (
            <div className="mt-3 -ml-2.5 flex flex-wrap items-center gap-1">
              <DiscussionLikeButton
                liked={Boolean(card.isLiked)}
                count={card.likes}
                onToggle={postActions.like}
              />
              <DiscussionStaffActions card={card} staff={postActions.staff} />
            </div>
          )}
        </article>

        {!isNote && (
          <section
            aria-label="Replies"
            className={`border-t ${LINE} px-5 pt-4 pb-6`}
          >
            <h3 className="m-0 mb-4 text-xs font-bold tracking-wider text-(--muted) uppercase">
              {replies.isLoading
                ? "Replies"
                : replyList.length === 0
                  ? "Replies"
                  : `${replyList.length} ${replyList.length === 1 ? "reply" : "replies"}`}
            </h3>
            {!replies.isLoading && replyList.length === 0 && (
              <p className="m-0 text-sm text-(--muted)">
                No replies yet.
                {canReply &&
                  !isLocked &&
                  !isOwnPost &&
                  ` Be the first to reply to ${firstName}.`}
              </p>
            )}
            <div className="flex flex-col gap-5">
              {replyList.map((reply) => (
                <PanelReply
                  key={reply.id}
                  reply={reply}
                  highlighted={isReplyCard && reply.id === card.id}
                  onLike={likeReply}
                  edit={
                    isEditingReply && reply.id === card.id
                      ? editHandlers
                      : undefined
                  }
                />
              ))}
              {replies.hasNextPage && (
                <button
                  type="button"
                  onClick={() => void replies.fetchNextPage()}
                  disabled={replies.isFetchingNextPage}
                  className="self-start rounded-lg px-2.5 py-1.5 text-sm font-semibold text-(--accent) hover:bg-(--hover)"
                >
                  {replies.isFetchingNextPage
                    ? "Loading…"
                    : "Show more replies"}
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      {canReply && threadId && (
        <div
          // The flash is a tinted layer over the whole area below the
          // line, the box and its toolbar alike, so their own colours stay.
          className={`relative shrink-0 border-t ${LINE} after:pointer-events-none after:absolute after:inset-0 after:z-10 after:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] after:transition-opacity after:ease-out after:content-[""] ${
            replyFlash
              ? "after:opacity-100 after:duration-200"
              : "after:opacity-0 after:duration-700"
          } ${
            variant === "phone" ? "pb-[var(--app-safe-area-bottom,0px)]" : ""
          }`}
        >
          {isLocked ? (
            <p className="m-0 flex items-center justify-center gap-2 px-4 py-4 text-xs font-semibold text-(--muted)">
              <LockSimple size={15} weight="bold" aria-hidden="true" />
              Replies are turned off for this discussion.
            </p>
          ) : (
            <ThreadReplyComposer
              key={threadId}
              entry={{ id: threadId, name: firstName }}
              currentUser={{
                name: currentUser?.displayName ?? "",
                avatar: currentUser?.avatarDataUrl ?? "",
              }}
              focusRequest={composerFocusRequest}
              editorReady
              onRequestFocus={() =>
                setComposerFocusRequest((request) => request + 1)
              }
              onFocusHandled={() => undefined}
              onSubmit={submitReply}
              courseId={card.courseId || undefined}
              className="grid grid-rows-[auto_auto] overflow-hidden bg-(--surface) transition-colors duration-150 focus-within:bg-[color-mix(in_srgb,var(--surface)_92%,var(--canvas))]"
            />
          )}
        </div>
      )}
    </div>
  );
}
