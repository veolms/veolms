import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardIcon as Keyboard } from "@phosphor-icons/react/Keyboard";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { FOCUS_RING, IconAction, MONO } from "../shared/ui";

/**
 * A key sequence as typed: keys joined by "+", alternatives by " / ".
 * "Mod" is Ctrl, or ⌘ on a Mac (CodeMirror's `Mod-`); "Ctrl" stays Ctrl.
 */
interface Shortcut {
  keys: string;
  what: string;
}

const GROUPS: readonly { name: string; items: readonly Shortcut[] }[] = [
  {
    name: "Run and submit",
    items: [
      { keys: "Mod+'", what: "Run the examples" },
      { keys: "Mod+Enter", what: "Submit" },
    ],
  },
  {
    name: "Edit",
    items: [
      { keys: "Mod+/", what: "Comment or uncomment lines" },
      { keys: "Shift+Alt+A", what: "Block comment" },
      { keys: "Alt+↑ / Alt+↓", what: "Move the line up or down" },
      { keys: "Shift+Alt+↑ / Shift+Alt+↓", what: "Copy the line up or down" },
      { keys: "Mod+Shift+K", what: "Delete the line" },
      { keys: "Mod+] / Mod+[", what: "Indent or outdent" },
      { keys: "Ctrl+Space", what: "Show suggestions" },
      { keys: "Mod+Z / Mod+Shift+Z", what: "Undo or redo" },
    ],
  },
  {
    name: "Select",
    items: [
      { keys: "Mod+D", what: "Add the next match (another cursor)" },
      { keys: "Mod+Shift+L", what: "Select every match" },
      { keys: "Alt+Click", what: "Add a cursor" },
      { keys: "Alt+Drag", what: "Box selection" },
      { keys: "Mod+L", what: "Select the line" },
    ],
  },
  {
    name: "Find and move",
    items: [
      { keys: "Mod+F", what: "Find" },
      { keys: "Mod+H", what: "Find and replace" },
      { keys: "Mod+G", what: "Go to line" },
      { keys: "Mod+Shift+[ / Mod+Shift+]", what: "Fold or unfold" },
      { keys: "Esc, Tab", what: "Leave the editor" },
    ],
  },
];

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/u.test(navigator.platform || navigator.userAgent);
}

const MAC_KEYS: Record<string, string> = {
  Mod: "⌘",
  Alt: "⌥",
  Shift: "⇧",
  Ctrl: "⌃",
  Enter: "↩",
};

/** One key as a key cap, VS Code's keybinding look. */
function KeyCap({ name, mac }: { name: string; mac: boolean }) {
  const label = mac ? (MAC_KEYS[name] ?? name) : name === "Mod" ? "Ctrl" : name;
  return (
    <kbd
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-1.5 text-[0.75rem] font-semibold text-(--text) ${MONO}`}
    >
      {label}
    </kbd>
  );
}

/** A binding: its key caps, alternatives split by "or". */
function Keys({ keys, mac }: { keys: string; mac: boolean }) {
  const alternatives = keys.split(" / ");
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {alternatives.map((sequence, index) => (
        <span key={sequence} className="inline-flex items-center gap-1">
          {index > 0 ? (
            <span className="px-0.5 text-xs text-(--muted)">or</span>
          ) : null}
          {sequence.split(", ").map((step, at) => (
            <span key={step} className="inline-flex items-center gap-0.5">
              {at > 0 ? (
                <span className="px-0.5 text-xs text-(--muted)">then</span>
              ) : null}
              {step.split("+").map((key) => (
                <KeyCap key={key} name={key} mac={mac} />
              ))}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

/**
 * The editor's keyboard shortcuts, as VS Code lists them: grouped, with key
 * caps, searchable. It opens from the keyboard button in the top bar.
 */
export function ShortcutsButton() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const mac = useMemo(() => isMac(), []);

  useEffect(() => {
    if (!open) return undefined;
    search.current?.focus();
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const wanted = query.trim().toLowerCase();
  const groups = GROUPS.map((group) => ({
    ...group,
    items: wanted
      ? group.items.filter(
          (item) =>
            item.what.toLowerCase().includes(wanted) ||
            item.keys.toLowerCase().includes(wanted),
        )
      : group.items,
  })).filter((group) => group.items.length > 0);

  return (
    <div ref={box} className="relative @max-2xl:hidden">
      <IconAction
        label="Keyboard shortcuts"
        onClick={() => {
          setQuery("");
          setOpen((value) => !value);
        }}
      >
        <Keyboard size={17} weight="bold" aria-hidden="true" />
      </IconAction>
      {open ? (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="absolute top-10 right-0 z-40 flex max-h-[min(34rem,calc(100dvh-6rem))] w-[26rem] flex-col overflow-hidden rounded-xl bg-(--surface) shadow-xl ring-1 ring-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        >
          <div className="grid gap-2 border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] p-3">
            <p className="text-sm font-semibold text-(--text)">
              Keyboard shortcuts
            </p>
            <label className="relative block">
              <span className="sr-only">Search shortcuts</span>
              <MagnifyingGlass
                size={15}
                weight="bold"
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-(--muted)"
              />
              <input
                ref={search}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search, e.g. comment or Ctrl+D"
                className={`h-9 w-full rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] pr-3 pl-8 text-sm! text-(--text) placeholder:text-(--muted) ${FOCUS_RING}`}
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-(--muted)">
                No shortcut matches “{query}”.
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.name} className="pt-3">
                  <h3 className="mb-1 text-[0.6875rem] font-bold tracking-[0.12em] text-(--muted) uppercase">
                    {group.name}
                  </h3>
                  <dl className="grid">
                    {group.items.map((item) => (
                      <div
                        key={item.keys}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-(--hover)"
                      >
                        <dt className="min-w-0 flex-1 text-sm text-(--text-secondary)">
                          {item.what}
                        </dt>
                        <dd>
                          <Keys keys={item.keys} mac={mac} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
