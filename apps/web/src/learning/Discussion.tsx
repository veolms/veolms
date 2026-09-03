import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../components/ui/drawer";
import { CommentCard } from "./CommentCard";
import type { Comment, CommentReply } from "./CommentCard";
import { CommentComposer } from "./CommentComposer";
import { DiscussionThreadPanel } from "./DiscussionThreadPanel";
import {
  createDiscussionDraft,
  createEmptyDiscussionDraft,
  getDiscussionAttachmentCount,
  hasDiscussionDraftContent,
  isDiscussionContent,
  isStoredDiscussionDraft,
  type DiscussionDraft,
  type DiscussionEntryKind,
  type DiscussionVisibility,
} from "./discussion-editor/types";
import { useSessionStorageState } from "./useSessionStorageState";

const CURRENT_USER = {
  name: "Ashi Singh",
  avatar: "/assets/sofia-avatar-160.webp",
};

const initialEntries: Comment[] = [
  {
    id: 4,
    name: "Rohit Sharma",
    time: "2 hours ago",
    avatar: "/assets/ethan-avatar-160.webp",
    text: "Great explanation! The way you broke down the design process makes it so much easier to understand. Especially the part about user empathy — super insightful!",
    entryKind: "comment",
    likes: 24,
    replies: 2,
    repliesExpanded: true,
    thread: [
      {
        id: 401,
        name: "Ashi Singh",
        time: "1 hour ago",
        avatar: "/assets/sofia-avatar-160.webp",
        text: "Thank you so much, Rohit! Really glad it helped.",
        likes: 12,
      },
      {
        id: 402,
        name: "Karan Mehta",
        time: "45 minutes ago",
        avatar: "/assets/ethan-avatar-160.webp",
        text: "Totally agree! The empathy part clicked for me too.",
        likes: 5,
      },
    ],
  },
  {
    id: 3,
    name: "Neha Patel",
    time: "3 hours ago",
    avatar: "/assets/sofia-avatar-160.webp",
    text: "Can you share some real-world examples of this process?",
    entryKind: "question",
    likes: 18,
    replies: 1,
    isQuestion: true,
    thread: [
      {
        id: 301,
        name: "Ashi Singh",
        time: "2 hours ago",
        avatar: "/assets/sofia-avatar-160.webp",
        text: "Absolutely — I’ll add a few examples from product discovery and usability testing.",
        likes: 7,
      },
    ],
  },
  {
    id: 2,
    name: "Ashi Singh",
    time: "1 day ago",
    avatar: "/assets/sofia-avatar-160.webp",
    text: "Here’s a quick note on user empathy with examples and a worksheet that helped me connect the steps.",
    entryKind: "note",
    likes: 8,
    attachment: {
      name: "User empathy notes",
      meta: "PDF · 412 KB",
    },
  },
  {
    id: 1,
    name: "Vivek Nair",
    time: "1 day ago",
    avatar: "/assets/ethan-avatar-160.webp",
    text: "How do you know when you have enough user interviews to start mapping patterns?",
    entryKind: "question",
    likes: 11,
    replies: 1,
    isQuestion: true,
    thread: [
      {
        id: 101,
        name: "Karan Mehta",
        time: "21 hours ago",
        avatar: "/assets/ethan-avatar-160.webp",
        text: "When the same themes repeat and new interviews stop changing the shape of the problem.",
        likes: 7,
      },
    ],
  },
];

type EntryFilter = "all" | DiscussionEntryKind;
type ComposerMode = "collapsed" | "desktop" | "mobile";

const DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT = 0.62;

export const getDiscussionComposerCollapsedSnapPoint = (
  viewportHeight: number,
  playerBottom: number | undefined,
) => {
  if (
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    playerBottom === undefined ||
    !Number.isFinite(playerBottom)
  ) {
    return DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT;
  }

  return Math.max(2, Math.round(viewportHeight - playerBottom));
};

