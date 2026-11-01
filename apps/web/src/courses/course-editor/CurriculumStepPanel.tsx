import {
  Fragment,
  type LazyExoticComponent,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import {
  LessonResourceManager,
  type LessonResourceItem,
} from "../lesson-resources/LessonResourceManager";
import { LessonDescriptionEditor } from "../CourseDescriptionEditor";
import {
  LessonContentTypeIcon,
  LessonStudioEditor,
  type LessonEditorDraft,
  type StudioLessonContentType,
} from "../curriculum";
import { VirtualizedLessonList } from "../curriculum/VirtualizedLessonList";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/PuzzlePiece";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { VideoIcon as Video } from "@phosphor-icons/react/Video";
import { XIcon as X } from "@phosphor-icons/react/X";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ThemedSelect } from "../../ThemedSelect";
import { SettingsToggle } from "../../settings/SettingsControls";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  CourseEditorDataResponse,
  CreateLessonResourceRequest,
  LessonResource,
  ReorderSectionsRequest,
  CreateCourseSectionRequest,
  ReorderLessonsRequest,
  CreateCourseLessonRequest,
  Permission,
} from "@veolms/contracts";
import { mediaService } from "../../services/media";
import {
  LessonDescriptionPreview,
  LessonDropIndicator,
  MemoizedLessonCard,
} from "./MemoizedLessonCard";
import {
  type CurriculumLessonItem,
  getLessonMediaInfo,
  getCourseWideLessonNumber,
  type CurriculumSectionItem,
  type DraggedLessonState,
  type LessonDropTarget,
} from "./curriculumItems";
import { CurriculumItemStatusIndicator } from "./statusIndicators";
import type { ApiError } from "../../lib/api-error";
import type { PersistLessonOptions } from "./editorLocalTypes";
import { getYoutubeImportTarget } from "../lesson-video-upload/youtube-import-target";
import { useCapabilities } from "../../services/authorization";
import { useAuthStore } from "../../store/auth.store";

export interface CurriculumStepPanelProps {
  editingLessonTarget: { sectionId: string; lessonId: string } | null;
  sections: CurriculumSectionItem[];
  editorData:
    | {
        course: {
          id: string;
          slug: string;
          title: string;
          status: "draft" | "published" | "archived";
          creatorId: string | null;
          version: number;
          createdAt: string;
          updatedAt: string;
          shortDescription?: string | null | undefined;
          description?: string | null | undefined;
          difficulty?:
            "beginner" | "intermediate" | "advanced" | null | undefined;
          categoryId?: string | null | undefined;
          thumbnailMediaId?: string | null | undefined;
          thumbnailUrl?: string | null | undefined;
          thumbnailSrcSet?:
            { url: string; width: number; height: number }[] | undefined;
          trailerMediaId?: string | null | undefined;
          instructorAlias?: string | null | undefined;
          publishedAt?: string | null | undefined;
          totalSections?: number | undefined;
          totalLessons?: number | undefined;
          totalDurationSeconds?: number | undefined;
        };
        sections: {
          id: string;
          title: string;
          position: number;
          lessons?:
            | {
                id: string;
                title: string;
                contentType: "video" | "document" | "quiz";
                position: number;
                isPreview: boolean;
                isPublished: boolean;
                description?: string | null | undefined;
                contentMediaId?: string | null | undefined;
                durationSeconds?: number | undefined;
                resources?:
                  | {
                      id: string;
                      mediaAssetId: string;
                      title: string;
                      mediaAsset?:
                        | {
                            originalFilename: string;
                            mimeType: string;
                            sizeBytes: number;
                            status:
                              | "uploading"
                              | "uploaded"
                              | "processing"
                              | "ready"
                              | "failed";
                          }
                        | undefined;
                    }[]
                  | undefined;
              }[]
            | undefined;
        }[];
        accessRules?:
          | {
              id: string;
              accessType: "everyone" | "restricted";
              durationType: "lifetime" | "fixed_duration" | "custom_expiration";
              durationDays?: number | null | undefined;
            }
          | null
          | undefined;
        pricing?:
          | {
              id: string;
              pricingType: "free" | "paid";
              price: number;
              currency: string;
              salePrice?: number | null | undefined;
              showDiscountBadge?: boolean | undefined;
            }
          | null
          | undefined;
        settings?:
          | {
              id: string;
              allowQa: boolean;
              allowComments: boolean;
              allowDownloads: boolean;
              allowNotes: boolean;
              certificateEnabled: boolean;
              showInstructorName: boolean;
              language: string;
              estimatedDuration?: number | null | undefined;
            }
          | null
          | undefined;
        includes?: { id: string; text: string; position: number }[] | undefined;
      }
    | undefined;
  courseTitle: string;
  savingLessonId: string | null;
  setEditingLessonTarget: Dispatch<
    SetStateAction<{ sectionId: string; lessonId: string } | null>
  >;
  handleCancelLessonDraft: (
    sectionId: string,
    lessonId: string,
    draft: LessonEditorDraft,
  ) => void;
  handleUpdateLesson: (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ) => void;
  persistLesson: (
    sectionId: string,
    lessonId: string,
    options?: PersistLessonOptions,
  ) => Promise<boolean>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  handleDeleteLesson: (sectionId: string, lessonId: string) => void;
  currentCourseId: string | null;
  handleLessonMediaAttached: (
    sectionId: string,
    lessonId: string,
    mediaAssetId: string,
  ) => Promise<boolean>;
  handleLessonProcessingComplete: () => Promise<void>;
  handleCreateLessonResource: (
    lessonId: string,
    payload: CreateLessonResourceRequest,
  ) => Promise<LessonResource>;
  handleLessonResourceAdded: (
    sectionId: string,
    lessonId: string,
    resource: LessonResourceItem,
  ) => void;
  handleDeleteLessonResource: (resourceId: string) => Promise<void>;
  handleLessonResourceRemoved: (
    sectionId: string,
    lessonId: string,
    resource: LessonResourceItem,
  ) => void;
  QuizAuthoringPanel: LazyExoticComponent<
    typeof import("../../quizzes/QuizAuthoringPanel").QuizAuthoringPanel
  >;
  isReorderingSections: boolean;
  reorderSectionsMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderSectionsRequest },
    { previousEditorData?: CourseEditorDataResponse }
  >;
  isCreatingSection: boolean;
  createSectionMutation: UseMutationResult<
    { id: string; title: string },
    ApiError,
    { courseId: string; payload: CreateCourseSectionRequest },
    unknown
  >;
  createCourseMutation: UseMutationResult<
    {
      id: string;
      slug: string;
      title: string;
      version: number;
      instructorAlias?: string | null | undefined;
    },
    ApiError,
    {
      title: string;
      shortDescription?: string | null | undefined;
      description?: string | null | undefined;
      categoryId?: string | null | undefined;
      difficulty?: "beginner" | "intermediate" | "advanced" | null | undefined;
      difficultyLevel?:
        "beginner" | "intermediate" | "advanced" | null | undefined;
      thumbnailMediaId?: string | null | undefined;
      trailerMediaId?: string | null | undefined;
      instructorAlias?: string | null | undefined;
    },
    unknown
  >;
  handleAddSection: () => Promise<void>;
  deletingSectionId: string | null;
  draggedSectionIndex: number | null;
  dragEnabledSectionId: string | null;
  updatingSectionId: string | null;
  handleSectionDragStart: (
    e: React.DragEvent,
    index: number,
    section: CurriculumSectionItem,
  ) => void;
  handleSectionDragOver: (e: React.DragEvent, index: number) => void;
  handleSectionDragEnd: () => Promise<void>;
  sectionHeaderElementsRef: RefObject<Map<string, HTMLDivElement>>;
  handleToggleSectionExpand: (sectionId: string) => Promise<void>;
  setDragEnabledSectionId: Dispatch<SetStateAction<string | null>>;
  handleSaveSectionTitle: (
    sectionId: string,
    newTitle: string,
  ) => Promise<void>;
  handleStartEditSectionTitle: (sectionId: string) => void;
  reorderingLessonsSectionId: string | null;
  getCurriculumItemDisplayStatus: (
    itemId: string,
  ) => "saving" | "saved" | "failed" | null;
  handleDeleteSection: (sectionId: string) => void;
  getCurriculumLessonKey: (lesson: CurriculumLessonItem) => string;
  pinnedVirtualizedLessonIds: Set<string>;
  draggedLessonState: DraggedLessonState | null;
  lessonDropTarget: LessonDropTarget | null;
  dragEnabledLessonId: string | null;
  deletingLessonId: string | null;
  reorderLessonsMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; sectionId: string; payload: ReorderLessonsRequest },
    { previousEditorData?: CourseEditorDataResponse }
  >;
  createLessonResourceMutation: UseMutationResult<
    {
      id: string;
      mediaAssetId: string;
      title: string;
      mediaAsset?:
        | {
            originalFilename: string;
            mimeType: string;
            sizeBytes: number;
            status:
              "uploading" | "uploaded" | "processing" | "ready" | "failed";
          }
        | undefined;
    },
    ApiError,
    {
      courseId: string;
      lessonId: string;
      payload: CreateLessonResourceRequest;
    },
    unknown
  >;
  deleteLessonResourceMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; resourceId: string },
    unknown
  >;
  mountedLessonEditorIds: string[];
  requestedSectionId: string | null;
  requestedLessonId: string | null;
  rememberLessonEditor: (lessonId: string) => void;
  handleToggleLessonExpand: (
    sectionId: string,
    lessonId: string,
    nextExpanded?: boolean,
  ) => Promise<boolean>;
  navigateToCurriculumFocus: (
    sectionId?: string | null,
    lessonId?: string | null,
  ) => void;
  handleLessonDragStart: (
    e: React.DragEvent,
    sectionId: string,
    lessonIndex: number,
    lesson: CurriculumLessonItem,
  ) => void;
  handleLessonDragOver: (
    e: React.DragEvent,
    targetSectionId: string,
    targetLessonId: string,
  ) => void;
  handleLessonDragEnd: () => Promise<void>;
  setDragEnabledLessonId: Dispatch<SetStateAction<string | null>>;
  handleLessonTitleBlur: (sectionId: string, lessonId: string) => Promise<void>;
  handleCancelEditLessonTitle: (sectionId: string, lessonId: string) => void;
  handleStartEditLessonTitle: (sectionId: string, lessonId: string) => void;
  handleCancelLessonDescriptionEdit: (
    sectionId: string,
    lessonId: string,
  ) => void;
  handleLessonFieldBlur: (sectionId: string, lessonId: string) => Promise<void>;
  handleLessonDiscreteChange: (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ) => Promise<boolean>;
  LessonVideoUpload: LazyExoticComponent<
    typeof import("../lesson-video-upload/LessonVideoUpload").LessonVideoUpload
  >;
  creatingLessonSectionId: string | null;
  createLessonMutation: UseMutationResult<
    { id: string },
    ApiError,
    { courseId: string; sectionId: string; payload: CreateCourseLessonRequest },
    unknown
  >;
  handleAddLesson: (sectionId: string) => Promise<void>;
}

