import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { MinusIcon as Minus } from "@phosphor-icons/react/Minus";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { XIcon as X } from "@phosphor-icons/react/X";
import Cropper, { type Area, type Point } from "react-easy-crop";

import {
  createAvatarCropFile,
  type AvatarCropAreaPixels,
} from "./avatar-image-processing";

export interface AvatarCropDialogProps {
  open: boolean;
  imageUrl: string | null;
  fileName?: string;
  error?: string;
  isSaving?: boolean;
  onClose: () => void;
  onConfirm: (file: File) => Promise<void> | void;
}

const DEFAULT_CROP: Point = { x: 0, y: 0 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "We couldn't process that photo. Please try another image.";
}

export function AvatarCropDialog({
  open,
  imageUrl,
  fileName = "profile-photo.webp",
  error,
  isSaving = false,
  onClose,
  onConfirm,
}: AvatarCropDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [crop, setCrop] = useState<Point>(DEFAULT_CROP);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] =
    useState<AvatarCropAreaPixels | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCrop(DEFAULT_CROP);
    setZoom(MIN_ZOOM);
    setRotation(0);
    setCroppedAreaPixels(null);
    setProcessingError("");
  }, [open, imageUrl]);

  const handleCropComplete = useCallback(
    (_croppedArea: Area, nextCroppedAreaPixels: Area) => {
      setCroppedAreaPixels(nextCroppedAreaPixels);
    },
    [],
  );

  if (!open || !imageUrl) return null;

  const isBusy = isSaving || isProcessing;
  const displayedError = error || processingError;

  const closeDialog = () => {
    if (isBusy) return;
    dialogRef.current?.close();
    onClose();
  };

  const resetEditor = () => {
    if (isBusy) return;
    setCrop(DEFAULT_CROP);
    setZoom(MIN_ZOOM);
    setRotation(0);
    setProcessingError("");
  };

  const rotateBy = (degrees: number) => {
    if (isBusy) return;
    setRotation((currentRotation) => (currentRotation + degrees + 360) % 360);
  };

  const confirm = async () => {
    if (isBusy || !croppedAreaPixels) return;

    setIsProcessing(true);
    setProcessingError("");
    try {
      const file = await createAvatarCropFile(
        imageUrl,
        croppedAreaPixels,
        rotation,
        fileName,
      );
      await onConfirm(file);
    } catch (error: unknown) {
      setProcessingError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="settings-profile__privacy-dialog settings-profile__crop-dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
    >
      <button
        type="button"
        className="settings-profile__privacy-dialog-close"
        aria-label="Close photo editor"
        disabled={isBusy}
        onClick={closeDialog}
      >
        <X size={18} />
      </button>

      <div className="settings-profile__privacy-dialog-copy">
        <h2 id="avatar-crop-dialog-title">Edit profile photo</h2>
        <p>
          Drag to position your photo, pinch or use the slider to zoom, then
          save it for your profile.
        </p>
      </div>

      <div className="settings-profile__crop-dialog-body">
        <div
          className="settings-profile__crop-viewport"
          aria-label="Profile photo crop area"
        >
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            showGrid={false}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            objectFit="contain"
            onCropChange={setCrop}
            onCropComplete={handleCropComplete}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
          />
        </div>

        <div className="settings-profile__crop-controls">
          <div className="settings-profile__crop-control-group">
            <div className="settings-profile__crop-control-label">
              <span>Zoom</span>
              <span aria-live="polite">{Math.round(zoom * 100)}%</span>
            </div>
            <div className="settings-profile__crop-zoom-control">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={isBusy || zoom <= MIN_ZOOM}
                onClick={() =>
                  setZoom((currentZoom) =>
                    Math.max(MIN_ZOOM, Number((currentZoom - 0.1).toFixed(2))),
                  )
                }
              >
                <Minus size={16} weight="bold" />
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                value={zoom}
                aria-label="Zoom photo"
                disabled={isBusy}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <button
                type="button"
                aria-label="Zoom in"
                disabled={isBusy || zoom >= MAX_ZOOM}
                onClick={() =>
                  setZoom((currentZoom) =>
                    Math.min(MAX_ZOOM, Number((currentZoom + 0.1).toFixed(2))),
                  )
                }
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>
          </div>

          <div className="settings-profile__crop-control-group">
            <div className="settings-profile__crop-control-label">
              <span>Rotate</span>
              <span aria-live="polite">{rotation}°</span>
            </div>
            <div className="settings-profile__crop-rotation-control">
              <button
                type="button"
                aria-label="Rotate left 90 degrees"
                disabled={isBusy}
                onClick={() => rotateBy(-90)}
              >
                <ArrowCounterClockwise size={18} />
                <span>Left</span>
              </button>
              <button
                type="button"
                aria-label="Rotate right 90 degrees"
                disabled={isBusy}
                onClick={() => rotateBy(90)}
              >
                <ArrowClockwise size={18} />
                <span>Right</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {displayedError && (
        <p className="settings-profile__crop-error" role="alert">
          {displayedError}
        </p>
      )}

      <div className="settings-profile__privacy-dialog-actions settings-profile__crop-dialog-actions">
        <button type="button" disabled={isBusy} onClick={resetEditor}>
          Reset
        </button>
        <button type="button" disabled={isBusy} onClick={closeDialog}>
          Cancel
        </button>
        <button
          type="button"
          disabled={isBusy || !croppedAreaPixels}
          onClick={() => void confirm()}
        >
          {isProcessing ? (
            <>
              <CircleNotch size={15} className="animate-spin" />
              Processing…
            </>
          ) : isSaving ? (
            "Saving…"
          ) : (
            <>
              <Check size={15} weight="bold" />
              Use photo
            </>
          )}
        </button>
      </div>
    </dialog>
  );
}