export const getDiscussionComposerViewportGeometry = (
  layoutViewportHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop: number,
  playerBottom: number | undefined,
) => {
  const resolvedLayoutViewportHeight =
    Number.isFinite(layoutViewportHeight) && layoutViewportHeight > 0
      ? layoutViewportHeight
      : visualViewportHeight;
  const rawVisualViewportHeight =
    Number.isFinite(visualViewportHeight) && visualViewportHeight > 0
      ? visualViewportHeight
      : resolvedLayoutViewportHeight;
  const resolvedVisualViewportHeight = Math.min(
    resolvedLayoutViewportHeight,
    rawVisualViewportHeight,
  );
  const resolvedVisualViewportOffsetTop = Math.min(
    Math.max(
      0,
      Number.isFinite(visualViewportOffsetTop) ? visualViewportOffsetTop : 0,
    ),
    Math.max(0, resolvedLayoutViewportHeight - resolvedVisualViewportHeight),
  );
  const visualViewportBottom =
    resolvedVisualViewportOffsetTop + resolvedVisualViewportHeight;

  return {
    collapsedSnapPoint: getDiscussionComposerCollapsedSnapPoint(
      visualViewportBottom,
      playerBottom,
    ),
    keyboardInset: Math.max(
      0,
      Math.round(resolvedLayoutViewportHeight - visualViewportBottom),
    ),
    visualViewportHeight: Math.max(2, Math.round(resolvedVisualViewportHeight)),
  };
};

interface DiscussionProps {
  persistenceKey: string;
  mobileBottomNavigation?: boolean;
  mobileBottomNavigationHidden?: boolean;
}

export const DISCUSSION_COMMENT_CHARACTER_LIMIT = 10_000;
const COMMENT_LENGTH_NOTICE = `Comments, Q&As, and notes can be up to ${DISCUSSION_COMMENT_CHARACTER_LIMIT.toLocaleString("en-US")} characters.`;
const initialDraft = createEmptyDiscussionDraft();
const countCharacters = (value: string) => Array.from(value).length;

interface EditingEntry {
  id: number;
  draft: DiscussionDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
}

interface OpenDiscussionThread {
  id: number;
  focusComposer: boolean;
}

const entryFilters = [
  ["all", "All"],
  ["note", "Notes"],
  ["comment", "Comments"],
  ["question", "Q&As"],
] as const satisfies readonly (readonly [EntryFilter, string])[];

const isDiscussionEntryKind = (value: unknown): value is DiscussionEntryKind =>
  value === "comment" || value === "question" || value === "note";

const isDiscussionVisibility = (
  value: unknown,
): value is DiscussionVisibility =>
  value === "public" || value === "private" || value === "unlisted";

const getAllowedVisibility = (
  entryKind: DiscussionEntryKind,
  visibility: DiscussionVisibility,
): DiscussionVisibility =>
  entryKind === "note" || visibility !== "private" ? visibility : "public";

const isStoredEntries = (value: unknown): value is Comment[] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as Comment).id === "number" &&
      typeof (entry as Comment).name === "string" &&
      typeof (entry as Comment).time === "string" &&
      typeof (entry as Comment).avatar === "string" &&
      typeof (entry as Comment).text === "string" &&
      typeof (entry as Comment).likes === "number" &&
      (typeof (entry as Comment).entryKind === "undefined" ||
        isDiscussionEntryKind((entry as Comment).entryKind)) &&
      (typeof (entry as Comment).content === "undefined" ||
        isDiscussionContent((entry as Comment).content)) &&
      (typeof (entry as Comment).visibility === "undefined" ||
        isDiscussionVisibility((entry as Comment).visibility)) &&
      (typeof (entry as Comment).liked === "undefined" ||
        typeof (entry as Comment).liked === "boolean") &&
      (typeof (entry as Comment).isOwn === "undefined" ||
        typeof (entry as Comment).isOwn === "boolean"),
  );

