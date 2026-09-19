import {
  ArrowLeftIcon as ArrowLeft,
  CaretRightIcon as CaretRight,
  CircleNotchIcon as CircleNotch,
  CloudArrowUpIcon as CloudArrowUp,
  DotsThreeIcon as DotsThree,
  EyeIcon as Eye,
  FileTextIcon as FileText,
  LockKeyIcon as LockKey,
  PaperclipIcon as Paperclip,
  PencilSimpleIcon as PencilSimple,
  TrashIcon as Trash,
  UploadSimpleIcon as UploadSimple,
  XIcon as X,
} from "@phosphor-icons/react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
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
import {
  LessonMediaWorkspace,
  type AttachedMediaInfo,
} from "./LessonMediaWorkspace";

export interface StudioLessonResourceItem {
  id: string;
  name: string;
  type?: string;
  size?: string;
  mediaAssetId?: string;
}

export interface LessonStudioEditorHandle {
  save: () => void;
  cancel: () => void;
}

export interface LessonStudioEditorProps {
  sectionNumber: number;
  sectionTitle: string;
  lessonNumber: number;
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
  onMediaAttached?: (
    mediaAssetId: string,
  ) => void | boolean | Promise<void | boolean>;
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

export const LessonStudioEditor = forwardRef<
  LessonStudioEditorHandle,
  LessonStudioEditorProps
>(function LessonStudioEditor({
  sectionNumber,
  sectionTitle,
  lessonNumber,
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
  onSave,
  onContentTypeChange,
  onDeleteLesson,
  onPreviewLesson,
  onUploadMedia,
  onMediaAttached,
  onProcessingComplete,
  onChangeVideoClick,
  onUploadThumbnail,
  onAddResourceFile,
  onDeleteResource,
  descriptionSection,
  quizSection,
  resourcesSection,
  hideHeader = false,
  playbackSuspended = false,
}: LessonStudioEditorProps, ref) {
  // Local editable draft state
  const [title, setTitle] = useState(initialTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [contentType, setContentType] = useState<StudioLessonContentType>(initialContentType);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [isPreview, setIsPreview] = useState(initialIsPreview);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isResourceDragOver, setIsResourceDragOver] = useState(false);
  const [activeContentTab, setActiveContentTab] = useState<
    "resources" | "description" | "quiz"
  >("resources");

  const resourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const videoUploadRef = useRef<LessonVideoUploadHandle>(null);

  // Sync state if props change from external updates
  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

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

  const handleSave = () => {
    void onSave({
      title: title.trim() || initialTitle,
      contentType,
      isPublished,
      isPreview,
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      cancel: onBack,
    }),
    [onBack, title, contentType, isPublished, isPreview, initialTitle, onSave],
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
          <h4 className="m-0 text-[0.85rem] sm:text-[0.88rem] font-bold text-(--text)">
            Resources ({resources.length})
          </h4>
          <p className="m-0 mt-0.5 text-[0.72rem] sm:text-[0.74rem] text-(--muted)">
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
        <p className="m-0 mt-2 text-[0.80rem] sm:text-[0.84rem] font-bold text-(--text)">
          Drag and drop files here
        </p>
        <p className="m-0 mt-0.5 text-[0.68rem] sm:text-[0.70rem] text-(--muted)">
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
                  <FileText size={15} weight="fill" />
                </div>
                <div className="min-w-0">
                  <p className="m-0 truncate text-[0.76rem] sm:text-[0.78rem] font-semibold text-(--text)">
                    {res.name}
                  </p>
                  <p className="m-0 text-[0.66rem] text-(--muted)">
                    {res.size || "1.2 MB"}
                  </p>
                </div>
              </div>

              {onDeleteResource && (
                <button
                  type="button"
                  onClick={() => onDeleteResource(res.id)}
                  aria-label="Remove resource"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-(--muted) hover:text-red-500 transition-colors cursor-pointer"
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
      className={`flex w-full flex-col select-none animate-in fade-in duration-200 ${
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
          <div className="flex items-center gap-2 text-[0.82rem] sm:text-[0.86rem] text-(--muted) font-medium">
            {/* Back Button */}
            <button
              type="button"
              onClick={onBack}
              title="Back to Course Content"
              aria-label="Back to Course Content"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} weight="bold" />
            </button>

            {/* Breadcrumb links */}
            <button
              type="button"
              onClick={onBack}
              className="hover:text-(--text) transition-colors cursor-pointer bg-transparent border-none p-0 text-inherit font-inherit"
            >
              Section {sectionNumber}
            </button>
            <CaretRight size={12} className="text-(--muted) opacity-60" />
            <button
              type="button"
              onClick={onBack}
              className="hover:text-(--text) transition-colors cursor-pointer bg-transparent border-none p-0 text-inherit font-inherit max-w-40 sm:max-w-64 truncate"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors cursor-pointer"
            >
              <DotsThree size={18} weight="bold" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1.5 z-40 w-44 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface,var(--surface)) p-1.5 text-xs text-(--text) shadow-(--card-floating-shadow)">
                {onPreviewLesson && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onPreviewLesson();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-colors cursor-pointer"
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
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
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
          <div className="flex min-w-0 flex-1 items-center gap-3 w-full">
            {/* Number badge matching image: [ 1 ] */}
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-[12px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-sm sm:text-base font-bold text-(--text) shadow-sm">
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
                  className="h-10 min-w-0 flex-1 rounded-[10px] border-2 border-(--accent) bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] px-3 text-base sm:text-lg font-bold text-(--text) outline-none shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--muted) hover:text-(--text) cursor-pointer"
                >
                  <X size={15} weight="bold" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="group flex min-w-0 flex-1 items-center gap-2 cursor-pointer"
              >
                <h1 className="m-0 truncate text-lg sm:text-xl font-bold tracking-[-0.015em] text-(--text)">
                  {title || "Untitled Lesson"}
                </h1>
                <button
                  type="button"
                  aria-label="Edit lesson title"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-(--muted) opacity-60 group-hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) transition-all cursor-pointer"
                >
                  <PencilSimple size={15} weight="bold" />
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons: Cancel and Save Changes */}
          <div className="flex items-center gap-2.5 shrink-0 max-[768px]:w-full max-[768px]:justify-end">
            <button
              type="button"
              onClick={onBack}
              disabled={isSaving}
              className="inline-flex h-9.5 items-center justify-center rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_7%,var(--surface))] px-4 sm:px-5 text-[0.82rem] font-semibold text-(--text) shadow-sm transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,var(--surface))] active:scale-95 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex h-9.5 items-center justify-center gap-1.5 rounded-[10px] border-none bg-(--accent) px-5 text-[0.82rem] font-bold text-(--on-accent,#ffffff) shadow-[0_3px_12px_var(--accent-shadow)] transition-all hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_16px_var(--accent-shadow)] active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Media Workspace & Settings (7 of 12 cols on desktop) */}
        <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
          <LessonMediaWorkspace
            contentType={contentType}
            lessonNumber={lessonNumber}
            lessonTitle={title}
            courseSlug={courseSlug}
            courseTitle={courseTitle}
            mediaInfo={mediaInfo}
            previewFile={previewFile}
            disabled={isSaving}
            onUploadFile={(file) => {
              if (contentType === "video") {
                videoUploadRef.current?.open(file);
                return;
              }
              void onUploadMedia?.(file);
            }}
            onChangeVideoClick={() => {
              if (contentType === "video") {
                videoUploadRef.current?.open();
                return;
              }
              onChangeVideoClick?.();
            }}
            videoUploadSection={onMediaAttached ? (
              <LessonVideoUpload
                ref={videoUploadRef}
                inline
                hideTrigger
                mediaAssetId={mediaInfo?.id}
                disabled={isSaving}
                onPreviewFile={setPreviewFile}
                onMediaAttached={onMediaAttached}
                onProcessingComplete={() => {
                  void onProcessingComplete?.();
                }}
              />
            ) : null}
            onUploadThumbnail={onUploadThumbnail}
            playbackSuspended={playbackSuspended}
          />
        </div>

        {/* RIGHT COLUMN: Content Type, Visibility, Preview, Resources (5 of 12 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
          {/* Card 1: Content Type */}
          <div className="flex flex-col rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-4.5 shadow-(--card-shadow)">
            <LessonContentTypeSelector
              value={contentType}
              onChange={handleContentTypeChange}
              disabled={isSaving}
            />
          </div>

          {/* Card 2: Visibility Setting */}
          <div className="flex items-center justify-between rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-4.5 shadow-(--card-shadow)">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)">
                <Eye size={18} weight="bold" />
              </div>
              <span className="text-[0.85rem] sm:text-[0.88rem] font-bold text-(--text)">
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
          <div className="flex items-center justify-between rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-4.5 shadow-(--card-shadow)">
            <div className="flex items-start gap-3 pr-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)">
                <LockKey size={18} weight="bold" />
              </div>
              <div>
                <span className="block text-[0.85rem] sm:text-[0.88rem] font-bold text-(--text)">
                  Free Preview
                </span>
                <p className="m-0 mt-0.5 text-[0.72rem] sm:text-[0.74rem] text-(--muted) leading-relaxed">
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
      <div className="flex w-full flex-col overflow-hidden rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) shadow-(--card-shadow)">
        <div className="flex items-center border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3">
          <button
            type="button"
            onClick={() => setActiveContentTab("resources")}
            className={`flex items-center gap-1.5 !rounded-none border-b-2 px-3.5 py-2.5 text-[0.80rem] sm:text-[0.82rem] font-bold cursor-pointer transition-colors ${
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
              className={`flex items-center gap-1.5 !rounded-none border-b-2 px-3.5 py-2.5 text-[0.80rem] sm:text-[0.82rem] font-bold cursor-pointer transition-colors ${
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
              className={`flex items-center gap-1.5 !rounded-none border-b-2 px-3.5 py-2.5 text-[0.80rem] sm:text-[0.82rem] font-bold cursor-pointer transition-colors ${
                activeContentTab === "quiz"
                  ? "border-(--accent) text-(--accent)"
                  : "border-transparent text-(--muted) hover:text-(--text)"
              }`}
            >
              <CaretRight size={15} className="rotate-90" />
              <span>Quiz Assessment</span>
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
});
