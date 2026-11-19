import React, { useEffect, useRef, useState } from "react";
import { XIcon as X } from "@phosphor-icons/react/X";
import type {
  DiscussionReactionType,
  EngagementTargetType,
} from "@veolms/contracts";
import { useReactionsQuery } from "../../services/learning-interactions/learning-interactions.queries";
import { DiscussionAvatar } from "../DiscussionAvatar";
import { ProfileLink } from "../../profiles/ProfileLink";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import {
  getReactionConfig,
  REACTION_CONFIGS,
  REACTION_TYPES,
} from "./reactionConstants";

interface WhoReactedModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: EngagementTargetType;
  targetId?: string;
  initialReaction?: DiscussionReactionType | "all";
}

export function WhoReactedModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  initialReaction = "all",
}: WhoReactedModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeTab, setActiveTab] = useState<DiscussionReactionType | "all">(
    initialReaction,
  );

  useEffect(() => {
    setActiveTab(initialReaction);
  }, [initialReaction, isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
    if (!isOpen && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
  }, [isOpen]);

  const { data, isLoading } = useReactionsQuery(
    targetType,
    targetId,
    activeTab,
    { enabled: isOpen && Boolean(targetId) },
  );

  const users = data?.users ?? [];
  const counts = data?.counts ?? { all: 0 };

  const closeDialog = () => {
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") {
      dialog.close();
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        closeDialog();
      }}
      className="fixed inset-0 z-150 m-auto flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-(--border) bg-(--surface) p-0 text-(--text) shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-(--border) px-5 py-3.5">
        <h2 className="text-base font-semibold">Reactions</h2>
        <button
          type="button"
          onClick={closeDialog}
          aria-label="Close"
          className="rounded-lg p-1 text-(--muted) hover:bg-(--surface-sunken) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-(--border) px-3 py-2 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "all"
              ? "bg-(--surface-sunken) text-(--text)"
              : "text-(--muted) hover:text-(--text)"
          }`}
        >
          <span>All</span>
          <span className="rounded-full bg-(--border) px-1.5 py-0.2 tabular-nums text-[11px]">
            {counts.all ?? 0}
          </span>
        </button>

        {REACTION_TYPES.map((type) => {
          const config = REACTION_CONFIGS[type];
          const Icon = config.icon;
          const count = counts[type] ?? 0;
          if (count === 0 && activeTab !== type) return null;

          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveTab(type)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === type
                  ? "bg-(--surface-sunken) text-(--text)"
                  : "text-(--muted) hover:text-(--text)"
              }`}
            >
              <span className={config.colorClass}>
                <Icon size={14} weight="fill" />
              </span>
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-(--muted)">
            <LoadingSpinnerIcon className="h-6 w-6 animate-spin text-(--accent)" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-(--muted)">
            No reactions yet.
          </div>
        ) : (
          <div className="divide-y divide-(--border)/40">
            {users.map((user) => {
              const reactionConfig = getReactionConfig(user.reaction);
              const ReactionIcon = reactionConfig.icon;

              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 px-2 py-2.5 transition-colors hover:bg-(--surface-sunken)/40 rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <DiscussionAvatar
                        src={user.avatarUrl}
                        className="size-9"
                        width={36}
                        height={36}
                      />
                      <span
                        className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-(--surface) bg-(--surface) ${reactionConfig.colorClass}`}
                      >
                        <ReactionIcon size={11} weight="fill" />
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {user.username ? (
                          <ProfileLink
                            username={user.username}
                            variant="name"
                            className="truncate text-sm font-medium hover:underline text-(--text)"
                          >
                            {user.displayName}
                          </ProfileLink>
                        ) : (
                          <span className="truncate text-sm font-medium text-(--text)">
                            {user.displayName}
                          </span>
                        )}

                        {user.role === "Instructor" && (
                          <span className="rounded bg-(--accent-light,rgba(99,102,241,0.1)) px-1.5 py-0.5 text-[10px] font-semibold text-(--accent)">
                            Instructor
                          </span>
                        )}
                        {user.role === "Admin" && (
                          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-500">
                            Admin
                          </span>
                        )}
                      </div>

                      {user.username && (
                        <p className="truncate text-xs text-(--muted)">
                          @{user.username}
                        </p>
                      )}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${reactionConfig.badgeColorClass} flex items-center gap-1`}
                  >
                    <ReactionIcon size={13} weight="fill" />
                    <span>{reactionConfig.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </dialog>
  );
}