export function Discussion({
  persistenceKey,
  mobileBottomNavigation = false,
  mobileBottomNavigationHidden = false,
}: DiscussionProps) {
  const storageBase = `veolms-learning-${persistenceKey}-discussion`;
  const [draft, setDraft] = useSessionStorageState<DiscussionDraft>(
    `${storageBase}-markdown-draft-v1`,
    initialDraft,
    isStoredDiscussionDraft,
  );
  const [postedEntries, setPostedEntries] = useSessionStorageState<Comment[]>(
    `${storageBase}-markdown-entries-v1`,
    [],
    isStoredEntries,
  );
  const [entries, setEntries] = useState(initialEntries);
  const [entryKind, setEntryKind] = useState<DiscussionEntryKind>("comment");
  const [visibility, setVisibility] = useState<DiscussionVisibility>("public");
  const [entryFilter, setEntryFilter] = useState<EntryFilter>("all");
  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [openThread, setOpenThread] = useState<OpenDiscussionThread | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const activeDraft = editingEntry?.draft ?? draft;
  const activeEntryKind = editingEntry?.entryKind ?? entryKind;
  const activeVisibility = editingEntry?.visibility ?? visibility;
  const draftAttachmentCount = getDiscussionAttachmentCount(
    activeDraft.markdown,
  );
  const draftHasContent = hasDiscussionDraftContent(activeDraft);
  const draftIsTooLong =
    countCharacters(activeDraft.plainText) > DISCUSSION_COMMENT_CHARACTER_LIMIT;
  const canSubmitDraft = draftHasContent && !draftIsTooLong;

  useEffect(() => {
    if (postedEntries.length === 0) return;
    setEntries((current) => [
      ...postedEntries.map((entry) => ({ ...entry, isOwn: true })),
      ...current.filter(
        (entry) =>
          !postedEntries.some((persisted) => persisted.id === entry.id),
      ),
    ]);
  }, [postedEntries]);

  const filteredEntries = useMemo(() => {
    const visibleEntries =
      entryFilter === "all"
        ? entries
        : entries.filter(
            (entry) =>
              (entry.entryKind ??
                (entry.isQuestion ? "question" : "comment")) === entryFilter,
          );
    return Array.from(
      new Map(visibleEntries.map((entry) => [entry.id, entry])).values(),
    );
  }, [entries, entryFilter]);
  const threadEntries = useMemo(
    () =>
      Array.from(new Map(entries.map((entry) => [entry.id, entry])).values()),
    [entries],
  );

  const submitEntry = () => {
    if (draftIsTooLong) {
      setNotice(COMMENT_LENGTH_NOTICE);
      return;
    }

    if (!draftHasContent) return;

    const text = activeDraft.plainText.trim();
    const submittedVisibility = getAllowedVisibility(
      activeEntryKind,
      activeVisibility,
    );

    if (editingEntry) {
      const originalEntry = entries.find(
        (entry) => entry.id === editingEntry.id,
      );
      if (!originalEntry) {
        setEditingEntry(null);
        return;
      }

      const updatedEntry: Comment = {
        ...originalEntry,
        text,
        content: activeDraft,
        visibility: submittedVisibility,
        entryKind: activeEntryKind,
        isQuestion: activeEntryKind === "question",
        time: "Just now (edited)",
      };
      const update = (current: Comment[]) =>
        current.map((entry) =>
          entry.id === updatedEntry.id ? updatedEntry : entry,
        );

      setEntries(update);
      setPostedEntries((current) =>
        current.some((entry) => entry.id === updatedEntry.id)
          ? update(current)
          : [updatedEntry, ...current],
      );
      setEditingEntry(null);
      setEntryFilter("all");
      setNotice("");
      return;
    }

    const entry: Comment = {
      id: Date.now(),
      name: CURRENT_USER.name,
      time: "Just now",
      avatar: CURRENT_USER.avatar,
      text,
      content: activeDraft,
      visibility: submittedVisibility,
      entryKind: activeEntryKind,
      likes: 0,
      replies: 0,
      isQuestion: activeEntryKind === "question",
      isOwn: true,
    };

    setPostedEntries((current) => [entry, ...current]);
    setEntries((current) => [entry, ...current]);
    setDraft(createEmptyDiscussionDraft());
    setEntryFilter("all");

    setNotice("");
  };

  const onLike = (id: number, liked: boolean) => {
    const update = (current: Comment[]) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              likes: Math.max(0, entry.likes + (liked ? 1 : -1)),
              liked,
            }
          : entry,
      );
    setEntries(update);
    setPostedEntries(update);
  };

  const beginEditingEntry = (entry: Comment) => {
    const entryKind =
      entry.entryKind ?? (entry.isQuestion ? "question" : "comment");
    setEditingEntry({
      id: entry.id,
      draft: entry.content ?? createDiscussionDraft(entry.text),
      entryKind,
      visibility: getAllowedVisibility(entryKind, entry.visibility ?? "public"),
    });
    setNotice("");
  };

  const deleteEntry = (id: number) => {
    const remove = (current: Comment[]) =>
      current.filter((entry) => entry.id !== id);
    setEntries(remove);
    setPostedEntries(remove);
    setEditingEntry((current) => (current?.id === id ? null : current));
    setNotice("");
  };

  const addReply = (entryId: number, reply: CommentReply) => {
    const update = (current: Comment[]) =>
      current.map((entry) => {
        if (entry.id !== entryId) return entry;
        const thread = [...(entry.thread ?? []), reply];
        return {
          ...entry,
          thread,
          replies: Math.max(entry.replies ?? 0, thread.length),
        };
      });
    setEntries(update);
    setPostedEntries(update);
  };

  const editReply = (
    entryId: number,
    replyId: number,
    replyDraft: DiscussionDraft,
  ) => {
    const update = (current: Comment[]) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              thread: entry.thread?.map((reply) =>
                reply.id === replyId
                  ? {
                      ...reply,
                      text: replyDraft.plainText.trim(),
                      content: replyDraft,
                      time: "Just now (edited)",
                    }
                  : reply,
              ),
            }
          : entry,
      );
    setEntries(update);
    setPostedEntries(update);
  };

  const deleteReply = (entryId: number, replyId: number) => {
    const update = (current: Comment[]) =>
      current.map((entry) => {
        if (entry.id !== entryId) return entry;
        const thread = (entry.thread ?? []).filter(
          (reply) => reply.id !== replyId,
        );
        return {
          ...entry,
          thread,
          replies: Math.max(0, (entry.replies ?? thread.length) - 1),
        };
      });
    setEntries(update);
    setPostedEntries(update);
  };

  return (
    <section className="learning-discussion" aria-label="Lesson discussion">
      <ThreadSurface
        draft={activeDraft}
        entryKind={activeEntryKind}
        visibility={activeVisibility}
        editingEntryId={editingEntry?.id ?? null}
        notice={notice}
        entryFilter={entryFilter}
        entries={filteredEntries}
        draftIsTooLong={draftIsTooLong}
        draftAttachmentCount={draftAttachmentCount}
        canSubmitDraft={canSubmitDraft}
        mobileBottomNavigation={mobileBottomNavigation}
        mobileBottomNavigationHidden={mobileBottomNavigationHidden}
        onDraftChange={(value) => {
          if (editingEntry) {
            setEditingEntry((current) =>
              current ? { ...current, draft: value } : current,
            );
          } else {
            setDraft(value);
          }
          setNotice(
            countCharacters(value.plainText) >
              DISCUSSION_COMMENT_CHARACTER_LIMIT
              ? COMMENT_LENGTH_NOTICE
              : "",
          );
        }}
        onEntryKindChange={(value) => {
          if (editingEntry) {
            setEditingEntry((current) =>
              current
                ? {
                    ...current,
                    entryKind: value,
                    visibility: getAllowedVisibility(value, current.visibility),
                  }
                : current,
            );
          } else {
            setEntryKind(value);
            setVisibility((current) => getAllowedVisibility(value, current));
          }
        }}
        onVisibilityChange={(value) => {
          const allowedVisibility = getAllowedVisibility(
            activeEntryKind,
            value,
          );
          if (editingEntry) {
            setEditingEntry((current) =>
              current ? { ...current, visibility: allowedVisibility } : current,
            );
          } else {
            setVisibility(allowedVisibility);
          }
        }}
        onSubmit={submitEntry}
        onCancelEdit={() => setEditingEntry(null)}
        onEntryFilterChange={setEntryFilter}
        onLike={onLike}
        onEdit={beginEditingEntry}
        onDelete={deleteEntry}
        onReport={() =>
          setNotice("Report received. Our moderation team will review it.")
        }
        onOpenThread={(id, focusComposer = false) =>
          setOpenThread({ id, focusComposer })
        }
      />
      <DiscussionThreadPanel
        open={openThread !== null}
        activeEntryId={openThread?.id ?? null}
        entries={threadEntries}
        focusComposerOnOpen={Boolean(openThread?.focusComposer)}
        onOpenChange={(open) => {
          if (!open) setOpenThread(null);
        }}
        onActiveEntryChange={(id) =>
          setOpenThread((current) =>
            current ? { id, focusComposer: false } : current,
          )
        }
        onLike={onLike}
        onAddReply={addReply}
        onEditEntry={beginEditingEntry}
        onDeleteEntry={deleteEntry}
        onEditReply={editReply}
        onDeleteReply={deleteReply}
        onReport={() =>
          setNotice("Report received. Our moderation team will review it.")
        }
      />
    </section>
  );
}

