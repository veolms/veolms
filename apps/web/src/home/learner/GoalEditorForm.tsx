import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { useEffect, useId, type CSSProperties } from "react";
import { stepGoalText } from "./goalInput";
import type { GoalEditor } from "./useGoalEditor";

/**
 * The daily goal while it is being edited: a line on top in place of the
 * heading, then one large field the goal is typed into as words ("45 min",
 * "1.5 hr", "1h 30m"). The line says what to type; when the text cannot be
 * saved it says what is wrong, or which formats work, in red, and the field
 * is ringed in red. The tick that saves it is `GoalSaveButton`, which takes
 * the edit button's place.
 *
 * The laptop's screen is laid out in its own large pixels (see
 * `LearnerGoalScreen`), the phone's card in the page's; each has its sizes.
 * Together they are as tall as the heading and figures they stand in for,
 * so nothing under the editor moves when it opens. On the laptop the field
 * half the sheet's width and grows with a longer goal ("1 hour 30
 * minutes"), below the tick in its corner, and a little shorter than the
 * figures, with the room it gives up kept above it.
 */
const sizes = {
  laptop: {
    // Kept clear of the tick in the sheet's corner.
    line: "flex h-11 items-center gap-3 pr-24 text-[36px] leading-[1.3] font-semibold whitespace-nowrap text-(--goal-ink)/85 @[50rem]/home:h-9 @[50rem]/home:gap-2.5 @[50rem]/home:text-[30px]",
    problem: "text-rose-300",
    problemIcon: "size-10 shrink-0 @[50rem]/home:size-9",
    // The field's text is set on the form: every input takes its font from
    // around it (`font: inherit` in the base styles, which outranks these).
    font: "text-[84px] leading-none font-semibold @[50rem]/home:text-[68px]",
    input:
      "mt-8 block h-28 w-[max(50%,calc(var(--goal-chars)*0.62em+88px))] max-w-full rounded-[32px] bg-white/12 px-9 text-white outline-none ring-4 ring-white/20 placeholder:text-white/35 focus:ring-(--goal-accent) aria-invalid:bg-rose-500/12 aria-invalid:ring-rose-400 @[50rem]/home:mt-6 @[50rem]/home:h-[92px] @[50rem]/home:rounded-[28px] @[50rem]/home:px-8",
  },
  card: {
    line: "flex min-h-5 items-center gap-1.5 text-[0.8125rem] leading-5 font-medium text-(--muted)",
    problem: "text-rose-600 [:root:not([data-theme=light])_&]:text-rose-300",
    problemIcon: "size-4 shrink-0",
    font: "text-[1.75rem] leading-none font-semibold",
    input:
      "mt-2 block h-11 w-full rounded-xl bg-current/8 px-3 text-(--text) outline-none ring-1 ring-current/15 placeholder:text-(--muted) focus:ring-2 focus:ring-(--accent) aria-invalid:bg-rose-500/10 aria-invalid:ring-2 aria-invalid:ring-rose-500",
  },
} as const;

export function GoalEditorForm({
  editor,
  variant,
}: {
  editor: GoalEditor;
  variant: keyof typeof sizes;
}) {
  const size = sizes[variant];
  const lineId = useId();
  const { inputRef } = editor;

  // The field takes the keyboard as the editor opens, with its text
  // selected so it can be typed over. Held where it is: the laptop is a
  // picture drawn in perspective, and scrolling to it would move the page.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, [inputRef]);

  return (
    <form
      id={editor.formId}
      ref={editor.editorRef}
      aria-label="Edit your daily goal"
      className={size.font}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        editor.save();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        editor.close();
      }}
    >
      <p
        id={lineId}
        role={editor.message ? "alert" : undefined}
        className={`${size.line} ${editor.message ? size.problem : ""}`}
      >
        {editor.message ? (
          <>
            <WarningCircle
              weight="fill"
              aria-hidden="true"
              className={size.problemIcon}
            />
            <span className="min-w-0 truncate">{editor.message}</span>
          </>
        ) : (
          <span className="min-w-0 truncate">
            Daily goal, like 45 min or 1.5 hr
          </span>
        )}
      </p>
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder="45 min"
        aria-label="Daily goal"
        aria-invalid={editor.invalid ? true : undefined}
        aria-describedby={lineId}
        value={editor.value}
        onChange={(event) => editor.setValue(event.target.value)}
        // The arrows move the goal a quarter hour at a time.
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          editor.setValue(
            stepGoalText(editor.value, event.key === "ArrowUp" ? 1 : -1),
          );
        }}
        maxLength={32}
        style={{ "--goal-chars": editor.value.length } as CSSProperties}
        // Its own corners, not the app's control radius.
        data-fixed-radius=""
        className={`transition-[box-shadow,background-color] motion-reduce:transition-none ${size.input}`}
      />
    </form>
  );
}

/**
 * The tick that saves the goal. It stands where the edit button was (the
 * sheet's corner on the laptop, the card's corner on the phone), so it is
 * outside the form in the page and submits it by its id.
 */
export function GoalSaveButton({
  editor,
  className,
  iconClassName,
}: {
  editor: GoalEditor;
  className: string;
  iconClassName: string;
}) {
  return (
    <button
      ref={editor.saveRef}
      type="submit"
      form={editor.formId}
      disabled={!editor.canSave}
      aria-busy={editor.saving || undefined}
      aria-label="Save your daily goal"
      title="Save"
      className={`cursor-pointer transition-[background-color,opacity,filter] disabled:cursor-default disabled:opacity-45 ${className}`}
    >
      <Check weight="bold" aria-hidden="true" className={iconClassName} />
    </button>
  );
}
