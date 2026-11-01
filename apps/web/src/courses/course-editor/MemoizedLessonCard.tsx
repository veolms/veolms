import { useState, useEffect, useRef, memo } from "react";
import type { LessonStudioEditorHandle } from "../curriculum";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import type { CurriculumLessonItem } from "./curriculumItems";

function getLessonDescriptionPreview(description: string) {
  return description
    .replace(/^[#\s>*-]+/gm, "")
    .replace(/[`*_[\]()]/g, "")
    .trim();
}

export function LessonDescriptionPreview({
  description,
  onEdit,
}: {
  description: string;
  onEdit: () => void;
}) {
  const hasDescription = description.trim().length > 0;
  const preview = hasDescription
    ? getLessonDescriptionPreview(description)
    : "No description added yet.";

  return (
    <div className="flex flex-col gap-2 mb-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-(--text-secondary) text-[0.84rem] font-semibold">
          Lesson Description
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-[8px] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-2.5 text-xs font-semibold text-(--accent-ink,var(--accent)) transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          aria-label="Edit description"
        >
          <PencilSimple size={14} weight="bold" />
          Edit Description
        </button>
      </div>
      <p
        data-lesson-description-preview
        className={`m-0 whitespace-pre-line line-clamp-4 overflow-hidden text-sm leading-6 sm:text-[15px] ${hasDescription ? "text-(--text-secondary)" : "italic text-(--muted)"}`}
      >
        {preview}
      </p>
    </div>
  );
}

export function LessonDropIndicator() {
  return (
    <div
      aria-hidden="true"
      className="relative z-10 -my-1 h-0.75 w-full rounded-full bg-(--accent) shadow-[0_0_8px_var(--accent-shadow)]"
    />
  );
}

interface MemoizedLessonCardProps {
  lesson: CurriculumLessonItem;
  sectionId: string;
  lessonIndex: number;
  isDragged: boolean;
  isDragEnabled: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isSectionReordering: boolean;
  isReorderPending: boolean;
  isResourceBusy: boolean;
  isLessonEditorMounted: boolean;
  isUrlFocused: boolean;
  onLessonEditorOpen: (lessonId: string) => void;
  render: (state: {
    isExpanded: boolean;
    setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    isEditorOpen: boolean;
    setEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isQuizOpen: boolean;
    setQuizOpen: React.Dispatch<React.SetStateAction<boolean>>;
    lessonEditorRef: React.RefObject<LessonStudioEditorHandle | null>;
    isLessonEditorMounted: boolean;
    onLessonEditorOpen: (lessonId: string) => void;
  }) => React.ReactElement;
}

export const MemoizedLessonCard = memo(
  function MemoizedLessonCard({
    lesson,
    isLessonEditorMounted,
    isUrlFocused,
    onLessonEditorOpen,
    render,
  }: MemoizedLessonCardProps) {
    const [isExpanded, setExpanded] = useState(lesson.isExpanded);
    const [isEditorOpen, setEditorOpen] = useState(Boolean(lesson.isExpanded));
    const [isQuizOpen, setQuizOpen] = useState(false);
    const lessonEditorRef = useRef<LessonStudioEditorHandle>(null);
    const wasUrlFocusedRef = useRef(isUrlFocused);

    useEffect(() => {
      setExpanded(lesson.isExpanded);
    }, [lesson.isExpanded]);

    useEffect(() => {
      if (isUrlFocused) {
        setExpanded(true);
        setEditorOpen(true);
        onLessonEditorOpen(lesson.id);
      } else if (wasUrlFocusedRef.current) {
        setExpanded(false);
        setEditorOpen(false);
        setQuizOpen(false);
      }
      wasUrlFocusedRef.current = isUrlFocused;
    }, [isUrlFocused, lesson.id, onLessonEditorOpen]);

    return render({
      isExpanded,
      setExpanded,
      isEditorOpen,
      setEditorOpen,
      isQuizOpen,
      setQuizOpen,
      lessonEditorRef,
      isLessonEditorMounted,
      onLessonEditorOpen,
    });
  },
  (previous, next) =>
    previous.lesson === next.lesson &&
    previous.sectionId === next.sectionId &&
    previous.lessonIndex === next.lessonIndex &&
    previous.isDragged === next.isDragged &&
    previous.isDragEnabled === next.isDragEnabled &&
    previous.isSaving === next.isSaving &&
    previous.isDeleting === next.isDeleting &&
    previous.isSectionReordering === next.isSectionReordering &&
    previous.isReorderPending === next.isReorderPending &&
    previous.isResourceBusy === next.isResourceBusy &&
    previous.isLessonEditorMounted === next.isLessonEditorMounted &&
    previous.isUrlFocused === next.isUrlFocused &&
    previous.onLessonEditorOpen === next.onLessonEditorOpen,
);
