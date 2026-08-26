import { FireIcon as Fire } from "@phosphor-icons/react/Fire";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../components/ui/drawer";
import { ThemedSelect } from "../ThemedSelect";
import type { ThemedSelectOption } from "../ThemedSelect";
import { CommentCard } from "./CommentCard";
import type { Comment } from "./CommentCard";
import { CommentComposer } from "./CommentComposer";
import {
  createEmptyRichTextDraft,
  isRichTextDocument,
  isStoredRichTextDraft,
  type DiscussionEntryKind,
  type DiscussionVisibility,
  type RichTextDraft,
} from "./commentEditor";
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

type FeedFilter = "top" | "newest";
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

interface LegacyLessonNote {
  id: number;
  time: string;
  text: string;
  content: RichTextDraft["content"];
  visibility: DiscussionVisibility;
}

interface DiscussionProps {
  persistenceKey: string;
  mobileBottomNavigation?: boolean;
}

export const DISCUSSION_COMMENT_CHARACTER_LIMIT = 10_000;
const COMMENT_LENGTH_NOTICE = `Comments, Q&As, and notes can be up to ${DISCUSSION_COMMENT_CHARACTER_LIMIT.toLocaleString("en-US")} characters.`;
const initialDraft = createEmptyRichTextDraft();
const countCharacters = (value: string) => Array.from(value).length;

const feedFilterOptions = [
  ["top", "Top", { flag: <Fire size={17} weight="fill" aria-hidden="true" /> }],
  ["newest", "Newest"],
] as const satisfies readonly ThemedSelectOption<FeedFilter>[];

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
        isRichTextDocument((entry as Comment).content)) &&
      (typeof (entry as Comment).visibility === "undefined" ||
        isDiscussionVisibility((entry as Comment).visibility)) &&
      (typeof (entry as Comment).liked === "undefined" ||
        typeof (entry as Comment).liked === "boolean") &&
      (typeof (entry as Comment).isOwn === "undefined" ||
        typeof (entry as Comment).isOwn === "boolean"),
  );

const isStoredLegacyNotes = (value: unknown): value is LegacyLessonNote[] =>
  Array.isArray(value) &&
  value.every(
    (note) =>
      Boolean(note) &&
      typeof note === "object" &&
      typeof (note as LegacyLessonNote).id === "number" &&
      typeof (note as LegacyLessonNote).time === "string" &&
      typeof (note as LegacyLessonNote).text === "string" &&
      isRichTextDocument((note as LegacyLessonNote).content) &&
      isDiscussionVisibility((note as LegacyLessonNote).visibility),
  );

const asLegacyNoteEntry = (note: LegacyLessonNote): Comment => ({
  id: note.id,
  name: CURRENT_USER.name,
  time: note.time,
  avatar: CURRENT_USER.avatar,
  text: note.text,
  content: note.content,
  visibility: note.visibility,
  entryKind: "note",
  likes: 0,
  replies: 0,
  isOwn: true,
});

