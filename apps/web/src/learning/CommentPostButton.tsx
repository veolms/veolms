import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { NotepadIcon as Notepad } from "@phosphor-icons/react/Notepad";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { useEffect, useId, type ReactNode } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import type {
  DiscussionEntryKind,
  DiscussionVisibility,
} from "./discussion-editor/types";
import type { InteractionCapabilities } from "./discussionFeed";

interface PostOption<Value extends string> {
  value: Value;
  label: string;
  description: string;
  icon: ReactNode;
}

const ENTRY_KINDS: readonly PostOption<DiscussionEntryKind>[] = [
  {
    value: "comment",
    label: "Comment",
    description: "Share a thought or start a discussion.",
    icon: <ChatCenteredDots size={17} aria-hidden="true" />,
  },
  {
    value: "question",
    label: "Q&A",
    description: "Ask a question and invite answers.",
    icon: <Question size={17} aria-hidden="true" />,
  },
  {
    value: "note",
    label: "Note",
    description: "Save a useful note for this lesson.",
    icon: <Notepad size={17} aria-hidden="true" />,
  },
];

const VISIBILITIES: readonly PostOption<DiscussionVisibility>[] = [
  {
    value: "public",
    label: "Public",
    description: "Everyone can see it.",
    icon: <Globe size={14} aria-hidden="true" />,
  },
  {
    value: "unlisted",
    label: "Unlisted",
    description: "Only the creator and people with the link can see it.",
    icon: <EyeSlash size={14} aria-hidden="true" />,
  },
  {
    // A note can be kept to oneself.
    value: "private",
    label: "Private",
    description: "Only you can see it.",
    icon: <Lock size={14} aria-hidden="true" />,
  },
];

/** What the button does, in its own words. */
export function postButtonLabel(
  entryKind: DiscussionEntryKind,
  editing: boolean,
): string {
  if (editing) return "Save changes";
  if (entryKind === "question") return "Post Q&A";
  if (entryKind === "note") return "Post note";
  return "Comment";
}

/**
 * The composer's Post button. The main part posts with the current choice
 * (Comment and Public until something else is picked) and says what it
 * will do; the arrow opens Post as (Comment, Q&A, Note) and Visibility
 * (Public, Unlisted; Private too for a note). A pick applies at once. Esc
 * or a click outside closes the menu.
 */
