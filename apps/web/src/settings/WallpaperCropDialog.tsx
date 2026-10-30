import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { MinusIcon as Minus } from "@phosphor-icons/react/Minus";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { XIcon as X } from "@phosphor-icons/react/X";
import Cropper, { type Area, type Point } from "react-easy-crop";
import {
  LAPTOP_WALLPAPER_ASPECT,
  type LaptopWallpaperCrop,
} from "../home/learner/laptopWallpaperImage";

const DEFAULT_CROP: Point = { x: 0, y: 0 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Where a picture picked for the home wallpaper sits on the laptop's
 * screen: the learner drags it into place and zooms in, in the screen's own
 * shape, and the part in the frame is what is kept. Laid out like the
 * profile photo's editor (`AvatarCropDialog`), whose styles it shares.
 */
export function WallpaperCropDialog({
  imageUrl,
  isSaving,
  error,
  onClose,
  onConfirm,
}: {
  imageUrl: string;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (crop: LaptopWallpaperCrop) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [crop, setCrop] = useState<Point>(DEFAULT_CROP);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<LaptopWallpaperCrop | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setArea(pixels);
  }, []);

  const close = () => {
    if (isSaving) return;
    dialogRef.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="settings-profile__privacy-dialog settings-profile__crop-dialog"
      aria-modal="true"
      aria-labelledby="wallpaper-crop-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <button
        type="button"
        className="settings-profile__privacy-dialog-close"
        aria-label="Close wallpaper editor"
        disabled={isSaving}
        onClick={close}
      >
        <X size={18} />
      </button>

      <div className="settings-profile__privacy-dialog-copy">
        <h2 id="wallpaper-crop-dialog-title">Place your wallpaper</h2>
        <p>
          Drag the picture to choose the part that shows, and pinch or use the
          slider to zoom.
        </p>
      </div>

      <div className="settings-profile__crop-dialog-body">
        {/* In the screen's shape rather than the photo editor's square, so
            the frame fills it and the picture moves under it. */}
        <div
          className="settings-profile__crop-viewport"
          style={{
            aspectRatio: LAPTOP_WALLPAPER_ASPECT,
            width: "min(100%, 520px)",
          }}
          aria-label="Wallpaper crop area"
        >
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={LAPTOP_WALLPAPER_ASPECT}
            showGrid={false}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            objectFit="cover"
            onCropChange={setCrop}
            onCropComplete={handleCropComplete}
            onZoomChange={setZoom}
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
                disabled={isSaving || zoom <= MIN_ZOOM}
                onClick={() =>
                  setZoom((current) =>
                    Math.max(MIN_ZOOM, Number((current - 0.1).toFixed(2))),
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
                aria-label="Zoom wallpaper"
                disabled={isSaving}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <button
                type="button"
                aria-label="Zoom in"
                disabled={isSaving || zoom >= MAX_ZOOM}
                onClick={() =>
                  setZoom((current) =>
                    Math.min(MAX_ZOOM, Number((current + 0.1).toFixed(2))),
                  )
                }
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p className="settings-profile__crop-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="settings-profile__privacy-dialog-actions settings-profile__crop-dialog-actions">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => {
            setCrop(DEFAULT_CROP);
            setZoom(MIN_ZOOM);
          }}
        >
          Reset
        </button>
        <button type="button" disabled={isSaving} onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving || !area}
          onClick={() => area && onConfirm(area)}
        >
          {isSaving ? (
            <>
              <CircleNotch size={15} className="animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Check size={15} weight="bold" />
              Use picture
            </>
          )}
        </button>
      </div>
    </dialog>
  );
}
