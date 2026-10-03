import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { BrainIcon as Brain } from "@phosphor-icons/react/Brain";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CloudArrowUpIcon as CloudArrowUp } from "@phosphor-icons/react/CloudArrowUp";
import { DotsThreeIcon as DotsThree } from "@phosphor-icons/react/DotsThree";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/LockKey";
import { PaperclipIcon as Paperclip } from "@phosphor-icons/react/Paperclip";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { ThemedSelect } from "../../ThemedSelect";
import { SettingsToggle } from "../../settings/SettingsControls";
import {
  LessonVideoUpload,
  type LessonVideoUploadHandle,
} from "../lesson-video-upload/LessonVideoUpload";
import {
  LessonContentTypeSelector,
  type StudioLessonContentType,
} from "./LessonContentTypeSelector";
import { LessonMediaWorkspace, type AttachedMediaInfo } from "./LessonMediaWorkspace";
import { LessonResourceIcon } from "../lesson-resources/LessonResourceIcon";
import { mediaService } from "../../services/media";

export interface StudioLessonResourceItem {
  id: string;
  name: string;
  type?: string;
  size?: string;
  mediaAssetId?: string;
}

export interface LessonEditorDraft {
  title: string;
  contentType: StudioLessonContentType;
  isPublished: boolean;
  isPreview: boolean;
}

export interface LessonStudioEditorHandle {
  save: () => void;
  cancel: () => void;
}

export interface LessonStudioEditorProps {
  sectionNumber: number;
  sectionTitle: string;
  lessonNumber: number;
  playbackLessonNumber?: number;
  lessonTitle: string;
  courseSlug?: string;
  courseTitle?: string;
  contentType: StudioLessonContentType;
  isPublished: boolean;
  isPreview: boolean;
  mediaInfo?: AttachedMediaInfo | null;
  resources?: StudioLessonResourceItem[];
  isSaving?: boolean;
  onBack: () => void;
  onCancel?: (draft: LessonEditorDraft) => void;
  onSave: (payload: {
    title: string;
    contentType: StudioLessonContentType;
    isPublished: boolean;
    isPreview: boolean;
  }) => void | Promise<void>;
  onContentTypeChange?: (type: StudioLessonContentType) => void;
  onDeleteLesson?: () => void;
  onPreviewLesson?: () => void;
  onUploadMedia?: (file: File) => void | Promise<void>;
  onMediaAttached?: (mediaAssetId: string) => void | boolean | Promise<void | boolean>;
  onProcessingComplete?: () => void | Promise<void>;
  onChangeVideoClick?: () => void;
  onUploadThumbnail?: (file: File) => void | Promise<void>;
  onAddResourceFile?: (file: File) => void | Promise<void>;
  onDeleteResource?: (resourceId: string) => void | Promise<void>;
  descriptionSection?: ReactNode;
  quizSection?: ReactNode;
  resourcesSection?: ReactNode;
  hideHeader?: boolean;
  playbackSuspended?: boolean;
}

