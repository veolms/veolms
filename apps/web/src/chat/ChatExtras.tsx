import { useShortcutPlatform } from "../useShortcutPlatform";
import { ChatDialog } from "./ChatDialogs";

export const CHAT_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Mod", "Alt", "N"], label: "New chat" },
  { keys: ["/"], label: "Search chats" },
  { keys: ["Alt", "↑"], label: "Previous chat" },
  { keys: ["Alt", "↓"], label: "Next chat" },
  { keys: ["Mod", "Alt", "P"], label: "Chat info" },
  { keys: ["Mod", "Alt", "E"], label: "Archive chat" },
  { keys: ["Mod", "Alt", "Shift", "M"], label: "Mute chat" },
  { keys: ["Mod", "Alt", "Shift", "P"], label: "Pin chat" },
  { keys: ["↑"], label: "Edit your last message (empty box)" },
  { keys: ["Enter"], label: "Send" },
  { keys: ["Shift", "Enter"], label: "New line" },
  { keys: ["Esc"], label: "Close reply, panel or chat" },
  { keys: ["Shift", "?"], label: "Keyboard shortcuts" },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const mac = useShortcutPlatform() === "mac";
  return (
    <ChatDialog title="Keyboard shortcuts" onClose={onClose}>
      <ul className="m-0 grid list-none gap-2 p-0">
        {CHAT_SHORTCUTS.map((shortcut) => (
          <li
            key={shortcut.label}
            className="flex items-center justify-between gap-4 text-[0.88rem]"
          >
            <span className="text-(--text-secondary)">{shortcut.label}</span>
            <span className="flex gap-1">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="rounded-md border border-solid border-(--chat-line-strong) bg-(--chat-input) px-1.5 py-0.5 font-sans text-[0.75rem] text-(--text)"
                >
                  {key === "Mod"
                    ? mac
                      ? "⌘"
                      : "Ctrl"
                    : key === "Alt" && mac
                      ? "⌥"
                      : key}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-10 cursor-pointer rounded-full border border-solid border-(--chat-line-strong) bg-transparent px-5 font-semibold text-(--accent-ink)"
        >
          Close
        </button>
      </div>
    </ChatDialog>
  );
}
