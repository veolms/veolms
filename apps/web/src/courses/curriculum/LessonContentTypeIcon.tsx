import {
  FileTextIcon as FileText,
  HeadphonesIcon as Headphones,
  ImageIcon as Image,
  PlayCircleIcon as PlayCircle,
  QuestionIcon as Question,
} from "@phosphor-icons/react";
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
    Icon: Question,
    label: "Quiz",
    path: "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,168a12,12,0,1,1,12-12A12,12,0,0,1,128,192Zm8-48.72V144a8,8,0,0,1-16,0v-8a8,8,0,0,1,8-8c13.23,0,24-9,24-20s-10.77-20-24-20-24,9-24,20v4a8,8,0,0,1-16,0v-4c0-19.85,17.94-36,40-36s40,16.15,40,36C168,125.38,154.24,139.93,136,143.28Z",
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
