import { XIcon as X } from "@phosphor-icons/react/X";
import { useRef, useState, type KeyboardEvent } from "react";
import { looksLikeEmail, parseEmailList } from "../teamFormat";

/**
 * Addresses as chips. Typing then Enter, comma or space adds one; pasting a
 * list adds them all. A chip that is not an email shows red, so the count
 * above the field matches what will be sent.
 */
export function EmailChipsInput({
  emails,
  onChange,
  id,
  autoFocus,
}: {
  emails: readonly string[];
  onChange: (emails: string[]) => void;
  id: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (text: string) => {
    const { valid, invalid } = parseEmailList(text);
    const next = [...emails];
    for (const email of [...valid, ...invalid]) {
      if (!next.includes(email)) next.push(email);
    }
    onChange(next);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === " ") {
      if (draft.trim()) {
        event.preventDefault();
        add(draft);
      } else if (event.key === "Enter") {
        event.preventDefault();
      }
    } else if (event.key === "Backspace" && !draft && emails.length > 0) {
      onChange(emails.slice(0, -1));
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="flex min-h-24 cursor-text flex-wrap content-start gap-1.5 rounded-xl bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] p-2.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]"
    >
      {emails.map((email) => {
        const valid = looksLikeEmail(email);
        return (
          <span
            key={email}
            className={`inline-flex max-w-full items-center gap-1 rounded-lg py-1 pr-1 pl-2.5 text-xs font-medium ${valid ? "bg-[color-mix(in_srgb,var(--text)_9%,transparent)] text-(--text)" : "bg-rose-500/15 text-rose-400"}`}
          >
            <span className="truncate">{email}</span>
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={(event) => {
                event.stopPropagation();
                onChange(emails.filter((item) => item !== email));
              }}
              className="flex size-4 cursor-pointer items-center justify-center rounded hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)]"
            >
              <X size={10} weight="bold" />
            </button>
          </span>
        );
      })}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        autoFocus={autoFocus}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && add(draft)}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text");
          if (/[\s,;]/.test(text.trim())) {
            event.preventDefault();
            add(`${draft} ${text}`);
          }
        }}
        placeholder={emails.length === 0 ? "Paste or type, press Enter…" : ""}
        className="min-w-40 flex-1 bg-transparent px-1 py-1 text-sm text-(--text) placeholder:text-(--muted) focus:outline-none"
      />
    </div>
  );
}
