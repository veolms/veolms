import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UserIcon as User } from "@phosphor-icons/react/User";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { UserAvatar } from "@veolms/contracts";

import { GoogleBrandIcon, GitHubBrandIcon } from "../auth/SocialBrandIcons";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";

export interface AvatarManagerProps {
  avatars: readonly UserAvatar[];
  canEdit: boolean;
  isLoading?: boolean;
  hasLoadError?: boolean;
  onSelect: (avatarId: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
}

function sourceLabel(source: UserAvatar["source"]): string {
  if (source === "google") return "Google profile photo";
  if (source === "github") return "GitHub profile photo";
  return "Uploaded photo";
}

const MAX_SAVED_AVATARS = 5;

export function AvatarManager({
  avatars,
  canEdit,
  isLoading = false,
  hasLoadError = false,
  onSelect,
  onDeleteAll,
}: AvatarManagerProps) {
  const [pendingAvatarId, setPendingAvatarId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState("");
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const uploadedAvatars = avatars.filter(
    (avatar) => avatar.source === "upload",
  );
  const providerAvatars = avatars.filter(
    (avatar) => avatar.source !== "upload",
  );
  const emptySlotsCount = Math.max(
    0,
    MAX_SAVED_AVATARS - uploadedAvatars.length,
  );

  const closeDeleteModal = () => {
    setConfirmingDelete(false);
    setConfirmDeleteText("");
  };

  useEffect(() => {
    if (!confirmingDelete) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDeleteModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmingDelete]);

  const select = async (avatarId: string) => {
    setError("");
    setPendingAvatarId(avatarId);
    try {
      await onSelect(avatarId);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "We couldn't select that avatar. Please try again.",
      );
    } finally {
      setPendingAvatarId(null);
    }
  };

  const deleteAll = async () => {
    setError("");
    setDeletingAll(true);
    try {
      await onDeleteAll();
      closeDeleteModal();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "We couldn't delete the uploaded avatars. Please try again.",
      );
    } finally {
      setDeletingAll(false);
    }
  };

  if (!canEdit && avatars.length === 0) return null;

