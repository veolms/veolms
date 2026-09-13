import { useEffect, useRef, useState } from "react";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  AVATAR_STYLES,
  buildDicebearSvgUrl,
  type AvatarStyle,
} from "@veolms/contracts";

export interface AvatarStylePickerProps {
  open: boolean;
  /** Stable identifier (the user's id) used as the base DiceBear seed. */
  seed: string;
  onClose: () => void;
  /** Receives the DiceBear image URL directly — DiceBear avatars are served
   * straight from DiceBear's own CDN, never stored, so there's nothing to
   * fetch or convert here. */
  onSelect: (avatarUrl: string) => void;
}

/** Inline dialog for generating a DiceBear avatar: pick a style, shuffle for
 * variety within it, then confirm to fill it into the existing avatar save
 * pipeline. Mirrors the `settings-profile__privacy-dialog` pattern already
 * used for the mobile-visibility confirmation. */
export function AvatarStylePicker({
  open,
  seed,
  onClose,
  onSelect,
}: AvatarStylePickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [style, setStyle] = useState<AvatarStyle>(AVATAR_STYLES[0]);
  const [shuffleCount, setShuffleCount] = useState(0);
  const effectiveSeed = shuffleCount > 0 ? `${seed}-${shuffleCount}` : seed;
  const previewUrl = buildDicebearSvgUrl(style, effectiveSeed);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      setStyle(AVATAR_STYLES[0]);
      setShuffleCount(0);
    }
  }, [open]);

  if (!open) return null;

  // Closes the native <dialog> synchronously before the component unmounts
  // (the `open` prop flipping false removes it next render), so its `open`
  // attribute is already cleared rather than left stale on a detached node.
  const closeDialog = () => {
    dialogRef.current?.close();
    onClose();
  };

  const confirm = () => {
    onSelect(previewUrl);
    closeDialog();
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
        onClick={closeDialog}
      >
        <X size={18} />
      </button>

      <div className="settings-profile__privacy-dialog-copy">
        <h2 id="avatar-picker-dialog-title">Generate an avatar</h2>
        <p>Pick a style below, then shuffle for a different look.</p>
      </div>

      <div className="settings-profile__avatar-style-preview">
        <img src={previewUrl} alt="" width={96} height={96} />
        <button
          type="button"
          className="settings-profile__avatar-style-shuffle"
          onClick={() => setShuffleCount((count) => count + 1)}
        >
          <ArrowsClockwise size={15} weight="bold" aria-hidden="true" />
          Shuffle
        </button>
      </div>

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
            aria-checked={option === style}
            className={`settings-profile__avatar-style-option${
              option === style ? " is-selected" : ""
            }`}
            onClick={() => setStyle(option)}
          >
            <img
              src={buildDicebearSvgUrl(option, seed)}
              alt=""
              width={40}
              height={40}
            />
            <span>{option}</span>
          </button>
        ))}
      </div>

      <div className="settings-profile__privacy-dialog-actions">
        <button type="button" onClick={closeDialog}>
          Cancel
        </button>
        <button type="button" onClick={confirm}>
          Use this avatar
        </button>
      </div>
    </dialog>
  );
}