export function CurriculumStepPanel({
  editingLessonTarget,
  sections,
  editorData,
  courseTitle,
  savingLessonId,
  setEditingLessonTarget,
  handleCancelLessonDraft,
  handleUpdateLesson,
  persistLesson,
  setToastMessage,
  handleDeleteLesson,
  currentCourseId,
  handleLessonMediaAttached,
  handleLessonProcessingComplete,
  handleCreateLessonResource,
  handleLessonResourceAdded,
  handleDeleteLessonResource,
  handleLessonResourceRemoved,
  QuizAuthoringPanel,
  isReorderingSections,
  reorderSectionsMutation,
  isCreatingSection,
  createSectionMutation,
  createCourseMutation,
  handleAddSection,
  deletingSectionId,
  draggedSectionIndex,
  dragEnabledSectionId,
  updatingSectionId,
  handleSectionDragStart,
  handleSectionDragOver,
  handleSectionDragEnd,
  sectionHeaderElementsRef,
  handleToggleSectionExpand,
  setDragEnabledSectionId,
  handleSaveSectionTitle,
  handleStartEditSectionTitle,
  reorderingLessonsSectionId,
  getCurriculumItemDisplayStatus,
  handleDeleteSection,
  getCurriculumLessonKey,
  pinnedVirtualizedLessonIds,
  draggedLessonState,
  lessonDropTarget,
  dragEnabledLessonId,
  deletingLessonId,
  reorderLessonsMutation,
  createLessonResourceMutation,
  deleteLessonResourceMutation,
  mountedLessonEditorIds,
  requestedSectionId,
  requestedLessonId,
  rememberLessonEditor,
  handleToggleLessonExpand,
  navigateToCurriculumFocus,
  handleLessonDragStart,
  handleLessonDragOver,
  handleLessonDragEnd,
  setDragEnabledLessonId,
  handleLessonTitleBlur,
  handleCancelEditLessonTitle,
  handleStartEditLessonTitle,
  handleCancelLessonDescriptionEdit,
  handleLessonFieldBlur,
  handleLessonDiscreteChange,
  LessonVideoUpload,
  creatingLessonSectionId,
  createLessonMutation,
  handleAddLesson,
}: CurriculumStepPanelProps) {
  // Each action shows only to whoever may take it on this course (a new
  // course is the user's own); the API checks the same key on its route,
  // and on a lesson's PATCH one key per field it changes.
  const capabilities = useCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const editedCourse = editorData?.course ?? {
    creatorId: currentUserId ?? null,
  };
  const may = (permission: Permission) =>
    capabilities.canOnCourse(permission, editedCourse);
  // Sections and lesson resources.
  const editsSections = may("course.curriculum.update");
  const addsLessons = may("lesson.create");
  const editsLessonDetails = may("lesson.details.update");
  const editsLessonContent = may("lesson.content.update");
  const publishesLessons = may("lesson.publish");
  const reordersLessons = may("lesson.reorder");
  const deletesLessons = may("lesson.delete");
  // An uploaded or imported video is attached as the lesson's content.
  const uploadsLessonMedia = editsLessonContent && may("lesson.video.update");
  const importsFromYoutube =
    uploadsLessonMedia && may("lesson.video.import_youtube");
  const opensQuizzes = capabilities.can("quiz.read");

  // prettier-ignore
  return (
    editingLessonTarget &&
    sections.some(
      (s) =>
        s.id === editingLessonTarget.sectionId &&
        s.lessons.some(
          (l) => l.id === editingLessonTarget.lessonId,
        ),
    ) ? (
      (() => {
        const activeSection = sections.find(
          (s) => s.id === editingLessonTarget.sectionId,
        )!;
        const activeLesson = activeSection.lessons.find(
          (l) => l.id === editingLessonTarget.lessonId,
        )!;
        const secIdx = sections.findIndex(
          (s) => s.id === activeSection.id,
        );
        const lesIdx = activeSection.lessons.findIndex(
          (l) => l.id === activeLesson.id,
        );

        return (
          <div className="course-wizard-curriculum-panel flex flex-col gap-4 w-full flex-1 min-h-0">
            <LessonStudioEditor
              sectionNumber={secIdx + 1}
              sectionTitle={activeSection.title}
              lessonNumber={lesIdx + 1}
              playbackLessonNumber={getCourseWideLessonNumber(
                sections,
                activeLesson.id,
              )}
              lessonTitle={activeLesson.title}
              courseSlug={editorData?.course?.slug}
              courseTitle={courseTitle || undefined}
              contentType={
                (activeLesson.contentType as StudioLessonContentType) ||
                "video"
              }
              isPublished={activeLesson.isPublished !== false}
              isPreview={activeLesson.isPreview === true}
              mediaInfo={getLessonMediaInfo(activeLesson)}
              resources={activeLesson.resources.map((r) => ({
                id: r.id,
                name: r.name,
                type: r.type,
                size: r.size,
                mediaAssetId: r.mediaAssetId,
              }))}
              isSaving={savingLessonId === activeLesson.id}
              canEditDetails={editsLessonDetails}
              canEditContent={editsLessonContent}
              canPublish={publishesLessons}
              onBack={() => setEditingLessonTarget(null)}
              onCancel={(draft) =>
                handleCancelLessonDraft(
                  activeSection.id,
                  activeLesson.id,
                  draft,
                )
              }
              onSave={async (payload) => {
                handleUpdateLesson(
                  activeSection.id,
                  activeLesson.id,
                  {
                    title: payload.title,
                    contentType: payload.contentType,
                    isPublished: payload.isPublished,
                    isPreview: payload.isPreview,
                  },
                );
                const saved = await persistLesson(
                  activeSection.id,
                  activeLesson.id,
                  { collapseOnSuccess: false },
                );
                if (saved) {
                  setToastMessage(
                    "Lesson changes saved successfully.",
                  );
                  setEditingLessonTarget(null);
                }
              }}
              onContentTypeChange={(contentType) => {
                handleUpdateLesson(
                  activeSection.id,
                  activeLesson.id,
                  {
                    contentType,
                  },
                );
              }}
              onDeleteLesson={deletesLessons ? () => {
                handleDeleteLesson(
                  activeSection.id,
                  activeLesson.id,
                );
                setEditingLessonTarget(null);
              } : undefined}
              onPreviewLesson={() => {
                if (currentCourseId) {
                  window.open(
                    `/courses/${currentCourseId}`,
                    "_blank",
                  );
                }
              }}
              onMediaAttached={uploadsLessonMedia ? (mediaAssetId) =>
                handleLessonMediaAttached(
                  activeSection.id,
                  activeLesson.id,
                  mediaAssetId,
                ) : undefined
              }
              youtubeImport={importsFromYoutube ? getYoutubeImportTarget(
                currentCourseId,
                activeLesson.id,
                activeLesson.isPendingCreation,
              ) : null}
              onProcessingComplete={() =>
                handleLessonProcessingComplete()
              }
              onUploadMedia={uploadsLessonMedia ? async (file) => {
                try {
                  const presigned =
                    await mediaService.presignMediaUpload({
                      filename: file.name,
                      contentType:
                        file.type || "application/octet-stream",
                      fileSize: file.size,
                      type:
                        activeLesson.contentType === "image"
                          ? "image"
                          : activeLesson.contentType === "document"
                            ? "document"
                            : "video",
                      visibility: "protected",
                    });
                  await mediaService.uploadFileToPresignedUrl(
                    presigned.uploadUrl,
                    file,
                  );
                  await mediaService.confirmUpload(
                    presigned.mediaAssetId,
                  );
                  const attached = await handleLessonMediaAttached(
                    activeSection.id,
                    activeLesson.id,
                    presigned.mediaAssetId,
                  );
                  // A failed attach has already shown its own error.
                  if (!attached) return;
                  setToastMessage(
                    "Media uploaded and attached successfully.",
                  );
                } catch (err: unknown) {
                  setToastMessage(
                    err instanceof Error
                      ? err.message
                      : "Media upload failed.",
                  );
                }
              } : undefined}
              onAddResourceFile={editsSections ? async (file) => {
                try {
                  const presigned =
                    await mediaService.presignMediaUpload({
                      filename: file.name,
                      contentType:
                        file.type || "application/octet-stream",
                      fileSize: file.size,
                      type: "document",
                      visibility: "protected",
                    });
                  await mediaService.uploadFileToPresignedUrl(
                    presigned.uploadUrl,
                    file,
                  );
                  await mediaService.confirmUpload(
                    presigned.mediaAssetId,
                  );
                  const created = await handleCreateLessonResource(
                    activeLesson.id,
                    {
                      title: file.name,
                      mediaAssetId: presigned.mediaAssetId,
                    },
                  );
                  handleLessonResourceAdded(
                    activeSection.id,
                    activeLesson.id,
                    {
                      id: created.id,
                      name: created.title,
                      type: "document",
                      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
                      mediaAssetId: created.mediaAssetId,
                    },
                  );
                  setToastMessage(
                    "Resource attached successfully.",
                  );
                } catch (err: unknown) {
                  setToastMessage(
                    err instanceof Error
                      ? err.message
                      : "Resource upload failed.",
                  );
                }
              } : undefined}
              onDeleteResource={editsSections ? async (resId) => {
                try {
                  await handleDeleteLessonResource(resId);
                  const resItem = activeLesson.resources.find(
                    (r) => r.id === resId,
                  );
                  if (resItem) {
                    handleLessonResourceRemoved(
                      activeSection.id,
                      activeLesson.id,
                      resItem,
                    );
                  }
                  setToastMessage("Resource removed.");
                } catch (err: unknown) {
                  setToastMessage(
                    err instanceof Error
                      ? err.message
                      : "Could not remove resource.",
                  );
                }
              } : undefined}
              descriptionSection={
                <div className="flex flex-col gap-2">
                  <LessonDescriptionEditor
                    id={`lesson-description-${activeLesson.id}`}
                    disabled={
                      !editsLessonDetails ||
                      activeLesson.isPendingCreation ||
                      savingLessonId === activeLesson.id
                    }
                    value={activeLesson.description}
                    onChange={(val) =>
                      handleUpdateLesson(
                        activeSection.id,
                        activeLesson.id,
                        { description: val },
                      )
                    }
                    placeholder="Add a detailed description of what students will learn in this lesson..."
                    maxLength={10000}
                  />
                </div>
              }
              quizSection={
                !opensQuizzes ? undefined : currentCourseId &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  activeLesson.id,
                ) ? (
                  <QuizAuthoringPanel
                    courseId={currentCourseId}
                    lessonId={activeLesson.id}
                    lessonTitle={activeLesson.title}
                    onQuizDeleted={() => {}}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-4 text-sm text-(--muted)">
                    Save the course and lesson before configuring an
                    attached Quiz.
                  </div>
                )
              }
            />
          </div>
        );
      })()
    ) : (
      <div className="course-wizard-curriculum-panel flex flex-col gap-4 w-full flex-1 min-h-0">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3">
          <div className="">
            <h2 className="m-0 text-(--text) text-[1.25rem] font-bold tracking-[-0.015em]">
              Course Curriculum
            </h2>
            <p className="m-0 mt-1 text-(--muted) text-[0.85rem]">
              Organize your course into sections and lessons. You
              can reorder them anytime.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {(isReorderingSections ||
              reorderSectionsMutation.isPending) && (
              <span className="inline-flex items-center gap-1 text-(--accent) text-[0.74rem] font-bold px-2.5 py-1 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span>Saving section order...</span>
              </span>
            )}
            <button
              type="button"
              hidden={!editsSections}
              disabled={
                isCreatingSection ||
                createSectionMutation.isPending ||
                createCourseMutation.isPending ||
                isReorderingSections ||
                reorderSectionsMutation.isPending
              }
              style={{
                fontSize: "0.80rem",
                fontWeight: 700,
                height: "34px",
                borderRadius: "8px",
                gap: "6px",
                paddingLeft: "16px",
                paddingRight: "16px",
              }}
              className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:whitespace-nowrap max-[768px]:self-start"
              onClick={handleAddSection}
            >
              {isCreatingSection ||
              createSectionMutation.isPending ||
              createCourseMutation.isPending ? (
                <>
                  <CircleNotch size={15} className="animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus size={15} weight="bold" />
                  <span>Add Section</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sections list or Empty State */}
        {sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 min-h-[420px] p-8 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent) mb-3.5">
              <BookOpen size={24} weight="bold" />
            </div>
            <h3 className="m-0 text-(--text) text-[1.05rem] font-bold">
              No sections added yet
            </h3>
            <p className="m-0 mt-1.5 max-w-[320px] text-(--muted) text-[0.84rem]">
              Add your first section to start building your course
              curriculum.
            </p>
            <button
              type="button"
              hidden={!editsSections}
              disabled={
                isCreatingSection ||
                createSectionMutation.isPending ||
                createCourseMutation.isPending ||
                isReorderingSections ||
                reorderSectionsMutation.isPending
              }
              style={{
                fontSize: "0.80rem",
                fontWeight: 700,
                height: "34px",
                borderRadius: "8px",
                gap: "6px",
                paddingLeft: "16px",
                paddingRight: "16px",
                marginTop: "18px",
              }}
              className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleAddSection}
            >
              {isCreatingSection ||
              createSectionMutation.isPending ||
              createCourseMutation.isPending ? (
                <>
                  <CircleNotch size={15} className="animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus size={15} weight="bold" />
                  <span>Add Section</span>
                </>
              )}
            </button>
          </div>
        ) : (
          sections.map((sec, secIndex) => (
            <div
              key={sec.id}
              className={`border rounded-[14px] bg-(--surface) shadow-(--card-shadow) overflow-hidden transition-[border-color,box-shadow,opacity] duration-150 ${
                deletingSectionId === sec.id
                  ? "opacity-45 pointer-events-none border-red-500/30"
                  : draggedSectionIndex === secIndex
                    ? "opacity-35 border-dashed border-(--accent)"
                    : "border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
              }`}
              draggable={
                editsSections &&
                dragEnabledSectionId === sec.id &&
                !sec.isPendingCreation &&
                !updatingSectionId &&
                !deletingSectionId &&
                !isReorderingSections &&
                !reorderSectionsMutation.isPending
              }
              onDragStart={(e) =>
                handleSectionDragStart(e, secIndex, sec)
              }
              onDragOver={(e) => handleSectionDragOver(e, secIndex)}
              onDragEnd={handleSectionDragEnd}
            >
              {/* Section Header */}
              <div
                ref={(element) => {
                  if (element) {
                    sectionHeaderElementsRef.current.set(
                      sec.id,
                      element,
                    );
                  } else {
                    sectionHeaderElementsRef.current.delete(sec.id);
                  }
                }}
                className="flex items-center justify-between px-[18px] py-3.5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] select-none cursor-pointer max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[12px_14px]"
                onClick={() => handleToggleSectionExpand(sec.id)}
                title="Click to toggle section"
              >
                <div className="flex items-center gap-3 max-[768px]:flex-1 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:gap-2">
                  <span
                    hidden={!editsSections}
                    className={`flex items-center justify-center text-(--muted) transition-opacity duration-150 ${
                      sec.isPendingCreation ||
                      isReorderingSections ||
                      reorderSectionsMutation.isPending
                        ? "opacity-25 cursor-not-allowed pointer-events-none"
                        : "cursor-grab opacity-60 hover:opacity-100"
                    }`}
                    title={
                      sec.isPendingCreation
                        ? "Creating section..."
                        : isReorderingSections ||
                            reorderSectionsMutation.isPending
                          ? "Reordering in progress..."
                          : "Drag to reorder section"
                    }
                    onMouseEnter={() => {
                      if (
                        !sec.isPendingCreation &&
                        !isReorderingSections &&
                        !reorderSectionsMutation.isPending
                      ) {
                        setDragEnabledSectionId(sec.id);
                      }
                    }}
                    onMouseLeave={() => {
                      if (draggedSectionIndex === null)
                        setDragEnabledSectionId(null);
                    }}
                    onMouseDown={() => {
                      if (
                        !sec.isPendingCreation &&
                        !isReorderingSections &&
                        !reorderSectionsMutation.isPending
                      ) {
                        setDragEnabledSectionId(sec.id);
                      }
                    }}
                    onMouseUp={() => {
                      if (draggedSectionIndex === null)
                        setDragEnabledSectionId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DotsSixVertical size={18} />
                  </span>
                  <div className="flex items-center gap-2.5 max-[768px]:flex-1 max-[768px]:min-w-0 max-[768px]:flex-wrap max-[768px]:gap-1.5">
                    <span className="text-(--text) text-[0.92rem] font-bold max-[768px]:whitespace-nowrap max-[768px]:shrink-0">
                      Section {secIndex + 1}
                    </span>
                    {sec.isEditingTitle ? (
                      <div
                        className="flex items-center gap-2 max-[768px]:w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          className="border border-(--accent) rounded-md px-2 py-0.75 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                          defaultValue={sec.title}
                          autoFocus
                          disabled={
                            sec.isPendingCreation ||
                            updatingSectionId === sec.id
                          }
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) =>
                            handleSaveSectionTitle(
                              sec.id,
                              e.target.value,
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <span
                        className={`text-(--text) text-[0.92rem] font-semibold max-[768px]:break-words max-[768px]:min-w-0 ${
                          sec.isPendingCreation ||
                          updatingSectionId === sec.id ||
                          deletingSectionId === sec.id
                            ? "opacity-60 pointer-events-none"
                            : ""
                        }`}
                        onClick={editsSections ? (e) => {
                          e.stopPropagation();
                          if (
                            sec.isPendingCreation ||
                            updatingSectionId === sec.id ||
                            deletingSectionId === sec.id
                          )
                            return;
                          handleStartEditSectionTitle(sec.id);
                        } : undefined}
                        title={
                          sec.isPendingCreation
                            ? "Creating section..."
                            : editsSections
                              ? "Click to edit section title"
                              : undefined
                        }
                      >
                        {sec.title}
                      </span>
                    )}
                    <span className="ml-1 text-(--muted) text-[0.76rem] font-normal">
                      {sec.lessons.length}{" "}
                      {sec.lessons.length === 1
                        ? "Lesson"
                        : "Lessons"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 max-[768px]:w-full max-[768px]:justify-between max-[768px]:pt-2 max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  {sec.isPendingCreation ? (
                    <span className="inline-flex items-center gap-1 text-(--accent) text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                      <CircleNotch
                        size={12}
                        className="animate-spin text-(--accent)"
                      />
                      <span>Creating...</span>
                    </span>
                  ) : deletingSectionId === sec.id ? (
                    <span className="inline-flex items-center gap-1 text-red-400 text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/28">
                      <CircleNotch
                        size={12}
                        className="animate-spin text-red-400"
                      />
                      <span>Deleting...</span>
                    </span>
                  ) : reorderingLessonsSectionId === sec.id ? (
                    <span className="inline-flex items-center gap-1 text-(--accent) text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                      <CircleNotch
                        size={12}
                        className="animate-spin text-(--accent)"
                      />
                      <span>Saving order...</span>
                    </span>
                  ) : (
                    <CurriculumItemStatusIndicator
                      status={getCurriculumItemDisplayStatus(
                        sec.id,
                      )}
                      testId={`curriculum-status-section-${sec.id}`}
                    />
                  )}
                  <button
                    type="button"
                    hidden={!editsSections}
                    disabled={
                      sec.isPendingCreation ||
                      updatingSectionId === sec.id ||
                      deletingSectionId === sec.id
                    }
                    className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] transition-[color,background-color,border-color] duration-150 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                    aria-label="Edit section title"
                    title="Edit section title"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditSectionTitle(sec.id);
                    }}
                  >
                    {updatingSectionId === sec.id ? (
                      <CircleNotch
                        size={14}
                        className="animate-spin text-(--accent)"
                      />
                    ) : (
                      <PencilSimple size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    hidden={!editsSections}
                    disabled={
                      sec.isPendingCreation ||
                      deletingSectionId === sec.id ||
                      updatingSectionId === sec.id
                    }
                    className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all duration-150 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                    aria-label="Delete section"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSection(sec.id);
                    }}
                  >
                    {deletingSectionId === sec.id ? (
                      <CircleNotch
                        size={14}
                        className="animate-spin text-red-400"
                      />
                    ) : (
                      <Trash size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={deletingSectionId === sec.id}
                    className={`inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] transition-all duration-150 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none [&>svg]:transition-transform [&>svg]:duration-200 ${
                      sec.isExpanded
                        ? "is-expanded [&>svg]:rotate-180"
                        : ""
                    }`}
                    aria-label={
                      sec.isExpanded
                        ? "Collapse section"
                        : "Expand section"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSectionExpand(sec.id);
                    }}
                  >
                    <CaretDown size={15} />
                  </button>
                </div>
              </div>

              {/* Section Body with CSS expand transition */}
              <div
                className={`grid transition-[grid-template-rows] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  sec.isExpanded
                    ? "is-open grid-rows-[1fr]"
                    : "grid-rows-[0fr]"
                }`}
              >
                <div
                  className={`min-h-0 overflow-hidden border-t border-transparent transition-[padding,border-color] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    sec.isExpanded
                      ? "px-4 pt-3 pb-4 border-t-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                      : "px-4 py-0"
                  }`}
                >
                  {sec.isExpanded && (
                    <VirtualizedLessonList
                      items={sec.lessons}
                      getItemKey={getCurriculumLessonKey}
                      pinnedItemIds={pinnedVirtualizedLessonIds}
                      estimatedItemSize={168}
                      itemGap={10}
                      renderItem={(les, lesIndex) => {
                        const isDraggedLesson =
                          draggedLessonState?.sectionId ===
                            sec.id &&
                          draggedLessonState.lessonId === les.id;
                        const isDropBefore =
                          lessonDropTarget?.sectionId === sec.id &&
                          lessonDropTarget.lessonId === les.id &&
                          lessonDropTarget.position === "before" &&
                          !isDraggedLesson;
                        const isDropAfter =
                          lessonDropTarget?.sectionId === sec.id &&
                          lessonDropTarget.lessonId === les.id &&
                          lessonDropTarget.position === "after" &&
                          !isDraggedLesson;

                        return (
                          <Fragment key={les.id}>
                            {isDropBefore && (
                              <LessonDropIndicator />
                            )}
                            <MemoizedLessonCard
                              lesson={les}
                              sectionId={sec.id}
                              lessonIndex={lesIndex}
                              isDragged={isDraggedLesson}
                              isDragEnabled={
                                dragEnabledLessonId === les.id
                              }
                              isSaving={savingLessonId === les.id}
                              isDeleting={
                                deletingLessonId === les.id
                              }
                              isSectionReordering={Boolean(
                                reorderingLessonsSectionId,
                              )}
                              isReorderPending={
                                reorderLessonsMutation.isPending
                              }
                              isResourceBusy={
                                createLessonResourceMutation.isPending ||
                                deleteLessonResourceMutation.isPending
                              }
                              isLessonEditorMounted={mountedLessonEditorIds.includes(
                                les.id,
                              )}
                              isUrlFocused={
                                requestedSectionId === sec.id &&
                                requestedLessonId === les.id
                              }
                              onLessonEditorOpen={
                                rememberLessonEditor
                              }
                              render={({
                                isExpanded,
                                setExpanded,
                                isEditorOpen,
                                setEditorOpen,
                                isQuizOpen,
                                setQuizOpen,
                                lessonEditorRef,
                                isLessonEditorMounted,
                                onLessonEditorOpen,
                              }) => {
                                const shouldKeepEditorMounted =
                                  isEditorOpen ||
                                  isLessonEditorMounted;
                                const toggleLesson = async () => {
                                  const nextExpanded = !isExpanded;
                                  if (nextExpanded) {
                                    setExpanded(true);
                                    setEditorOpen(true);
                                    onLessonEditorOpen(les.id);
                                  }
                                  const canToggle =
                                    await handleToggleLessonExpand(
                                      sec.id,
                                      les.id,
                                      nextExpanded,
                                    );
                                  if (!canToggle) {
                                    setExpanded(isExpanded);
                                    if (nextExpanded)
                                      setEditorOpen(false);
                                  } else if (!nextExpanded) {
                                    setExpanded(false);
                                    setEditorOpen(false);
                                    setQuizOpen(false);
                                  }
                                  if (canToggle) {
                                    navigateToCurriculumFocus(
                                      nextExpanded ? sec.id : null,
                                      nextExpanded ? les.id : null,
                                    );
                                  }
                                };

                                return (
                                  <div
                                    style={{ contain: "layout" }}
                                    className={`border rounded-[10px] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] shadow-(--card-shadow) overflow-hidden transition-[border-color,box-shadow,opacity] duration-150 ${
                                      isDraggedLesson
                                        ? "opacity-35 border-dashed border-(--accent)"
                                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                                    }`}
                                    draggable={
                                      reordersLessons &&
                                      dragEnabledLessonId ===
                                        les.id &&
                                      !les.isPendingCreation &&
                                      !reorderingLessonsSectionId &&
                                      !reorderLessonsMutation.isPending
                                    }
                                    onDragStart={(e) => {
                                      e.stopPropagation();
                                      handleLessonDragStart(
                                        e,
                                        sec.id,
                                        lesIndex,
                                        les,
                                      );
                                    }}
                                    onDragOver={(e) => {
                                      e.stopPropagation();
                                      handleLessonDragOver(
                                        e,
                                        sec.id,
                                        les.id,
                                      );
                                    }}
                                    onDragEnd={(e) => {
                                      e.stopPropagation();
                                      void handleLessonDragEnd();
                                    }}
                                  >
                                    <>
                                      {/* Lesson Header */}
                                      <div
                                        className="flex items-center justify-between px-4 py-3 select-none cursor-pointer max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[10px_12px]"
                                        onClick={() =>
                                          void toggleLesson()
                                        }
                                        title="Expand lesson editor"
                                      >
                                        <div className="flex min-w-0 flex-1 items-center gap-2.5 max-[768px]:w-full max-[768px]:gap-2">
                                          <span
                                            hidden={!reordersLessons}
                                            className={`flex items-center justify-center text-(--muted) transition-opacity duration-150 ${
                                              les.isPendingCreation ||
                                              reorderingLessonsSectionId ||
                                              reorderLessonsMutation.isPending
                                                ? "opacity-25 cursor-not-allowed pointer-events-none"
                                                : "cursor-grab opacity-60 hover:opacity-100"
                                            }`}
                                            title={
                                              les.isPendingCreation
                                                ? "Creating lesson..."
                                                : reorderingLessonsSectionId ||
                                                    reorderLessonsMutation.isPending
                                                  ? "Reordering in progress..."
                                                  : "Drag to reorder lesson"
                                            }
                                            onMouseEnter={() => {
                                              if (
                                                !les.isPendingCreation &&
                                                !reorderingLessonsSectionId &&
                                                !reorderLessonsMutation.isPending
                                              ) {
                                                setDragEnabledLessonId(
                                                  les.id,
                                                );
                                              }
                                            }}
                                            onMouseLeave={() => {
                                              if (
                                                !draggedLessonState
                                              )
                                                setDragEnabledLessonId(
                                                  null,
                                                );
                                            }}
                                            onMouseDown={() => {
                                              if (
                                                !les.isPendingCreation &&
                                                !reorderingLessonsSectionId &&
                                                !reorderLessonsMutation.isPending
                                              ) {
                                                setDragEnabledLessonId(
                                                  les.id,
                                                );
                                              }
                                            }}
                                            onMouseUp={() => {
                                              if (
                                                !draggedLessonState
                                              )
                                                setDragEnabledLessonId(
                                                  null,
                                                );
                                            }}
                                            onClick={(e) =>
                                              e.stopPropagation()
                                            }
                                          >
                                            <DotsSixVertical
                                              size={18}
                                            />
                                          </span>
                                          <LessonContentTypeIcon
                                            contentType={
                                              les.pendingContentType ||
                                              les.contentType
                                            }
                                          />
                                          {les.isEditingTitle ? (
                                            <div
                                              className="flex min-w-0 flex-1 items-center gap-2"
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                            >
                                              <span className="shrink-0 text-(--text) text-[0.88rem] font-medium">
                                                {lesIndex + 1}.{" "}
                                              </span>
                                              <input
                                                id={`les-title-${les.id}`}
                                                type="text"
                                                data-fixed-radius
                                                maxLength={120}
                                                value={les.title}
                                                autoFocus
                                                style={{
                                                  fontFamily:
                                                    "inherit",
                                                  fontSize:
                                                    "0.88rem",
                                                  fontWeight: 500,
                                                  lineHeight: 1.5,
                                                  borderRadius:
                                                    "6px",
                                                }}
                                                disabled={
                                                  les.isPendingCreation ||
                                                  savingLessonId ===
                                                    les.id
                                                }
                                                onChange={(e) =>
                                                  handleUpdateLesson(
                                                    sec.id,
                                                    les.id,
                                                    {
                                                      title:
                                                        e.target
                                                          .value,
                                                    },
                                                  )
                                                }
                                                onBlur={() => {
                                                  void handleLessonTitleBlur(
                                                    sec.id,
                                                    les.id,
                                                  );
                                                }}
                                                onKeyDown={(e) => {
                                                  if (
                                                    e.key ===
                                                    "Enter"
                                                  ) {
                                                    e.preventDefault();
                                                    e.currentTarget.blur();
                                                  } else if (
                                                    e.key ===
                                                    "Escape"
                                                  ) {
                                                    e.preventDefault();
                                                    handleCancelEditLessonTitle(
                                                      sec.id,
                                                      les.id,
                                                    );
                                                  }
                                                }}
                                                placeholder="e.g. Introduction to React Hooks"
                                                className="h-7 min-w-0 flex-1 border border-[color-mix(in_srgb,var(--accent)_52%,transparent)] rounded-[6px] px-2 py-0.5 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] font-medium leading-[1.5] outline-none [font-family:inherit] focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed"
                                              />
                                              <button
                                                type="button"
                                                aria-label="Cancel lesson title edit"
                                                title="Cancel title edit"
                                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-(--muted) transition-colors hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:text-(--text)"
                                                onMouseDown={(
                                                  e,
                                                ) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCancelEditLessonTitle(
                                                    sec.id,
                                                    les.id,
                                                  );
                                                }}
                                              >
                                                <X size={14} />
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="group/title flex min-w-0 flex-1 items-center gap-1.5">
                                              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-(--text) text-[0.88rem] font-medium cursor-pointer">
                                                {lesIndex + 1}.{" "}
                                                {les.title}
                                              </span>
                                              <button
                                                type="button"
                                                hidden={!editsLessonDetails}
                                                aria-label="Edit lesson title"
                                                title="Edit lesson title"
                                                disabled={
                                                  les.isPendingCreation
                                                }
                                                className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-transparent bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--muted) opacity-0 transition-[opacity,color,background-color] duration-150 group-hover/title:opacity-100 group-focus-within/title:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:text-(--text) focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-30"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleStartEditLessonTitle(
                                                    sec.id,
                                                    les.id,
                                                  );
                                                }}
                                              >
                                                <PencilSimple
                                                  size={14}
                                                  weight="bold"
                                                />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 max-[768px]:w-full max-[768px]:justify-between max-[768px]:pt-2 max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                                          {les.isPendingCreation ? (
                                            <span className="inline-flex items-center gap-1 text-(--accent) text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                                              <CircleNotch
                                                size={12}
                                                className="animate-spin text-(--accent)"
                                              />
                                              <span>
                                                Creating...
                                              </span>
                                            </span>
                                          ) : deletingLessonId ===
                                            les.id ? (
                                            <span className="inline-flex items-center gap-1 text-red-400 text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/28">
                                              <CircleNotch
                                                size={12}
                                                className="animate-spin text-red-400"
                                              />
                                              <span>
                                                Deleting...
                                              </span>
                                            </span>
                                          ) : (
                                            <CurriculumItemStatusIndicator
                                              status={getCurriculumItemDisplayStatus(
                                                les.id,
                                              )}
                                              testId={`curriculum-status-lesson-${les.id}`}
                                            />
                                          )}
                                          {les.isPublished ===
                                            false && (
                                            <span
                                              className="inline-flex items-center gap-1 text-[#f59e0b] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,#f59e0b_12%,transparent)] border border-[color-mix(in_srgb,#f59e0b_28%,transparent)]"
                                              title="Draft mode: This lesson is not published and is hidden from students."
                                            >
                                              <EyeSlash
                                                size={13}
                                                weight="bold"
                                              />{" "}
                                              Unpublished
                                            </span>
                                          )}
                                          {isEditorOpen && (
                                            <>
                                              <button
                                                type="button"
                                                disabled={
                                                  savingLessonId ===
                                                    les.id ||
                                                  deletingLessonId ===
                                                    les.id
                                                }
                                                className="inline-flex h-7 items-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-2.5 text-[14px]! font-[700]! text-(--text) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  lessonEditorRef.current?.cancel();
                                                }}
                                              >
                                                Cancel
                                              </button>
                                              <button
                                                type="button"
                                                disabled={
                                                  savingLessonId ===
                                                    les.id ||
                                                  deletingLessonId ===
                                                    les.id
                                                }
                                                className="inline-flex h-7 items-center rounded-[8px] bg-(--accent) px-2.5 text-[14px]! font-[700]! text-(--on-accent,#ffffff) shadow-[0_2px_8px_var(--accent-shadow)] transition-colors hover:bg-(--accent-hover,var(--accent)) disabled:cursor-not-allowed disabled:opacity-50"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  lessonEditorRef.current?.save();
                                                }}
                                              >
                                                Save
                                              </button>
                                            </>
                                          )}
                                          <button
                                            type="button"
                                            hidden={!deletesLessons}
                                            disabled={
                                              les.isPendingCreation ||
                                              deletingLessonId ===
                                                les.id
                                            }
                                            className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all duration-150 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                            aria-label="Delete lesson"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteLesson(
                                                sec.id,
                                                les.id,
                                              );
                                            }}
                                          >
                                            {deletingLessonId ===
                                            les.id ? (
                                              <CircleNotch
                                                size={14}
                                                className="animate-spin text-red-400"
                                              />
                                            ) : (
                                              <Trash size={15} />
                                            )}
                                          </button>
                                          <button
                                            type="button"
                                            className={`inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] transition-all duration-150 bg-transparent cursor-pointer p-0 [&>svg]:transition-transform [&>svg]:duration-200 ${
                                              isExpanded
                                                ? "is-expanded [&>svg]:rotate-180"
                                                : ""
                                            }`}
                                            aria-label={
                                              isExpanded
                                                ? "Collapse lesson editor"
                                                : "Expand lesson editor"
                                            }
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void toggleLesson();
                                            }}
                                          >
                                            <CaretDown size={15} />
                                          </button>
                                        </div>
                                      </div>

                                      {(isExpanded ||
                                        shouldKeepEditorMounted) && (
                                        <div
                                          aria-hidden={!isExpanded}
                                          className={
                                            isExpanded
                                              ? undefined
                                              : "hidden"
                                          }
                                        >
                                          {les.isPendingCreation ? (
                                            <div className="flex min-h-48 items-center justify-center border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-5 py-8">
                                              <div className="flex items-center gap-2 text-(--muted) text-[0.86rem] font-semibold">
                                                <CircleNotch
                                                  size={16}
                                                  className="animate-spin text-(--accent)"
                                                />
                                                Creating lesson...
                                              </div>
                                            </div>
                                          ) : shouldKeepEditorMounted ? (
                                            <div className="border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-5 py-5 max-[768px]:p-[14px_12px_16px]">
                                              <LessonStudioEditor
                                                ref={
                                                  lessonEditorRef
                                                }
                                                hideHeader
                                                sectionNumber={
                                                  sections.findIndex(
                                                    (item) =>
                                                      item.id ===
                                                      sec.id,
                                                  ) + 1
                                                }
                                                sectionTitle={
                                                  sec.title
                                                }
                                                lessonNumber={
                                                  lesIndex + 1
                                                }
                                                playbackLessonNumber={getCourseWideLessonNumber(
                                                  sections,
                                                  les.id,
                                                )}
                                                lessonTitle={
                                                  les.title
                                                }
                                                courseSlug={
                                                  editorData?.course
                                                    ?.slug
                                                }
                                                courseTitle={
                                                  courseTitle ||
                                                  undefined
                                                }
                                                contentType={
                                                  (les.contentType as StudioLessonContentType) ||
                                                  "video"
                                                }
                                                isPublished={
                                                  les.isPublished !==
                                                  false
                                                }
                                                isPreview={
                                                  les.isPreview ===
                                                  true
                                                }
                                                playbackSuspended={
                                                  !isExpanded
                                                }
                                                mediaInfo={getLessonMediaInfo(
                                                  les,
                                                )}
                                                resources={les.resources.map(
                                                  (resource) => ({
                                                    id: resource.id,
                                                    name: resource.name,
                                                    type: resource.type,
                                                    size: resource.size,
                                                    mediaAssetId:
                                                      resource.mediaAssetId,
                                                  }),
                                                )}
                                                isSaving={
                                                  savingLessonId ===
                                                  les.id
                                                }
                                                canEditDetails={editsLessonDetails}
                                                canEditContent={editsLessonContent}
                                                canPublish={publishesLessons}
                                                onBack={() => {
                                                  setExpanded(
                                                    false,
                                                  );
                                                  setEditorOpen(
                                                    false,
                                                  );
                                                  setQuizOpen(
                                                    false,
                                                  );
                                                }}
                                                onCancel={(draft) =>
                                                  handleCancelLessonDraft(
                                                    sec.id,
                                                    les.id,
                                                    draft,
                                                  )
                                                }
                                                onSave={async (
                                                  payload,
                                                ) => {
                                                  handleUpdateLesson(
                                                    sec.id,
                                                    les.id,
                                                    {
                                                      title:
                                                        payload.title,
                                                      contentType:
                                                        payload.contentType,
                                                      isPublished:
                                                        payload.isPublished,
                                                      isPreview:
                                                        payload.isPreview,
                                                    },
                                                  );
                                                  const saved =
                                                    await persistLesson(
                                                      sec.id,
                                                      les.id,
                                                      {
                                                        collapseOnSuccess: false,
                                                      },
                                                    );
                                                  if (saved) {
                                                    setToastMessage(
                                                      "Lesson changes saved successfully.",
                                                    );
                                                    setEditorOpen(
                                                      false,
                                                    );
                                                  }
                                                }}
                                                onContentTypeChange={(
                                                  contentType,
                                                ) => {
                                                  handleUpdateLesson(
                                                    sec.id,
                                                    les.id,
                                                    {
                                                      contentType,
                                                    },
                                                  );
                                                }}
                                                onMediaAttached={uploadsLessonMedia ? (
                                                  mediaAssetId,
                                                ) =>
                                                  handleLessonMediaAttached(
                                                    sec.id,
                                                    les.id,
                                                    mediaAssetId,
                                                  ) : undefined
                                                }
                                                youtubeImport={importsFromYoutube ? getYoutubeImportTarget(
                                                  currentCourseId,
                                                  les.id,
                                                  les.isPendingCreation,
                                                ) : null}
                                                onProcessingComplete={() =>
                                                  handleLessonProcessingComplete()
                                                }
                                                onUploadMedia={uploadsLessonMedia ? async (
                                                  file,
                                                ) => {
                                                  try {
                                                    const presigned =
                                                      await mediaService.presignMediaUpload(
                                                        {
                                                          filename:
                                                            file.name,
                                                          contentType:
                                                            file.type ||
                                                            "application/octet-stream",
                                                          fileSize:
                                                            file.size,
                                                          type:
                                                            les.contentType ===
                                                            "image"
                                                              ? "image"
                                                              : les.contentType ===
                                                                  "document"
                                                                ? "document"
                                                                : "video",
                                                          visibility:
                                                            "protected",
                                                        },
                                                      );
                                                    await mediaService.uploadFileToPresignedUrl(
                                                      presigned.uploadUrl,
                                                      file,
                                                    );
                                                    await mediaService.confirmUpload(
                                                      presigned.mediaAssetId,
                                                    );
                                                    const attached =
                                                      await handleLessonMediaAttached(
                                                        sec.id,
                                                        les.id,
                                                        presigned.mediaAssetId,
                                                      );
                                                    // A failed attach has already shown its own error.
                                                    if (!attached)
                                                      return;
                                                    setToastMessage(
                                                      "Media uploaded and attached successfully.",
                                                    );
                                                  } catch (err: unknown) {
                                                    setToastMessage(
                                                      err instanceof
                                                        Error
                                                        ? err.message
                                                        : "Media upload failed.",
                                                    );
                                                  }
                                                } : undefined}
                                                descriptionSection={
                                                  <LessonDescriptionEditor
                                                    id={`lesson-description-${les.id}`}
                                                    disabled={
                                                      !editsLessonDetails ||
                                                      les.isPendingCreation ||
                                                      savingLessonId ===
                                                        les.id
                                                    }
                                                    value={
                                                      les.description
                                                    }
                                                    onChange={(
                                                      value,
                                                    ) =>
                                                      handleUpdateLesson(
                                                        sec.id,
                                                        les.id,
                                                        {
                                                          description:
                                                            value,
                                                        },
                                                      )
                                                    }
                                                    placeholder="Add a detailed description of what students will learn in this lesson..."
                                                    maxLength={
                                                      10000
                                                    }
                                                  />
                                                }
                                                resourcesSection={
                                                  <LessonResourceManager
                                                    courseId={
                                                      currentCourseId
                                                    }
                                                    lessonId={
                                                      les.id
                                                    }
                                                    resources={
                                                      les.resources
                                                    }
                                                    disabled={
                                                      !editsSections ||
                                                      les.isPendingCreation ||
                                                      createLessonResourceMutation.isPending ||
                                                      deleteLessonResourceMutation.isPending
                                                    }
                                                    onCreateResource={(
                                                      payload,
                                                    ) =>
                                                      handleCreateLessonResource(
                                                        les.id,
                                                        payload,
                                                      )
                                                    }
                                                    onResourceAdded={(
                                                      resource,
                                                    ) =>
                                                      handleLessonResourceAdded(
                                                        sec.id,
                                                        les.id,
                                                        resource,
                                                      )
                                                    }
                                                    onDeleteResource={(
                                                      resourceId,
                                                    ) =>
                                                      handleDeleteLessonResource(
                                                        resourceId,
                                                      )
                                                    }
                                                    onResourceRemoved={(
                                                      resource,
                                                    ) =>
                                                      handleLessonResourceRemoved(
                                                        sec.id,
                                                        les.id,
                                                        resource,
                                                      )
                                                    }
                                                  />
                                                }
                                                quizSection={
                                                  !opensQuizzes ? undefined : currentCourseId &&
                                                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                                                    les.id,
                                                  ) ? (
                                                    <QuizAuthoringPanel
                                                      courseId={
                                                        currentCourseId
                                                      }
                                                      lessonId={
                                                        les.id
                                                      }
                                                      lessonTitle={
                                                        les.title
                                                      }
                                                      onQuizDeleted={() => {}}
                                                    />
                                                  ) : (
                                                    <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-4 text-sm text-(--muted)">
                                                      Save the
                                                      course and
                                                      lesson before
                                                      configuring an
                                                      attached Quiz.
                                                    </div>
                                                  )
                                                }
                                              />
                                            </div>
                                          ) : (
                                            <div
                                              className={`grid transition-[grid-template-rows] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                                isExpanded
                                                  ? "is-open grid-rows-[1fr]"
                                                  : "grid-rows-[0fr]"
                                              }`}
                                              draggable={false}
                                              onMouseDown={(e) =>
                                                e.stopPropagation()
                                              }
                                            >
                                              <div
                                                className={`min-h-0 overflow-hidden border-t border-transparent bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] transition-[padding,border-color] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                                  isExpanded
                                                    ? "px-5 pt-4 pb-5 border-t-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[768px]:p-[14px_12px_16px]"
                                                    : "px-5 py-0 max-[768px]:p-0"
                                                }`}
                                              >
                                                <div className="grid grid-cols-1 gap-6 max-[768px]:gap-3.5">
                                                  {/* Lesson description stays below the lightweight lesson controls. */}
                                                  <div className="order-2 flex min-w-0 flex-col gap-4.5">
                                                    {isEditorOpen ? (
                                                      <div className="mb-3 flex flex-col gap-2">
                                                        <div className="flex items-center justify-between gap-3">
                                                          <label
                                                            id={`les-desc-label-${les.id}`}
                                                            className="text-(--text-secondary) text-[0.84rem] font-semibold"
                                                          >
                                                            Lesson
                                                            Description
                                                          </label>
                                                          <button
                                                            type="button"
                                                            className="inline-flex min-h-8 items-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent px-2.5 text-xs font-semibold text-(--muted) transition-colors hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                                                            onMouseDown={(
                                                              e,
                                                            ) => {
                                                              e.preventDefault();
                                                              e.stopPropagation();
                                                            }}
                                                            onClick={(
                                                              e,
                                                            ) => {
                                                              e.stopPropagation();
                                                              handleCancelLessonDescriptionEdit(
                                                                sec.id,
                                                                les.id,
                                                              );
                                                              setEditorOpen(
                                                                false,
                                                              );
                                                            }}
                                                          >
                                                            Cancel
                                                          </button>
                                                        </div>
                                                        <div
                                                          className={
                                                            les.isPendingCreation
                                                              ? "opacity-60 pointer-events-none"
                                                              : ""
                                                          }
                                                          onBlur={(
                                                            e,
                                                          ) => {
                                                            if (
                                                              !e.currentTarget.contains(
                                                                e.relatedTarget as Node,
                                                              )
                                                            ) {
                                                              void handleLessonFieldBlur(
                                                                sec.id,
                                                                les.id,
                                                              );
                                                            }
                                                          }}
                                                        >
                                                          <LessonDescriptionEditor
                                                            id={`lesson-description-${les.id}`}
                                                            disabled={
                                                              les.isPendingCreation
                                                            }
                                                            value={
                                                              les.description
                                                            }
                                                            onChange={(
                                                              val,
                                                            ) =>
                                                              handleUpdateLesson(
                                                                sec.id,
                                                                les.id,
                                                                {
                                                                  description:
                                                                    val,
                                                                },
                                                              )
                                                            }
                                                            placeholder="Add a detailed description of what students will learn in this lesson..."
                                                            maxLength={
                                                              10000
                                                            }
                                                          />
                                                        </div>
                                                      </div>
                                                    ) : (
                                                      <LessonDescriptionPreview
                                                        description={
                                                          les.description
                                                        }
                                                        onEdit={() => {
                                                          setEditorOpen(
                                                            true,
                                                          );
                                                          onLessonEditorOpen(
                                                            les.id,
                                                          );
                                                        }}
                                                      />
                                                    )}
                                                  </div>

                                                  {/* Right column */}
                                                  <div className="order-1 flex min-w-0 flex-col gap-4.5">
                                                    {/* Content Type Selector */}
                                                    <div
                                                      inert={!editsLessonContent}
                                                      className="flex flex-col gap-2 mb-4"
                                                    >
                                                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                                                        Content Type
                                                        {""}
                                                        <span className="text-[#ff5252] ml-0.5">
                                                          *
                                                        </span>
                                                      </label>
                                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                        <div
                                                          className={`relative flex items-center gap-2.5 border rounded-[10px] px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                                            les.isPendingCreation
                                                              ? "opacity-60 cursor-not-allowed"
                                                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                                          } ${
                                                            les.contentType ===
                                                            "video"
                                                              ? "is-selected border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                                          }`}
                                                          onClick={() => {
                                                            if (
                                                              les.isPendingCreation
                                                            )
                                                              return;
                                                            void handleLessonDiscreteChange(
                                                              sec.id,
                                                              les.id,
                                                              {
                                                                contentType:
                                                                  "video",
                                                              },
                                                            );
                                                          }}
                                                        >
                                                          <div
                                                            className={`flex w-4 h-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${les.contentType === "video" ? "border-(--accent)" : "border-(--muted)"}`}
                                                          >
                                                            {les.contentType ===
                                                              "video" && (
                                                              <div className="w-1.5 h-1.5 rounded-full bg-(--accent)" />
                                                            )}
                                                          </div>
                                                          <div className="flex items-center justify-center text-(--accent)">
                                                            <Video
                                                              size={
                                                                16
                                                              }
                                                              weight="fill"
                                                            />
                                                          </div>
                                                          <div className="flex flex-col min-w-0">
                                                            <span className="text-(--text) text-[0.82rem] font-bold leading-tight truncate">
                                                              Video
                                                            </span>
                                                            <span className="text-(--muted) text-[0.70rem] truncate">
                                                              Video
                                                              lesson
                                                            </span>
                                                          </div>
                                                        </div>

                                                        <div
                                                          className={`relative flex items-center gap-2.5 border rounded-[10px] px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                                            les.isPendingCreation
                                                              ? "opacity-60 cursor-not-allowed"
                                                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                                          } ${
                                                            les.contentType ===
                                                            "document"
                                                              ? "is-selected border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                                          }`}
                                                          onClick={() => {
                                                            if (
                                                              les.isPendingCreation
                                                            )
                                                              return;
                                                            void handleLessonDiscreteChange(
                                                              sec.id,
                                                              les.id,
                                                              {
                                                                contentType:
                                                                  "document",
                                                              },
                                                            );
                                                          }}
                                                        >
                                                          <div
                                                            className={`flex w-4 h-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${les.contentType === "document" ? "border-(--accent)" : "border-(--muted)"}`}
                                                          >
                                                            {les.contentType ===
                                                              "document" && (
                                                              <div className="w-1.5 h-1.5 rounded-full bg-(--accent)" />
                                                            )}
                                                          </div>
                                                          <div className="flex items-center justify-center text-(--accent)">
                                                            <FileText
                                                              size={
                                                                16
                                                              }
                                                              weight="fill"
                                                            />
                                                          </div>
                                                          <div className="flex flex-col min-w-0">
                                                            <span className="text-(--text) text-[0.82rem] font-bold leading-tight truncate">
                                                              Document
                                                            </span>
                                                            <span className="text-(--muted) text-[0.70rem] truncate">
                                                              PDF /
                                                              Reading
                                                            </span>
                                                          </div>
                                                        </div>
                                                      </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                      {/* Content Source Controls (Video or Document) */}
                                                      <div className="flex flex-col gap-2 mb-0">
                                                        <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                                                          {les.contentType ===
                                                          "video"
                                                            ? "Video Source"
                                                            : "Document / PDF Source"}
                                                          <span className="text-[#ff5252] ml-0.5">
                                                            *
                                                          </span>
                                                        </label>
                                                        {les.contentType ===
                                                        "video" ? (
                                                          <LessonVideoUpload
                                                            mediaAssetId={
                                                              les.contentMediaId
                                                            }
                                                            disabled={
                                                              !uploadsLessonMedia ||
                                                              les.isPendingCreation
                                                            }
                                                            onMediaAttached={(
                                                              mediaAssetId,
                                                            ) =>
                                                              handleLessonMediaAttached(
                                                                sec.id,
                                                                les.id,
                                                                mediaAssetId,
                                                              )
                                                            }
                                                            youtubeImport={importsFromYoutube ? getYoutubeImportTarget(
                                                              currentCourseId,
                                                              les.id,
                                                              les.isPendingCreation,
                                                            ) : null}
                                                            onProcessingComplete={() =>
                                                              handleLessonProcessingComplete()
                                                            }
                                                          />
                                                        ) : (
                                                          <div className="flex items-center gap-2 max-[768px]:w-full max-[768px]:flex max-[768px]:gap-2">
                                                            <button
                                                              type="button"
                                                              disabled={
                                                                les.isPendingCreation
                                                              }
                                                              style={{
                                                                fontSize:
                                                                  "0.80rem",
                                                                fontWeight: 700,
                                                                height:
                                                                  "34px",
                                                                borderRadius:
                                                                  "8px",
                                                                gap: "6px",
                                                                paddingLeft:
                                                                  "16px",
                                                                paddingRight:
                                                                  "16px",
                                                              }}
                                                              className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                                            >
                                                              <UploadSimple
                                                                size={
                                                                  15
                                                                }
                                                              />
                                                              Upload
                                                            </button>
                                                            <button
                                                              type="button"
                                                              disabled={
                                                                les.isPendingCreation
                                                              }
                                                              style={{
                                                                fontSize:
                                                                  "0.80rem",
                                                                fontWeight: 500,
                                                                height:
                                                                  "34px",
                                                                borderRadius:
                                                                  "8px",
                                                                gap: "6px",
                                                                paddingLeft:
                                                                  "14px",
                                                                paddingRight:
                                                                  "14px",
                                                              }}
                                                              className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text) bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                                            >
                                                              <FileText
                                                                size={
                                                                  15
                                                                }
                                                                className="text-(--text-secondary)"
                                                              />
                                                              Select
                                                              from
                                                              Media
                                                            </button>
                                                          </div>
                                                        )}
                                                      </div>

                                                      {/* Lesson Publishing Status */}
                                                      <div className="flex flex-col gap-2 mb-0">
                                                        <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                                                          Publishing
                                                          Status
                                                        </label>
                                                        <ThemedSelect
                                                          value={
                                                            les.isPublished !==
                                                            false
                                                              ? "published"
                                                              : "draft"
                                                          }
                                                          onValueChange={(
                                                            value,
                                                          ) => {
                                                            if (
                                                              les.isPendingCreation
                                                            )
                                                              return;
                                                            void handleLessonDiscreteChange(
                                                              sec.id,
                                                              les.id,
                                                              {
                                                                isPublished:
                                                                  value ===
                                                                  "published",
                                                              },
                                                            );
                                                          }}
                                                          options={[
                                                            [
                                                              "published",
                                                              "Published",
                                                            ],
                                                            [
                                                              "draft",
                                                              "Draft (Hidden)",
                                                            ],
                                                          ]}
                                                          disabled={
                                                            !publishesLessons ||
                                                            les.isPendingCreation
                                                          }
                                                          ariaLabel="Publishing status"
                                                          triggerClassName="!h-9 !w-full !rounded-[8px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !px-3 !text-[0.84rem] !text-(--text) !bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] font-semibold disabled:!opacity-60"
                                                        />
                                                      </div>
                                                    </div>

                                                    {/* Free Preview Toggle */}
                                                    <div
                                                      className={`flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[8px] px-3 py-2 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] mb-3 ${les.isPendingCreation ? "opacity-60 pointer-events-none" : ""}`}
                                                    >
                                                      <div className="pr-3">
                                                        <strong className="block mb-0.5 text-(--text) text-[0.88rem] font-[650]">
                                                          Free
                                                          Preview
                                                        </strong>
                                                        <p className="m-0 text-(--muted) text-[0.78rem]">
                                                          Allow
                                                          prospective
                                                          students
                                                          to view
                                                          this
                                                          lesson
                                                          before
                                                          enrolling
                                                          or
                                                          purchasing.
                                                        </p>
                                                      </div>
                                                      <SettingsToggle
                                                        checked={
                                                          les.isPreview ===
                                                          true
                                                        }
                                                        onChange={(
                                                          checked,
                                                        ) => {
                                                          if (
                                                            les.isPendingCreation
                                                          )
                                                            return;
                                                          void handleLessonDiscreteChange(
                                                            sec.id,
                                                            les.id,
                                                            {
                                                              isPreview:
                                                                checked,
                                                            },
                                                          );
                                                        }}
                                                        label="Toggle Free Preview"
                                                        disabled={
                                                          !editsLessonDetails
                                                        }
                                                      />
                                                    </div>

                                                    {/* Lesson Resources */}
                                                    <LessonResourceManager
                                                      courseId={
                                                        currentCourseId
                                                      }
                                                      lessonId={
                                                        les.id
                                                      }
                                                      resources={
                                                        les.resources
                                                      }
                                                      disabled={
                                                        !editsSections ||
                                                        les.isPendingCreation ||
                                                        createLessonResourceMutation.isPending ||
                                                        deleteLessonResourceMutation.isPending
                                                      }
                                                      onCreateResource={(
                                                        payload,
                                                      ) =>
                                                        handleCreateLessonResource(
                                                          les.id,
                                                          payload,
                                                        )
                                                      }
                                                      onResourceAdded={(
                                                        resource,
                                                      ) =>
                                                        handleLessonResourceAdded(
                                                          sec.id,
                                                          les.id,
                                                          resource,
                                                        )
                                                      }
                                                      onDeleteResource={(
                                                        resourceId,
                                                      ) =>
                                                        handleDeleteLessonResource(
                                                          resourceId,
                                                        )
                                                      }
                                                      onResourceRemoved={(
                                                        resource,
                                                      ) =>
                                                        handleLessonResourceRemoved(
                                                          sec.id,
                                                          les.id,
                                                          resource,
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                </div>

                                                {/* Quiz authoring stays behind an explicit action so it cannot slow lesson expansion. */}
                                                <div className="mt-1 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-4">
                                                  {isQuizOpen ? (
                                                    <div className="flex flex-col gap-3">
                                                      <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2 text-xs font-semibold text-(--text)">
                                                          <PuzzlePiece
                                                            size={
                                                              16
                                                            }
                                                            className="text-(--accent)"
                                                            weight="fill"
                                                          />
                                                          <span>
                                                            Quiz
                                                            Assessment
                                                          </span>
                                                        </div>
                                                        <button
                                                          type="button"
                                                          className="inline-flex min-h-8 items-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent px-2.5 text-xs font-semibold text-(--muted) transition-colors hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:text-(--text)"
                                                          onClick={() =>
                                                            setQuizOpen(
                                                              false,
                                                            )
                                                          }
                                                        >
                                                          Close
                                                        </button>
                                                      </div>
                                                      {currentCourseId &&
                                                      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                                                        les.id,
                                                      ) ? (
                                                        <QuizAuthoringPanel
                                                          courseId={
                                                            currentCourseId
                                                          }
                                                          lessonId={
                                                            les.id
                                                          }
                                                          lessonTitle={
                                                            les.title
                                                          }
                                                          onQuizDeleted={() => {
                                                            // Quiz deleted, query invalidation in hook updates UI
                                                          }}
                                                        />
                                                      ) : (
                                                        <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-4 text-sm text-(--muted)">
                                                          Save the
                                                          course and
                                                          lesson
                                                          before
                                                          configuring
                                                          an
                                                          attached
                                                          Quiz.
                                                        </div>
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      hidden={!opensQuizzes}
                                                      disabled={
                                                        les.isPendingCreation
                                                      }
                                                      className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 text-xs font-semibold text-(--accent-ink,var(--accent)) transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                                                      onClick={() =>
                                                        setQuizOpen(
                                                          true,
                                                        )
                                                      }
                                                    >
                                                      <PuzzlePiece
                                                        size={15}
                                                        weight="fill"
                                                      />
                                                      Add Quiz
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  </div>
                                );
                              }}
                            />
                            {isDropAfter && <LessonDropIndicator />}
                          </Fragment>
                        );
                      }}
                    />
                  )}

                  {/* Add Lesson Action */}
                  <div hidden={!addsLessons} className="mt-3.5">
                    <button
                      type="button"
                      disabled={
                        sec.isPendingCreation ||
                        creatingLessonSectionId === sec.id ||
                        createLessonMutation.isPending
                      }
                      className="inline-flex items-center gap-1.5 text-(--muted) enabled:hover:text-(--text) text-[0.82rem] font-medium border-0 bg-transparent p-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none enabled:cursor-pointer"
                      onClick={() => handleAddLesson(sec.id)}
                    >
                      {creatingLessonSectionId === sec.id ? (
                        <>
                          <CircleNotch
                            size={14}
                            className="animate-spin text-(--accent)"
                          />
                          <span>Adding Lesson...</span>
                        </>
                      ) : (
                        <>
                          <Plus size={16} /> Add Lesson
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    )
  );
}
