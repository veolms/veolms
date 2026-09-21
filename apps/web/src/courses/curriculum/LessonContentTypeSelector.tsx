import type { CSSProperties } from "react";
import audio44 from "../../assets/content-type-icons/audio-44.webp";
import audio88 from "../../assets/content-type-icons/audio-88.webp";
import audio132 from "../../assets/content-type-icons/audio-132.webp";
import document44 from "../../assets/content-type-icons/document-44.webp";
import document88 from "../../assets/content-type-icons/document-88.webp";
import document132 from "../../assets/content-type-icons/document-132.webp";
import image44 from "../../assets/content-type-icons/image-44.webp";
import image88 from "../../assets/content-type-icons/image-88.webp";
import image132 from "../../assets/content-type-icons/image-132.webp";
import video44 from "../../assets/content-type-icons/video-44.webp";
import video88 from "../../assets/content-type-icons/video-88.webp";
import video132 from "../../assets/content-type-icons/video-132.webp";

export type StudioLessonContentType = "video" | "audio" | "image" | "document";

export interface LessonContentTypeSelectorProps {
  value: StudioLessonContentType;
  onChange: (type: StudioLessonContentType) => void;
  disabled?: boolean;
}

interface ContentTypeItem {
  id: StudioLessonContentType;
  label: string;
  src: string;
  srcSet: string;
  accentColor: string;
  glowColor: string;
}

const ICON_DISPLAY_SIZES =
  "(min-width: 640px) 44px, 40px";

function contentTypeIcon(src44: string, src88: string, src132: string) {
  return {
    src: src88,
    srcSet: `${src44} 44w, ${src88} 88w, ${src132} 132w`,
  };
}

const CONTENT_TYPES: readonly ContentTypeItem[] = [
  {
    id: "video",
    label: "Video",
    ...contentTypeIcon(video44, video88, video132),
    accentColor: "#1879f4",
    glowColor: "rgba(24, 121, 244, 0.38)",
  },
  {
    id: "audio",
    label: "Audio",
    ...contentTypeIcon(audio44, audio88, audio132),
    accentColor: "#ee3a84",
    glowColor: "rgba(238, 58, 132, 0.38)",
  },
  {
    id: "image",
    label: "Image",
    ...contentTypeIcon(image44, image88, image132),
    accentColor: "#1bcead",
    glowColor: "rgba(27, 206, 173, 0.38)",
  },
  {
    id: "document",
    label: "Doc",
    ...contentTypeIcon(document44, document88, document132),
    accentColor: "#f8c72a",
    glowColor: "rgba(248, 199, 42, 0.4)",
  },
] as const;

export function LessonContentTypeSelector({
  value,
  onChange,
  disabled = false,
}: LessonContentTypeSelectorProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <label
          id="content-type-label"
          className="m-0 text-[0.85rem] sm:text-[0.88rem] font-bold text-(--text)"
        >
          Content Type <span className="text-red-500">*</span>
        </label>
      </div>
      <p className="m-0 text-[0.74rem] sm:text-[0.76rem] text-(--muted)">
        Select the main type of content for this lesson.
      </p>

      {/* 4 Cards Grid */}
      <div
        role="radiogroup"
        aria-labelledby="content-type-label"
        className="grid grid-cols-4 gap-2 sm:gap-2.5"
      >
        {CONTENT_TYPES.map((type) => {
          const isSelected = value === type.id;

          return (
            <button
              key={type.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(type.id)}
              style={
                {
                  "--type-accent": type.accentColor,
                  ...(isSelected
                    ? {
                        boxShadow: `0 0 16px ${type.glowColor}, var(--card-shadow)`,
                      }
                    : {}),
                } as CSSProperties
              }
              className={`group relative flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 p-3 text-center transition-[border-color,background-color,box-shadow] duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "border-(--type-accent) bg-[color-mix(in_srgb,var(--type-accent)_14%,var(--surface))]"
                  : "border-transparent bg-(--card-surface,var(--surface)) shadow-(--card-shadow) hover:border-[color-mix(in_srgb,var(--type-accent)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--type-accent)_8%,var(--surface))]"
              }`}
            >
              <img
                src={type.src}
                srcSet={type.srcSet}
                sizes={ICON_DISPLAY_SIZES}
                width={44}
                height={44}
                alt=""
                aria-hidden="true"
                decoding="async"
                className="block h-10 w-10 sm:h-11 sm:w-11 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.28)]"
              />

              <span
                className={`text-[0.76rem] sm:text-[0.80rem] font-bold ${
                  isSelected ? "text-(--text)" : "text-(--text-secondary)"
                }`}
              >
                {type.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
