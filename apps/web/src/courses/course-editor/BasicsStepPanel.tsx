import type {
  LazyExoticComponent,
  ReactNode,
  RefObject,
  Dispatch,
  SetStateAction,
} from "react";
import { createDiscussionDraft } from "../../learning/discussion-editor/types";
import { CourseDescriptionEditor } from "../CourseDescriptionEditor";
import { CoursePreviewMedia } from "./CoursePreviewMedia";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { XIcon as X } from "@phosphor-icons/react/X";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { SettingsToggle } from "../../settings/SettingsControls";
import type {
  UseMutationResult,
  RefetchOptions,
  QueryObserverResult,
} from "@tanstack/react-query";
import {
  type BasicsFieldKey,
  BasicsFieldStatusIndicator,
} from "./statusIndicators";
import type { ApiError } from "../../lib/api-error";

export interface BasicsStepPanelProps {
  isEditing: boolean;
  showTitleTooltip: boolean;
  isDownstreamUnlocked: boolean;
  isInitialCourseCreationPending: boolean;
  titleInputRef: RefObject<HTMLInputElement | null>;
  setShowTitleTooltip: Dispatch<SetStateAction<boolean>>;
  getBasicsFieldDisplayStatus: (
    fieldKey: BasicsFieldKey,
  ) => "saving" | "saved" | "failed" | null;
  currentCourseId: string | null;
  courseTitle: string;
  setCourseTitle: (title: string) => void;
  clearBasicsFieldStatus: (fieldKey: BasicsFieldKey) => void;
  currentCourseIdRef: RefObject<string | null>;
  cancelTitleCreationDebounce: () => void;
  titleCreationDebounceTimerRef: RefObject<NodeJS.Timeout | null>;
  persistBasicsField: (
    fieldKey:
      "title" | "shortDescription" | "courseDescription" | "instructorAlias",
  ) => Promise<
    | {
        id: string;
        version: number;
        title: string;
        instructorAlias?: string | null;
      }
    | undefined
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
  shortDescription: string;
  setShortDescription: (shortDescription: string) => void;
  courseDescription: string;
  setCourseDescription: (description: string) => void;
  instructorAlias: string;
  setInstructorAlias: (instructorAlias: string) => void;
  showInstructorName: boolean;
  isBasicsControlSaving: (controlKey: string) => boolean;
  handleShowInstructorNameChange: (nextValue: boolean) => Promise<void>;
  thumbnailInputRef: RefObject<HTMLInputElement | null>;
  isBasicsSaving: boolean;
  isThumbnailBusy: boolean;
  handleThumbnailFileSelect: (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  thumbnail: string | null;
  triggerThumbnailUpload: () => void;
  /** Uploads and saves an image as the thumbnail (a dropped file). */
  uploadThumbnailFile: (file: File) => Promise<void>;
  thumbnailUploadError: string | null;
  /** Clears the course's trailer. */
  handleRemoveTrailer: () => Promise<void>;
  /** The desktop overview banner's card, under the thumbnail and trailer. */
  bannerUpload?: ReactNode;
  LessonVideoUpload: LazyExoticComponent<
    typeof import("../lesson-video-upload/LessonVideoUpload").LessonVideoUpload
  >;
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
  handleTrailerMediaAttached: (mediaAssetId: string) => Promise<boolean>;
  refetchEditor: (options?: RefetchOptions) => Promise<
    QueryObserverResult<
      {
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
      },
      ApiError
    >
  >;
  totalSections: number;
  totalLessons: number;
  computedDuration: string;
  DiscussionMarkdown: LazyExoticComponent<
    typeof import("../../learning/discussion-editor/DiscussionMarkdown").DiscussionMarkdown
  >;
}

export function BasicsStepPanel({
  isEditing,
  showTitleTooltip,
  isDownstreamUnlocked,
  isInitialCourseCreationPending,
  titleInputRef,
  setShowTitleTooltip,
  getBasicsFieldDisplayStatus,
  currentCourseId,
  courseTitle,
  setCourseTitle,
  clearBasicsFieldStatus,
  currentCourseIdRef,
  cancelTitleCreationDebounce,
  titleCreationDebounceTimerRef,
  persistBasicsField,
  createCourseMutation,
  shortDescription,
  setShortDescription,
  courseDescription,
  setCourseDescription,
  instructorAlias,
  setInstructorAlias,
  showInstructorName,
  isBasicsControlSaving,
  handleShowInstructorNameChange,
  thumbnailInputRef,
  isBasicsSaving,
  isThumbnailBusy,
  handleThumbnailFileSelect,
  thumbnail,
  triggerThumbnailUpload,
  uploadThumbnailFile,
  thumbnailUploadError,
  handleRemoveTrailer,
  bannerUpload,
  LessonVideoUpload,
  editorData,
  handleTrailerMediaAttached,
  refetchEditor,
  totalSections,
  totalLessons,
  computedDuration,
  DiscussionMarkdown,
}: BasicsStepPanelProps) {
  // prettier-ignore
  return (
    <div className="relative z-10 grid grid-cols-1 md:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)] gap-6 items-start max-[768px]:gap-4.5 w-full min-w-0">
      {/* Left Column: Form Sections */}
      <div className="flex flex-col gap-5">
        {/* Basic Information Section */}
        <section className="relative z-10 rounded-[14px] p-6 bg-(--surface) shadow-(--card-shadow) max-[768px]:p-4">
          <div className="mb-4.5 flex items-center justify-between">
            <div>
              <h2 className="m-0 text-(--text) text-[1.18rem] font-[650] tracking-[-0.015em]">
                Basic Information
              </h2>
              <p className="m-0 mt-1 mb-0 text-(--muted) text-[0.82rem]">
                {isEditing
                  ? "Update the essential details of your course."
                  : "Add the essential details of your course."}
              </p>
            </div>
          </div>

          <div className="relative flex flex-col gap-2 mb-5">
            {showTitleTooltip &&
              !isDownstreamUnlocked &&
              !isInitialCourseCreationPending && (
                <div
                  role="tooltip"
                  id="course-title-tooltip"
                  data-testid="basics-title-tooltip"
                  onClick={() => titleInputRef.current?.focus()}
                  className="absolute -top-9 left-0 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--surface-strong) text-(--text) text-[0.78rem] font-medium border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] shadow-[0_6px_20px_color-mix(in_srgb,var(--accent-shadow)_22%,transparent)] transition-all select-none cursor-pointer group"
                >
                  <Info
                    size={15}
                    weight="fill"
                    className="text-(--accent) shrink-0"
                  />
                  <span>
                    Continue course creation by entering a course
                    title
                  </span>
                  <button
                    type="button"
                    aria-label="Dismiss tooltip"
                    className="ml-1 p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) hover:text-(--text) transition-colors border-none bg-transparent cursor-pointer inline-flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTitleTooltip(false);
                    }}
                  >
                    <X size={13} />
                  </button>
                  <div
                    className="absolute -bottom-1.5 left-6 w-3 h-3 rotate-45 bg-(--surface-strong) border-r border-b border-[color-mix(in_srgb,var(--accent)_35%,var(--border))]"
                    aria-hidden="true"
                  />
                </div>
              )}
            <div className="flex items-center justify-between">
              <label
                htmlFor="course-title"
                className="text-(--text-secondary) text-[0.84rem] font-semibold"
              >
                Course Title{" "}
                <span className="text-[#ff5252] ml-0.5">*</span>
              </label>
              <BasicsFieldStatusIndicator
                status={getBasicsFieldDisplayStatus("title")}
                testId="basics-field-status-title"
              />
            </div>
            <div className="relative flex items-center">
              <input
                id="course-title"
                ref={titleInputRef}
                autoFocus={!currentCourseId}
                type="text"
                maxLength={120}
                placeholder="e.g. Complete Backend with Node.js"
                disabled={isInitialCourseCreationPending}
                value={courseTitle}
                onChange={(e) => {
                  if (isInitialCourseCreationPending) return;
                  const val = e.target.value.slice(0, 120);
                  setCourseTitle(val);
                  clearBasicsFieldStatus("title");
                  if (val.trim()) {
                    setShowTitleTooltip(false);
                  }

                  // 1-second debounce for brand-new courses only
                  if (
                    !currentCourseIdRef.current &&
                    !currentCourseId &&
                    !isEditing
                  ) {
                    cancelTitleCreationDebounce();
                    if (val.trim()) {
                      titleCreationDebounceTimerRef.current =
                        setTimeout(() => {
                          titleCreationDebounceTimerRef.current =
                            null;
                          void persistBasicsField("title");
                        }, 1000);
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (isInitialCourseCreationPending) {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    // Pressing Enter triggers immediate creation, cancelling pending debounce
                    if (
                      !currentCourseIdRef.current &&
                      !currentCourseId &&
                      !isEditing
                    ) {
                      cancelTitleCreationDebounce();
                      void persistBasicsField("title");
                    }
                  }
                }}
                onFocus={() => {
                  setShowTitleTooltip(false);
                }}
                onBlur={() => {
                  if (isInitialCourseCreationPending) return;
                  cancelTitleCreationDebounce();
                  void persistBasicsField("title");
                  if (!currentCourseId && !courseTitle.trim()) {
                    setShowTitleTooltip(true);
                  }
                }}
                aria-describedby={
                  showTitleTooltip && !isDownstreamUnlocked
                    ? "course-title-tooltip"
                    : !isDownstreamUnlocked
                      ? "basics-title-helper"
                      : undefined
                }
                className="w-full h-11 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] pl-3.5 pr-[75px] py-0 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <span className="absolute right-3.5 text-(--muted) text-[0.76rem] pointer-events-none">
                {courseTitle.length} / 120
              </span>
            </div>
            {!isDownstreamUnlocked && (
              <p
                className="m-0 mt-0.5 text-(--muted) text-[0.78rem] flex items-center gap-1.5"
                role="status"
                data-testid="basics-title-helper"
              >
                {createCourseMutation.isPending ||
                isInitialCourseCreationPending ? (
                  <>
                    <CircleNotch
                      size={13}
                      className="animate-spin text-(--accent) shrink-0"
                    />
                    <span>Creating course…</span>
                  </>
                ) : (
                  "Add a course title to continue."
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 mb-5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="course-short-description"
                className="text-(--text-secondary) text-[0.84rem] font-semibold"
              >
                Short Description
              </label>
              <BasicsFieldStatusIndicator
                status={getBasicsFieldDisplayStatus(
                  "shortDescription",
                )}
                testId="basics-field-status-shortDescription"
              />
            </div>
            <div className="relative flex items-center">
              <textarea
                id="course-short-description"
                rows={2}
                maxLength={150}
                placeholder="A concise summary of your course (shown in course cards and search)..."
                disabled={!isDownstreamUnlocked}
                value={shortDescription}
                onChange={(e) => {
                  setShortDescription(e.target.value.slice(0, 150));
                  clearBasicsFieldStatus("shortDescription");
                }}
                onBlur={() => {
                  void persistBasicsField("shortDescription");
                }}
                className="w-full min-h-[68px] max-h-[140px] resize-y border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] pl-3.5 pr-[75px] py-2.5 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed font-[inherit]"
              />
              <span className="absolute right-3.5 bottom-2.5 text-(--muted) text-[0.76rem] pointer-events-none">
                {shortDescription.length} / 150
              </span>
            </div>
          </div>

          <div
            className="flex flex-col gap-2 mb-5"
            onBlur={() => {
              void persistBasicsField("courseDescription");
            }}
          >
            <div className="flex items-center justify-between">
              <label
                htmlFor="course-description"
                className="text-(--text-secondary) text-[0.84rem] font-semibold"
              >
                Course Description{" "}
                <span className="text-[#ff5252] ml-0.5">*</span>
              </label>
              <BasicsFieldStatusIndicator
                status={getBasicsFieldDisplayStatus(
                  "courseDescription",
                )}
                testId="basics-field-status-courseDescription"
              />
            </div>
            <CourseDescriptionEditor
              id="course-description"
              disabled={!isDownstreamUnlocked}
              value={courseDescription}
              onChange={(val) => {
                setCourseDescription(val);
                clearBasicsFieldStatus("courseDescription");
              }}
              placeholder="Describe what your course is about, what students will learn, and who this course is for..."
              maxLength={1500}
            />
          </div>

          {/* Instructor Alias & Visibility (Frontend Visual Demo) */}
          <div className="flex flex-col gap-2 mb-4.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="instructor-alias"
                className="text-(--text-secondary) text-[0.84rem] font-semibold"
              >
                Instructor Alias
              </label>
              <BasicsFieldStatusIndicator
                status={getBasicsFieldDisplayStatus(
                  "instructorAlias",
                )}
                testId="basics-field-status-instructorAlias"
              />
            </div>
            <input
              id="instructor-alias"
              type="text"
              maxLength={100}
              placeholder="e.g. Alex Rivera or Design Guild"
              disabled={!isDownstreamUnlocked}
              value={instructorAlias}
              onChange={(e) => {
                setInstructorAlias(e.target.value);
                clearBasicsFieldStatus("instructorAlias");
              }}
              onBlur={() => {
                void persistBasicsField("instructorAlias");
              }}
              className="w-full h-11 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] px-3.5 py-0 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="m-0 text-(--muted) text-[0.78rem]">
              Optional custom name shown to students instead of your
              account name.
            </p>
          </div>

          {/* Show Instructor Name Settings Row */}
          <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
            <div className="flex flex-col min-w-0 pr-3">
              <div className="flex items-center gap-2">
                <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                  Show Instructor Name
                </strong>
                <BasicsFieldStatusIndicator
                  status={getBasicsFieldDisplayStatus(
                    "showInstructorName",
                  )}
                  testId="basics-field-status-showInstructorName"
                />
              </div>
              <p className="m-0 text-(--muted) text-[0.8rem]">
                Control whether the instructor name is shown to
                students.
              </p>
            </div>
            <SettingsToggle
              checked={showInstructorName}
              disabled={
                !isDownstreamUnlocked ||
                isBasicsControlSaving("showInstructorName")
              }
              onChange={() =>
                void handleShowInstructorNameChange(
                  !showInstructorName,
                )
              }
              label="Toggle Show Instructor Name"
            />
          </div>
        </section>

        {/* Course Media Section */}
        <section className="relative z-10 rounded-[14px] p-6 bg-(--surface) shadow-(--card-shadow) max-[768px]:p-4">
          <div className="mb-4.5">
            <h2 className="m-0 text-(--text) text-[1.18rem] font-[650] tracking-[-0.015em]">
              Course Media
            </h2>
            <p className="m-0 mt-1 mb-5 text-(--muted) text-[0.82rem]">
              Set the thumbnail and trailer on the course preview. The banner
              shows behind the course title on desktop.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Hidden Thumbnail File Input */}
            <input
              type="file"
              ref={thumbnailInputRef}
              disabled={
                !isDownstreamUnlocked ||
                isBasicsSaving ||
                isThumbnailBusy
              }
              onChange={(event) => {
                void handleThumbnailFileSelect(event);
              }}
              accept="image/*"
              style={{ display: "none" }}
            />

            {bannerUpload}
          </div>
        </section>
      </div>

      {/* Right Column: Live Course Preview */}
      <div className="flex min-w-0 flex-col gap-5 md:sticky md:top-0 md:self-start">
        <section className="rounded-[14px] p-5 bg-(--surface) shadow-(--card-shadow)">
          <h2 className="m-0 text-(--text) text-[1.1rem] font-[650]">
            Course Preview
          </h2>
          <p className="m-0 mt-1 mb-4 text-(--muted) text-[0.8rem]">
            This is how your course will appear to students.
          </p>

          <CoursePreviewMedia
            courseId={currentCourseId}
            disabled={!isDownstreamUnlocked || isBasicsSaving}
            thumbnail={thumbnail}
            isThumbnailBusy={isThumbnailBusy}
            thumbnailUploadError={thumbnailUploadError}
            triggerThumbnailUpload={triggerThumbnailUpload}
            uploadThumbnailFile={uploadThumbnailFile}
            trailerMediaId={editorData?.course?.trailerMediaId}
            LessonVideoUpload={LessonVideoUpload}
            handleTrailerMediaAttached={handleTrailerMediaAttached}
            onTrailerProcessed={() => {
              void refetchEditor();
            }}
            handleRemoveTrailer={handleRemoveTrailer}
          />

          <div className="mt-4">
            <h3 className="m-0 mb-3 text-(--text) text-[1.15rem] font-bold leading-[1.3]">
              {courseTitle.trim() ? courseTitle : "Course Title"}
            </h3>

            <div className="flex items-center gap-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-3.5 text-(--muted) text-[0.8rem]">
              <span className="flex items-center gap-1.25">
                <BookOpen size={15} /> {totalSections} Sections
              </span>
              <span className="flex items-center gap-1.25">
                <BookOpen size={15} /> {totalLessons} Lessons
              </span>
              <span
                className="flex items-center gap-1.25"
                data-testid="course-preview-duration"
              >
                {computedDuration}
              </span>
            </div>

            <div className="mt-3.5 min-w-0 max-w-full overflow-hidden wrap-anywhere wrap-break-word">
              <h4 className="m-0 mb-1.5 text-(--text-secondary) text-[0.84rem] font-[650]">
                About this course
              </h4>
              {courseDescription.trim() ? (
                <DiscussionMarkdown
                  content={createDiscussionDraft(
                    courseDescription.trim(),
                  )}
                  label="Course description preview"
                  className="[&>:first-child]:mt-0 max-w-none"
                />
              ) : (
                <p className="m-0 text-(--muted) text-[0.82rem] leading-normal wrap-anywhere wrap-break-word">
                  This is a short description of your course. It
                  will appear here on the course card.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
