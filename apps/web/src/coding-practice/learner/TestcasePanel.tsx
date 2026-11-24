import { useState } from "react";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { XIcon as X } from "@phosphor-icons/react/X";
import { FOCUS_RING, HAIRLINE, MONO } from "../shared/ui";
import {
  isUnchanged,
  MAX_CASE_DRAFTS,
  parseArgs,
  type CaseDraft,
} from "./testcases";

const CHIP = `inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[0.8125rem]! font-semibold! ${FOCUS_RING}`;

/**
 * LeetCode's Testcase tab: the examples as Case 1, Case 2…, each argument
 * editable, and "+" for a case of the learner's own. An edited or new case
 * is run without an expected answer: Test Result shows what the code
 * returned.
 */
export function TestcasePanel({
  drafts,
  parameters,
  onChange,
}: {
  drafts: CaseDraft[];
  parameters: string[];
  onChange: (drafts: CaseDraft[]) => void;
}) {
  const [active, setActive] = useState(0);
  const index = Math.min(active, drafts.length - 1);
  const draft = drafts[index];
  if (!draft)
    return (
      <p className="px-4 py-6 text-sm text-(--muted)">
        This question has no examples to edit.
      </p>
    );
  const parsed = parseArgs(draft);
  const argCount = Math.max(draft.args.length, parameters.length);
  const update = (next: CaseDraft) =>
    onChange(drafts.map((item, at) => (at === index ? next : item)));

  return (
    <div className="grid gap-3 p-3">
      <div
        role="tablist"
        aria-label="Test cases"
        className="flex flex-wrap items-center gap-1.5"
      >
        {drafts.map((item, at) => (
          <span key={item.key} className="group relative">
            <button
              type="button"
              role="tab"
              aria-selected={at === index}
              onClick={() => setActive(at)}
              className={`${CHIP} ${
                at === index
                  ? "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--text)"
                  : "text-(--text-secondary) hover:bg-(--hover)"
              }`}
            >
              Case {at + 1}
              {!isUnchanged(item) ? (
                <span
                  className="size-1.5 rounded-full bg-(--accent)"
                  title={item.source ? "Edited" : "Your case"}
                />
              ) : null}
            </button>
            {drafts.length > 1 && !item.source ? (
              <button
                type="button"
                aria-label={`Remove case ${at + 1}`}
                onClick={() => {
                  onChange(drafts.filter((_, other) => other !== at));
                  setActive(Math.max(0, at - 1));
                }}
                className={`absolute -top-1.5 -right-1.5 hidden size-4 cursor-pointer items-center justify-center rounded-full bg-(--surface) text-(--muted) shadow ring-1 ring-[color-mix(in_srgb,var(--text)_14%,transparent)] group-hover:flex ${FOCUS_RING}`}
              >
                <X size={9} weight="bold" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))}
        {drafts.length < MAX_CASE_DRAFTS ? (
          <button
            type="button"
            aria-label="Add a test case"
            title="Add a test case"
            onClick={() => {
              onChange([
                ...drafts,
                {
                  key: `own-${Date.now()}`,
                  source: null,
                  args: [...draft.args],
                },
              ]);
              setActive(drafts.length);
            }}
            className={`${CHIP} px-2 text-(--text-secondary) hover:bg-(--hover)`}
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
          </button>
        ) : null}
        {draft.source && !isUnchanged(draft) ? (
          <button
            type="button"
            onClick={() =>
              update({
                ...draft,
                args: draft.source!.args.map((arg) => JSON.stringify(arg)),
              })
            }
            className={`ml-auto cursor-pointer rounded text-xs! font-semibold! text-(--accent-ink,var(--accent)) underline underline-offset-2 ${FOCUS_RING}`}
          >
            Undo changes
          </button>
        ) : null}
      </div>
      {Array.from({ length: argCount }, (_, at) => {
        const name = parameters[at] ?? `Argument ${at + 1}`;
        const invalid = !parsed.ok && parsed.index === at;
        return (
          <label key={at} className="grid gap-1">
            <span
              className={`text-xs font-semibold text-(--text-secondary) ${MONO}`}
            >
              {name} =
            </span>
            <textarea
              value={draft.args[at] ?? ""}
              spellCheck={false}
              rows={Math.min(
                6,
                Math.max(1, (draft.args[at] ?? "").split("\n").length),
              )}
              onChange={(event) => {
                const args = [...draft.args];
                args[at] = event.target.value;
                update({ ...draft, args });
              }}
              aria-invalid={invalid}
              className={`w-full resize-y rounded-lg border bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-3 py-2 text-[0.8125rem]! text-(--text) outline-none ${MONO} ${
                invalid
                  ? "border-(--code-fail)"
                  : `${HAIRLINE} focus:border-(--accent)`
              }`}
            />
            {invalid ? (
              <span className="text-xs text-(--code-fail)">
                Not valid JSON: use [1, 2], &quot;text&quot;, true, null…
              </span>
            ) : null}
          </label>
        );
      })}
      {!draft.source || !isUnchanged(draft) ? (
        <p className="text-xs text-(--muted)">
          Run shows what your code returns for this case; it has no expected
          answer to check.
        </p>
      ) : null}
    </div>
  );
}
