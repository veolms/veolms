import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { ThemedSelect } from "../ThemedSelect";
import { CommentCard } from "./CommentCard";
import type { Comment, CommentReply } from "./CommentCard";
import { CommentComposer } from "./CommentComposer";
import {
  applyDiscussionFeed,
  DISCUSSION_FEED_SORT_OPTIONS,
  getDiscussionFeedCountLabel,
  type DiscussionEntryFilter,
  type DiscussionFeedSort,
  type InteractionCapabilities,
} from "./discussionFeed";

export type { InteractionCapabilities };
import { DiscussionThreadPanel } from "./DiscussionThreadPanel";
import {
  DESCRIPTION_SURFACE_BASE,
  LessonDescription,
} from "./LessonDescription";
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
import {
  NO_LEGACY_KEYS,
  useSessionStorageState,
} from "./useSessionStorageState";
import { useCurrentUser } from "../services/auth";
import {
  useCreateNote,
  useDeleteNote,
  useUpdateNote,
  useUserNotes,
} from "../services/learning-interactions";
import { adaptLearningNoteToComment } from "./learning-notes.adapter";

const CURRENT_USER = {
  name: "Ashi Singh",
  avatar: "/assets/sofia-avatar-160.webp",
};

const EMPTY_MOBILE_COMPOSER_DRAFT = createEmptyDiscussionDraft();

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

export interface DiscussionProps {
  persistenceKey: string;
  courseId?: string;
  lessonId?: string;
  mobileBottomNavigation?: boolean;
  mobileBottomNavigationHidden?: boolean;
  lessonDescription?: string | null;
  isLessonDescriptionLoading?: boolean;
  interactionCapabilities?: InteractionCapabilities;
  isInteractionCapabilitiesLoading?: boolean;
}

const DEFAULT_CAPABILITIES: InteractionCapabilities = {
  allowComments: true,
  allowNotes: true,
  allowQa: true,
};

export const DISCUSSION_COMMENT_CHARACTER_LIMIT = 10_000;
const COMMENT_LENGTH_NOTICE = `Comments, Q&As, and notes can be up to ${DISCUSSION_COMMENT_CHARACTER_LIMIT.toLocaleString("en-US")} characters.`;
const initialDraft = createEmptyDiscussionDraft();
const countCharacters = (value: string) => Array.from(value).length;

interface EditingEntry {
  id: string | number;
  draft: DiscussionDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
}

interface OpenDiscussionThread {
  id: string | number;
  focusComposer: boolean;
}

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
  entryKind !== "note" && visibility === "private" ? "public" : visibility;

