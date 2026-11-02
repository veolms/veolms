import type { Icon } from "@phosphor-icons/react";
import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { NotepadIcon as Notepad } from "@phosphor-icons/react/Notepad";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { PencilSimpleLine } from "@phosphor-icons/react/PencilSimpleLine";
import { Button } from "../components/Button";
import type { DiscussionEntryFilter } from "./discussionFeed";

interface EmptyStateCopy {
  title: string;
  /** Said to someone who can post here. */
  invitation: string;
  action: string;
}

const copyByFilter: Record<DiscussionEntryFilter, EmptyStateCopy> = {
  all: {
    title: "No discussions yet",
    invitation: "Be the first to start the discussion on this lesson.",
    action: "Start a discussion",
  },
  comment: {
    title: "No comments yet",
    invitation: "Be the first to share a thought on this lesson.",
    action: "Write a comment",
  },
  question: {
    title: "No Q&As yet",
    invitation: "Be the first to ask a question about this lesson.",
    action: "Ask a question",
  },
  // A note is the learner's own, so nobody is "first" to one.
  note: {
    title: "No notes yet",
    invitation: "Notes you take on this lesson are kept here.",
    action: "Write a note",
  },
};

/**
 * Under "Mine" the list holds only what the learner wrote, so being empty
 * says nothing about the lesson: others may have written plenty. The words
 * are about the learner instead.
 */
const mineCopyByFilter: Record<DiscussionEntryFilter, EmptyStateCopy> = {
  all: {
    title: "You haven't posted anything yet",
    invitation:
      "Your comments, questions and notes on this lesson will show up here.",
    action: "Start a discussion",
  },
  comment: {
    title: "You haven't written any comments yet",
    invitation: "Share a thought on this lesson and it will show up here.",
    action: "Write a comment",
  },
  question: {
    title: "You haven't asked any questions yet",
    invitation: "Ask something about this lesson and it will show up here.",
    action: "Ask a question",
  },
  note: {
    title: "You haven't taken any notes yet",
    invitation: "Notes you take on this lesson are kept here.",
    action: "Write a note",
  },
};

const searchCopy: EmptyStateCopy = {
  title: "No matching discussions",
  invitation: "Try other words, or clear the search to see every discussion.",
  action: "",
};

/**
 * The picture over each kind's empty list: the same one each post of that
 * kind carries (`CommentCard`) and the kind picker shows.
 */
const iconByFilter: Record<DiscussionEntryFilter, Icon> = {
  all: ChatsCircle,
  comment: ChatCenteredDots,
  question: Question,
  note: Notepad,
};

const pencilFade =
  "transition-opacity duration-150 motion-reduce:transition-none";

/**
 * What the lesson's discussion shows while it has nothing in it: that it is
 * empty, an invitation to be the first, and a button that opens the box to
 * write in. Someone who cannot post here gets the statement alone, with the
 * way back to the full list when a filter is what emptied it.
 */
export function DiscussionEmptyState({
  filter,
  mine = false,
  searching = false,
  canReturnToAll,
  onStart,
}: {
  filter: DiscussionEntryFilter;
  /** The list is narrowed to what the learner wrote themselves. */
  mine?: boolean;
  /**
   * The list is a search's results: nothing matched, which says nothing
   * about whether the lesson has discussions, so nobody is asked to be first.
   */
  searching?: boolean;
  /** A filter is on, and the full list can be chosen instead. */
  canReturnToAll: boolean;
  /** Opens the composer. Left out for someone who cannot post here. */
  onStart?: () => void;
}) {
  const copy = searching
    ? searchCopy
    : (mine ? mineCopyByFilter : copyByFilter)[filter];
  const EmptyIcon = searching ? MagnifyingGlass : iconByFilter[filter];
  const start = searching ? undefined : onStart;
  const hint =
    searching || start
      ? copy.invitation
      : canReturnToAll
        ? "Choose All to return to the full lesson discussion."
        : null;

  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span
        className="mb-3 grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent-ink,var(--accent))"
        aria-hidden="true"
      >
        <EmptyIcon size={24} weight="duotone" />
      </span>
      <p className="font-semibold text-(--text)">{copy.title}</p>
      {hint ? (
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-(--muted)">
          {hint}
        </p>
      ) : null}
      {start ? (
        // Under the pointer the button stays where it is: it darkens, and
        // its pencil fills in. The filled pencil lies over the outlined one
        // and the two trade places, so the change is a fade, not a jump.
        <Button motion="static" className="group/start mt-4" onClick={start}>
          <span className="relative inline-flex" aria-hidden="true">
            <PencilSimpleLine
              size={17}
              weight="bold"
              className={`${pencilFade} group-hover/start:opacity-0 group-focus-visible/start:opacity-0`}
            />
            <PencilSimpleLine
              size={17}
              weight="fill"
              className={`${pencilFade} absolute inset-0 opacity-0 group-hover/start:opacity-100 group-focus-visible/start:opacity-100`}
            />
          </span>
          {/* The weight is set here: on this page the shared button's own
              does not reach its words. */}
          <span className="font-semibold">{copy.action}</span>
        </Button>
      ) : null}
    </div>
  );
}
