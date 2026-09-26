import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  AVATAR_STYLES,
  buildDicebearSvgUrl,
  type AvatarStyle,
  type UserAvatar,
} from "@veolms/contracts";

import { GoogleBrandIcon } from "../auth/SocialBrandIcons";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";

export interface AvatarStylePickerProps {
  open: boolean;
  /** Stable identifier (the user's id) used as the base DiceBear seed. */
  seed: string;
  avatars?: readonly UserAvatar[];
  currentAvatarUrl?: string | null;
  isSaving?: boolean;
  onClose: () => void;
  /** Receives the DiceBear image URL to generate and save. */
  onSelectGenerated: (avatarUrl: string) => Promise<void> | void;
  /** Receives an existing saved/synced avatar ID to switch to. */
  onSelectSaved: (avatarId: string) => Promise<void> | void;
}

function formatStyleLabel(style: AvatarStyle): string {
  if (style === "pixel-art") return "Pixel-Art";
  return style.charAt(0).toUpperCase() + style.slice(1);
}

export function AvatarStylePicker({
  open,
  seed,
  avatars = [],
  currentAvatarUrl,
  isSaving = false,
  onClose,
  onSelectGenerated,
  onSelectSaved,
}: AvatarStylePickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const prevOpenRef = useRef(false);

  const googleAvatar = useMemo(
    () => avatars.find((avatar) => avatar.source === "google"),
    [avatars],
  );
  const savedAvatars = useMemo(
    () => avatars.filter((avatar) => avatar.source === "upload").slice(0, 2),
    [avatars],
  );
  const hasSavedAvatars = Boolean(googleAvatar || savedAvatars.length > 0);

  // Identify user's active/current avatar from the database list or current URL
  const activeSavedAvatar = useMemo(() => {
    const byFlag = avatars.find((a) => a.isCurrent);
    if (byFlag) return byFlag;

    if (currentAvatarUrl) {
      const exact = avatars.find(
        (a) =>
          a.avatarDataUrl === currentAvatarUrl ||
          a.avatarSrcSet?.some((v) => v.url === currentAvatarUrl),
      );
      if (exact) return exact;

      const cleanCurrent = currentAvatarUrl.split("?")[0];
      const cleanMatch = avatars.find(
        (a) =>
          a.avatarDataUrl.split("?")[0] === cleanCurrent ||
          a.avatarSrcSet?.some((v) => v.url?.split("?")[0] === cleanCurrent),
      );
      if (cleanMatch) return cleanMatch;
    }

    return null;
  }, [avatars, currentAvatarUrl]);

  const matchedDicebearStyle = useMemo(() => {
    if (!currentAvatarUrl) return null;
    return (
      AVATAR_STYLES.find((style) => currentAvatarUrl.includes(`/${style}/`)) ??
      null
    );
  }, [currentAvatarUrl]);

  const [activeTab, setActiveTab] = useState<"saved" | "generate">("saved");
  const [userSelectedSavedId, setUserSelectedSavedId] = useState<string | null>(
    null,
  );
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>(
    AVATAR_STYLES[0],
  );
  const [shuffleCount, setShuffleCount] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [failedThumbnails, setFailedThumbnails] = useState<
    Record<string, boolean>
  >({});

  const effectiveSeed = shuffleCount > 0 ? `${seed}-${shuffleCount}` : seed;
  const generatedPreviewUrl = buildDicebearSvgUrl(
    selectedStyle,
    effectiveSeed,
  );

  // Guarantee that an avatar is selected when saved tab is active
  const effectiveSelectedSavedId = useMemo(() => {
    if (
      userSelectedSavedId &&
      avatars.some((a) => a.id === userSelectedSavedId)
    ) {
      return userSelectedSavedId;
    }
    if (activeSavedAvatar) {
      return activeSavedAvatar.id;
    }
    return null;
  }, [userSelectedSavedId, avatars, activeSavedAvatar]);

  const selectedSavedAvatar = useMemo(() => {
    if (effectiveSelectedSavedId) {
      return avatars.find((a) => a.id === effectiveSelectedSavedId) ?? null;
    }
    return activeSavedAvatar;
  }, [avatars, effectiveSelectedSavedId, activeSavedAvatar]);

  const previewSrc =
    selectedSavedAvatar?.avatarDataUrl ?? currentAvatarUrl ?? null;
  const previewSrcSet = selectedSavedAvatar?.avatarSrcSet;

  const previewCaption = useMemo(() => {
    if (activeTab === "saved") {
      if (selectedSavedAvatar) {
        return selectedSavedAvatar.source === "google"
          ? "Google Account Photo"
          : "Saved Photo";
      }
      return "Current Photo";
    }
    return formatStyleLabel(selectedStyle);
  }, [activeTab, selectedSavedAvatar, selectedStyle]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    // Only initialize when dialog transitions from closed to open
    if (open && !prevOpenRef.current) {
      setPreviewFailed(false);
      setFailedThumbnails({});
      setShuffleCount(0);
      setUserSelectedSavedId(null);

      // If current avatar is a DiceBear style and user has no matching saved avatar, start on generate
      if (matchedDicebearStyle && !activeSavedAvatar) {
        setActiveTab("generate");
        setSelectedStyle(matchedDicebearStyle);
      } else {
        setActiveTab("saved");
        if (matchedDicebearStyle) {
          setSelectedStyle(matchedDicebearStyle);
        }
      }
    }
    prevOpenRef.current = open;
  }, [open, matchedDicebearStyle, activeSavedAvatar]);

  useEffect(() => {
    setPreviewFailed(false);
  }, [selectedStyle, shuffleCount, activeTab, effectiveSelectedSavedId]);

  if (!open) return null;

  const closeDialog = () => {
    if (isSaving) return;
    dialogRef.current?.close();
    onClose();
  };

  const confirm = async () => {
    if (isSaving) return;
    if (activeTab === "saved") {
      const avatarId = effectiveSelectedSavedId ?? selectedSavedAvatar?.id;
      if (avatarId) {
        await onSelectSaved(avatarId);
      }
    } else {
      if (previewFailed) return;
      await onSelectGenerated(generatedPreviewUrl);
    }
  };

  const confirmSavedDirectly = async (avatarId: string) => {
    if (isSaving) return;
    setUserSelectedSavedId(avatarId);
    await onSelectSaved(avatarId);
  };

  return (
    <dialog
      ref={dialogRef}
      className="settings-profile__privacy-dialog settings-profile__avatar-dialog"
      aria-modal="true"
      aria-labelledby="avatar-picker-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
    >
      <button
        type="button"
        className="settings-profile__privacy-dialog-close"
        aria-label="Close avatar picker"
        disabled={isSaving}
        onClick={closeDialog}
      >
        <X size={18} />
      </button>

      <div className="settings-profile__privacy-dialog-copy">
        <h2 id="avatar-picker-dialog-title">Choose an avatar</h2>
        <p className="settings-profile__avatar-dialog-subtitle">
          Select from your synced or saved photos, or generate a custom look.
        </p>
      </div>

      <div className="settings-profile__avatar-dialog-body">
        {/* Left Column: Big Avatar Preview Box */}
        <div className="settings-profile__avatar-preview-col">
          <div className="settings-profile__avatar-preview-circle">
            {activeTab === "saved" ? (
              previewSrc ? (
                <ResponsiveAvatar
                  src={previewSrc}
                  srcSet={previewSrcSet}
                  alt="Avatar preview"
                  width={152}
                  height={152}
                  sizes="(min-width: 680px) 152px, 88px"
                  className="settings-profile__avatar-preview-img"
                />
              ) : (
                <span
                  className="settings-profile__avatar-fallback"
                  role="img"
                  aria-label="No avatar selected"
                >
                  No avatar
                </span>
              )
            ) : previewFailed ? (
              <span
                className="settings-profile__avatar-fallback"
                role="img"
                aria-label="Avatar preview unavailable"
              >
                Preview unavailable
              </span>
            ) : (
              <img
                src={generatedPreviewUrl}
                alt="Generated avatar preview"
                width={152}
                height={152}
                className="settings-profile__avatar-preview-img"
                onError={() => setPreviewFailed(true)}
                onLoad={() => setPreviewFailed(false)}
              />
            )}
          </div>
          <span className="settings-profile__avatar-preview-caption">
            {previewCaption}
          </span>
          {activeTab === "generate" && (
            <button
              type="button"
              className="settings-profile__avatar-style-shuffle"
              disabled={isSaving}
              onClick={() => setShuffleCount((count) => count + 1)}
              title="Shuffle avatar look"
            >
              <ArrowsClockwise size={13} weight="bold" aria-hidden="true" />
              Shuffle look
            </button>
          )}
        </div>

        {/* Right Column: Tabs and Grid Panels */}
        <div className="settings-profile__avatar-options-col">
          <div
            className="settings-profile__avatar-dialog-tabs"
            role="tablist"
            aria-label="Avatar source"
          >
            <button
              type="button"
              role="tab"
              id="avatar-tab-saved"
              aria-selected={activeTab === "saved"}
              aria-controls="avatar-tabpanel-saved"
              className={`settings-profile__avatar-dialog-tab${
                activeTab === "saved" ? " is-active" : ""
              }`}
              onClick={() => setActiveTab("saved")}
            >
              Sync &amp; saved
            </button>
            <button
              type="button"
              role="tab"
              id="avatar-tab-generate"
              aria-selected={activeTab === "generate"}
              aria-controls="avatar-tabpanel-generate"
              className={`settings-profile__avatar-dialog-tab${
                activeTab === "generate" ? " is-active" : ""
              }`}
              onClick={() => setActiveTab("generate")}
            >
              Generate avatar
            </button>
          </div>

          <div
            role="tabpanel"
            id={
              activeTab === "saved"
                ? "avatar-tabpanel-saved"
                : "avatar-tabpanel-generate"
            }
            aria-labelledby={
              activeTab === "saved" ? "avatar-tab-saved" : "avatar-tab-generate"
            }
            className="settings-profile__avatar-tabpanel"
          >
            {activeTab === "saved" ? (
              hasSavedAvatars ? (
                <div className="settings-profile__avatar-saved-grid">
                  {googleAvatar && (
                    <button
                      type="button"
                      className={`settings-profile__avatar-saved-option${
                        effectiveSelectedSavedId === googleAvatar.id
                          ? " is-selected"
                          : ""
                      }`}
                      disabled={isSaving}
                      onClick={() => setUserSelectedSavedId(googleAvatar.id)}
                      onDoubleClick={() => confirmSavedDirectly(googleAvatar.id)}
                      title="Google Account Photo (Double-click to apply directly)"
                      aria-label="Google Account Photo"
                      aria-pressed={effectiveSelectedSavedId === googleAvatar.id}
                    >
                      {effectiveSelectedSavedId === googleAvatar.id && (
                        <span
                          className="settings-profile__avatar-check-badge"
                          title="Selected photo"
                          aria-label="Active"
                        >
                          <Check size={12} weight="bold" />
                        </span>
                      )}
                      <div className="settings-profile__avatar-saved-thumb-wrap">
                        <ResponsiveAvatar
                          src={googleAvatar.avatarDataUrl}
                          srcSet={googleAvatar.avatarSrcSet}
                          alt="Google Account"
                          width={60}
                          height={60}
                          sizes="60px"
                          className="settings-profile__avatar-saved-thumb"
                        />
                        <span
                          className="settings-profile__avatar-google-badge"
                          aria-hidden="true"
                        >
                          <GoogleBrandIcon size={13} />
                        </span>
                      </div>
                    </button>
                  )}

                  {savedAvatars.map((saved, index) => {
                    const isSelected = effectiveSelectedSavedId === saved.id;
                    return (
                      <button
                        key={saved.id}
                        type="button"
                        className={`settings-profile__avatar-saved-option${
                          isSelected ? " is-selected" : ""
                        }`}
                        disabled={isSaving}
                        onClick={() => setUserSelectedSavedId(saved.id)}
                        onDoubleClick={() => confirmSavedDirectly(saved.id)}
                        title={`Saved photo ${index + 1} (Double-click to apply directly)`}
                        aria-label={`Saved photo ${index + 1}`}
                        aria-pressed={isSelected}
                      >
                        {isSelected && (
                          <span
                            className="settings-profile__avatar-check-badge"
                            title="Selected photo"
                            aria-label="Active"
                          >
                            <Check size={12} weight="bold" />
                          </span>
                        )}
                        <div className="settings-profile__avatar-saved-thumb-wrap">
                          <ResponsiveAvatar
                            src={saved.avatarDataUrl}
                            srcSet={saved.avatarSrcSet}
                            alt={`Saved photo ${index + 1}`}
                            width={60}
                            height={60}
                            sizes="60px"
                            className="settings-profile__avatar-saved-thumb"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="settings-profile__avatar-empty-hint">
                  No synced or saved photos available. Choose the Generate avatar
                  tab to customize a new look.
                </p>
              )
            ) : (
              <div
                className="settings-profile__avatar-style-grid"
                role="radiogroup"
                aria-label="Avatar style"
              >
                {AVATAR_STYLES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selectedStyle === option}
                    disabled={isSaving}
                    className={`settings-profile__avatar-style-option${
                      selectedStyle === option ? " is-selected" : ""
                    }`}
                    onClick={() => setSelectedStyle(option)}
                  >
                    {failedThumbnails[option] ? (
                      <span
                        className="settings-profile__avatar-thumbnail-fallback"
                        aria-hidden="true"
                      >
                        {option.slice(0, 2).toUpperCase()}
                      </span>
                    ) : (
                      <img
                        src={buildDicebearSvgUrl(option, seed)}
                        alt=""
                        width={46}
                        height={46}
                        onError={() =>
                          setFailedThumbnails((prev) => ({
                            ...prev,
                            [option]: true,
                          }))
                        }
                      />
                    )}
                    {selectedStyle === option && (
                      <span
                        className="settings-profile__avatar-check-badge"
                        title="Selected style"
                        aria-label="Selected"
                      >
                        <Check size={12} weight="bold" />
                      </span>
                    )}
                    <span>{formatStyleLabel(option)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="settings-profile__privacy-dialog-actions">
        <button type="button" onClick={closeDialog} disabled={isSaving}>
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={
            isSaving ||
            (activeTab === "generate" && previewFailed) ||
            (activeTab === "saved" && !selectedSavedAvatar)
          }
          className="settings-profile__avatar-confirm-btn"
        >
          {isSaving ? (
            <>
              <CircleNotch size={15} className="animate-spin" />
              Saving...
            </>
          ) : activeTab === "saved" ? (
            "Use this photo"
          ) : (
            "Use this avatar"
          )}
        </button>
      </div>
    </dialog>
  );
}