export function CommentPostButton({
  entryKind,
  visibility,
  capabilities,
  editing,
  disabled,
  submitting,
  menuOpen,
  onMenuOpenChange,
  onEntryKindChange,
  onVisibilityChange,
  onPost,
}: {
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  capabilities?: InteractionCapabilities;
  editing: boolean;
  /** Nothing to post yet. */
  disabled: boolean;
  submitting: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
  onPost: () => void;
}) {
  const menuId = useId();
  const kinds = editing
    ? ENTRY_KINDS.filter((option) => option.value === entryKind)
    : ENTRY_KINDS.filter((option) =>
        !capabilities
          ? true
          : option.value === "comment"
            ? capabilities.allowComments
            : option.value === "question"
              ? capabilities.allowQa
              : capabilities.allowNotes,
      );
  const visibilities = VISIBILITIES.filter(
    (option) => option.value !== "private" || entryKind === "note",
  );

  // Private is a note's alone: a comment or Q&A picked after it is public.
  useEffect(() => {
    if (entryKind !== "note" && visibility === "private") {
      onVisibilityChange("public");
    }
  }, [entryKind, onVisibilityChange, visibility]);

  const label = submitting ? "Saving…" : postButtonLabel(entryKind, editing);
  const PostIcon = editing ? Check : PaperPlaneTilt;
  const unavailable = disabled || submitting;

  return (
    <div
      data-comment-post-button
      data-unavailable={unavailable || undefined}
      className="flex h-10 shrink-0 items-stretch overflow-hidden rounded-xl bg-(--accent) text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_55%,transparent)] data-unavailable:bg-[color-mix(in_srgb,var(--accent)_45%,var(--surface))] data-unavailable:shadow-none sm:h-11"
    >
      <button
        type="button"
        disabled={unavailable}
        onClick={onPost}
        aria-keyshortcuts="Enter Control+Enter Meta+Enter"
        className="inline-flex items-center gap-2 pr-3 pl-3.5 text-sm font-semibold transition-colors hover:bg-(--accent-hover) disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-(--on-accent) max-sm:px-3"
      >
        <PostIcon
          size={18}
          weight={editing ? "bold" : "fill"}
          aria-hidden="true"
        />
        <span className="max-sm:sr-only">{label}</span>
      </button>
      <span
        aria-hidden="true"
        className="my-2 w-px bg-[color-mix(in_srgb,var(--on-accent)_35%,transparent)]"
      />
      <Popover open={menuOpen} onOpenChange={onMenuOpenChange}>
        {/* Open even while the last post is still being sent or the box
            is empty: what to post next can be chosen before writing it. */}
        <PopoverTrigger
          aria-label="Post options"
          aria-controls={menuOpen ? menuId : undefined}
          className="grid w-10 place-items-center transition-colors hover:bg-(--accent-hover) disabled:cursor-not-allowed data-popup-open:bg-(--accent-hover) focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-(--on-accent)"
        >
          <CaretDown
            size={15}
            weight="bold"
            aria-hidden="true"
            className="transition-transform in-data-popup-open:rotate-180"
          />
        </PopoverTrigger>
        <PopoverContent
          id={menuId}
          data-comment-post-menu
          align="end"
          side="bottom"
          sideOffset={8}
          className="flex w-[21rem] max-w-[calc(100vw-1rem)] flex-col gap-3 p-3"
        >
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 px-1 text-[0.68rem] font-bold tracking-[0.08em] text-(--muted) uppercase">
              Post as
            </legend>
            <div
              role="radiogroup"
              aria-label="Post as"
              className="flex flex-col gap-1"
            >
              {kinds.map((option) => {
                const selected = option.value === entryKind;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={editing}
                    onClick={() => onEntryKindChange(option.value)}
                    className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-left ring-1 ring-transparent transition-colors ring-inset hover:bg-(--hover) aria-checked:bg-(--accent)/10 aria-checked:ring-(--accent)/60 disabled:cursor-default"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-(--surface-strong) text-(--text-secondary)">
                      {option.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-(--text)">
                        {option.label}
                      </span>
                      <span className="block text-xs text-(--muted)">
                        {option.description}
                      </span>
                    </span>
                    {selected ? (
                      <Check
                        size={16}
                        weight="bold"
                        aria-hidden="true"
                        className="shrink-0 text-(--accent)"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3">
            <span
              id={`${menuId}-visibility`}
              className="px-1 text-[0.68rem] font-bold tracking-[0.08em] text-(--muted) uppercase"
            >
              Visibility
            </span>
            <div
              role="radiogroup"
              aria-labelledby={`${menuId}-visibility`}
              className="flex gap-0.5 rounded-lg bg-[color-mix(in_srgb,var(--canvas)_55%,transparent)] p-0.5 ring-1 ring-[color-mix(in_srgb,var(--text)_8%,transparent)] ring-inset"
            >
              {visibilities.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={visibility === option.value}
                  title={option.description}
                  onClick={() => onVisibilityChange(option.value)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-(--muted) transition-colors hover:text-(--text) aria-checked:bg-(--surface) aria-checked:text-(--text) aria-checked:shadow-sm"
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={unavailable}
            onClick={() => {
              onMenuOpenChange(false);
              onPost();
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-(--accent) text-sm font-semibold text-(--on-accent) transition-colors hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45"
          >
            <PostIcon
              size={17}
              weight={editing ? "bold" : "fill"}
              aria-hidden="true"
            />
            {label}
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