interface ThreadSurfaceProps {
  draft: DiscussionDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  editingEntryId: number | null;
  notice: string;
  entryFilter: EntryFilter;
  entries: Comment[];
  draftIsTooLong: boolean;
  draftAttachmentCount: number;
  canSubmitDraft: boolean;
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden: boolean;
  onDraftChange: (value: DiscussionDraft) => void;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
  onEntryFilterChange: (filter: EntryFilter) => void;
  onLike: (id: number, liked: boolean) => void;
  onEdit: (comment: Comment) => void;
  onDelete: (id: number) => void;
  onReport: (id: number) => void;
  onOpenThread: (id: number, focusComposer?: boolean) => void;
}

function ThreadSurface({
  draft,
  entryKind,
  visibility,
  editingEntryId,
  notice,
  entryFilter,
  entries,
  draftIsTooLong,
  draftAttachmentCount,
  canSubmitDraft,
  mobileBottomNavigation,
  mobileBottomNavigationHidden,
  onDraftChange,
  onEntryKindChange,
  onVisibilityChange,
  onSubmit,
  onCancelEdit,
  onEntryFilterChange,
  onLike,
  onEdit,
  onDelete,
  onReport,
  onOpenThread,
}: ThreadSurfaceProps) {
  const isPhone = usePhoneComposerLayout();
  const composerHostRef = useRef<HTMLDivElement>(null);
  const compactComposerScrollHidden =
    mobileBottomNavigation && mobileBottomNavigationHidden;
  const [composerMode, setComposerMode] = useState<ComposerMode>("collapsed");
  const [
    mobileComposerCollapsedSnapPoint,
    setMobileComposerCollapsedSnapPoint,
  ] = useState<number>(DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT);
  const [mobileComposerSnapPoint, setMobileComposerSnapPoint] = useState<
    number | null
  >(DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT);
  const [mobileComposerKeyboardInset, setMobileComposerKeyboardInset] =
    useState(0);
  const [mobileComposerViewportHeight, setMobileComposerViewportHeight] =
    useState<number | null>(null);
  const mobileComposerSnapPoints = useMemo(
    () => [mobileComposerCollapsedSnapPoint, 1],
    [mobileComposerCollapsedSnapPoint],
  );

  const getMobileComposerViewportGeometry = useCallback(() => {
    const playerBottom = document
      .querySelector<HTMLElement>(".learning-workspace__player-wrap")
      ?.getBoundingClientRect().bottom;
    const visualViewport = window.visualViewport;
    return getDiscussionComposerViewportGeometry(
      document.documentElement.clientHeight || window.innerHeight,
      visualViewport?.height ?? window.innerHeight,
      visualViewport?.offsetTop ?? 0,
      playerBottom,
    );
  }, []);

  const openMobileComposer = useCallback(() => {
    const geometry = getMobileComposerViewportGeometry();
    setMobileComposerCollapsedSnapPoint(geometry.collapsedSnapPoint);
    setMobileComposerSnapPoint(geometry.collapsedSnapPoint);
    setMobileComposerKeyboardInset(geometry.keyboardInset);
    setMobileComposerViewportHeight(geometry.visualViewportHeight);
    setComposerMode("mobile");
  }, [getMobileComposerViewportGeometry]);

  const closeComposer = useCallback(() => {
    setComposerMode("collapsed");
    if (editingEntryId !== null) onCancelEdit();
  }, [editingEntryId, onCancelEdit]);

  useEffect(() => {
    setComposerMode((current) => {
      if (isPhone && current === "desktop") return "collapsed";
      if (!isPhone && current === "mobile") return "collapsed";
      return current;
    });
  }, [isPhone]);

  useEffect(() => {
    if (editingEntryId === null) return undefined;
    if (isPhone) {
      openMobileComposer();
      return undefined;
    }

    setComposerMode("desktop");
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      composerHostRef.current?.scrollIntoView?.({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingEntryId, isPhone, openMobileComposer]);

  useEffect(() => {
    if (!isPhone || composerMode !== "mobile") return undefined;

    const player = document.querySelector<HTMLElement>(
      ".learning-workspace__player-wrap",
    );
    let frame: number | null = null;
    let settleTimer: number | null = null;
    const syncSnapPoint = () => {
      frame = null;
      const geometry = getMobileComposerViewportGeometry();
      setMobileComposerCollapsedSnapPoint(geometry.collapsedSnapPoint);
      setMobileComposerSnapPoint((current) =>
        current === 1 ? 1 : geometry.collapsedSnapPoint,
      );
      setMobileComposerKeyboardInset(geometry.keyboardInset);
      setMobileComposerViewportHeight(geometry.visualViewportHeight);
    };
    const scheduleSnapPointSync = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncSnapPoint);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(syncSnapPoint, 180);
    };
    const playerResizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleSnapPointSync);

    if (player) playerResizeObserver?.observe(player);
    window.addEventListener("resize", scheduleSnapPointSync);
    window.addEventListener("orientationchange", scheduleSnapPointSync);
    document.addEventListener("fullscreenchange", scheduleSnapPointSync);
    document.addEventListener("webkitfullscreenchange", scheduleSnapPointSync);
    window.visualViewport?.addEventListener("resize", scheduleSnapPointSync);
    window.visualViewport?.addEventListener("scroll", scheduleSnapPointSync);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      playerResizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSnapPointSync);
      window.removeEventListener("orientationchange", scheduleSnapPointSync);
      document.removeEventListener("fullscreenchange", scheduleSnapPointSync);
      document.removeEventListener(
        "webkitfullscreenchange",
        scheduleSnapPointSync,
      );
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleSnapPointSync,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        scheduleSnapPointSync,
      );
    };
  }, [composerMode, getMobileComposerViewportGeometry, isPhone]);

  useEffect(() => {
    if (composerMode === "collapsed") return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-comment-composer-container]")
      ) {
        return;
      }
      if (document.querySelector('[role="listbox"]')) return;
      closeComposer();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [closeComposer, composerMode]);

  const submitAndCollapse = () => {
    if (!canSubmitDraft) return;
    onSubmit();
    setComposerMode("collapsed");
  };

  return (
    <div>
      {!isPhone && (
        <div
          ref={composerHostRef}
          data-comment-composer-container
          className="mt-4 scroll-mt-4"
        >
          {composerMode === "desktop" ? (
            <CommentComposer
              draft={draft}
              documentId={
                editingEntryId === null
                  ? "discussion-new"
                  : `discussion-edit-${editingEntryId}`
              }
              entryKind={entryKind}
              visibility={visibility}
              invalid={draftIsTooLong}
              canSubmit={canSubmitDraft}
              editing={editingEntryId !== null}
              autoFocus
              onDraftChange={onDraftChange}
              onEntryKindChange={onEntryKindChange}
              onVisibilityChange={onVisibilityChange}
              onSubmit={submitAndCollapse}
              onClose={closeComposer}
            />
          ) : (
            <CompactComposer
              draft={draft}
              attachmentCount={draftAttachmentCount}
              onOpen={() => setComposerMode("desktop")}
            />
          )}
        </div>
      )}

      <p role="status" className="sr-only">
        {notice}
      </p>

      <div
        role="group"
        aria-label="Filter discussion entries"
        className={`learning-discussion__filter-group flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isPhone ? "mt-2" : "mt-5"}`}
      >
        {entryFilters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={entryFilter === value}
            onClick={() => onEntryFilterChange(value)}
            className={`learning-discussion__filter-button h-8 shrink-0 rounded-lg px-2.5 font-semibold transition-[background-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:px-3 ${entryFilter === value ? "bg-(--text) text-(--canvas) shadow-[0_6px_18px_color-mix(in_srgb,var(--canvas)_28%,transparent)]" : "bg-[color-mix(in_srgb,var(--surface)_54%,transparent)] text-(--text-secondary) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)] hover:bg-(--hover) hover:text-(--text)"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`mt-1 flex flex-col gap-1 ${isPhone ? "pb-36" : "pb-4"}`}>
        {entries.map((entry) => (
          <CommentCard
            key={entry.id}
            comment={entry}
            onLike={onLike}
            onEdit={onEdit}
            onDelete={onDelete}
            onReport={onReport}
            onOpenThread={onOpenThread}
          />
        ))}
        {entries.length === 0 && (
          <div className="py-12 text-center">
            <p className="font-semibold text-(--text)">
              No{" "}
              {entryFilter === "all" ? "entries" : getFilterName(entryFilter)}{" "}
              yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-(--muted)">
              Choose All to return to the full lesson discussion.
            </p>
          </div>
        )}
      </div>

      {isPhone && composerMode !== "mobile" && (
        <MobileCompactComposerPortal
          draft={draft}
          attachmentCount={draftAttachmentCount}
          mobileBottomNavigation={mobileBottomNavigation}
          scrollHidden={compactComposerScrollHidden}
          onOpen={openMobileComposer}
        />
      )}

      {isPhone && (
        <Drawer
          open={composerMode === "mobile"}
          onOpenChange={(open) => {
            if (open) openMobileComposer();
            else closeComposer();
          }}
          modal={false}
          snapPoints={mobileComposerSnapPoints}
          snapPoint={mobileComposerSnapPoint}
          onSnapPointChange={(snapPoint) => {
            if (typeof snapPoint === "number" || snapPoint === null) {
              setMobileComposerSnapPoint(snapPoint);
            }
          }}
          snapToSequentialPoints
          showSwipeHandle
          swipeDirection="down"
          swipeHandleClassName="pt-2.5 after:w-18 after:bg-[color-mix(in_srgb,var(--text)_34%,transparent)]"
        >
          <DrawerContent
            data-comment-composer-container
            style={
              {
                "--drawer-content-height": mobileComposerViewportHeight
                  ? `${mobileComposerViewportHeight}px`
                  : "100dvh",
                "--drawer-content-max-height": mobileComposerViewportHeight
                  ? `${mobileComposerViewportHeight}px`
                  : "100dvh",
                bottom: `${mobileComposerKeyboardInset}px`,
                paddingBottom:
                  mobileComposerKeyboardInset > 0
                    ? "0px"
                    : "var(--app-safe-area-bottom)",
              } as React.CSSProperties
            }
            aria-label={
              editingEntryId === null
                ? "Create a discussion entry"
                : "Edit a discussion entry"
            }
            className="learning-comment-composer-drawer overflow-hidden rounded-t-[22px]! bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] px-0 pt-0 shadow-[0_-20px_56px_rgba(0,0,0,0.42)] data-expanded:rounded-none!"
          >
            <DrawerTitle className="sr-only">
              {editingEntryId === null
                ? "Create a discussion entry"
                : "Edit a discussion entry"}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Write a comment, Q&A, or note for this lesson.
            </DrawerDescription>
            <CommentComposer
              draft={draft}
              documentId={
                editingEntryId === null
                  ? "discussion-new"
                  : `discussion-edit-${editingEntryId}`
              }
              entryKind={entryKind}
              visibility={visibility}
              invalid={draftIsTooLong}
              canSubmit={canSubmitDraft}
              editing={editingEntryId !== null}
              autoFocus
              presentation="drawer"
              onDraftChange={onDraftChange}
              onEntryKindChange={onEntryKindChange}
              onVisibilityChange={onVisibilityChange}
              onSubmit={submitAndCollapse}
              onClose={closeComposer}
            />
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

interface CompactComposerProps {
  draft: DiscussionDraft;
  attachmentCount: number;
  mobile?: boolean;
  onOpen: () => void;
}

interface MobileCompactComposerPortalProps {
  draft: DiscussionDraft;
  attachmentCount: number;
  mobileBottomNavigation: boolean;
  scrollHidden: boolean;
  onOpen: () => void;
}

function MobileCompactComposerPortal({
  draft,
  attachmentCount,
  mobileBottomNavigation,
  scrollHidden,
  onOpen,
}: MobileCompactComposerPortalProps) {
  const layerTarget = document.querySelector<HTMLElement>(
    "[data-learning-motion-stage]",
  );

  return createPortal(
    <div
      data-learning-mobile-composer-layer
      className={`pointer-events-none fixed inset-x-0 z-130 box-border min-w-0 max-w-full overflow-x-clip transition-[transform,opacity] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        mobileBottomNavigation
          ? "bottom-[calc(58px+var(--app-viewport-safe-area-bottom))]"
          : "bottom-0"
      }`}
      style={{
        opacity: "var(--learning-player-content-opacity, 1)",
        transform:
          "translate3d(0, var(--learning-player-content-offset-y, 0px), 0)",
        transitionDuration:
          "var(--learning-player-content-motion-duration, 0ms)",
      }}
    >
      <div
        data-learning-mobile-composer-surface
        data-testid="mobile-discussion-composer"
        data-scroll-hidden={scrollHidden}
        aria-hidden={scrollHidden}
        className={`pointer-events-auto relative box-border min-w-0 max-w-full overflow-x-clip bg-[color-mix(in_srgb,var(--canvas)_90%,transparent)] px-3 pt-2 pb-[max(8px,var(--app-safe-area-bottom))] shadow-[0_-12px_36px_color-mix(in_srgb,var(--canvas)_58%,transparent)] backdrop-blur-xl transition-[transform,opacity,visibility] will-change-transform motion-reduce:transition-none ${scrollHidden ? "pointer-events-none invisible translate-y-[calc(100%+58px+var(--app-viewport-safe-area-bottom)+4px)] opacity-0 duration-180 ease-[cubic-bezier(0.4,0,1,1)]" : "visible translate-y-0 opacity-100 duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]"}`}
      >
        <CompactComposer
          draft={draft}
          attachmentCount={attachmentCount}
          mobile
          onOpen={onOpen}
        />
      </div>
    </div>,
    layerTarget ?? document.body,
  );
}

function CompactComposer({
  draft,
  attachmentCount,
  mobile = false,
  onOpen,
}: CompactComposerProps) {
  const preview =
    draft.plainText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const attachmentPreview = `${attachmentCount} ${attachmentCount === 1 ? "attachment" : "attachments"}`;

  return (
    <button
      type="button"
      data-compact-comment-composer
      aria-label="Open discussion composer"
      onClick={onOpen}
      className={`flex w-full items-center gap-2 bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] text-left shadow-[0_12px_34px_color-mix(in_srgb,var(--canvas)_34%,transparent),inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)] transition-[background-color,box-shadow] hover:bg-[color-mix(in_srgb,var(--surface)_94%,var(--hover))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${mobile ? "rounded-xl p-1.5" : "rounded-lg p-1.5"}`}
    >
      <img
        src={CURRENT_USER.avatar}
        alt=""
        className="pointer-events-none size-9 shrink-0 rounded-full object-cover"
      />
      <span className="learning-discussion__composer-prompt min-w-0 flex-1 truncate px-2 py-1.5 text-(--muted)">
        {preview ||
          (attachmentCount > 0 ? attachmentPreview : "Write something…")}
      </span>
    </button>
  );
}

function usePhoneComposerLayout() {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isPhone;
}

const getFilterName = (filter: Exclude<EntryFilter, "all">) => {
  if (filter === "question") return "Q&As";
  if (filter === "note") return "notes";
  return "comments";
};