  return (
    <section
      className="mt-4 rounded-2xl border border-(--border) bg-(--surface) p-4.5 sm:p-5 shadow-sm transition-colors"
      aria-labelledby="avatar-manager-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="avatar-manager-title"
              className="text-sm font-semibold tracking-tight text-(--text)"
            >
              Profile photos
            </h3>
            {uploadedAvatars.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--track)/60 px-2.5 py-0.5 text-[11px] font-medium text-(--text-secondary)">
                <span
                  className="size-1.5 rounded-full bg-(--accent)"
                  aria-hidden="true"
                />
                <span>
                  {uploadedAvatars.length}/{MAX_SAVED_AVATARS} slots
                </span>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-(--muted) leading-relaxed">
            Choose the photo you want to use on your profile across courses and
            certificates.
          </p>
        </div>

        {canEdit && uploadedAvatars.length > 0 && (
          <button
            type="button"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-(--border)/80 bg-(--track)/40 px-2.5 text-xs font-medium text-(--muted) transition-all hover:border-(--danger)/40 hover:bg-(--danger)/10 hover:text-(--danger) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--danger) disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => {
              setError("");
              setConfirmDeleteText("");
              setConfirmingDelete(true);
            }}
            disabled={deletingAll || pendingAvatarId !== null}
          >
            <Trash size={13} weight="bold" aria-hidden="true" />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {providerAvatars.length > 0 && (
        <div className="mt-4 rounded-xl border border-(--border) bg-(--track)/35 p-3.5 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-(--text)">
              <Sparkle
                size={15}
                weight="duotone"
                className="text-(--accent)"
                aria-hidden="true"
              />
              <span>Synced account photo</span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border border-(--border)/60 bg-(--surface) px-2 py-0.5 text-[10px] font-medium text-(--muted)">
              <LinkSimple size={11} weight="bold" aria-hidden="true" />
              Auto-synced
            </span>
          </div>
          <p className="mt-1 text-xs text-(--muted) leading-relaxed">
            Photos automatically synced from your verified authentication
            accounts.
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {providerAvatars.map((avatar) => {
              const isCurrent = avatar.isCurrent;
              const isPending = pendingAvatarId === avatar.id;
              const isGoogle = avatar.source === "google";
              const hasFailed = Boolean(failedImages[avatar.id]);

              return (
                <button
                  key={avatar.id}
                  type="button"
                  className={`group relative flex items-center gap-3 rounded-xl border p-2 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
                    isCurrent
                      ? "border-(--accent) bg-(--accent-soft)/25 shadow-[0_2px_12px_color-mix(in_srgb,var(--accent-shadow)_24%,transparent)] ring-1 ring-(--accent)"
                      : "border-(--border) bg-(--surface) hover:border-(--accent-border) hover:bg-(--hover)"
                  }`}
                  aria-label={`${sourceLabel(avatar.source)}${
                    isCurrent ? ", current avatar" : ", use this avatar"
                  }`}
                  aria-pressed={isCurrent}
                  onClick={() => void select(avatar.id)}
                  disabled={
                    !canEdit ||
                    isCurrent ||
                    pendingAvatarId !== null ||
                    deletingAll
                  }
                >
                  <div className="relative size-10 shrink-0">
                    {hasFailed || !avatar.avatarDataUrl ? (
                      <div className="flex size-full items-center justify-center rounded-full border border-(--border) bg-(--surface-strong)">
                        {isGoogle ? (
                          <GoogleBrandIcon size={20} />
                        ) : (
                          <GitHubBrandIcon size={20} />
                        )}
                      </div>
                    ) : (
                      <ResponsiveAvatar
                        src={avatar.avatarDataUrl}
                        srcSet={avatar.avatarSrcSet}
                        sizes="40px"
                        width={160}
                        height={160}
                        alt=""
                        onError={() =>
                          setFailedImages((prev) => ({
                            ...prev,
                            [avatar.id]: true,
                          }))
                        }
                        className="size-full rounded-full object-cover ring-1 ring-(--border)"
                      />
                    )}
                    <div className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-(--surface) shadow-xs ring-1 ring-(--border)">
                      {isGoogle ? (
                        <GoogleBrandIcon size={11} />
                      ) : (
                        <GitHubBrandIcon size={11} />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 pr-1">
                    <div className="flex items-center gap-1.5">
                      <span className="block truncate text-xs font-semibold text-(--text)">
                        {isGoogle ? "Google Account" : "GitHub Account"}
                      </span>
                      {isCurrent && (
                        <span className="flex size-3.5 items-center justify-center rounded-full bg-(--accent) text-(--on-accent)">
                          <Check size={9} weight="bold" />
                        </span>
                      )}
                    </div>
                    <span
                      className={`block text-[11px] ${
                        isCurrent
                          ? "font-medium text-(--accent)"
                          : "text-(--muted)"
                      }`}
                    >
                      {isPending
                        ? "Applying…"
                        : isCurrent
                          ? "Active profile photo"
                          : "Click to use"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div
          className="mt-4 grid grid-cols-5 gap-2.5 animate-pulse"
          aria-label="Loading photos…"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`skeleton-slot-${index}`}
              className="aspect-square rounded-xl border border-(--border)/40 bg-(--surface-strong)/60"
            />
          ))}
        </div>
      ) : uploadedAvatars.length > 0 ? (
        <div className="mt-4">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-semibold text-(--text)">
              Saved library
            </span>
            <span className="text-[11px] text-(--muted)">
              {uploadedAvatars.length} of {MAX_SAVED_AVATARS} saved
            </span>
          </div>

          <div
            className="grid grid-cols-5 gap-2.5"
            aria-label="Uploaded avatars"
          >
            {uploadedAvatars.map((avatar) => {
              const isCurrent = avatar.isCurrent;
              const isPending = pendingAvatarId === avatar.id;
              const hasFailed = Boolean(failedImages[avatar.id]);

              return (
                <button
                  key={avatar.id}
                  type="button"
                  className={`group relative aspect-square overflow-hidden rounded-xl border transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
                    isCurrent
                      ? "border-(--accent) shadow-[0_4px_16px_color-mix(in_srgb,var(--accent-shadow)_35%,transparent)] ring-2 ring-(--accent) ring-offset-2 ring-offset-(--surface)"
                      : "border-(--border) bg-(--surface-strong)/50 hover:border-(--accent-border) hover:shadow-xs"
                  }`}
                  aria-label={`${sourceLabel(avatar.source)}${
                    isCurrent ? ", current avatar" : ", use this avatar"
                  }`}
                  aria-pressed={isCurrent}
                  onClick={() => void select(avatar.id)}
                  disabled={
                    !canEdit ||
                    isCurrent ||
                    pendingAvatarId !== null ||
                    deletingAll
                  }
                >
                  {hasFailed || !avatar.avatarDataUrl ? (
                    <div className="flex size-full items-center justify-center bg-(--surface-strong) text-(--muted)">
                      <User size={24} weight="duotone" />
                    </div>
                  ) : (
                    <ResponsiveAvatar
                      src={avatar.avatarDataUrl}
                      srcSet={avatar.avatarSrcSet}
                      sizes="80px"
                      width={160}
                      height={160}
                      alt=""
                      onError={() =>
                        setFailedImages((prev) => ({
                          ...prev,
                          [avatar.id]: true,
                        }))
                      }
                      className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  )}

                  {isCurrent && (
                    <span
                      className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-(--accent) text-(--on-accent) shadow-sm ring-1 ring-black/20"
                      aria-hidden="true"
                    >
                      <Check size={12} weight="bold" />
                    </span>
                  )}

                  {isPending && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-white">
                      <CircleNotch
                        size={18}
                        weight="bold"
                        className="animate-spin text-white"
                      />
                      <span className="mt-1 text-[10px] font-medium tracking-tight">
                        Saving…
                      </span>
                    </div>
                  )}
                </button>
              );
            })}

            {Array.from({ length: emptySlotsCount }).map((_, index) => (
              <div
                key={`empty-slot-${index}`}
                className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-(--border)/60 bg-(--track)/15 text-(--muted)/40 transition-colors"
                aria-hidden="true"
              >
                <span className="text-[10px] font-medium tracking-tight">
                  Slot {uploadedAvatars.length + index + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-(--border) bg-(--track)/20 px-4 py-5 text-center">
          <p className="text-xs text-(--muted)">
            No custom photos yet. Upload a photo or generate an avatar above.
          </p>
        </div>
      )}

      {hasLoadError && (
        <div
          className="mt-3 flex items-center gap-2 rounded-lg border border-(--danger)/20 bg-(--danger)/10 px-3 py-2 text-xs font-medium text-(--danger)"
          role="alert"
        >
          <WarningCircle
            size={16}
            weight="fill"
            className="shrink-0"
            aria-hidden="true"
          />
          <span>
            We couldn&apos;t load your saved avatars. You can still upload or
            generate a new one.
          </span>
        </div>
      )}

      {error && (
        <div
          className="mt-3 flex items-center gap-2 rounded-lg border border-(--danger)/20 bg-(--danger)/10 px-3 py-2 text-xs font-medium text-(--danger)"
          role="alert"
        >
          <WarningCircle
            size={16}
            weight="fill"
            className="shrink-0"
            aria-hidden="true"
          />
          <span>{error}</span>
        </div>
      )}

      {confirmingDelete &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            onClick={closeDeleteModal}
          >
            <div
              className="relative w-full max-w-md rounded-2xl border border-(--border) bg-(--surface) p-5 sm:p-6 text-(--text) shadow-2xl animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--danger)/12 text-(--danger)">
                    <Trash size={18} weight="bold" />
                  </div>
                  <div>
                    <h4
                      id="confirm-delete-title"
                      className="text-base font-bold tracking-tight text-(--text)"
                    >
                      Clear saved photos?
                    </h4>
                    <p className="mt-0.5 text-xs text-(--muted)">
                      This action cannot be undone.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
                  onClick={closeDeleteModal}
                  aria-label="Close"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>

              <p className="mt-3.5 text-xs leading-relaxed text-(--text-secondary)">
                This will permanently delete your {uploadedAvatars.length}{" "}
                uploaded photo{uploadedAvatars.length === 1 ? "" : "s"}. Synced
                photos from Google or GitHub will not be affected.
              </p>

              <div className="mt-4 rounded-xl border border-(--border) bg-(--track)/50 p-3">
                <label
                  htmlFor="delete-confirm-input"
                  className="block text-xs font-medium text-(--text-secondary)"
                >
                  To confirm, write{" "}
                  <span className="font-mono font-bold text-(--danger)">
                    delete
                  </span>{" "}
                  below:
                </label>
                <input
                  id="delete-confirm-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={confirmDeleteText}
                  onChange={(e) => setConfirmDeleteText(e.target.value)}
                  placeholder='Write "delete"'
                  className="mt-2 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 font-mono text-xs text-(--text) placeholder:text-(--muted)/60 focus:border-(--danger) focus:outline-none focus:ring-1 focus:ring-(--danger)"
                  autoFocus
                />
              </div>

              <div className="mt-5 flex items-center justify-end gap-2.5 max-[480px]:flex-col-reverse">
                <button
                  type="button"
                  className="w-auto min-w-24 rounded-lg border border-(--border) px-3.5 py-2 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) max-[480px]:w-full"
                  onClick={closeDeleteModal}
                  disabled={deletingAll}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex w-auto min-w-28 items-center justify-center gap-1.5 rounded-lg bg-(--danger) px-4 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-(--danger)/90 disabled:cursor-not-allowed disabled:opacity-40 max-[480px]:w-full"
                  disabled={
                    confirmDeleteText.trim().toLowerCase() !== "delete" ||
                    deletingAll
                  }
                  onClick={() => void deleteAll()}
                >
                  {deletingAll && (
                    <CircleNotch
                      size={14}
                      weight="bold"
                      className="animate-spin"
                    />
                  )}
                  <span>{deletingAll ? "Deleting…" : "Delete all"}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