export function Discussion({
  persistenceKey,
  mobileBottomNavigation = false,
}: DiscussionProps) {
  const storageBase = `veolms-learning-${persistenceKey}-discussion`;
  const [draft, setDraft] = useSessionStorageState<RichTextDraft>(
    `${storageBase}-comment-draft`,
    initialDraft,
    isStoredRichTextDraft,
  );
  const [postedEntries, setPostedEntries] = useSessionStorageState<Comment[]>(
    `${storageBase}-posted-comments`,
    [],
    isStoredEntries,
  );
  const [legacyNotes] = useSessionStorageState<LegacyLessonNote[]>(
    `${storageBase}-posted-notes`,
    [],
    isStoredLegacyNotes,
  );
  const [entries, setEntries] = useState(initialEntries);
  const [entryKind, setEntryKind] = useState<DiscussionEntryKind>("comment");
  const [visibility, setVisibility] = useState<DiscussionVisibility>("public");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("top");
  const [entryFilter, setEntryFilter] = useState<EntryFilter>("all");
  const [notice, setNotice] = useState("");
  const draftIsTooLong =
    countCharacters(draft.text) > DISCUSSION_COMMENT_CHARACTER_LIMIT;

  useEffect(() => {
    const migratedNotes = legacyNotes.map(asLegacyNoteEntry);
    const persistedById = new Map<number, Comment>();
    [...postedEntries, ...migratedNotes].forEach((entry) => {
      if (!persistedById.has(entry.id)) {
        persistedById.set(entry.id, { ...entry, isOwn: true });
      }
    });
    const persistedEntries = [...persistedById.values()];

    if (persistedEntries.length > 0) {
      setEntries((current) => [
        ...persistedEntries,
        ...current.filter(
          (entry) =>
            !persistedEntries.some((persisted) => persisted.id === entry.id),
        ),
      ]);
    }

    const notesMissingFromCurrentStorage = migratedNotes.filter(
      (note) => !postedEntries.some((entry) => entry.id === note.id),
    );
    if (notesMissingFromCurrentStorage.length > 0) {
      setPostedEntries((current) => [
        ...notesMissingFromCurrentStorage,
        ...current,
      ]);
    }
  }, [legacyNotes, postedEntries, setPostedEntries]);

  const filteredEntries = useMemo(() => {
    const visibleEntries =
      entryFilter === "all"
        ? entries
        : entries.filter(
            (entry) =>
              (entry.entryKind ??
                (entry.isQuestion ? "question" : "comment")) === entryFilter,
          );
    const uniqueEntries = Array.from(
      new Map(visibleEntries.map((entry) => [entry.id, entry])).values(),
    );

    return uniqueEntries.sort((left, right) => {
      if (feedFilter === "newest") return right.id - left.id;
      const leftScore = left.likes + (left.replies ?? 0) * 2;
      const rightScore = right.likes + (right.replies ?? 0) * 2;
      return rightScore - leftScore || right.id - left.id;
    });
  }, [entries, entryFilter, feedFilter]);

  const addEntry = () => {
    if (draftIsTooLong) {
      setNotice(COMMENT_LENGTH_NOTICE);
      return;
    }

    const text = draft.text.trim();
    if (!text) {
      setNotice(
        entryKind === "note"
          ? "Write a note before posting."
          : entryKind === "question"
            ? "Write a Q&A before posting."
            : "Write a comment before posting.",
      );
      return;
    }

    const entry: Comment = {
      id: Date.now(),
      name: CURRENT_USER.name,
      time: "Just now",
      avatar: CURRENT_USER.avatar,
      text,
      content: draft.content,
      visibility,
      entryKind,
      likes: 0,
      replies: 0,
      isQuestion: entryKind === "question",
      isOwn: true,
    };

    setPostedEntries((current) => [entry, ...current]);
    setEntries((current) => [entry, ...current]);
    setDraft(createEmptyRichTextDraft());
    setFeedFilter("newest");
    setEntryFilter("all");

    const entryName =
      entryKind === "note"
        ? "Note"
        : entryKind === "question"
          ? "Q&A"
          : "Comment";
    const visibilityPrefix =
      visibility === "private"
        ? "Private "
        : visibility === "unlisted"
          ? "Unlisted "
          : "";
    const noticeEntryName = visibilityPrefix
      ? `${visibilityPrefix}${entryName.toLowerCase()}`
      : entryName;
    setNotice(
      entryKind === "note"
        ? `${noticeEntryName} saved.`
        : `${noticeEntryName} posted.`,
    );
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

  const editEntry = (id: number, text: string) => {
    const update = (current: Comment[]) =>
      current.map((entry) =>
        entry.id === id
          ? { ...entry, text, content: undefined, time: "Just now (edited)" }
          : entry,
      );
    setEntries(update);
    setPostedEntries(update);
    setNotice("Entry updated.");
  };

  const deleteEntry = (id: number) => {
    const remove = (current: Comment[]) =>
      current.filter((entry) => entry.id !== id);
    setEntries(remove);
    setPostedEntries(remove);
    setNotice("Entry deleted.");
  };

  return (
    <section className="learning-discussion" aria-label="Lesson discussion">
      <ThreadSurface
        draft={draft}
        entryKind={entryKind}
        visibility={visibility}
        notice={notice}
        feedFilter={feedFilter}
        entryFilter={entryFilter}
        entries={filteredEntries}
        draftIsTooLong={draftIsTooLong}
        mobileBottomNavigation={mobileBottomNavigation}
        onDraftChange={(value) => {
          setDraft(value);
          setNotice(
            countCharacters(value.text) > DISCUSSION_COMMENT_CHARACTER_LIMIT
              ? COMMENT_LENGTH_NOTICE
              : "",
          );
        }}
        onEntryKindChange={setEntryKind}
        onVisibilityChange={setVisibility}
        onSubmit={addEntry}
        onFeedFilterChange={setFeedFilter}
        onEntryFilterChange={setEntryFilter}
        onLike={onLike}
        onEdit={editEntry}
        onDelete={deleteEntry}
        onReport={() =>
          setNotice("Report received. Our moderation team will review it.")
        }
      />
    </section>
  );
}

interface ThreadSurfaceProps {
  draft: RichTextDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  notice: string;
  feedFilter: FeedFilter;
  entryFilter: EntryFilter;
  entries: Comment[];
  draftIsTooLong: boolean;
  mobileBottomNavigation: boolean;
  onDraftChange: (value: RichTextDraft) => void;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
  onSubmit: () => void;
  onFeedFilterChange: (filter: FeedFilter) => void;
  onEntryFilterChange: (filter: EntryFilter) => void;
  onLike: (id: number, liked: boolean) => void;
  onEdit: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  onReport: (id: number) => void;
}

function ThreadSurface({
  draft,
  entryKind,
  visibility,
  notice,
  feedFilter,
  entryFilter,
  entries,
  draftIsTooLong,
  mobileBottomNavigation,
  onDraftChange,
  onEntryKindChange,
  onVisibilityChange,
  onSubmit,
  onFeedFilterChange,
  onEntryFilterChange,
  onLike,
  onEdit,
  onDelete,
  onReport,
}: ThreadSurfaceProps) {
  const isPhone = usePhoneComposerLayout();
  const [composerMode, setComposerMode] = useState<ComposerMode>("collapsed");
  const [
    mobileComposerCollapsedSnapPoint,
    setMobileComposerCollapsedSnapPoint,
  ] = useState<number>(DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT);
  const [mobileComposerSnapPoint, setMobileComposerSnapPoint] = useState<
    number | null
  >(DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT);
  const mobileComposerSnapPoints = useMemo(
    () => [mobileComposerCollapsedSnapPoint, 1],
    [mobileComposerCollapsedSnapPoint],
  );

  const getMobileComposerCollapsedSnapPoint = useCallback(() => {
    const playerBottom = document
      .querySelector<HTMLElement>(".learning-workspace__player-wrap")
      ?.getBoundingClientRect().bottom;
    return getDiscussionComposerCollapsedSnapPoint(
      window.innerHeight,
      playerBottom,
    );
  }, []);

  const openMobileComposer = useCallback(() => {
    const collapsedSnapPoint = getMobileComposerCollapsedSnapPoint();
    setMobileComposerCollapsedSnapPoint(collapsedSnapPoint);
    setMobileComposerSnapPoint(collapsedSnapPoint);
    setComposerMode("mobile");
  }, [getMobileComposerCollapsedSnapPoint]);

  useEffect(() => {
    setComposerMode((current) => {
      if (isPhone && current === "desktop") return "collapsed";
      if (!isPhone && current === "mobile") return "collapsed";
      return current;
    });
  }, [isPhone]);

  useEffect(() => {
    if (!isPhone || composerMode !== "mobile") return undefined;

    const player = document.querySelector<HTMLElement>(
      ".learning-workspace__player-wrap",
    );
    let frame: number | null = null;
    const syncSnapPoint = () => {
      frame = null;
      const collapsedSnapPoint = getMobileComposerCollapsedSnapPoint();
      setMobileComposerCollapsedSnapPoint(collapsedSnapPoint);
      setMobileComposerSnapPoint((current) =>
        current === 1 ? 1 : collapsedSnapPoint,
      );
    };
    const scheduleSnapPointSync = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncSnapPoint);
    };
    const playerResizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleSnapPointSync);

    if (player) playerResizeObserver?.observe(player);
    window.addEventListener("resize", scheduleSnapPointSync);
    window.visualViewport?.addEventListener("resize", scheduleSnapPointSync);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      playerResizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSnapPointSync);
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleSnapPointSync,
      );
    };
  }, [composerMode, getMobileComposerCollapsedSnapPoint, isPhone]);

  const submitAndCollapse = () => {
    onSubmit();
    if (!draft.text.trim() || draftIsTooLong) return;
    setComposerMode("collapsed");
  };

  return (
    <div>
      {!isPhone && (
        <div className="mt-4">
          {composerMode === "desktop" ? (
            <CommentComposer
              draft={draft}
              entryKind={entryKind}
              visibility={visibility}
              invalid={draftIsTooLong}
              autoFocus
              onDraftChange={onDraftChange}
              onEntryKindChange={onEntryKindChange}
              onVisibilityChange={onVisibilityChange}
              onSubmit={submitAndCollapse}
            />
          ) : (
            <CompactComposer
              draft={draft}
              onOpen={() => setComposerMode("desktop")}
              onSubmit={submitAndCollapse}
            />
          )}
        </div>
      )}

      <p
        role="status"
        className={
          notice
            ? `mt-2 text-xs ${notice.includes("posted") || notice.includes("saved") || notice.includes("updated") || notice.includes("deleted") ? "text-(--success)" : notice.includes("Report") ? "text-(--muted)" : "text-(--danger)"}`
            : "sr-only"
        }
      >
        {notice}
      </p>

      <div
        className={`learning-discussion__filter-bar ${isPhone ? "mt-2" : "mt-5"}`}
      >
        <div
          role="group"
          aria-label="Filter discussion entries"
          className="learning-discussion__filter-group flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        <div className="learning-discussion__sort w-[5.4rem] shrink-0 sm:w-[5.8rem]">
          <ThemedSelect
            value={feedFilter}
            onValueChange={onFeedFilterChange}
            options={feedFilterOptions}
            ariaLabel="Sort discussion"
            triggerClassName="learning-discussion__sort-trigger h-8 px-2 sm:px-2.5"
          />
        </div>
      </div>

      <div className={`mt-1 ${isPhone ? "pb-36" : "pb-4"}`}>
        {entries.map((entry) => (
          <CommentCard
            key={entry.id}
            comment={entry}
            onLike={onLike}
            onEdit={onEdit}
            onDelete={onDelete}
            onReport={onReport}
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
        <div
          className={`fixed inset-x-0 z-130 bg-[color-mix(in_srgb,var(--canvas)_90%,transparent)] px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-12px_36px_color-mix(in_srgb,var(--canvas)_58%,transparent)] backdrop-blur-xl ${mobileBottomNavigation ? "bottom-[calc(58px+env(safe-area-inset-bottom))]" : "bottom-0"}`}
        >
          <CompactComposer
            draft={draft}
            mobile
            onOpen={openMobileComposer}
            onSubmit={submitAndCollapse}
          />
        </div>
      )}

      {isPhone && (
        <Drawer
          open={composerMode === "mobile"}
          onOpenChange={(open) => {
            if (open) openMobileComposer();
            else setComposerMode("collapsed");
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
            aria-label="Create a discussion entry"
            className="learning-comment-composer-drawer overflow-hidden rounded-t-[26px]! bg-[color-mix(in_srgb,var(--canvas)_92%,var(--surface))] px-0 pt-0 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-20px_56px_rgba(0,0,0,0.42)] data-[swipe-axis=y]:[--drawer-content-max-height:100dvh] data-expanded:rounded-none!"
          >
            <DrawerTitle className="sr-only">
              Create a discussion entry
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Write a comment, Q&A, or note for this lesson.
            </DrawerDescription>
            <CommentComposer
              draft={draft}
              entryKind={entryKind}
              visibility={visibility}
              invalid={draftIsTooLong}
              autoFocus
              presentation="drawer"
              onDraftChange={onDraftChange}
              onEntryKindChange={onEntryKindChange}
              onVisibilityChange={onVisibilityChange}
              onSubmit={submitAndCollapse}
            />
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

interface CompactComposerProps {
  draft: RichTextDraft;
  mobile?: boolean;
  onOpen: () => void;
  onSubmit: () => void;
}

function CompactComposer({
  draft,
  mobile = false,
  onOpen,
  onSubmit,
}: CompactComposerProps) {
  const preview = draft.text.trim();

  return (
    <div
      data-compact-comment-composer
      className={`flex items-center gap-2 bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] shadow-[0_12px_34px_color-mix(in_srgb,var(--canvas)_34%,transparent),inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)] ${mobile ? "rounded-xl p-1.5" : "rounded-lg p-1.5"}`}
    >
      <img
        src={CURRENT_USER.avatar}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover"
      />
      <button
        type="button"
        aria-label="Open discussion composer"
        onClick={onOpen}
        className="learning-discussion__composer-prompt min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text-secondary) focus-visible:outline-2 focus-visible:outline-(--accent)"
      >
        {preview || "Write something…"}
      </button>
      <button
        type="button"
        aria-label={
          preview ? "Send discussion entry" : "Open discussion composer"
        }
        onClick={preview ? onSubmit : onOpen}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-(--accent) text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_62%,transparent)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
      >
        <PaperPlaneTilt size={20} weight="fill" aria-hidden="true" />
      </button>
    </div>
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
