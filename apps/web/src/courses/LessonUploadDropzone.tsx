import { CloudArrowUpIcon as CloudArrowUp } from "@phosphor-icons/react";
import type { DragEvent, KeyboardEvent } from "react";

export interface LessonUploadDropzoneProps {
  title: string;
  supportText: string;
  isDragging: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChooseFile: () => void;
  onDragEnter?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

export function LessonUploadDropzone({
  title,
  supportText,
  isDragging,
  disabled = false,
  ariaLabel,
  onChooseFile,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: LessonUploadDropzoneProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!disabled && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onChooseFile();
    }
  };

  return (
    <div
      className={`group relative flex aspect-video min-h-[210px] w-full flex-col items-center justify-center overflow-hidden rounded-[16px] border-2 border-dashed p-4 text-center transition-all duration-150 sm:min-h-[250px] sm:p-6 ${
        isDragging
          ? "border-(--accent) bg-[linear-gradient(160deg,color-mix(in_srgb,var(--accent)_16%,var(--canvas))_0%,color-mix(in_srgb,var(--accent)_8%,var(--surface))_100%)] shadow-[inset_0_0_0_2px_var(--accent),0_0_24px_var(--accent-shadow)]"
          : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[linear-gradient(155deg,color-mix(in_srgb,var(--canvas)_80%,var(--surface))_0%,color-mix(in_srgb,var(--surface)_65%,var(--canvas))_100%)] shadow-[inset_0_2px_6px_color-mix(in_srgb,black_28%,transparent),inset_0_1px_2px_color-mix(in_srgb,var(--text)_10%,transparent),inset_0_-1px_0_color-mix(in_srgb,var(--surface)_90%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface)_95%,var(--hover))]"
      } ${disabled ? "cursor-not-allowed opacity-75" : "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"}`}
      onClick={() => {
        if (!disabled) onChooseFile();
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_20%,var(--surface))_0%,color-mix(in_srgb,var(--accent)_8%,var(--canvas))_100%)] text-(--accent) shadow-[var(--card-compact-shadow,0_3px_8px_color-mix(in_srgb,var(--text)_12%,transparent))] transition-transform duration-200 group-hover:scale-105 sm:h-16 sm:w-16">
        <CloudArrowUp size={34} weight="duotone" />
      </div>
      <p className="m-0 mt-3 text-[0.88rem] font-semibold text-(--text) sm:mt-4 sm:text-[0.92rem]">
        {title}
      </p>
      <p className="m-0 mt-1 text-[0.72rem] font-medium text-(--muted) sm:text-[0.74rem]">
        <span>or </span>
        <span className="text-(--accent) underline-offset-4 hover:underline">
          click to browse
        </span>
      </p>
      <p className="m-0 mt-2 text-[0.70rem] text-(--muted) sm:text-[0.74rem]">
        {supportText}
      </p>
    </div>
  );
}