export const LessonStudioEditor = forwardRef<LessonStudioEditorHandle, LessonStudioEditorProps>(
  function LessonStudioEditor(
    {
      sectionNumber,
      sectionTitle,
      lessonNumber,
      playbackLessonNumber,
      lessonTitle: initialTitle,
      courseSlug,
      courseTitle,
      contentType: initialContentType,
      isPublished: initialIsPublished,
      isPreview: initialIsPreview,
      mediaInfo,
      resources = [],
      isSaving = false,
      onBack,
      onCancel,
      onSave,
      onContentTypeChange,
      onDeleteLesson,
      onPreviewLesson,
      onUploadMedia,
      onMediaAttached,
      onProcessingComplete,
      onUploadThumbnail,
      onAddResourceFile,
      onDeleteResource,
      descriptionSection,
      quizSection,
      resourcesSection,
      hideHeader = false,
      playbackSuspended = false,
    }: LessonStudioEditorProps,
    ref,
  ) {
    // Local editable draft state
    const [title, setTitle] = useState(initialTitle);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [contentType, setContentType] = useState<StudioLessonContentType>(initialContentType);
    const [previewFile, setPreviewFile] = useState<File | null>(null);
    // Bumped when processing finishes so the workspace requests playback again.
    const [playbackRevision, setPlaybackRevision] = useState(0);
    // Asset whose generated thumbnail is available while it is still processing.
    const [processingThumbnailMediaId, setProcessingThumbnailMediaId] = useState<string | null>(
      null,
    );
    const [isPublished, setIsPublished] = useState(initialIsPublished);
    const [isPreview, setIsPreview] = useState(initialIsPreview);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [isResourceDragOver, setIsResourceDragOver] = useState(false);
    const [activeContentTab, setActiveContentTab] = useState<"resources" | "description" | "quiz">(
      "resources",
    );

    const resourceFileInputRef = useRef<HTMLInputElement | null>(null);
    const titleInputRef = useRef<HTMLInputElement | null>(null);
    const moreMenuRef = useRef<HTMLDivElement | null>(null);
    const videoUploadRef = useRef<LessonVideoUploadHandle>(null);

    // Sync state if props change from external updates
    useEffect(() => {
      setTitle(initialTitle);
    }, [initialTitle]);

    const attachedMediaId = mediaInfo?.id;
    useEffect(() => {
      setProcessingThumbnailMediaId(null);
    }, [attachedMediaId]);

    const workspaceMediaInfo = useMemo<AttachedMediaInfo | null>(() => {
      if (!processingThumbnailMediaId) return mediaInfo ?? null;
      const thumbnailUrl = mediaService.getVideoThumbnailUrl(processingThumbnailMediaId);
      return mediaInfo ? { ...mediaInfo, thumbnailUrl } : { thumbnailUrl };
    }, [mediaInfo, processingThumbnailMediaId]);

    useEffect(() => {
      setContentType(initialContentType);
    }, [initialContentType]);

    useEffect(() => {
      setIsPublished(initialIsPublished);
    }, [initialIsPublished]);

    useEffect(() => {
      setIsPreview(initialIsPreview);
    }, [initialIsPreview]);

    // Click outside to close more menu
    useEffect(() => {
      if (!showMoreMenu) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
          setShowMoreMenu(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showMoreMenu]);

    const handleContentTypeChange = (type: StudioLessonContentType) => {
      setContentType(type);
      onContentTypeChange?.(type);
    };

    const handleSave = useCallback(() => {
      void onSave({
        title: title.trim() || initialTitle,
        contentType,
        isPublished,
        isPreview,
      });
    }, [contentType, initialTitle, isPreview, isPublished, onSave, title]);

    const handleCancel = useCallback(() => {
      onCancel?.({ title, contentType, isPublished, isPreview });
      onBack();
    }, [contentType, isPreview, isPublished, onBack, onCancel, title]);

    useImperativeHandle(
      ref,
      () => ({
        save: handleSave,
        cancel: handleCancel,
      }),
      [handleCancel, handleSave],
    );

    const handleResourceDrop = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResourceDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && onAddResourceFile) {
        void onAddResourceFile(file);
      }
    };

    const resourcesTabContent = resourcesSection ?? (
      <div className="flex flex-col">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)">
            <Paperclip size={18} weight="bold" className="rotate-45" />
          </div>
          <div>
            <h4 className="m-0 text-[0.85rem] font-bold text-(--text) sm:text-[0.88rem]">
              Resources ({resources.length})
            </h4>
            <p className="m-0 mt-0.5 text-[0.72rem] text-(--muted) sm:text-[0.74rem]">
              Attach files, links, or other resources for this lesson.
            </p>
          </div>
        </div>

        <input
          ref={resourceFileInputRef}
          type="file"
          aria-label="Upload resource file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onAddResourceFile) void onAddResourceFile(file);
          }}
        />

        <div
          onClick={() => resourceFileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsResourceDragOver(true);
          }}
          onDragLeave={() => setIsResourceDragOver(false)}
          onDrop={handleResourceDrop}
          className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-[12px] border-2 border-dashed p-5 text-center transition-all ${
            isResourceDragOver
              ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,var(--surface))]"
          }`}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted)">
            <CloudArrowUp size={20} weight="bold" />
          </div>
          <p className="m-0 mt-2 text-[0.80rem] font-bold text-(--text) sm:text-[0.84rem]">
            Drag and drop files here
          </p>
          <p className="m-0 mt-0.5 text-[0.68rem] text-(--muted) sm:text-[0.70rem]">
            Supports PDFs, documents, images, ZIP files (max 500 MB).
          </p>
        </div>

        {resources.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {resources.map((res) => (
              <div
                key={res.id}
                className="flex items-center justify-between gap-2.5 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--accent)">
                    <LessonResourceIcon name={res.name} type={res.type} className="size-[15px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[0.76rem] font-semibold text-(--text) sm:text-[0.78rem]">
                      {res.name}
                    </p>
                    <p className="m-0 text-[0.66rem] text-(--muted)">{res.size || "1.2 MB"}</p>
                  </div>
                </div>

                {onDeleteResource && (
                  <button
                    type="button"
                    onClick={() => onDeleteResource(res.id)}
                    aria-label="Remove resource"
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-(--muted) transition-colors hover:text-red-500"
                  >
                    <X size={13} weight="bold" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );

    const editorPanel = (
      <div
        className={`animate-in fade-in flex w-full flex-col duration-200 select-none ${
          hideHeader ? "gap-4" : "gap-6"
        }`}
      >
        {/* ========================================================================= */}
        {/* 1. TOP HEADER BAR: Breadcrumbs, Title, Cancel & Save Changes             */}
        {/* ========================================================================= */}
        {!hideHeader && (
          <div className="flex flex-col gap-3.5 pb-2">
            {/* Breadcrumb Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[0.82rem] font-medium text-(--muted) sm:text-[0.86rem]">
                {/* Back Button */}
                <button
                  type="button"
                  onClick={handleCancel}
                  title="Back to Course Content"
                  aria-label="Back to Course Content"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-(--text) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                >
                  <ArrowLeft size={14} weight="bold" />
                </button>

                {/* Breadcrumb links */}
                <button
                  type="button"
                  onClick={onBack}
                  className="font-inherit cursor-pointer border-none bg-transparent p-0 text-inherit transition-colors hover:text-(--text)"
                >
                  Section {sectionNumber}
                </button>
                <CaretRight size={12} className="text-(--muted) opacity-60" />
                <button
                  type="button"
                  onClick={onBack}
                  className="font-inherit max-w-40 cursor-pointer truncate border-none bg-transparent p-0 text-inherit transition-colors hover:text-(--text) sm:max-w-64"
                >
                  {sectionTitle || "Course Content"}
                </button>
                <CaretRight size={12} className="text-(--muted) opacity-60" />
                <span className="font-semibold text-(--text)">Edit Lesson</span>
              </div>

              {/* More Menu Dropdown */}
              <div ref={moreMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoreMenu((prev) => !prev)}
                  aria-label="More lesson options"
                  title="More options"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text)"
                >
                  <DotsThree size={18} weight="bold" />
                </button>

                {showMoreMenu && (
                  <div className="absolute top-full right-0 z-40 mt-1.5 w-44 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface,var(--surface)) p-1.5 text-xs text-(--text) shadow-(--card-floating-shadow)">
                    {onPreviewLesson && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          onPreviewLesson();
                        }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                      >
                        <Eye size={15} />
                        <span>Preview Lesson</span>
                      </button>
                    )}
                    {onDeleteLesson && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          onDeleteLesson();
                        }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-red-500 transition-colors hover:bg-red-500/10"
                      >
                        <Trash size={15} />
                        <span>Delete Lesson</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Title & Action Buttons Row */}
            <div className="flex items-center justify-between gap-4 max-[768px]:flex-col max-[768px]:items-start">
              {/* Lesson Index Badge + Editable Title */}
              <div className="flex w-full min-w-0 flex-1 items-center gap-3">
                {/* Number badge matching image: [ 1 ] */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-sm font-bold text-(--text) shadow-sm sm:h-10 sm:w-10 sm:text-base">
                  {lessonNumber}
                </div>

                {/* Title / Inline Input */}
                {isEditingTitle ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={title}
                      autoFocus
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setIsEditingTitle(false);
                        } else if (e.key === "Escape") {
                          setTitle(initialTitle);
                          setIsEditingTitle(false);
                        }
                      }}
                      className="h-10 min-w-0 flex-1 rounded-[10px] border-2 border-(--accent) bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] px-3 text-base font-bold text-(--text) shadow-sm outline-none sm:text-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(false)}
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--muted) hover:text-(--text)"
                    >
                      <X size={15} weight="bold" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsEditingTitle(true)}
                    className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                  >
                    <h1 className="m-0 truncate text-lg font-bold tracking-[-0.015em] text-(--text) sm:text-xl">
                      {title || "Untitled Lesson"}
                    </h1>
                    <button
                      type="button"
                      aria-label="Edit lesson title"
                      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--muted) opacity-60 transition-all group-hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
                    >
                      <PencilSimple size={15} weight="bold" />
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons: Cancel and Save Changes */}
              <div className="flex shrink-0 items-center gap-2.5 max-[768px]:w-full max-[768px]:justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="inline-flex h-9.5 cursor-pointer items-center justify-center rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_7%,var(--surface))] px-4 text-[0.82rem] font-semibold text-(--text) shadow-sm transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,var(--surface))] active:scale-95 disabled:opacity-50 sm:px-5"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex h-9.5 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-none bg-(--accent) px-5 text-[0.82rem] font-bold text-(--on-accent,#ffffff) shadow-[0_3px_12px_var(--accent-shadow)] transition-all hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_16px_var(--accent-shadow)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? (
                    <>
                      <CircleNotch size={15} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. TWO-COLUMN MAIN STUDIO WORKSPACE                                       */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN: Media Workspace & Settings (7 of 12 cols on desktop) */}
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
            <LessonMediaWorkspace
              contentType={contentType}
              lessonNumber={playbackLessonNumber}
              lessonTitle={title}
              courseSlug={courseSlug}
              courseTitle={courseTitle}
              mediaInfo={workspaceMediaInfo}
              playbackRevision={playbackRevision}
              previewFile={previewFile}
              disabled={isSaving}
              onUploadFile={(file) => {
                if (contentType === "video") {
                  videoUploadRef.current?.open(file);
                  return;
                }
                void onUploadMedia?.(file);
              }}
              videoUploadSection={
                onMediaAttached ? (
                  <LessonVideoUpload
                    ref={videoUploadRef}
                    inline
                    hideTrigger
                    mediaAssetId={mediaInfo?.id}
                    disabled={isSaving}
                    onPreviewFile={setPreviewFile}
                    onMediaAttached={onMediaAttached}
                    onThumbnailAvailable={setProcessingThumbnailMediaId}
                    onProcessingComplete={() => {
                      setPlaybackRevision((revision) => revision + 1);
                      void onProcessingComplete?.();
                    }}
                  />
                ) : null
              }
              onUploadThumbnail={onUploadThumbnail}
              playbackSuspended={playbackSuspended}
            />
          </div>

          {/* RIGHT COLUMN: Content Type, Visibility, Preview, Resources (5 of 12 cols) */}
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
            {/* Card 1: Content Type */}
            <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 shadow-(--card-shadow) sm:rounded-[16px] sm:p-4.5">
              <LessonContentTypeSelector
                value={contentType}
                onChange={handleContentTypeChange}
                disabled={isSaving}
              />
            </div>

            {/* Card 2: Visibility Setting */}
            <div className="flex items-center justify-between rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 shadow-(--card-shadow) sm:rounded-[16px] sm:p-4.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)">
                  <Eye size={18} weight="bold" />
                </div>
                <span className="text-[0.85rem] font-bold text-(--text) sm:text-[0.88rem]">
                  Visibility
                </span>
              </div>

              <div className="w-36 sm:w-40">
                <ThemedSelect
                  value={isPublished ? "published" : "draft"}
                  onValueChange={(val) => setIsPublished(val === "published")}
                  options={[
                    ["published", "Published"],
                    ["draft", "Draft (Hidden)"],
                  ]}
                  disabled={isSaving}
                  ariaLabel="Lesson visibility"
                  triggerClassName="!h-9 !w-full !rounded-[9px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !px-3 !text-[0.80rem] !text-(--text) !bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] font-semibold"
                />
              </div>
            </div>

            {/* Card 3: Free Preview Toggle */}
            <div className="flex items-center justify-between rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 shadow-(--card-shadow) sm:rounded-[16px] sm:p-4.5">
              <div className="flex items-start gap-3 pr-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)">
                  <LockKey size={18} weight="bold" />
                </div>
                <div>
                  <span className="block text-[0.85rem] font-bold text-(--text) sm:text-[0.88rem]">
                    Free Preview
                  </span>
                  <p className="m-0 mt-0.5 text-[0.72rem] leading-relaxed text-(--muted) sm:text-[0.74rem]">
                    Allow prospective students to view this lesson before enrolling or purchasing.
                  </p>
                </div>
              </div>

              <SettingsToggle
                checked={isPreview}
                onChange={setIsPreview}
                label="Toggle free preview"
              />
            </div>
          </div>
        </div>

        {/* Full-width lesson content tabs */}
        <div className="flex w-full flex-col overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) shadow-(--card-shadow) sm:rounded-[16px]">
          <div className="flex items-center border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3">
            <button
              type="button"
              onClick={() => setActiveContentTab("resources")}
              className={`flex cursor-pointer items-center gap-1.5 !rounded-none border-b-2 px-3.5 py-2.5 text-[0.80rem] font-bold transition-colors sm:text-[0.82rem] ${
                activeContentTab === "resources"
                  ? "border-(--accent) text-(--accent)"
                  : "border-transparent text-(--muted) hover:text-(--text)"
              }`}
            >
              <Paperclip size={15} weight="bold" className="rotate-45" />
              <span>Resources</span>
            </button>

            {descriptionSection && (
              <button
                type="button"
                onClick={() => setActiveContentTab("description")}
                className={`flex cursor-pointer items-center gap-1.5 !rounded-none border-b-2 px-3.5 py-2.5 text-[0.80rem] font-bold transition-colors sm:text-[0.82rem] ${
                  activeContentTab === "description"
                    ? "border-(--accent) text-(--accent)"
                    : "border-transparent text-(--muted) hover:text-(--text)"
                }`}
              >
                <FileText size={15} weight="bold" />
                <span>Description</span>
              </button>
            )}

            {quizSection && (
              <button
                type="button"
                onClick={() => setActiveContentTab("quiz")}
                className={`flex cursor-pointer items-center gap-1.5 !rounded-none border-b-2 px-3.5 py-2.5 text-[0.80rem] font-bold transition-colors sm:text-[0.82rem] ${
                  activeContentTab === "quiz"
                    ? "border-(--accent) text-(--accent)"
                    : "border-transparent text-(--muted) hover:text-(--text)"
                }`}
              >
                <Brain size={15} weight="bold" />
                <span>Quiz</span>
              </button>
            )}
          </div>

          <div className="w-full p-4">
            {activeContentTab === "resources" && resourcesTabContent}
            {activeContentTab === "description" && descriptionSection}
            {activeContentTab === "quiz" && quizSection}
          </div>
        </div>
      </div>
    );

    return editorPanel;
  },
);
