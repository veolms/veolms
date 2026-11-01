import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { LaptopIcon as Laptop } from "@phosphor-icons/react/Laptop";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { LaptopWallpaperCrop } from "../home/learner/laptopWallpaperImage";
import {
  chooseLaptopWallpaper,
  LAPTOP_WALLPAPERS,
  removeOwnLaptopWallpaper,
  saveOwnLaptopWallpaper,
  useLaptopWallpaper,
  type LaptopWallpaperId,
} from "../home/learner/laptopWallpaper";

// Only needed once a picture is picked, so it is not part of the page.
const loadWallpaperImage = () => import("../home/learner/laptopWallpaperImage");
const WallpaperCropDialog = lazy(() =>
  import("./WallpaperCropDialog").then((module) => ({
    default: module.WallpaperCropDialog,
  })),
);

/** One wallpaper to pick, drawn in the laptop screen's own shape. */
function WallpaperChoice({
  name,
  src,
  selected,
  onChoose,
}: {
  name: string;
  src: string;
  selected: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${name} wallpaper`}
      onClick={onChoose}
      className={`group min-w-0 rounded-xl border p-2 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
        selected
          ? "border-[color-mix(in_srgb,var(--accent)_72%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] shadow-[0_8px_22px_color-mix(in_srgb,var(--accent)_9%,transparent)]"
          : "border-(--border) bg-(--surface) hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] hover:bg-(--surface-strong)"
      }`}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="block aspect-800/530 w-full rounded-lg bg-slate-950 object-cover"
      />
      <span className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-(--text)">
          {name}
        </span>
        {selected ? (
          <CheckCircle
            size={18}
            weight="fill"
            aria-hidden="true"
            className="shrink-0 text-(--accent-ink,var(--accent))"
          />
        ) : null}
      </span>
    </button>
  );
}

/**
 * The wallpaper on the laptop on the learner's home: one of the app's own,
 * or a picture the learner picks from their device. Their picture is cut to
 * the screen and kept in this browser only; it is not uploaded.
 */
export function LaptopWallpaperSettingsCard() {
  const wallpaper = useLaptopWallpaper();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The picture picked, while the learner places it on the screen.
  const [placing, setPlacing] = useState<{ file: File; url: string } | null>(
    null,
  );
  const [placingProblem, setPlacingProblem] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (placing) URL.revokeObjectURL(placing.url);
    },
    [placing],
  );

  const choose = (id: LaptopWallpaperId) => {
    setProblem(null);
    chooseLaptopWallpaper(id);
  };

  const pickOwnPicture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // So that picking the same file again is still a change.
    event.target.value = "";
    if (!file) return;
    setProblem(null);
    try {
      const { checkLaptopWallpaperFile } = await loadWallpaperImage();
      checkLaptopWallpaperFile(file);
    } catch (error) {
      setProblem(
        error instanceof Error && error.message
          ? error.message
          : "That picture could not be used.",
      );
      return;
    }
    setPlacingProblem(null);
    setPlacing({ file, url: URL.createObjectURL(file) });
  };

  const applyPlacedPicture = async (crop: LaptopWallpaperCrop) => {
    if (!placing) return;
    setPlacingProblem(null);
    setIsPreparing(true);
    try {
      const { prepareLaptopWallpaper } = await loadWallpaperImage();
      const picture = await prepareLaptopWallpaper(placing.file, crop);
      if (!saveOwnLaptopWallpaper(picture)) {
        setPlacingProblem(
          "This browser has no room left to keep the picture. Try a smaller one.",
        );
        return;
      }
      setPlacing(null);
    } catch (error) {
      setPlacingProblem(
        error instanceof Error && error.message
          ? error.message
          : "That picture could not be used.",
      );
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <section
      className="settings-learning-card"
      aria-labelledby="laptop-wallpaper-heading"
    >
      <header className="settings-learning-card__heading">
        <Laptop size={21} weight="duotone" />
        <h3 id="laptop-wallpaper-heading">Home wallpaper</h3>
      </header>
      <p className="text-xs leading-5 text-(--text-secondary)">
        The picture on the laptop on your home page, behind today&apos;s goal.
      </p>

      <div
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Home wallpaper"
      >
        {LAPTOP_WALLPAPERS.map(({ id, name, src }) => (
          <WallpaperChoice
            key={id}
            name={name}
            src={src}
            selected={wallpaper.id === id}
            onChoose={() => choose(id)}
          />
        ))}
        {wallpaper.ownSrc ? (
          <WallpaperChoice
            name="Your picture"
            src={wallpaper.ownSrc}
            selected={wallpaper.id === "own"}
            onChoose={() => choose("own")}
          />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void pickOwnPicture(event)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPreparing}
          aria-busy={isPreparing}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-3 text-sm! font-semibold text-(--text) transition-colors hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] hover:bg-(--surface-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-wait disabled:opacity-60"
        >
          <UploadSimple size={16} weight="bold" aria-hidden="true" />
          {isPreparing
            ? "Preparing…"
            : wallpaper.ownSrc
              ? "Use another picture"
              : "Use your own picture"}
        </button>
        {wallpaper.ownSrc ? (
          <button
            type="button"
            onClick={() => {
              setProblem(null);
              removeOwnLaptopWallpaper();
            }}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm! font-semibold text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          >
            <Trash size={16} aria-hidden="true" />
            Remove your picture
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-(--text-secondary)">
        You place your picture on the screen before it is used. It is kept in
        this browser only and is not uploaded.
      </p>
      {placing ? (
        <Suspense fallback={null}>
          <WallpaperCropDialog
            imageUrl={placing.url}
            isSaving={isPreparing}
            error={placingProblem}
            onClose={() => setPlacing(null)}
            onConfirm={(crop) => void applyPlacedPicture(crop)}
          />
        </Suspense>
      ) : null}
      {problem ? (
        <p
          role="alert"
          className="mt-2 text-xs leading-5 font-medium text-(--danger)"
        >
          {problem}
        </p>
      ) : null}
    </section>
  );
}
