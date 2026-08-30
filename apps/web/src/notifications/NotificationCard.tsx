import { useState } from "react";
import { AtIcon as At } from "@phosphor-icons/react/At";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChatTeardropTextIcon as ChatTeardropText } from "@phosphor-icons/react/ChatTeardropText";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { ClipboardTextIcon as ClipboardText } from "@phosphor-icons/react/ClipboardText";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { TrophyIcon as Trophy } from "@phosphor-icons/react/Trophy";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";
import type { NotificationItem } from "./notificationsData";
import { useBackDismiss } from "../navigation/useBackDismiss";

export interface NotificationCardProps {
  notification: NotificationItem;
  onToggleRead: (id: string) => void;
  onDelete: (id: string) => void;
  setNotice?: (message: string) => void;
}

export function NotificationCard({
  notification,
  onToggleRead,
  onDelete,
  setNotice,
}: NotificationCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useBackDismiss({ open: menuOpen, onDismiss: () => setMenuOpen(false) });

  const getIcon = (type: NotificationItem["iconType"]) => {
    switch (type) {
      case "graduation":
        return <GraduationCap size={22} weight="duotone" />;
      case "chat":
        return <ChatTeardropText size={22} weight="duotone" />;
      case "clipboard":
        return <ClipboardText size={22} weight="duotone" />;
      case "calendar":
        return <CalendarBlank size={22} weight="duotone" />;
      case "at":
        return <At size={22} weight="duotone" />;
      case "book":
        return <BookOpen size={22} weight="duotone" />;
      case "bell":
        return <Bell size={22} weight="duotone" />;
      case "trophy":
        return <Trophy size={22} weight="duotone" />;
      case "wallet":
        return <Wallet size={22} weight="duotone" />;
      case "shield":
        return <ShieldCheck size={22} weight="duotone" />;
    }
  };

  const handleCopyLink = () => {
    setMenuOpen(false);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(
        `${window.location.origin}/notifications#${notification.id}`,
      );
      setNotice?.("Notification link copied to clipboard.");
    }
  };

  const handleDelete = () => {
    setMenuOpen(false);
    onDelete(notification.id);
  };

  const handleToggleRead = () => {
    setMenuOpen(false);
    onToggleRead(notification.id);
  };

  return (
    <article
      id={notification.id}
      className={`group relative rounded-2xl border border-(--border) p-4 transition-all duration-200 hover:bg-(--card-surface-hover,var(--hover)) ${
        notification.isRead
          ? "bg-(--card-surface-raised,var(--surface)) opacity-90"
          : "bg-(--card-surface-raised,var(--surface))"
      }`}
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-start justify-between gap-3.5">
        {/* Left: Icon Badge */}
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] shadow-sm"
          style={{
            backgroundColor: notification.iconColor,
            color: notification.iconTextColor,
          }}
          aria-hidden="true"
        >
          {getIcon(notification.iconType)}
        </div>

        {/* Middle: Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm sm:text-base text-(--text) tracking-tight">
              {notification.title}
            </h3>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-(--text-secondary) leading-relaxed">
            {notification.body}
          </p>
        </div>

        {/* Right: Timestamp + Unread Dot + Context Menu */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 pt-0.5">
          <span className="text-xs text-(--muted) whitespace-nowrap">
            {notification.timestamp}
          </span>

          {/* Unread Accent Dot */}
          {!notification.isRead && (
            <span
              className="h-2 w-2 rounded-full bg-(--accent) shrink-0 shadow-[0_0_8px_var(--accent)]"
              aria-label="Unread notification"
            />
          )}

          {/* Action Menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={`Options for notification: ${notification.title}`}
              aria-expanded={menuOpen}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer"
            >
              <DotsThreeVertical size={18} weight="bold" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 z-30 min-w-42.5 rounded-xl border border-(--border) bg-(--card-surface) p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleToggleRead}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-(--text) hover:bg-(--hover) cursor-pointer"
                  >
                    <Check size={14} />
                    <span>
                      {notification.isRead ? "Mark as unread" : "Mark as read"}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleCopyLink}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-(--text) hover:bg-(--hover) cursor-pointer"
                  >
                    <LinkSimple size={14} />
                    <span>Copy link</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-400 hover:bg-(--hover) cursor-pointer"
                  >
                    <Trash size={14} />
                    <span>Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
