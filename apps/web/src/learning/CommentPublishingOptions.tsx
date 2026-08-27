import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { NotepadIcon as Notepad } from "@phosphor-icons/react/Notepad";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { useId, type ReactNode } from "react";
import type {
  DiscussionEntryKind,
  DiscussionVisibility,
} from "./commentEditor";

interface CommentPublishingOptionsProps {
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
}

interface PublishingOption<Value extends string> {
  value: Value;
  label: string;
  description: string;
  icon: ReactNode;
}

const visibilityOptions: readonly PublishingOption<DiscussionVisibility>[] = [
  {
    value: "public",
    label: "Public",
    description: "Everyone can see it.",
    icon: <Globe size={18} aria-hidden="true" />,
  },
  {
    value: "unlisted",
    label: "Unlisted",
    description: "Only the creator and people with the link can see it.",
    icon: <EyeSlash size={18} aria-hidden="true" />,
  },
  {
    value: "private",
    label: "Private",
    description: "Only you can see it.",
    icon: <Lock size={18} aria-hidden="true" />,
  },
];

const entryKindOptions: readonly PublishingOption<DiscussionEntryKind>[] = [
  {
    value: "comment",
    label: "Comment",
    description: "Share a thought or start a discussion.",
    icon: <ChatCenteredDots size={19} aria-hidden="true" />,
  },
  {
    value: "question",
    label: "Q&A",
    description: "Ask a question and invite answers.",
    icon: <Question size={19} aria-hidden="true" />,
  },
  {
    value: "note",
    label: "Note",
    description: "Save a useful note for this lesson.",
    icon: <Notepad size={19} aria-hidden="true" />,
  },
];

export function CommentPublishingOptions({
  entryKind,
  visibility,
  onEntryKindChange,
  onVisibilityChange,
}: CommentPublishingOptionsProps) {
  const availableVisibilityOptions =
    entryKind === "note"
      ? visibilityOptions
      : visibilityOptions.filter((option) => option.value !== "private");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-5 sm:px-5 sm:py-6">
      <fieldset className="space-y-2.5">
        <legend className="text-base font-semibold text-(--text)">
          Post as
        </legend>
        <div
          className="overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_9%,transparent)]"
          role="radiogroup"
          aria-label="Post as"
        >
          {entryKindOptions.map((option, index) => (
            <PublishingRow
              key={option.value}
              name="discussion-entry-kind"
              option={option}
              selected={entryKind === option.value}
              separated={index > 0}
              onSelect={onEntryKindChange}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-base font-semibold text-(--text)">
          Visibility
        </legend>
        <div
          className={`grid gap-1 rounded-xl bg-[color-mix(in_srgb,var(--canvas)_55%,transparent)] p-1 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent)] ${entryKind === "note" ? "grid-cols-3" : "grid-cols-2"}`}
          role="radiogroup"
          aria-label="Visibility"
        >
          {availableVisibilityOptions.map((option) => (
            <PublishingSegment
              key={option.value}
              name="discussion-visibility"
              option={option}
              selected={visibility === option.value}
              onSelect={onVisibilityChange}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

interface PublishingControlProps<Value extends string> {
  name: string;
  option: PublishingOption<Value>;
  selected: boolean;
  onSelect: (value: Value) => void;
}

function PublishingSegment<Value extends string>({
  name,
  option,
  selected,
  onSelect,
}: PublishingControlProps<Value>) {
  const tooltipId = useId();
  const tooltipPosition =
    option.value === "public"
      ? "left-0"
      : option.value === "private"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <label
      className={`group relative flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-[background-color,color,box-shadow] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-(--accent) sm:text-sm ${selected ? "bg-(--accent-soft) text-(--accent-ink,var(--accent)) shadow-[0_5px_16px_color-mix(in_srgb,var(--canvas)_28%,transparent)]" : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"}`}
    >
      <input
        type="radio"
        name={name}
        value={option.value}
        aria-label={option.label}
        aria-describedby={tooltipId}
        checked={selected}
        className="peer sr-only"
        onChange={() => onSelect(option.value)}
      />
      {option.icon}
      <span>{option.label}</span>
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none invisible absolute top-[calc(100%+0.5rem)] z-30 w-max max-w-56 translate-y-1 rounded-lg bg-(--surface-elevated,var(--surface)) px-2.5 py-1.5 text-center text-xs font-medium leading-4 text-(--text) opacity-0 shadow-[0_10px_26px_color-mix(in_srgb,var(--canvas)_48%,transparent),inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)] transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:translate-y-0 peer-focus-visible:opacity-100 ${tooltipPosition}`}
      >
        {option.description}
      </span>
    </label>
  );
}

interface PublishingRowProps<Value extends string>
  extends PublishingControlProps<Value> {
  separated: boolean;
}

function PublishingRow<Value extends string>({
  name,
  option,
  selected,
  separated,
  onSelect,
}: PublishingRowProps<Value>) {
  return (
    <label
      className={`group relative grid min-h-14 cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-(--accent) sm:px-4 ${separated ? "shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text)_8%,transparent)]" : ""} ${selected ? "bg-(--accent-soft)" : "hover:bg-(--hover)"}`}
    >
      <input
        type="radio"
        name={name}
        value={option.value}
        aria-label={option.label}
        checked={selected}
        className="sr-only"
        onChange={() => onSelect(option.value)}
      />
      <span
        className={`grid size-9 place-items-center rounded-lg transition-colors ${selected ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-(--accent-ink,var(--accent))" : "bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--text-secondary) group-hover:text-(--text)"}`}
      >
        {option.icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-(--text)">
          {option.label}
        </span>
        <span className="block text-xs leading-4 text-(--text-secondary)">
          {option.description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`grid size-5 place-items-center rounded-full transition-[background-color,color,box-shadow] ${selected ? "bg-(--accent) text-(--on-accent) shadow-[0_4px_12px_color-mix(in_srgb,var(--accent-shadow)_42%,transparent)]" : "text-transparent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_22%,transparent)]"}`}
      >
        <Check size={12} weight="bold" />
      </span>
    </label>
  );
}
