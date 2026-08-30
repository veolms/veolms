import { AtIcon as At } from "@phosphor-icons/react/At";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { MegaphoneIcon as Megaphone } from "@phosphor-icons/react/Megaphone";
import type { NotificationTabId } from "./notificationsData";

export interface NotificationSummaryWidgetProps {
  counts: Record<NotificationTabId, number>;
  onSelectCategory?: (tab: NotificationTabId) => void;
}

export function NotificationSummaryWidget({
  counts,
  onSelectCategory,
}: NotificationSummaryWidgetProps) {
  const summaryItems = [
    {
      id: "unread" as NotificationTabId,
      label: "Unread",
      count: counts.unread,
      Icon: Bell,
      iconColor: "text-(--accent)",
      iconBg: "bg-(--accent-soft)",
    },
    {
      id: "mentions" as NotificationTabId,
      label: "Mentions",
      count: counts.mentions,
      Icon: At,
      iconColor: "text-purple-400",
      iconBg: "bg-purple-500/10",
    },
    {
      id: "course-activity" as NotificationTabId,
      label: "Course activity",
      count: counts["course-activity"],
      Icon: BookOpen,
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      id: "announcements" as NotificationTabId,
      label: "Announcements",
      count: counts.announcements,
      Icon: Megaphone,
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
  ];

  return (
    <section
      aria-labelledby="notification-summary-heading"
      className="rounded-[18px] border border-(--border) bg-(--card-surface) p-5 transition-all md:p-6"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <h3
        id="notification-summary-heading"
        className="font-bold text-base text-(--text) tracking-tight"
      >
        Summary
      </h3>

      <div className="mt-4 flex flex-col gap-2.5">
        {summaryItems.map((item) => {
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectCategory?.(item.id)}
              className="flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) md:text-sm"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${item.iconBg} ${item.iconColor}`}
                  aria-hidden="true"
                >
                  <Icon size={16} weight="duotone" />
                </div>
                <span className="font-medium">{item.label}</span>
              </div>
              <span className="font-bold text-(--text)">{item.count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
