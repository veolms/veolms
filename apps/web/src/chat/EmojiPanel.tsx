import { useState } from "react";

import { cn } from "../lib/utils";

/**
 * A small emoji panel (WhatsApp opens one above the message box). Recent
 * picks come first and are remembered in this browser.
 */
const GROUPS: Array<{ label: string; emoji: string }> = [
  {
    label: "Smileys",
    emoji:
      "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬",
  },
  {
    label: "Gestures",
    emoji:
      "👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🧠 👀 👁️",
  },
  {
    label: "Hearts",
    emoji:
      "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 🔥 ✨ ⭐ 🌟 🎉 🎊 🏆 🥇 🎯",
  },
  {
    label: "Study",
    emoji:
      "📚 📖 📝 ✏️ 🖊️ 📌 📎 📏 📐 🗂️ 📅 ⏰ ⏳ 💡 🔍 💻 🖥️ ⌨️ 🖱️ 📱 🧪 🔬 🧮 🎓 🏫 📊 📈 🧩 🚀 ✅ ❌ ❓ ❗ ⚠️ 🔗 🐛",
  },
  { label: "Food", emoji: "☕ 🍵 🧃 🍕 🍔 🍟 🌮 🍜 🍩 🍪 🎂 🍎 🍌 🍉 🍇 🥭" },
];

const RECENT_KEY = "veolms-chat-recent-emoji";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string) {
  try {
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(
      0,
      16,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not remembered: fine.
  }
}

export function EmojiPanel({
  onPick,
  className,
}: {
  onPick: (emoji: string) => void;
  className?: string;
}) {
  const [recent] = useState(readRecent);
  const groups =
    recent.length > 0
      ? [{ label: "Recent", emoji: recent.join(" ") }, ...GROUPS]
      : GROUPS;
  return (
    <div
      role="dialog"
      aria-label="Emoji"
      className={cn(
        "max-h-72 overflow-y-auto rounded-xl border border-(--border) bg-(--surface) p-2 shadow-[0_18px_48px_rgb(0_0_0/0.3)]",
        className,
      )}
    >
      {groups.map((group) => (
        <section key={group.label} className="mb-2">
          <h3 className="m-0 px-1 pb-1 text-[0.7rem] font-semibold tracking-wide text-(--muted) uppercase">
            {group.label}
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))]">
            {group.emoji.split(" ").map((emoji) => (
              <button
                key={`${group.label}-${emoji}`}
                type="button"
                onClick={() => {
                  rememberEmoji(emoji);
                  onPick(emoji);
                }}
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-xl hover:bg-(--hover)"
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
