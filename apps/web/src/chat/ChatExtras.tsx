import type { ChatRoomSummary } from "@veolms/contracts";

import { getApiError } from "../lib/api-error";
import { useShortcutPlatform } from "../useShortcutPlatform";
import { useMyCourses } from "../services/courses";
import { chatService } from "../services/chat";
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
                  className="rounded-md border border-solid border-(--border-strong) bg-(--surface-strong) px-1.5 py-0.5 font-sans text-[0.75rem] text-(--text)"
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
          className="h-10 cursor-pointer rounded-full border border-solid border-(--border-strong) bg-transparent px-5 font-semibold text-(--accent-ink)"
        >
          Close
        </button>
      </div>
    </ChatDialog>
  );
}

/** Staff: turn on the group of a course they run. */
export function CourseGroupsDialog({
  rooms,
  onOpened,
  onClose,
  onToast,
}: {
  rooms: ChatRoomSummary[];
  onOpened: (roomId: string) => void;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const courses = useMyCourses();
  const byCourse = new Map(
    rooms.filter((r) => r.courseId).map((r) => [r.courseId!, r.id]),
  );
  return (
    <ChatDialog title="Course groups" onClose={onClose}>
      <p className="m-0 mb-3 text-[0.86rem] text-(--text-secondary)">
        Turn on a group for a course. Everyone enrolled sees it in Chats. Free
        courses start with only admins sending.
      </p>
      <ul className="m-0 max-h-80 list-none overflow-y-auto p-0">
        {(courses.data?.courses ?? []).map((course) => {
          const roomId = byCourse.get(course.id);
          return (
            <li
              key={course.id}
              className="flex items-center gap-3 border-b border-solid border-(--border) py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-[0.9rem] text-(--text)">
                {course.title}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (roomId) {
                    onOpened(roomId);
                    return;
                  }
                  try {
                    const { room } = await chatService.enableCourseChat(
                      course.id,
                    );
                    onOpened(room.id);
                  } catch (error) {
                    onToast(getApiError(error).message);
                  }
                }}
                className="h-8 shrink-0 cursor-pointer rounded-full border border-solid border-(--accent-border) bg-transparent px-3.5 text-[0.8rem] font-semibold text-(--accent-ink) hover:bg-(--hover)"
              >
                {roomId ? "Open" : "Turn on"}
              </button>
            </li>
          );
        })}
        {courses.data && courses.data.courses.length === 0 ? (
          <li className="py-4 text-center text-[0.86rem] text-(--muted)">
            You don’t run any course yet.
          </li>
        ) : null}
      </ul>
    </ChatDialog>
  );
}
