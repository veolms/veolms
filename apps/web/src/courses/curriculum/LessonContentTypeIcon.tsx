import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { HeadphonesIcon as Headphones } from "@phosphor-icons/react/Headphones";
import { ImageIcon as Image } from "@phosphor-icons/react/Image";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { BrainIcon as Brain } from "@phosphor-icons/react/Brain";
import type { ComponentType } from "react";

export type LessonListContentType =
  | "video"
  | "audio"
  | "image"
  | "document"
  | "quiz";

interface ContentTypeIconMeta {
  Icon: ComponentType<{
    size?: number;
    weight?: "fill";
    className?: string;
  }>;
  label: string;
  path: string;
}

const CONTENT_TYPE_ICONS: Record<LessonListContentType, ContentTypeIconMeta> = {
  video: {
    Icon: PlayCircle,
    label: "Video",
    path: "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm40.55,110.58-52,36A8,8,0,0,1,104,164V92a8,8,0,0,1,12.55-6.58l52,36a8,8,0,0,1,0,13.16Z",
  },
  audio: {
    Icon: Headphones,
    label: "Audio",
    path: "M232,128v56a24,24,0,0,1-24,24H192a24,24,0,0,1-24-24V144a24,24,0,0,1,24-24h23.65a87.71,87.71,0,0,0-87-80H128a88,88,0,0,0-87.64,80H64a24,24,0,0,1,24,24v40a24,24,0,0,1-24,24H48a24,24,0,0,1-24-24V128A104.11,104.11,0,0,1,201.89,54.66,103.41,103.41,0,0,1,232,128Z",
  },
  image: {
    Icon: Image,
    label: "Image",
    path: "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM156,88a12,12,0,1,1-12,12A12,12,0,0,1,156,88Zm60,112H40V160.69l46.34-46.35a8,8,0,0,1,11.32,0h0L165,181.66a8,8,0,0,0,11.32-11.32l-17.66-17.65L173,138.34a8,8,0,0,1,11.31,0L216,170.07V200Z",
  },
  document: {
    Icon: FileText,
    label: "Document",
    path: "M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,176H96a8,8,0,0,1,0-16h64a8,8,0,0,1,0,16Zm0-32H96a8,8,0,0,1,0-16h64a8,8,0,0,1,0,16Zm-8-56V44l44,44Z",
  },
  quiz: {
    Icon: Brain,
    label: "Quiz",
    path: "M212,76V72a44,44,0,0,0-74.86-31.31,3.93,3.93,0,0,0-1.14,2.8v88.72a4,4,0,0,0,6.2,3.33A47.67,47.67,0,0,1,167.68,128a8.18,8.18,0,0,1,8.31,7.58,8,8,0,0,1-8,8.42,32,32,0,0,0-32,32v33.88a4,4,0,0,0,1.49,3.12,47.92,47.92,0,0,0,74.21-17.16,4,4,0,0,0-4.49-5.56A68.06,68.06,0,0,1,192,192h-7.73a8.18,8.18,0,0,1-8.25-7.47,8,8,0,0,1,8-8.53h8a51.6,51.6,0,0,0,24-5.88v0A52,52,0,0,0,212,76Zm-12,36h-4a36,36,0,0,1-36-36V72a8,8,0,0,1,16,0v4a20,20,0,0,0,20,20h4a8,8,0,0,1,0,16ZM88,28A44.05,44.05,0,0,0,44,72v4a52,52,0,0,0-4,94.12h0A51.6,51.6,0,0,0,64,176h7.73A8.18,8.18,0,0,1,80,183.47,8,8,0,0,1,72,192H64a67.48,67.48,0,0,1-15.21-1.73,4,4,0,0,0-4.5,5.55A47.93,47.93,0,0,0,118.51,213a4,4,0,0,0,1.49-3.12V176a32,32,0,0,0-32-32,8,8,0,0,1-8-8.42A8.18,8.18,0,0,1,88.32,128a47.67,47.67,0,0,1,25.48,7.54,4,4,0,0,0,6.2-3.33V43.49a4,4,0,0,0-1.14-2.81A43.85,43.85,0,0,0,88,28Zm8,48a36,36,0,0,1-36,36H56a8,8,0,0,1,0-16h4A20,20,0,0,0,80,76V72a8,8,0,0,1,16,0Z",
  },
};

function resolveContentTypeIcon(
  contentType: LessonListContentType | string | undefined,
): ContentTypeIconMeta {
  if (contentType && contentType in CONTENT_TYPE_ICONS) {
    return CONTENT_TYPE_ICONS[contentType as LessonListContentType];
  }
  return CONTENT_TYPE_ICONS.video;
}

export function lessonContentTypeIconSvg(
  contentType: LessonListContentType | string | undefined,
): string {
  const { path } = resolveContentTypeIcon(contentType);
  return `<svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
}

export function LessonContentTypeIcon({
  contentType,
  muted = false,
  size = 20,
}: {
  contentType: LessonListContentType | string | undefined;
  muted?: boolean;
  size?: number;
}) {
  const { Icon, label } = resolveContentTypeIcon(contentType);

  return (
    <span
      className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center ${
        muted ? "text-(--accent) opacity-60" : "text-(--accent)"
      }`}
      title={label}
      aria-label={label}
    >
      <Icon size={size} weight="fill" className="block shrink-0" />
    </span>
  );
}