const isStoredEntries = (value: unknown): value is Comment[] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      Boolean(entry) &&
      typeof entry === "object" &&
      (typeof (entry as Comment).id === "number" ||
        typeof (entry as Comment).id === "string") &&
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
  courseId,
  lessonId,
  mobileBottomNavigation = false,
  mobileBottomNavigationHidden = false,
  lessonDescription,
  isLessonDescriptionLoading = false,
  interactionCapabilities,
  isInteractionCapabilitiesLoading = false,
}: DiscussionProps) {
  const capabilities = interactionCapabilities ?? DEFAULT_CAPABILITIES;
  const enabledKinds = useMemo<DiscussionEntryKind[]>(() => {
    const kinds: DiscussionEntryKind[] = [];
    if (capabilities.allowComments) kinds.push("comment");
    if (capabilities.allowNotes) kinds.push("note");
    if (capabilities.allowQa) kinds.push("question");
    return kinds;
  }, [capabilities.allowComments, capabilities.allowNotes, capabilities.allowQa]);

  const isAllDisabled =
    !isInteractionCapabilitiesLoading && enabledKinds.length === 0;

  const firstAvailableKind = useMemo<DiscussionEntryKind>(() => {
    if (capabilities.allowComments) return "comment";
    if (capabilities.allowQa) return "question";
    if (capabilities.allowNotes) return "note";
    return "comment";
  }, [capabilities.allowComments, capabilities.allowNotes, capabilities.allowQa]);

  const availableFilters = useMemo<readonly (readonly [DiscussionEntryFilter, string])[]>(() => {
    if (enabledKinds.length === 0) return [];
    if (enabledKinds.length === 1) {
      const singleKind = enabledKinds[0]!;
      const label =
        singleKind === "comment"
          ? "Comments"
          : singleKind === "note"
            ? "Notes"
            : "Q&As";
      return [[singleKind, label]] as const;
    }
    const filters: (readonly [DiscussionEntryFilter, string])[] = [["all", "All"]];
    if (capabilities.allowComments) filters.push(["comment", "Comments"]);
    if (capabilities.allowNotes) filters.push(["note", "Notes"]);
    if (capabilities.allowQa) filters.push(["question", "Q&As"]);
    return filters;
  }, [capabilities, enabledKinds]);

  const promptText = useMemo(() => {
    if (enabledKinds.length === 1) {
      if (enabledKinds[0] === "note") return "Write a note…";
      if (enabledKinds[0] === "question") return "Ask a question…";
      return "Write a comment…";
    }
    return "Write something…";
  }, [enabledKinds]);

  const { data: currentUser } = useCurrentUser();
  const authorName =
    currentUser?.displayName?.trim() ||
    currentUser?.username?.trim() ||
    CURRENT_USER.name;
  const authorAvatar = currentUser?.avatarDataUrl || CURRENT_USER.avatar;

  const {
    data: notesData,
    isLoading: isNotesLoading,
    isError: isNotesError,
    refetch: refetchNotes,
  } = useUserNotes(
    {
      courseId: courseId ?? "",
      lessonId: lessonId ?? "",
      limit: 50,
    },
    {
      enabled: Boolean(courseId && lessonId && capabilities.allowNotes),
    },
  );

  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();
  const isSubmittingNote =
    createNoteMutation.isPending || updateNoteMutation.isPending;

  const backendNotes = useMemo<Comment[]>(() => {
    if (!courseId || !lessonId || !capabilities.allowNotes || !notesData?.notes) return [];
    return notesData.notes.map((note) =>
      adaptLearningNoteToComment(note, authorName, authorAvatar),
    );
  }, [capabilities.allowNotes, courseId, lessonId, notesData?.notes, authorName, authorAvatar]);

  const storageBase = `veolms-learning-${persistenceKey}-discussion`;
  const [draft, setDraft] = useSessionStorageState<DiscussionDraft>(
    `${storageBase}-markdown-draft-v1`,
    initialDraft,
    isStoredDiscussionDraft,
  );
  const sanitizeStoredEntries = (items: Comment[]): Comment[] =>
    items.filter((entry) => entry.entryKind !== "note");

  const [postedEntries, setPostedEntries] = useSessionStorageState<Comment[]>(
    `${storageBase}-markdown-entries-v1`,
    [],
    isStoredEntries,
    NO_LEGACY_KEYS,
    sanitizeStoredEntries,
  );
  const [entries, setEntries] = useState(initialEntries);
  const [entryKind, setEntryKind] = useState<DiscussionEntryKind>(firstAvailableKind);
  const [visibility, setVisibility] = useState<DiscussionVisibility>("public");
  const [entryFilter, setEntryFilter] = useState<DiscussionEntryFilter>(
    enabledKinds.length === 1 ? enabledKinds[0]! : "all",
  );
  const [feedSort, setFeedSort] = useState<DiscussionFeedSort>("newest");
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
  const canSubmitDraft =
    draftHasContent &&
    !draftIsTooLong &&
    !isSubmittingNote &&
    (activeEntryKind !== "note" || Boolean(courseId && lessonId));

  useEffect(() => {
    if (isInteractionCapabilitiesLoading || enabledKinds.length === 0) return;
    const isCurrentFilterValid =
      (entryFilter === "all" && enabledKinds.length > 1) ||
      (entryFilter !== "all" && enabledKinds.includes(entryFilter));

    if (!isCurrentFilterValid) {
      const fallback = enabledKinds.length > 1 ? "all" : enabledKinds[0]!;
      setEntryFilter(fallback);
    }
  }, [enabledKinds, entryFilter, isInteractionCapabilitiesLoading]);

  useEffect(() => {
    if (enabledKinds.length === 0) return;
    if (!enabledKinds.includes(entryKind)) {
      setEntryKind(firstAvailableKind);
      setVisibility((current) => getAllowedVisibility(firstAvailableKind, current));
    }
  }, [enabledKinds, entryKind, firstAvailableKind]);

  useEffect(() => {
    if (postedEntries.length === 0) return;
    const sanitizedEntries = sanitizeStoredEntries(postedEntries);
    if (sanitizedEntries.length !== postedEntries.length) {
      setPostedEntries(sanitizedEntries);
      return;
    }
    setEntries((current) => [
      ...sanitizedEntries.map((entry) => ({ ...entry, isOwn: true })),
      ...current.filter(
        (entry) =>
          !sanitizedEntries.some((persisted) => persisted.id === entry.id),
      ),
    ]);
  }, [postedEntries, setPostedEntries]);

  const combinedEntries = useMemo<Comment[]>(() => {
    return [...backendNotes, ...entries];
  }, [backendNotes, entries]);

  const filteredEntries = useMemo(
    () =>
      applyDiscussionFeed({
        currentUserName: authorName,
        entries: combinedEntries,
        filter: entryFilter,
        sort: feedSort,
        capabilities,
      }),
    [authorName, capabilities, combinedEntries, entryFilter, feedSort],
  );
  const threadEntries = useMemo(
    () =>
      Array.from(
        new Map(combinedEntries.map((entry) => [entry.id, entry])).values(),
      ),
    [combinedEntries],
  );

  const submitEntry = async (): Promise<boolean> => {
    if (activeEntryKind === "note") {
      if (!draftHasContent) return false;
      if (draftIsTooLong) {
        setNotice(COMMENT_LENGTH_NOTICE);
        return false;
      }
      if (!courseId || !lessonId) {
        setNotice("Course or lesson context is missing.");
        return false;
      }

      if (editingEntry) {
        try {
          await updateNoteMutation.mutateAsync({
            noteId: String(editingEntry.id),
            payload: {
              content: activeDraft.markdown,
            },
          });
          setEditingEntry(null);
          setNotice("");
          return true;
        } catch (error) {
          setNotice("Failed to update note. Please try again.");
          return false;
        }
      }

      try {
        await createNoteMutation.mutateAsync({
          courseId,
          lessonId,
          content: activeDraft.markdown,
          visibility: activeVisibility,
        });
        setDraft(createEmptyDiscussionDraft());
        setEntryFilter(
          enabledKinds.length > 1 ? "all" : (enabledKinds[0] ?? "all"),
        );
        setNotice("");
        return true;
      } catch (error) {
        setNotice("Failed to save note. Please try again.");
        return false;
      }
    }

    if (draftIsTooLong) {
      setNotice(COMMENT_LENGTH_NOTICE);
      return false;
    }

    if (!draftHasContent) return false;

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
        return false;
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
      setEntryFilter(
        enabledKinds.length > 1 ? "all" : (enabledKinds[0] ?? "all"),
      );
      setNotice("");
      return true;
    }

    const entry: Comment = {
      id: Date.now(),
      name: authorName,
      time: "Just now",
      avatar: authorAvatar,
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
    setEntryFilter(
      enabledKinds.length > 1 ? "all" : (enabledKinds[0] ?? "all"),
    );

    setNotice("");
    return true;
  };

  const onLike = (id: string | number, liked: boolean) => {
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

  const deleteEntry = async (id: string | number) => {
    const isBackendNote = backendNotes.some((note) => note.id === id);
    if (isBackendNote) {
      try {
        await deleteNoteMutation.mutateAsync(String(id));
        setEditingEntry((current) => (current?.id === id ? null : current));
        setNotice("");
      } catch (error) {
        setNotice("Failed to delete note. Please try again.");
      }
      return;
    }

    const remove = (current: Comment[]) =>
      current.filter((entry) => entry.id !== id);
    setEntries(remove);
    setPostedEntries(remove);
    setEditingEntry((current) => (current?.id === id ? null : current));
    setNotice("");
  };

  const addReply = (entryId: string | number, reply: CommentReply) => {
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
    entryId: string | number,
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

  const deleteReply = (entryId: string | number, replyId: number) => {
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
        lessonDescription={lessonDescription}
        isLessonDescriptionLoading={isLessonDescriptionLoading}
        draft={activeDraft}
        entryKind={activeEntryKind}
        visibility={activeVisibility}
        editingEntryId={editingEntry?.id ?? null}
        notice={notice}
        entryFilter={entryFilter}
        feedSort={feedSort}
        entries={filteredEntries}
        draftIsTooLong={draftIsTooLong}
        draftAttachmentCount={draftAttachmentCount}
        canSubmitDraft={canSubmitDraft}
        isSubmitting={isSubmittingNote}
        isNotesLoading={isNotesLoading}
        isNotesError={isNotesError}
        onRetryNotes={() => refetchNotes()}
        mobileBottomNavigation={mobileBottomNavigation}
        mobileBottomNavigationHidden={mobileBottomNavigationHidden}
        capabilities={capabilities}
        isInteractionCapabilitiesLoading={isInteractionCapabilitiesLoading}
        isAllDisabled={isAllDisabled}
        availableFilters={availableFilters}
        enabledKinds={enabledKinds}
        promptText={promptText}
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
        onFeedSortChange={setFeedSort}
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
  lessonDescription?: string | null;
  isLessonDescriptionLoading?: boolean;
  draft: DiscussionDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  editingEntryId: string | number | null;
  notice: string;
  entryFilter: DiscussionEntryFilter;
  feedSort: DiscussionFeedSort;
  entries: Comment[];
  draftIsTooLong: boolean;
  draftAttachmentCount: number;
  canSubmitDraft: boolean;
  isSubmitting?: boolean;
  isNotesLoading?: boolean;
  isNotesError?: boolean;
  onRetryNotes?: () => void;
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden: boolean;
  capabilities: InteractionCapabilities;
  isInteractionCapabilitiesLoading?: boolean;
  isAllDisabled: boolean;
  availableFilters: readonly (readonly [DiscussionEntryFilter, string])[];
  enabledKinds: DiscussionEntryKind[];
  promptText: string;
  onDraftChange: (value: DiscussionDraft) => void;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
  onSubmit: () => Promise<boolean> | void;
  onCancelEdit: () => void;
  onEntryFilterChange: (filter: DiscussionEntryFilter) => void;
  onFeedSortChange: (sort: DiscussionFeedSort) => void;
  onLike: (id: string | number, liked: boolean) => void;
  onEdit: (comment: Comment) => void;
  onDelete: (id: string | number) => void;
  onReport: (id: string | number) => void;
  onOpenThread: (id: string | number, focusComposer?: boolean) => void;
}

function ThreadSurface({
  lessonDescription,
  isLessonDescriptionLoading = false,
  draft,
  entryKind,
  visibility,
  editingEntryId,
  notice,
  entryFilter,
  feedSort,
  entries,
  draftIsTooLong,
  draftAttachmentCount,
  canSubmitDraft,
  isSubmitting = false,
  isNotesLoading = false,
  isNotesError = false,
  onRetryNotes,
  mobileBottomNavigation,
  mobileBottomNavigationHidden,
  capabilities,
  isInteractionCapabilitiesLoading = false,
  isAllDisabled,
  availableFilters,
  promptText,
  onDraftChange,
  onEntryKindChange,
  onVisibilityChange,
  onSubmit,
  onCancelEdit,
  onEntryFilterChange,
  onFeedSortChange,
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

  useLayoutEffect(() => {
    if (!isPhone) return undefined;
    const root = document.documentElement;
    root.dataset.learningMobileComposerReady = "true";
    return () => {
      delete root.dataset.learningMobileComposerReady;
    };
  }, [isPhone]);

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

  const closeComposer = useCallback(() => {
    setComposerMode("collapsed");
    if (editingEntryId !== null) onCancelEdit();
  }, [editingEntryId, onCancelEdit]);

  const openMobileComposer = useCallback(() => {
    const geometry = getMobileComposerViewportGeometry();
    setMobileComposerCollapsedSnapPoint(geometry.collapsedSnapPoint);
    setMobileComposerSnapPoint(geometry.collapsedSnapPoint);
    setMobileComposerKeyboardInset(geometry.keyboardInset);
    setMobileComposerViewportHeight(geometry.visualViewportHeight);
    setComposerMode("mobile");
  }, [getMobileComposerViewportGeometry]);

  useEffect(() => {
    setComposerMode((current: ComposerMode) => {
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
    if (!isPhone || composerMode !== "mobile") {
      setMobileComposerKeyboardInset(0);
      setMobileComposerViewportHeight(null);
      return undefined;
    }

    const syncGeometry = () => {
      const geometry = getMobileComposerViewportGeometry();
      setMobileComposerCollapsedSnapPoint(geometry.collapsedSnapPoint);
      setMobileComposerSnapPoint((current: number | null) =>
        current === 1 ? 1 : geometry.collapsedSnapPoint,
      );
      setMobileComposerKeyboardInset(geometry.keyboardInset);
      setMobileComposerViewportHeight(geometry.visualViewportHeight);
    };

    syncGeometry();
    let frameId = 0;
    const scheduleSnapPointSync = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncGeometry);
    };

    window.addEventListener("resize", scheduleSnapPointSync);
    window.visualViewport?.addEventListener("resize", scheduleSnapPointSync);
    window.visualViewport?.addEventListener("scroll", scheduleSnapPointSync);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleSnapPointSync);
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

  const submitAndCollapse = async () => {
    if (!canSubmitDraft) return;
    const result = await onSubmit();
    if (result !== false) {
      setComposerMode("collapsed");
    }
  };

  if (isInteractionCapabilitiesLoading) {
    return (
      <div>
        <LessonDescription
          description={lessonDescription}
          isLoading={isLessonDescriptionLoading}
        />
        <div
          className="mt-4 flex flex-col gap-3"
          data-testid="learner-interactions-loading"
        >
          <div className="h-10 w-full animate-pulse rounded-md bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]" />
          <div className="flex gap-2">
            <div className="h-8 w-16 animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]" />
            <div className="h-8 w-24 animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]" />
          </div>
        </div>
      </div>
    );
  }

  if (isAllDisabled) {
    return (
      <div>
        <LessonDescription
          description={lessonDescription}
          isLoading={isLessonDescriptionLoading}
        />
        <div
          className="py-8 text-center"
          data-testid="learner-interactions-disabled-message"
        >
          <p className="text-sm font-medium text-(--muted)">
            Learner interactions are disabled for this course.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <LessonDescription
        description={lessonDescription}
        isLoading={isLessonDescriptionLoading}
      />
      {!isPhone && (
        <div
          ref={composerHostRef}
          data-comment-composer-container
          className="mt-3 scroll-mt-4 sm:mt-4"
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
              capabilities={capabilities}
              invalid={draftIsTooLong}
              canSubmit={canSubmitDraft}
              isSubmitting={isSubmitting}
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
              promptText={promptText}
              onOpen={() => setComposerMode("desktop")}
            />
          )}
        </div>
      )}

      <p role="status" className="sr-only">
        {notice}
      </p>

      {availableFilters.length > 0 && (
        <div
          role="group"
          aria-label="Filter discussion entries"
          className="learning-discussion__filter-group mt-3 flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:mt-5 [&::-webkit-scrollbar]:hidden"
        >
          {availableFilters.map(([value, label]) => (
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
      )}

      <div
        className="mt-3.5 flex min-w-0 items-end max-[640px]:mt-2.5"
        data-discussion-feed-toolbar
      >
        <p
          className="min-w-0 truncate text-lg leading-none font-semibold tracking-[-0.02em] text-(--text)"
          aria-live="polite"
        >
          {getDiscussionFeedCountLabel(entryFilter, entries.length)}
        </p>
        <span
          className="shrink-0 text-lg leading-none text-(--text-secondary)"
          aria-hidden="true"
          data-discussion-feed-separator
        >
          {"\u00A0\u00A0·\u00A0\u00A0"}
        </span>
        <ThemedSelect
          value={feedSort}
          onValueChange={onFeedSortChange}
          ariaLabel="Sort discussions"
          options={DISCUSSION_FEED_SORT_OPTIONS}
          triggerClassName="h-auto! w-auto! max-w-full shrink-0! items-end! justify-start! gap-1! border-0! bg-transparent! p-0! shadow-none! text-[13px] leading-none! font-medium whitespace-nowrap text-(--text-secondary)! hover:bg-transparent! hover:text-(--text)! data-[state=open]:bg-transparent! data-[state=open]:shadow-none!"
        />
      </div>

      <div
        className={`mt-2.5 flex flex-col gap-1 ${isPhone ? "pb-36" : "pb-4"}`}
      >
        {entryFilter === "note" && isNotesLoading ? (
          <div
            className="py-12 text-center"
            data-testid="learning-notes-loading"
          >
            <div className="mx-auto mb-2.5 h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
            <p className="text-sm font-medium text-(--muted)">Loading notes…</p>
          </div>
        ) : entryFilter === "note" && isNotesError ? (
          <div
            className="py-12 text-center"
            data-testid="learning-notes-error"
          >
            <p className="font-semibold text-(--text)">Failed to load notes</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-(--muted)">
              There was a problem loading your notes for this lesson.
            </p>
            {onRetryNotes && (
              <button
                type="button"
                onClick={onRetryNotes}
                className="mt-3 inline-flex items-center rounded-lg bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text) shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-(--hover)"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <>
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
                {availableFilters.some(([val]) => val === "all") && (
                  <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-(--muted)">
                    Choose All to return to the full lesson discussion.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {isPhone && composerMode !== "mobile" && (
        <MobileCompactComposerPortal
          draft={draft}
          attachmentCount={draftAttachmentCount}
          promptText={promptText}
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
              capabilities={capabilities}
              invalid={draftIsTooLong}
              canSubmit={canSubmitDraft}
              isSubmitting={isSubmitting}
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
  promptText?: string;
  disabled?: boolean;
  onOpen: () => void;
}

const COMPACT_COMPOSER_SURFACE = `${DESCRIPTION_SURFACE_BASE} rounded-md transition-[background-color,box-shadow] hover:bg-[color-mix(in_srgb,var(--surface)_96%,var(--hover))]`;

const MOBILE_COMPOSER_SURFACE_BASE =
  "border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-transparent backdrop-blur-xl px-3 pt-2 pb-[max(8px,var(--app-safe-area-bottom))]";

interface MobileCompactComposerPortalProps {
  draft: DiscussionDraft;
  attachmentCount: number;
  promptText?: string;
  mobileBottomNavigation: boolean;
  scrollHidden: boolean;
  onOpen: () => void;
}

function MobileCompactComposerPortal({
  draft,
  attachmentCount,
  promptText,
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
        className={`pointer-events-auto relative box-border min-w-0 max-w-full overflow-x-clip ${MOBILE_COMPOSER_SURFACE_BASE} transition-[transform,opacity,visibility] will-change-transform motion-reduce:transition-none ${scrollHidden ? "pointer-events-none invisible translate-y-[calc(100%+58px+var(--app-viewport-safe-area-bottom)+4px)] opacity-0 duration-180 ease-[cubic-bezier(0.4,0,1,1)]" : "visible translate-y-0 opacity-100 duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]"}`}
      >
        <CompactComposer
          draft={draft}
          attachmentCount={attachmentCount}
          promptText={promptText}
          onOpen={onOpen}
        />
      </div>
    </div>,
    layerTarget ?? document.body,
  );
}

export function PrerenderedMobileCommentComposer() {
  return (
    <div
      data-learning-mobile-composer-prerender
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(58px+var(--app-viewport-safe-area-bottom))] z-130 box-border hidden min-w-0 max-w-full overflow-x-clip [[data-navigation-layout=compact]_&]:block [[data-learning-mobile-composer-ready=true]_&]:hidden!"
    >
      <div
        className={`relative box-border min-w-0 max-w-full overflow-x-clip ${MOBILE_COMPOSER_SURFACE_BASE}`}
      >
        <CompactComposer
          draft={EMPTY_MOBILE_COMPOSER_DRAFT}
          attachmentCount={0}
          disabled
          onOpen={() => undefined}
        />
      </div>
    </div>
  );
}

function CompactComposer({
  draft,
  attachmentCount,
  promptText = "Write something…",
  disabled = false,
  onOpen,
}: CompactComposerProps) {
  const preview =
    draft.plainText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const attachmentPreview = `${attachmentCount} ${attachmentCount === 1 ? "attachment" : "attachments"}`;

  return (
    <div
      role="button"
      data-compact-comment-composer
      aria-label="Open discussion composer"
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onOpen}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`flex w-full cursor-pointer items-center gap-2 p-1.5 text-left ${COMPACT_COMPOSER_SURFACE} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)${disabled ? " pointer-events-none opacity-60" : ""}`}
    >
      <img
        src={CURRENT_USER.avatar}
        alt=""
        className="pointer-events-none size-9 shrink-0 rounded-full object-cover"
      />
      <span className="learning-discussion__composer-prompt min-w-0 flex-1 truncate px-2 py-1.5 text-(--muted)">
        {preview ||
          (attachmentCount > 0 ? attachmentPreview : promptText)}
      </span>
    </div>
  );
}

function usePhoneComposerLayout() {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isPhone;
}

const getFilterName = (filter: Exclude<DiscussionEntryFilter, "all">) => {
  if (filter === "question") return "Q&As";
  if (filter === "note") return "notes";
  return "comments";
};
