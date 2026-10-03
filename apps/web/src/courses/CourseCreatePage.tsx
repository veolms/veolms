import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  Fragment,
} from "react";
import "../styles/features/course-wizard.css";
import { useLocation, useNavigate, useParams } from "react-router";
import { createPortal } from "react-dom";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { createDiscussionDraft } from "../learning/discussion-editor/types";
import { CourseQuizPricingCard } from "./CourseQuizPricingCard";
import { CourseStaticPageRefreshNotice } from "./CourseStaticPageRefreshNotice";
import {
  LessonResourceManager,
  toLessonResourceItem,
  type LessonResourceItem,
} from "./lesson-resources/LessonResourceManager";
import { CourseDescriptionEditor, LessonDescriptionEditor } from "./CourseDescriptionEditor";
import {
  LessonContentTypeIcon,
  LessonStudioEditor,
  lessonContentTypeIconSvg,
  type LessonStudioEditorHandle,
  type LessonEditorDraft,
  type StudioLessonContentType,
  type AttachedMediaInfo,
} from "./curriculum";
import { VirtualizedLessonList } from "./curriculum/VirtualizedLessonList";

const DiscussionMarkdown = lazy(() =>
  import("../learning/discussion-editor/DiscussionMarkdown").then((module) => ({
    default: module.DiscussionMarkdown,
  })),
);
const LessonVideoUpload = lazy(() =>
  import("./lesson-video-upload/LessonVideoUpload").then((module) => ({
    default: module.LessonVideoUpload,
  })),
);
const QuizAuthoringPanel = lazy(() =>
  import("../quizzes/QuizAuthoringPanel").then((module) => ({
    default: module.QuizAuthoringPanel,
  })),
);
import { useBackDismiss } from "../navigation/useBackDismiss";
import { ToastNotification } from "../ToastNotification";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CertificateIcon as Certificate } from "@phosphor-icons/react/Certificate";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { ChatCircleTextIcon as ChatCircleText } from "@phosphor-icons/react/ChatCircleText";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { HeadphonesIcon as Headphones } from "@phosphor-icons/react/Headphones";
import { ImageIcon, ImageIcon as Image } from "@phosphor-icons/react/Image";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { LightningIcon as Lightning } from "@phosphor-icons/react/Lightning";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/LockKey";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/NotePencil";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/PuzzlePiece";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { VideoIcon as Video } from "@phosphor-icons/react/Video";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import type { ComponentType } from "react";
import ISO6391 from "iso-639-1";
import { ThemedSelect } from "../ThemedSelect";
import { SettingsToggle } from "../settings/SettingsControls";
import type { NavigateTo } from "../routing/navigation";
import { getCourseEditorPath } from "./courseEditorRouting";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import { getNumberShortcutIndex, isEditingShortcutTarget } from "../keyboardShortcuts";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import {
  coursesService,
  useCategories,
  useCourseEditor,
  useCoursePreview,
  useCourseValidation,
  useCreateCategory,
  useCreateCourse,
  useCreateCourseInclude,
  useCreateLesson,
  useCreateLessonResource,
  useCreateSection,
  useDeleteCategory,
  useDeleteCourseInclude,
  useDeleteLesson,
  useDeleteLessonResource,
  useDeleteSection,
  useReorderCourseIncludes,
  useReorderLessons,
  useReorderSections,
  useUpdateCourseBasics,
  useUpdateCourseInclude,
  useUpdateLesson,
  useUpdateSection,
  useUpsertAccessRules,
  useUpsertPricing,
  useUpsertSettings,
  usePublishCourse,
  useUnpublishCourse,
} from "../services/courses";
import { getCourseThumbnailCdnUrl, waitForCourseThumbnailCdnUrl } from "./courseMedia";
import { useIsMutating } from "@tanstack/react-query";
import type {
  Category,
  CourseEditorDataResponse,
  CourseIncludeItem,
  CourseValidationArea,
  CreateLessonResourceRequest,
  LessonResource,
} from "@veolms/contracts";
import { MEDIA_MAX_SIZES } from "@veolms/contracts";
import { CourseOverviewPage, CourseOverviewSkeleton } from "./CourseOverviewPage";
import type { CourseInclude, CourseOverviewPricingProps } from "./CourseOverviewPage";
import type { Course, CourseLevel, CourseCategory } from "./catalogue";
import type { Lesson } from "../learning/courseContent";
import { formatDuration, resolveCourseDurationSeconds } from "./courseAdapter";
import { mediaService } from "../services/media";
import { clearVideoPlaybackBootstrapCache } from "../learning/videoPlaybackBootstrap";

const EMPTY_CATEGORIES: Category[] = [];

const LESSON_EDITOR_DRAFT_STORAGE_PREFIX = "veolms:lesson-editor-draft:";
const LESSON_EDITOR_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredLessonEditorDraft extends LessonEditorDraft {
  description: string;
  contentMediaId: string | null;
  savedAt: number;
}

function getLessonEditorDraftStorageKey(courseId: string | null, lessonId: string): string {
  return `${LESSON_EDITOR_DRAFT_STORAGE_PREFIX}${courseId || "new-course"}:${lessonId}`;
}

function isStudioLessonContentType(value: unknown): value is StudioLessonContentType {
  return (
    value === "video" ||
    value === "audio" ||
    value === "image" ||
    value === "document" ||
    value === "quiz"
  );
}

function readLessonEditorDraft(
  courseId: string | null,
  lessonId: string,
): StoredLessonEditorDraft | null {
  if (typeof window === "undefined") return null;

  const storageKey = getLessonEditorDraftStorageKey(courseId, lessonId);
  try {
    const rawDraft = window.localStorage.getItem(storageKey);
    if (!rawDraft) return null;

    const parsed = JSON.parse(rawDraft) as Partial<StoredLessonEditorDraft>;
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > LESSON_EDITOR_DRAFT_TTL_MS ||
      typeof parsed.title !== "string" ||
      !isStudioLessonContentType(parsed.contentType)
    ) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return {
      title: parsed.title,
      description: typeof parsed.description === "string" ? parsed.description : "",
      contentType: parsed.contentType,
      contentMediaId: typeof parsed.contentMediaId === "string" ? parsed.contentMediaId : null,
      isPublished: parsed.isPublished !== false,
      isPreview: parsed.isPreview === true,
      savedAt: parsed.savedAt,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

function writeLessonEditorDraft(
  courseId: string | null,
  lessonId: string,
  draft: Omit<StoredLessonEditorDraft, "savedAt">,
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getLessonEditorDraftStorageKey(courseId, lessonId),
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // Local draft persistence is best-effort and must not block editing.
  }
}

function clearLessonEditorDraft(courseId: string | null, lessonId: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(getLessonEditorDraftStorageKey(courseId, lessonId));
  } catch {
    // Ignore storage cleanup failures; the saved lesson is already persisted.
  }
}

function getLessonDescriptionPreview(description: string) {
  return description
    .replace(/^[#\s>*-]+/gm, "")
    .replace(/[`*_[\]()]/g, "")
    .trim();
}

function LessonDescriptionPreview({
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
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.84rem] font-semibold text-(--text-secondary)">
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
        className={`m-0 line-clamp-4 overflow-hidden text-sm leading-6 whitespace-pre-line sm:text-[15px] ${hasDescription ? "text-(--text-secondary)" : "text-(--muted) italic"}`}
      >
        {preview}
      </p>
    </div>
  );
}

interface LessonSnapshot {
  title: string;
  description: string;
  contentType: "video" | "document" | "quiz" | "audio" | "image";
  contentMediaId?: string | null;
  isPublished?: boolean;
  isPreview?: boolean;
}

interface CurriculumLessonItem {
  id: string;
  title: string;
  isEditingTitle?: boolean;
  contentTypeSelected?: boolean;
  pendingContentType?: "video" | "document" | "quiz" | "audio" | "image";
  description: string;
  contentType: "video" | "document" | "quiz" | "audio" | "image";
  contentMediaId?: string | null;
  durationSeconds?: number;
  isExpanded: boolean;
  isPublished?: boolean;
  isPreview?: boolean;
  isPendingCreation?: boolean;
  initialState?: LessonSnapshot;
  resources: LessonResourceItem[];
}

const getCurriculumLessonKey = (lesson: CurriculumLessonItem) => lesson.id;

/**
 * Media details the lesson editor can show for an attached asset. The editor
 * payload only carries the asset ID and duration, so nothing else is implied.
 */
const getLessonMediaInfo = (
  lesson: Pick<CurriculumLessonItem, "contentMediaId" | "contentType" | "durationSeconds">,
): AttachedMediaInfo | null =>
  lesson.contentMediaId
    ? {
        id: lesson.contentMediaId,
        durationSeconds: lesson.durationSeconds || undefined,
        thumbnailUrl:
          lesson.contentType === "video"
            ? mediaService.getVideoThumbnailUrl(lesson.contentMediaId)
            : undefined,
      }
    : null;

/**
 * The playback API numbers lessons by their order across the whole course
 * (sections by position, then lessons by position). Lessons that are not
 * saved yet do not exist server-side and are not counted.
 */
const getCourseWideLessonNumber = (
  curriculumSections: readonly CurriculumSectionItem[],
  lessonId: string,
): number | undefined => {
  let lessonNumber = 0;
  for (const section of curriculumSections) {
    for (const lesson of section.lessons) {
      if (lesson.isPendingCreation) continue;
      lessonNumber += 1;
      if (lesson.id === lessonId) return lessonNumber;
    }
  }
  return undefined;
};

interface CurriculumSectionItem {
  id: string;
  title: string;
  isExpanded: boolean;
  isEditingTitle?: boolean;
  isPendingCreation?: boolean;
  lessons: CurriculumLessonItem[];
}

interface DraggedLessonState {
  sectionId: string;
  lessonId: string;
}

interface LessonDropTarget {
  sectionId: string;
  lessonId: string;
  position: "before" | "after";
}

function LessonDropIndicator() {
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

const MemoizedLessonCard = memo(
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

export type CourseWizardStepId =
  "basics" | "curriculum" | "access-rules" | "pricing" | "extras" | "publish";

type WizardStepIcon = ComponentType<{
  size?: number;
  weight?: "bold" | "duotone" | "fill" | "regular";
  className?: string;
}>;

export interface WizardStepDefinition {
  id: CourseWizardStepId;
  label: string;
  Icon: WizardStepIcon;
  tone: "blue" | "cyan" | "gold" | "green" | "orange" | "rose" | "violet";
}

export const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  { id: "basics", label: "Basics", Icon: BookOpen, tone: "blue" },
  { id: "curriculum", label: "Curriculum", Icon: ListBullets, tone: "violet" },
  { id: "access-rules", label: "Access Rules", Icon: LockKey, tone: "gold" },
  { id: "pricing", label: "Pricing", Icon: Tag, tone: "green" },
  { id: "extras", label: "Extras", Icon: PuzzlePiece, tone: "orange" },
  { id: "publish", label: "Publish", Icon: Lightning, tone: "rose" },
];

export const WIZARD_STEP_IDS: readonly CourseWizardStepId[] = WIZARD_STEPS.map(({ id }) => id);

const COURSE_WIZARD_ARROW_KEY_OWNER_SELECTOR = [
  '[role="dialog"]',
  '[role="grid"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="tab"]',
  '[role="tree"]',
].join(",");

function getAdjacentWizardSteps(activeStep: CourseWizardStepId): Set<CourseWizardStepId> {
  const index = WIZARD_STEP_IDS.indexOf(activeStep);
  const mounted = new Set<CourseWizardStepId>([activeStep]);
  const previous = WIZARD_STEP_IDS[index - 1];
  const following = WIZARD_STEP_IDS[index + 1];
  if (previous) mounted.add(previous);
  if (following) mounted.add(following);
  return mounted;
}

type ThumbnailUploadStatus =
  "idle" | "uploading" | "confirming" | "processing" | "saving" | "error";

type ChecklistState = "idle" | "validating" | "valid" | "invalid";

// Basics State Model & Normalization
export interface BasicsFormState {
  title: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "";
  language: string;
  instructorAlias: string;
  showInstructorName: boolean;
}

export const initialBasicsState: BasicsFormState = {
  title: "",
  shortDescription: "",
  description: "",
  categoryId: "",
  difficulty: "",
  language: "en",
  instructorAlias: "",
  showInstructorName: true,
};

export const normalizeBasicsState = (raw?: Partial<BasicsFormState> | null): BasicsFormState => ({
  title: raw?.title ?? "",
  shortDescription: raw?.shortDescription ?? "",
  description: raw?.description ?? "",
  categoryId: raw?.categoryId ?? "",
  difficulty: (raw?.difficulty ?? "") as BasicsFormState["difficulty"],
  language: raw?.language || "en",
  instructorAlias: raw?.instructorAlias ?? "",
  showInstructorName:
    raw?.showInstructorName !== undefined ? Boolean(raw.showInstructorName) : true,
});

function getThumbnailUploadErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Thumbnail upload failed. Please try again.";
}

export const isBasicsMetaEqual = (a: BasicsFormState, b: BasicsFormState): boolean => {
  const normA = normalizeBasicsState(a);
  const normB = normalizeBasicsState(b);
  return (
    normA.title === normB.title &&
    normA.shortDescription === normB.shortDescription &&
    normA.description === normB.description &&
    normA.categoryId === normB.categoryId &&
    normA.difficulty === normB.difficulty &&
    normA.instructorAlias === normB.instructorAlias
  );
};

export const isBasicsSettingsEqual = (a: BasicsFormState, b: BasicsFormState): boolean => {
  const normA = normalizeBasicsState(a);
  const normB = normalizeBasicsState(b);
  return normA.language === normB.language && normA.showInstructorName === normB.showInstructorName;
};

export const isBasicsEqual = (a: BasicsFormState, b: BasicsFormState): boolean => {
  return isBasicsMetaEqual(a, b) && isBasicsSettingsEqual(a, b);
};

export type BasicsFieldKey =
  "title" | "shortDescription" | "courseDescription" | "instructorAlias" | "showInstructorName";

export const BasicsFieldStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch size={12} className="shrink-0 animate-spin text-(--accent)" />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle size={12} weight="fill" className="shrink-0 text-rose-500" />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export type AccessRulesControlKey =
  | "accessType"
  | "durationMode"
  | "fixedDuration"
  | "enableQA"
  | "enableComments"
  | "enableDownloads"
  | "enableNotes";

export const AccessRulesControlStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch size={12} className="shrink-0 animate-spin text-(--accent)" />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle size={12} weight="fill" className="shrink-0 text-rose-500" />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export type PricingControlKey =
  "pricingType" | "currency" | "sellingPrice" | "originalPrice" | "pricingDetails";

export const PricingControlStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch size={12} className="shrink-0 animate-spin text-(--accent)" />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle size={12} weight="fill" className="shrink-0 text-rose-500" />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export type ExtrasControlKey = "enableCertificate" | "inclusions" | (string & {});

export const ExtrasControlStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch size={12} className="shrink-0 animate-spin text-(--accent)" />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle size={12} weight="fill" className="shrink-0 text-rose-500" />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export type CurriculumItemKey = string;

export const CurriculumItemStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch size={12} className="shrink-0 animate-spin text-(--accent)" />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle size={12} weight="fill" className="shrink-0 text-rose-500" />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export type PublishControlKey = string;

export const PublishControlStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch size={12} className="shrink-0 animate-spin text-(--accent)" />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle size={12} weight="fill" className="shrink-0 text-rose-500" />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export function formatIsoToDatetimeLocal(isoString?: string | null): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
}

export function formatDatetimeLocalToIso(localString?: string | null): string | null {
  if (!localString || !localString.trim()) return null;
  try {
    const d = new Date(localString);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

// Access Rules State Model & Normalization
export type AccessType = "everyone" | "restricted";
export type AccessDurationMode = "lifetime" | "fixed" | "";
export type DurationUnit = "Days" | "Weeks" | "Months" | "Years";

export interface AccessRulesFormState {
  accessType: AccessType;
  durationMode: AccessDurationMode;
  fixedDurationValue: number;
  fixedDurationUnit: DurationUnit;
  enableQA: boolean;
  enableComments: boolean;
  enableDownloads: boolean;
  enableNotes: boolean;
}

export const initialAccessRulesState: AccessRulesFormState = {
  accessType: "everyone",
  durationMode: "",
  fixedDurationValue: 30,
  fixedDurationUnit: "Days",
  enableQA: true,
  enableComments: true,
  enableDownloads: false,
  enableNotes: true,
};

export const normalizeAccessRulesState = (
  raw?: Partial<AccessRulesFormState> | null,
): AccessRulesFormState => ({
  accessType: (raw?.accessType || "everyone") as AccessType,
  durationMode: (raw?.durationMode || "") as AccessDurationMode,
  fixedDurationValue: typeof raw?.fixedDurationValue === "number" ? raw.fixedDurationValue : 30,
  fixedDurationUnit: (raw?.fixedDurationUnit || "Days") as DurationUnit,
  enableQA: raw?.enableQA !== undefined ? Boolean(raw.enableQA) : true,
  enableComments: raw?.enableComments !== undefined ? Boolean(raw.enableComments) : true,
  enableDownloads: raw?.enableDownloads !== undefined ? Boolean(raw.enableDownloads) : false,
  enableNotes: raw?.enableNotes !== undefined ? Boolean(raw.enableNotes) : true,
});

export const isAccessRuleConfigEqual = (
  a: AccessRulesFormState,
  b: AccessRulesFormState,
): boolean => {
  const normA = normalizeAccessRulesState(a);
  const normB = normalizeAccessRulesState(b);
  const durationMatch =
    normA.durationMode === normB.durationMode &&
    (normA.durationMode !== "fixed" ||
      (normA.fixedDurationValue === normB.fixedDurationValue &&
        normA.fixedDurationUnit === normB.fixedDurationUnit));
  return normA.accessType === normB.accessType && durationMatch;
};

export const isAccessSettingsEqual = (
  a: AccessRulesFormState,
  b: AccessRulesFormState,
): boolean => {
  const normA = normalizeAccessRulesState(a);
  const normB = normalizeAccessRulesState(b);
  return (
    normA.enableQA === normB.enableQA &&
    normA.enableComments === normB.enableComments &&
    normA.enableDownloads === normB.enableDownloads &&
    normA.enableNotes === normB.enableNotes
  );
};

export const isAccessRulesEqual = (a: AccessRulesFormState, b: AccessRulesFormState): boolean => {
  return isAccessRuleConfigEqual(a, b) && isAccessSettingsEqual(a, b);
};

// Pricing State Model & Normalization
export type PricingType = "free" | "paid";

export interface PricingFormState {
  pricingType: PricingType;
  sellingPrice: string;
  originalPrice: string;
  currency: string;
}

export type PricingState = PricingFormState;

export const initialPricingState: PricingFormState = {
  pricingType: "paid",
  sellingPrice: "",
  originalPrice: "",
  currency: "INR",
};

export const normalizePricingState = (
  raw?: Partial<PricingFormState> | null,
): PricingFormState => ({
  pricingType: raw?.pricingType === "free" ? "free" : "paid",
  sellingPrice: raw?.sellingPrice ? String(raw.sellingPrice).trim() : "",
  originalPrice: raw?.originalPrice ? String(raw.originalPrice).trim() : "",
  currency: raw?.currency ? String(raw.currency).trim() : "INR",
});

export const isPricingEqual = (a: PricingFormState, b: PricingFormState): boolean => {
  const normA = normalizePricingState(a);
  const normB = normalizePricingState(b);

  if (normA.pricingType !== normB.pricingType) return false;
  if (normA.currency !== normB.currency) return false;

  if (normA.pricingType === "free") {
    return true;
  }

  return normA.sellingPrice === normB.sellingPrice && normA.originalPrice === normB.originalPrice;
};

// Extras State Model & Normalization (server-backed: certificateEnabled)
export interface ExtrasFormState {
  enableCertificate: boolean;
}

export const initialExtrasState: ExtrasFormState = {
  enableCertificate: false,
};

export const normalizeExtrasState = (raw?: Partial<ExtrasFormState> | null): ExtrasFormState => ({
  enableCertificate: Boolean(raw?.enableCertificate),
});

export const isExtrasEqual = (a: ExtrasFormState, b: ExtrasFormState): boolean => {
  return a.enableCertificate === b.enableCertificate;
};

export interface AutoIncludeItem {
  id: string;
  text: string;
  source: string;
}

export function deriveAutoIncludes(params: {
  durationMode?: string;
  fixedDurationValue?: number;
  fixedDurationUnit?: string;
  enableCertificate?: boolean;
  enableDownloads?: boolean;
  hasPreviewLessons?: boolean;
}): AutoIncludeItem[] {
  const items: AutoIncludeItem[] = [];

  if (params.durationMode === "lifetime") {
    items.push({
      id: "auto-lifetime",
      text: "Full lifetime access",
      source: "Access Rules",
    });
  } else if (
    params.durationMode === "fixed" &&
    params.fixedDurationValue &&
    params.fixedDurationValue > 0
  ) {
    items.push({
      id: "auto-fixed-duration",
      text: `${params.fixedDurationValue} ${String(params.fixedDurationUnit || "Days").toLowerCase()} access`,
      source: "Access Rules",
    });
  }

  if (params.enableCertificate) {
    items.push({
      id: "auto-cert",
      text: "Certificate of completion",
      source: "Certificate",
    });
  }

  if (params.enableDownloads) {
    items.push({
      id: "auto-downloads",
      text: "Downloadable resources",
      source: "Access Rules",
    });
  }

  if (params.hasPreviewLessons) {
    items.push({
      id: "auto-preview",
      text: "Free preview lessons",
      source: "Curriculum",
    });
  }

  return items;
}

export function deriveSuggestedInclusions(params: {
  durationMode?: string;
  fixedDurationValue?: number;
  fixedDurationUnit?: string;
  enableCertificate?: boolean;
  enableDownloads?: boolean;
  hasPreviewLessons?: boolean;
  currentDraft?: Array<{ text: string }>;
}): string[] {
  const suggestions: string[] = [];

  if (params.durationMode === "lifetime") {
    suggestions.push("Full lifetime access");
  } else if (
    params.durationMode === "fixed" &&
    params.fixedDurationValue &&
    params.fixedDurationValue > 0
  ) {
    suggestions.push(
      `${params.fixedDurationValue} ${String(params.fixedDurationUnit || "Days").toLowerCase()} access`,
    );
  }

  if (params.enableCertificate) {
    suggestions.push("Certificate of completion");
  }

  if (params.enableDownloads) {
    suggestions.push("Downloadable resources");
  }

  if (params.hasPreviewLessons) {
    suggestions.push("Free preview lessons");
  }

  suggestions.push(
    "Personal guidance",
    "One-on-one session",
    "Community access",
    "Assignments & feedback",
    "Access on all devices",
  );

  const existing = new Set((params.currentDraft || []).map((d) => d.text.trim().toLowerCase()));

  return suggestions.filter(
    (sug, idx, arr) =>
      arr.findIndex((x) => x.toLowerCase() === sug.toLowerCase()) === idx &&
      !existing.has(sug.toLowerCase()),
  );
}

export const isManualIncludesEqual = (
  draft: Array<{ id: string; text: string }>,
  server: Array<{ id: string; text: string }>,
): boolean => {
  if (draft.length !== server.length) return false;
  for (let i = 0; i < draft.length; i++) {
    const d = draft[i];
    const s = server[i];
    if (!d || !s) return false;
    if (d.id !== s.id) return false;
    if (d.text.trim() !== s.text.trim()) return false;
  }
  return true;
};

export const checkIsCurriculumDirty = (
  sections: Array<{
    id: string;
    isEditingTitle?: boolean;
    lessons: Array<{
      id: string;
      title: string;
      description?: string;
      contentType: "video" | "document" | "quiz" | "audio" | "image";
      contentMediaId?: string | null;
      durationSeconds?: number;
      isPublished?: boolean;
      isPreview?: boolean;
      isPendingCreation?: boolean;
      initialState?: {
        title: string;
        description: string;
        contentType: "video" | "document" | "quiz" | "audio" | "image";
        contentMediaId?: string | null;
        isPublished?: boolean;
        isPreview?: boolean;
      };
    }>;
  }>,
): boolean => {
  const hasEditingSection = sections.some(
    (s) =>
      s.isEditingTitle &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id),
  );
  if (hasEditingSection) return true;

  return sections.some((sec) =>
    sec.lessons.some((les) => {
      if (les.isPendingCreation) return false;
      const init = les.initialState || {
        title: les.title,
        description: les.description || "",
        contentType: les.contentType,
        contentMediaId: les.contentMediaId ?? null,
        isPublished: les.isPublished !== undefined ? les.isPublished : true,
        isPreview: les.isPreview !== undefined ? les.isPreview : false,
      };
      const isPub = les.isPublished !== undefined ? les.isPublished : true;
      const isPrev = les.isPreview !== undefined ? les.isPreview : false;
      const initPub = init.isPublished !== undefined ? init.isPublished : true;
      const initPrev = init.isPreview !== undefined ? init.isPreview : false;

      return (
        les.title.trim() !== init.title.trim() ||
        (les.description || "") !== (init.description || "") ||
        les.contentType !== init.contentType ||
        (les.contentMediaId ?? null) !== (init.contentMediaId ?? null) ||
        isPub !== initPub ||
        isPrev !== initPrev
      );
    }),
  );
};

export function getCurrencyOptions(): Array<
  readonly [string, string, { searchKeywords?: string }?]
> {
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });
    const codes =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("currency")
        : ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "JPY", "CNY", "SGD", "NZD", "CHF", "AED"];

    const list: Array<{ code: string; name: string; label: string }> = [];
    for (const code of codes) {
      try {
        const name = displayNames.of(code) || code;
        list.push({
          code,
          name,
          label: `${name} (${code})`,
        });
      } catch {
        list.push({
          code,
          name: code,
          label: `${code} (${code})`,
        });
      }
    }

    list.sort((a, b) => a.name.localeCompare(b.name));

    return list.map((item) => [
      item.code,
      item.label,
      { searchKeywords: `${item.code} ${item.name}` },
    ]);
  } catch {
    return [
      ["USD", "US Dollar (USD)", { searchKeywords: "USD US Dollar" }],
      ["EUR", "Euro (EUR)", { searchKeywords: "EUR Euro" }],
      ["GBP", "British Pound (GBP)", { searchKeywords: "GBP British Pound" }],
      ["INR", "Indian Rupee (INR)", { searchKeywords: "INR Indian Rupee" }],
    ];
  }
}

export function getCurrencySymbol(currencyCode: string): string {
  if (!currencyCode) return "₹";
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    const symbolPart = parts.find((p) => p.type === "currency");
    return symbolPart ? symbolPart.value : currencyCode;
  } catch {
    const map: Record<string, string> = {
      INR: "₹",
      USD: "$",
      EUR: "€",
      GBP: "£",
      JPY: "¥",
      AUD: "A$",
      CAD: "CA$",
    };
    return map[currencyCode.toUpperCase()] || currencyCode;
  }
}

export function validatePricing(pricing: PricingState): {
  isValid: boolean;
  error: string | null;
} {
  if (pricing.pricingType === "free") {
    return { isValid: true, error: null };
  }

  const rawSell = pricing.sellingPrice.replace(/,/g, "").trim();
  const sellNum = parseFloat(rawSell);

  if (!rawSell || isNaN(sellNum) || sellNum <= 0) {
    return {
      isValid: false,
      error: "Please enter a valid selling price greater than 0.",
    };
  }

  const rawOrig = pricing.originalPrice.replace(/,/g, "").trim();
  if (rawOrig) {
    const origNum = parseFloat(rawOrig);
    if (isNaN(origNum) || origNum <= 0) {
      return {
        isValid: false,
        error: "Original price must be a valid number greater than 0.",
      };
    }
    if (sellNum > origNum) {
      return {
        isValid: false,
        error: "Sale price cannot be greater than original price.",
      };
    }
  }

  return { isValid: true, error: null };
}

const escapeHtml = (str: string) => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const setCustomDragImage = (
  e: React.DragEvent,
  sourceElement: HTMLElement,
  htmlContent: string,
) => {
  if (!e.dataTransfer) return;
  const rect = sourceElement.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.style.position = "fixed";
  ghost.style.top = "-9999px";
  ghost.style.left = "-9999px";
  ghost.style.width = `${Math.round(rect.width)}px`;
  ghost.style.boxSizing = "border-box";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "999999";
  ghost.innerHTML = htmlContent;
  document.body.appendChild(ghost);

  const offsetX = Math.min(Math.max(e.clientX - rect.left, 24), Math.max(rect.width - 24, 24));
  const offsetY = 24;

  e.dataTransfer.effectAllowed = "move";
  try {
    e.dataTransfer.setData("text/plain", "");
    e.dataTransfer.setDragImage(ghost, offsetX, offsetY);
  } catch {
    // fallback if dataTransfer is restricted
  }

  setTimeout(() => {
    if (ghost.parentNode) {
      ghost.parentNode.removeChild(ghost);
    }
  }, 0);
};

const sectionGhostHtml = (title: string, index: number, lessonCount: number) => `
  <div style="
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    border-radius: 12px;
    border: 1.5px solid var(--accent, #6366f1);
    background: var(--surface, #1e1e24);
    color: var(--text, #ffffff);
    box-shadow: 0 14px 32px rgba(0,0,0,0.45);
    box-sizing: border-box;
    font-family: inherit;
  ">
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="display: flex; align-items: center; color: var(--muted, #888); opacity: 0.85;">
        <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
          <path d="M100,60a16,16,0,1,1-16-16A16,16,0,0,1,100,60Zm72-16a16,16,0,1,0,16,16A16,16,0,0,0,172,44ZM84,112a16,16,0,1,0,16,16A16,16,0,0,0,84,112Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,112ZM84,180a16,16,0,1,0,16,16A16,16,0,0,0,84,180Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,180Z"/>
        </svg>
      </span>
      <span style="font-weight: 700; font-size: 0.92rem; color: var(--text, #fff);">
        Section ${index + 1}
      </span>
      <span style="font-weight: 600; font-size: 0.92rem; color: var(--text, #fff);">
        ${escapeHtml(title)}
      </span>
      <span style="font-size: 0.76rem; color: var(--muted, #888); margin-left: 4px;">
        ${lessonCount} ${lessonCount === 1 ? "Lesson" : "Lessons"}
      </span>
    </div>
  </div>
`;

const lessonGhostHtml = (
  title: string,
  index: number,
  contentType: "video" | "document" | "quiz" | "audio" | "image",
) => {
  return `
  <div style="
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1.5px solid var(--accent, #6366f1);
    background: var(--surface, #1e1e24);
    color: var(--text, #ffffff);
    box-shadow: 0 12px 28px rgba(0,0,0,0.4);
    box-sizing: border-box;
    font-family: inherit;
  ">
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="display: flex; align-items: center; color: var(--muted, #888); opacity: 0.85;">
        <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
          <path d="M100,60a16,16,0,1,1-16-16A16,16,0,0,1,100,60Zm72-16a16,16,0,1,0,16,16A16,16,0,0,0,172,44ZM84,112a16,16,0,1,0,16,16A16,16,0,0,0,84,112Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,112ZM84,180a16,16,0,1,0,16,16A16,16,0,0,0,84,180Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,180Z"/>
        </svg>
      </span>
      <span style="display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; color: var(--accent, #6366f1);">
        ${lessonContentTypeIconSvg(contentType)}
      </span>
      <span style="font-weight: 600; font-size: 0.88rem; color: var(--text, #fff);">
        ${index + 1}. ${escapeHtml(title)}
      </span>
    </div>
    <div style="display: flex; align-items: center; gap: 8px; color: var(--muted, #888); opacity: 0.8;">
      <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
        <path d="M216,48H176V40a24.1,24.1,0,0,0-24-24H104A24.1,24.1,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM104,104v48a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm64,0v48a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>
      </svg>
      <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
        <path d="M128,184a8,8,0,0,1-5.66-2.34l-80-80a8,8,0,0,1,11.32-11.32L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32l-80,80A8,8,0,0,1,128,184Z"/>
      </svg>
    </div>
  </div>
`;
};

const inclusionGhostHtml = (text: string) => `
  <div style="
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1.5px solid var(--accent, #6366f1);
    background: var(--surface, #1e1e24);
    color: var(--text, #ffffff);
    box-shadow: 0 10px 24px rgba(0,0,0,0.35);
    box-sizing: border-box;
    font-family: inherit;
  ">
    <span style="display: flex; align-items: center; color: var(--muted, #888); opacity: 0.85;">
      <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
        <path d="M100,60a16,16,0,1,1-16-16A16,16,0,0,1,100,60Zm72-16a16,16,0,1,0,16,16A16,16,0,0,0,172,44ZM84,112a16,16,0,1,0,16,16A16,16,0,0,0,84,112Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,112ZM84,180a16,16,0,1,0,16,16A16,16,0,0,0,84,180Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,180Z"/>
      </svg>
    </span>
    <span style="font-weight: 500; font-size: 0.86rem; color: var(--text, #fff);">
      ${escapeHtml(text || "Inclusion item")}
    </span>
  </div>
`;

export function buildPricingPayload(state: PricingFormState) {
  if (state.pricingType === "free") {
    return {
      pricingType: "free" as const,
      price: 0,
      salePrice: null,
      currency: state.currency || "INR",
    };
  }
  const rawSell = state.sellingPrice.replace(/,/g, "").trim();
  const rawOrig = state.originalPrice.replace(/,/g, "").trim();
  const sellNum = Math.round(parseFloat(rawSell));
  const origNum = rawOrig ? Math.round(parseFloat(rawOrig)) : null;

  const price = origNum && origNum > 0 ? origNum : isNaN(sellNum) ? 0 : sellNum;
  const salePrice = origNum && origNum > 0 ? (isNaN(sellNum) ? null : sellNum) : null;

  return {
    pricingType: "paid" as const,
    price,
    salePrice,
    currency: state.currency || "INR",
  };
}

export interface BuildLocalPreviewParams {
  currentCourseId: string | null;
  courseTitle: string;
  shortDescription: string;
  courseDescription: string;
  categoryId: string;
  difficultyLevel: "beginner" | "intermediate" | "advanced" | "";
  language: string;
  instructorAlias: string;
  showInstructorName: boolean;
  courseVersion: number;
  isPublished: boolean;
  thumbnailMediaId?: string | null;
  trailerMediaId?: string | null;
  sections: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      description?: string | null;
      contentType: "video" | "document" | "quiz" | "audio" | "image";
      contentMediaId?: string | null;
      durationSeconds?: number;
      isPreview?: boolean;
      isPublished?: boolean;
      resources?: Array<{
        id: string;
        name: string;
        mediaAssetId?: string;
      }>;
    }>;
  }>;
  pricingDraft: PricingFormState;
  accessRulesDraft: AccessRulesFormState;
  enableCertificate: boolean;
  manualIncludesDraft: Array<{ id: string; text: string }>;
  editorDefaults?: {
    course?: {
      slug?: string;
      status?: "draft" | "published" | "archived";
      creatorId?: string | null;
      thumbnailMediaId?: string | null;
      trailerMediaId?: string | null;
      createdAt?: string;
      updatedAt?: string;
      publishedAt?: string | null;
      totalDurationSeconds?: number;
    } | null;
    accessRules?: { id?: string } | null;
    pricing?: { id?: string } | null;
    settings?: { id?: string; estimatedDuration?: number | null } | null;
  } | null;
  totalDurationSeconds?: number;
  now?: string;
}

export function buildLocalPreviewData({
  currentCourseId,
  courseTitle,
  shortDescription,
  courseDescription,
  categoryId,
  difficultyLevel,
  language,
  instructorAlias,
  showInstructorName,
  courseVersion,
  isPublished,
  thumbnailMediaId,
  trailerMediaId,
  sections,
  pricingDraft,
  accessRulesDraft,
  enableCertificate,
  manualIncludesDraft,
  editorDefaults,
  totalDurationSeconds,
  now = new Date().toISOString(),
}: BuildLocalPreviewParams): CourseEditorDataResponse | null {
  // Preserve course-title/course-ID boundary without "Untitled Course" fallback
  if (!currentCourseId || !courseTitle.trim()) {
    return null;
  }

  const totalSectionsCount = sections.length;
  const totalLessonsCount = sections.reduce((acc, sec) => acc + (sec.lessons?.length ?? 0), 0);

  const isFixedDuration = accessRulesDraft.durationMode === "fixed";
  const unitMultiplier =
    accessRulesDraft.fixedDurationUnit === "Years"
      ? 365
      : accessRulesDraft.fixedDurationUnit === "Months"
        ? 30
        : accessRulesDraft.fixedDurationUnit === "Weeks"
          ? 7
          : 1;
  const durationDays = isFixedDuration
    ? (accessRulesDraft.fixedDurationValue || 30) * unitMultiplier
    : null;

  const pricingPayload = buildPricingPayload(pricingDraft);

  const courseData: CourseEditorDataResponse["course"] = {
    id: currentCourseId,
    slug: editorDefaults?.course?.slug || "",
    title: courseTitle.trim(),
    shortDescription: shortDescription.trim() || null,
    description: courseDescription.trim() || null,
    difficulty: difficultyLevel ? difficultyLevel : null,
    status: isPublished ? "published" : editorDefaults?.course?.status || "draft",
    creatorId: editorDefaults?.course?.creatorId || null,
    categoryId: categoryId || null,
    thumbnailMediaId:
      thumbnailMediaId !== undefined
        ? thumbnailMediaId
        : editorDefaults?.course?.thumbnailMediaId || null,
    trailerMediaId: trailerMediaId ?? (editorDefaults?.course?.trailerMediaId || null),
    instructorAlias: instructorAlias.trim() || null,
    version: courseVersion,
    createdAt: editorDefaults?.course?.createdAt || now,
    updatedAt: editorDefaults?.course?.updatedAt || now,
    publishedAt: editorDefaults?.course?.publishedAt || null,
    totalSections: totalSectionsCount,
    totalLessons: totalLessonsCount,
    totalDurationSeconds: totalDurationSeconds ?? editorDefaults?.course?.totalDurationSeconds ?? 0,
  };

  const sectionsData: CourseEditorDataResponse["sections"] = sections.map((sec, secIdx) => ({
    id: sec.id,
    courseId: currentCourseId,
    title: sec.title,
    position: secIdx,
    lessons: (sec.lessons || []).map((les, lesIdx) => ({
      id: les.id,
      courseId: currentCourseId,
      sectionId: sec.id,
      title: les.title,
      description: les.description || null,
      contentType: (les.contentType === "audio"
        ? "video"
        : les.contentType === "image"
          ? "document"
          : les.contentType) as "video" | "document" | "quiz",
      contentMediaId: les.contentMediaId ?? null,
      durationSeconds: les.durationSeconds,
      position: lesIdx,
      isPreview: Boolean(les.isPreview),
      isPublished: les.isPublished !== undefined ? les.isPublished : true,
      resources: (les.resources || []).map((res, resIdx) => ({
        id: res.id,
        lessonId: les.id,
        mediaAssetId: res.mediaAssetId || res.id,
        title: res.name,
        position: resIdx,
        createdAt: now,
      })),
    })),
  }));

  const accessRulesData: CourseEditorDataResponse["accessRules"] = {
    id: editorDefaults?.accessRules?.id || "preview-access-rules",
    courseId: currentCourseId,
    accessType: (accessRulesDraft.accessType as AccessType) || "everyone",
    durationType: isFixedDuration ? "fixed_duration" : "lifetime",
    durationDays,
  };

  const pricingData: CourseEditorDataResponse["pricing"] = {
    id: editorDefaults?.pricing?.id || "preview-pricing",
    courseId: currentCourseId,
    pricingType: pricingPayload.pricingType,
    price: pricingPayload.price,
    salePrice: pricingPayload.salePrice,
    currency: pricingPayload.currency,
  };

  const settingsData: CourseEditorDataResponse["settings"] = {
    id: editorDefaults?.settings?.id || "preview-settings",
    courseId: currentCourseId,
    allowQa: accessRulesDraft.enableQA,
    allowComments: accessRulesDraft.enableComments,
    allowDownloads: accessRulesDraft.enableDownloads,
    allowNotes: accessRulesDraft.enableNotes,
    certificateEnabled: enableCertificate,
    showInstructorName: showInstructorName !== false,
    language: language || "en",
    estimatedDuration: editorDefaults?.settings?.estimatedDuration ?? null,
  };

  const includesData: CourseEditorDataResponse["includes"] = manualIncludesDraft
    .filter((inc) => Boolean(inc.text.trim()))
    .map((inc, index) => ({
      id: inc.id,
      courseId: currentCourseId,
      text: inc.text.trim(),
      icon: null,
      position: index,
      createdAt: now,
      updatedAt: now,
    }));

  return {
    course: courseData,
    sections: sectionsData,
    accessRules: accessRulesData,
    pricing: pricingData,
    settings: settingsData,
    includes: includesData,
  };
}

export function parseWizardTab(rawParam: string | null | undefined): CourseWizardStepId | null {
  if (!rawParam) return null;
  const normalized = rawParam.toLowerCase().trim();
  if (normalized === "access" || normalized === "accessrules" || normalized === "access-rules") {
    return "access-rules";
  }
  if (WIZARD_STEPS.some((s) => s.id === normalized)) {
    return normalized as CourseWizardStepId;
  }
  return null;
}

export function CourseWizardSkeleton({
  activeStep = "basics",
}: {
  activeStep?: CourseWizardStepId;
}) {
  return (
    <div
      id="course-wizard-tab-panel"
      className="swipeable-tab-panel course-wizard-tab-content relative flex min-h-0 flex-1 animate-pulse flex-col pt-4 pb-6 max-[640px]:pt-3"
      role="tabpanel"
      aria-labelledby={`course-wizard-tab-${activeStep}`}
      data-testid="course-wizard-skeleton"
      data-wizard-step={activeStep}
    >
      <div className="swipeable-tab-panel__native-slide w-full min-w-0">
        {activeStep === "basics" ? (
          <div className="relative z-10 grid w-full min-w-0 grid-cols-1 items-start gap-6 max-[768px]:gap-4.5 md:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
            {/* Left Column: Basic Information Form */}
            <div className="flex flex-col gap-5">
              <section className="relative z-10 rounded-[14px] bg-(--surface) p-6 shadow-(--card-shadow) max-[768px]:p-4">
                <div className="mb-4.5">
                  <h2 className="m-0 text-[1.18rem] font-[650] tracking-[-0.015em] text-(--text)">
                    Basic Information
                  </h2>
                  <p className="m-0 mt-1 mb-5 text-[0.82rem] text-(--muted)">
                    Update the essential details of your course.
                  </p>
                </div>

                {/* Course Title */}
                <div className="mb-5 flex flex-col gap-2">
                  <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                  <div className="h-11 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                </div>

                {/* Short Description */}
                <div className="mb-5 flex flex-col gap-2">
                  <div className="h-4 w-36 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                  <div className="h-18 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                </div>

                {/* Course Description with Rich Text Toolbar */}
                <div className="mb-5 flex flex-col gap-2">
                  <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                  <div className="overflow-hidden rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                    <div className="flex h-10 items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-3">
                      <div className="h-6 w-16 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                    </div>
                    <div className="h-36 w-full p-3.5">
                      <div className="mb-2.5 h-4 w-3/4 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                      <div className="h-4 w-1/2 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    </div>
                  </div>
                </div>

                {/* 2-Column: Category & Difficulty */}
                <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-24 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-11 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-11 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                  </div>
                </div>

                {/* 2-Column: Language & Instructor Alias */}
                <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-20 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-11 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-11 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                  </div>
                </div>

                {/* Media Uploaders */}
                <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
                  <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] p-3">
                    <div className="mb-2 h-8 w-8 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                    <div className="h-7 w-20 rounded-md bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
                  </div>
                  <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] p-3">
                    <div className="mb-2 h-8 w-8 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                    <div className="h-7 w-20 rounded-md bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Live Course Preview */}
            <div className="flex min-w-0 flex-col gap-5 md:sticky md:top-0 md:self-start">
              <section className="rounded-[14px] bg-(--surface) p-5 shadow-(--card-shadow)">
                <h2 className="m-0 text-[1.1rem] font-[650] text-(--text)">Course Preview</h2>
                <p className="m-0 mt-1 mb-4 text-[0.8rem] text-(--muted)">
                  This is how your course will appear to students.
                </p>

                {/* Aspect-video dashed preview */}
                <div className="mb-4 flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <div className="h-4 w-4 rounded bg-[color-mix(in_srgb,var(--text)_15%,transparent)]" />
                  </div>
                  <div className="h-3 w-44 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="h-5 w-3/4 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                  <div className="flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-3 text-[0.8rem] text-(--muted)">
                    <div className="h-3.5 w-20 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    <div className="h-3.5 w-20 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    <div className="h-3.5 w-16 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                    <div className="h-3 w-full rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    <div className="h-3 w-4/5 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : activeStep === "curriculum" ? (
          <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
            {/* Top Toolbar */}
            <div className="mb-2 flex items-center justify-between max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3">
              <div>
                <h2 className="m-0 text-[1.25rem] font-bold tracking-[-0.015em] text-(--text)">
                  Course Curriculum
                </h2>
                <p className="m-0 mt-1 text-[0.85rem] text-(--muted)">
                  Organize your course into sections and lessons. You can reorder them anytime.
                </p>
              </div>
              <div className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] px-4 text-[0.80rem] font-bold text-white max-[768px]:self-start">
                <Plus size={15} weight="bold" />
                <span>Add Section</span>
              </div>
            </div>

            {/* Section 1 Card */}
            <div className="overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) shadow-(--card-shadow)">
              {/* Section Header */}
              <div className="flex items-center justify-between bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-[18px] py-3.5 select-none max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[12px_14px]">
                <div className="flex items-center gap-3 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:flex-1 max-[768px]:gap-2">
                  <DotsSixVertical size={18} className="shrink-0 text-(--muted) opacity-40" />
                  <CaretDown size={16} className="shrink-0 text-(--muted)" />
                  <div className="h-4.5 w-40 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] max-[640px]:w-28 max-[480px]:w-24" />
                  <div className="h-4.5 max-w-36 flex-1 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                  <div className="h-5 w-18 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[480px]:hidden" />
                </div>
                <div className="flex items-center gap-1.5 max-[768px]:w-full max-[768px]:justify-end max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[768px]:pt-2">
                  <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>

              {/* Lessons List inside Section 1 */}
              <div className="flex flex-col gap-2.5 p-[14px_18px] max-[768px]:p-[12px_14px]">
                {/* Lesson 1 */}
                <div className="flex items-center justify-between gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-3 max-[768px]:p-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <DotsSixVertical size={16} className="shrink-0 text-(--muted) opacity-40" />
                    <PlayCircle
                      size={20}
                      className="shrink-0 text-(--accent) opacity-60"
                      weight="fill"
                    />
                    <div className="h-4 max-w-64 min-w-16 flex-1 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-4 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="h-6 w-16 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[640px]:hidden" />
                    <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>

                {/* Lesson 2 */}
                <div className="flex items-center justify-between gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-3 max-[768px]:p-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <DotsSixVertical size={16} className="shrink-0 text-(--muted) opacity-40" />
                    <PlayCircle
                      size={20}
                      className="shrink-0 text-(--accent) opacity-60"
                      weight="fill"
                    />
                    <div className="h-4 max-w-48 min-w-16 flex-1 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-4 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="h-6 w-16 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[640px]:hidden" />
                    <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>

                {/* Lesson 3 */}
                <div className="flex items-center justify-between gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-3 max-[768px]:p-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <DotsSixVertical size={16} className="shrink-0 text-(--muted) opacity-40" />
                    <PlayCircle
                      size={20}
                      className="shrink-0 text-(--accent) opacity-60"
                      weight="fill"
                    />
                    <div className="h-4 max-w-56 min-w-16 flex-1 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-4 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="h-6 w-16 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[640px]:hidden" />
                    <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>

                {/* Add Lesson action */}
                <div className="mt-1">
                  <div className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-(--muted)">
                    <Plus size={16} />
                    <span>Add Lesson</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2 Card */}
            <div className="overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) shadow-(--card-shadow)">
              <div className="flex items-center justify-between bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-[18px] py-3.5 select-none max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[12px_14px]">
                <div className="flex items-center gap-3 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:flex-1 max-[768px]:gap-2">
                  <DotsSixVertical size={18} className="shrink-0 text-(--muted) opacity-40" />
                  <CaretRight size={16} className="shrink-0 text-(--muted)" />
                  <div className="h-4.5 w-40 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] max-[640px]:w-28 max-[480px]:w-24" />
                  <div className="h-4.5 max-w-44 flex-1 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                  <div className="h-5 w-18 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[480px]:hidden" />
                </div>
                <div className="flex items-center gap-1.5 max-[768px]:w-full max-[768px]:justify-end max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[768px]:pt-2">
                  <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "access-rules" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top Grid: 1. Who can access & 2. Access duration */}
            <div className="grid w-full min-w-0 grid-cols-1 gap-5 max-[768px]:gap-3.5 md:grid-cols-2">
              {/* Card 1: Who can access this course? */}
              <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                    1. Who can access this course?
                  </h3>
                  <p className="m-0 text-[0.83rem] text-(--muted)">
                    Choose who is allowed to access this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Option: Everyone */}
                  <div className="relative flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-3.5 px-4">
                    <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                      <div className="h-2 w-2 rounded-full bg-(--accent)" />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                        Everyone
                      </strong>
                      <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                        Anyone with access to the platform can access this course.
                      </p>
                    </div>
                  </div>

                  {/* Option: Restricted access */}
                  <div className="relative flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-3.5 px-4 opacity-60">
                    <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                    <div className="flex flex-1 flex-col gap-0.75">
                      <div className="flex items-center gap-2">
                        <strong className="text-[0.9rem] leading-[18px] font-[650] text-(--text)">
                          Restricted access
                        </strong>
                        <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-(--muted)">
                          Coming soon
                        </span>
                      </div>
                      <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                        Only users who meet the selected requirements can access this course.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Access duration */}
              <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                    2. Access duration
                  </h3>
                  <p className="m-0 text-[0.83rem] text-(--muted)">
                    Set how long learners can access this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Option 1: Lifetime access */}
                  <div className="relative flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-3.5 px-4">
                    <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                      <div className="h-2 w-2 rounded-full bg-(--accent)" />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                        Lifetime access
                      </strong>
                      <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                        Learners can access this course forever.
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Fixed duration */}
                  <div className="relative flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-3.5 px-4">
                    <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                        Fixed duration
                      </strong>
                      <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                        Set a specific number of days or months learners have access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Additional Settings (Toggles) */}
            <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
              <div className="mb-4.5">
                <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                  3. Additional Settings
                </h3>
                <p className="m-0 text-[0.83rem] text-(--muted)">
                  Configure social and learning features for this course.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4.5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3.5 pr-3">
                    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                      <ChatCircleText size={20} weight="fill" />
                    </div>
                    <div>
                      <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
                        Comments
                      </strong>
                      <p className="m-0 text-[0.8rem] text-(--muted)">
                        Allow learners to comment on course content.
                      </p>
                    </div>
                  </div>
                  <div className="h-6 w-11 rounded-full bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4.5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3.5 pr-3">
                    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                      <NotePencil size={20} weight="bold" />
                    </div>
                    <div>
                      <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
                        Notes
                      </strong>
                      <p className="m-0 text-[0.8rem] text-(--muted)">
                        Allow learners to take notes while learning.
                      </p>
                    </div>
                  </div>
                  <div className="h-6 w-11 rounded-full bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" />
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "pricing" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Course pricing & 2. Price details */}
            <div className="grid w-full min-w-0 grid-cols-1 gap-5 max-[768px]:gap-3.5 md:grid-cols-2">
              {/* Card 1: Course pricing */}
              <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                    1. Course pricing
                  </h3>
                  <p className="m-0 text-[0.83rem] text-(--muted)">
                    Choose how you want to sell this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Radio Option: Free */}
                  <div className="relative flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-3.5 px-4">
                    <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                        Free
                      </strong>
                      <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                        Anyone who can access the course can enroll for free.
                      </p>
                    </div>
                  </div>

                  {/* Radio Option: Paid */}
                  <div className="relative flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-3.5 px-4">
                    <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                      <div className="h-2 w-2 rounded-full bg-(--accent)" />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                        Paid
                      </strong>
                      <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                        Learners must purchase the course to get access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Price details */}
              <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                    2. Price details
                  </h3>
                  <p className="m-0 text-[0.83rem] text-(--muted)">
                    Set the pricing for your course.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[0.84rem] font-semibold text-(--text-secondary)">
                      Currency <span className="ml-0.5 text-[#ff5252]">*</span>
                    </label>
                    <div className="flex h-11 w-full items-center justify-between rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5">
                      <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      <CaretDown size={14} className="text-(--muted)" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-[0.84rem] font-semibold text-(--text-secondary)">
                        Price (INR) <span className="ml-0.5 text-[#ff5252]">*</span>
                      </label>
                      <div className="flex h-11 w-full items-center rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5">
                        <div className="h-4 w-16 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[0.84rem] font-semibold text-(--text-secondary)">
                        Original Price (Optional)
                      </label>
                      <div className="flex h-11 w-full items-center rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5">
                        <div className="h-4 w-16 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Pricing Summary */}
            <div className="flex items-center justify-between rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 shadow-(--card-shadow)">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                  <Tag size={20} weight="bold" />
                </div>
                <div>
                  <div className="mb-1 h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                  <div className="h-3 w-48 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>
              <div className="h-7 w-24 rounded-lg bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]" />
            </div>
          </div>
        ) : activeStep === "extras" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Certificates & 2. This course includes */}
            <div className="grid w-full min-w-0 grid-cols-1 items-start gap-5 max-[768px]:gap-3.5 md:grid-cols-2">
              {/* Card 1: Certificates */}
              <div className="flex h-fit flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                    1. Certificates
                  </h3>
                  <p className="m-0 text-[0.83rem] text-(--muted)">
                    Configure how certificates will be issued for this course.
                  </p>
                </div>

                {/* Enable Certificate Toggle Row */}
                <div className="mb-4.5 flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4.5 py-3.5">
                  <div className="flex min-w-0 flex-col pr-3">
                    <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
                      Enable certificate
                    </strong>
                    <p className="m-0 text-[0.8rem] text-(--muted)">
                      Issue certificates to learners on course completion.
                    </p>
                  </div>
                  <div className="h-6 w-11 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--text)_18%,transparent)]" />
                </div>

                {/* Certificate Configuration Controls */}
                <div className="flex flex-col gap-4.5 opacity-60">
                  {/* Template Selector */}
                  <div className="mb-5 flex flex-col gap-2">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[0.84rem] font-semibold text-(--text-secondary)">
                        Certificate template
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-(--muted)">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-[0.78rem] text-(--muted)">
                      Choose from pre-designed certificate templates.
                    </p>
                    <div className="flex h-10 w-full items-center justify-between rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5">
                      <div className="h-4 w-44 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                      <CaretDown size={14} className="text-(--muted)" />
                    </div>
                  </div>

                  {/* Certificate Issuance Options */}
                  <div className="mb-5 flex flex-col gap-2">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[0.84rem] font-semibold text-(--text-secondary)">
                        Certificate issuance
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-(--muted)">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-[0.78rem] text-(--muted)">
                      Choose when the certificate should be issued.
                    </p>

                    <div className="flex flex-col gap-2.5">
                      {/* Option 1: On course completion */}
                      <div className="relative flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-3.5 px-4">
                        <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                          <div className="h-2 w-2 rounded-full bg-(--accent)" />
                        </div>
                        <div className="flex flex-1 flex-col gap-0.75">
                          <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                            On course completion
                          </strong>
                          <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                            Issue certificate when the learner completes all lessons.
                          </p>
                        </div>
                      </div>

                      {/* Option 2: Minimum completion percentage */}
                      <div className="relative flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-3.5 px-4">
                        <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                        <div className="flex flex-1 flex-col gap-0.75">
                          <div className="flex w-full items-center justify-between">
                            <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                              Minimum completion percentage
                            </strong>
                            <div className="flex items-center gap-1.5">
                              <div className="flex h-8 w-[76px] items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.86rem] font-semibold text-(--muted)">
                                95
                              </div>
                              <span className="text-[0.86rem] font-bold text-(--text)">%</span>
                            </div>
                          </div>
                          <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                            Issue certificate when learner reaches the selected percentage.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: This course includes */}
              <div className="flex h-fit flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                    2. This course includes
                  </h3>
                  <p className="m-0 text-[0.83rem] text-(--muted)">
                    These details are calculated from your curriculum.
                  </p>
                </div>

                {/* 3 Metrics Cards */}
                <div className="mb-6 grid grid-cols-1 gap-3 max-[768px]:gap-2.5 min-[1024px]:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] px-3 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-indigo-500/[0.14] text-indigo-500">
                      <BookOpen size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-4 w-6 rounded bg-[color-mix(in_srgb,var(--text)_16%,transparent)]" />
                      <span className="text-[0.74rem] font-medium text-(--muted)">Sections</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] px-3 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-purple-500/[0.14] text-purple-500">
                      <PlayCircle size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-4 w-6 rounded bg-[color-mix(in_srgb,var(--text)_16%,transparent)]" />
                      <span className="text-[0.74rem] font-medium text-(--muted)">Lessons</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] px-3 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-500/[0.14] text-blue-500">
                      <Clock size={20} weight="bold" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-4 w-8 rounded bg-[color-mix(in_srgb,var(--text)_16%,transparent)]" />
                      <span className="text-[0.74rem] font-medium text-(--muted)">
                        Content length
                      </span>
                    </div>
                  </div>
                </div>

                {/* Course Inclusions Header */}
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="m-0 text-[0.95rem] font-bold text-(--text)">
                      Course inclusions
                    </h4>
                    <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2.5 py-0.75 text-[0.72rem] font-bold text-(--muted)">
                      3 / 6
                    </span>
                  </div>
                  <p className="m-0 text-[0.82rem] leading-normal text-(--muted)">
                    Perks and benefits your learners will receive upon enrolling (max 6 items).
                    Click suggestions below or add custom inclusions.
                  </p>

                  {/* Inclusion items */}
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-2.5 px-3.5">
                      <DotsSixVertical size={18} className="shrink-0 text-(--muted) opacity-40" />
                      <div className="h-4 w-40 flex-1 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      <div className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) opacity-40">
                        <Trash size={14} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-2.5 px-3.5">
                      <DotsSixVertical size={18} className="shrink-0 text-(--muted) opacity-40" />
                      <div className="h-4 w-32 flex-1 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      <div className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) opacity-40">
                        <Trash size={14} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-2.5 px-3.5">
                      <DotsSixVertical size={18} className="shrink-0 text-(--muted) opacity-40" />
                      <div className="h-4 w-36 flex-1 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      <div className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) opacity-40">
                        <Trash size={14} />
                      </div>
                    </div>
                  </div>

                  {/* Suggested perks chips */}
                  <div className="mt-2 flex flex-col gap-2">
                    <span className="text-[0.74rem] font-bold tracking-wider text-(--muted) uppercase">
                      Suggested perks (click to add)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <div className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-3 py-1.5 text-[0.8rem] font-medium text-(--muted)">
                        <Plus size={13} weight="bold" />
                        <span>Community access</span>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-3 py-1.5 text-[0.8rem] font-medium text-(--muted)">
                        <Plus size={13} weight="bold" />
                        <span>Assignments & feedback</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* activeStep === 'publish' */
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Publish settings & 2. Pre-publish Checklist */}
            <div className="grid w-full min-w-0 grid-cols-1 items-start gap-5 max-[768px]:gap-3.5 md:grid-cols-2">
              {/* Card 1: Publish settings */}
              <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                    1. Publish settings
                  </h3>
                  <p className="m-0 text-[0.83rem] text-(--muted)">
                    Choose when and how your course becomes visible.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Status row */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.86rem] font-[650] text-(--text)">Course status</label>
                    <div className="mt-0.5 flex items-center">
                      <span className="inline-flex items-center rounded-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-2.5 py-1 text-[0.8rem] font-bold tracking-[0.04em] text-(--muted) uppercase">
                        Draft
                      </span>
                    </div>
                  </div>

                  {/* Visibility */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.86rem] font-[650] text-(--text)">
                      Course visibility
                    </label>
                    <div className="flex h-10 w-full items-center justify-between rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5">
                      <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      <CaretDown size={14} className="text-(--muted)" />
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[0.86rem] font-[650] text-(--text)">Publish on</label>
                    <div className="relative flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-3 px-4">
                      <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                        <div className="h-2 w-2 rounded-full bg-(--accent)" />
                      </div>
                      <strong className="text-[0.88rem] font-[650] text-(--text)">
                        Publish immediately
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Pre-publish Checklist */}
              <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                    2. Pre-publish Checklist
                  </h3>
                  <p className="m-0 text-[0.83rem] text-(--muted)">
                    Review all required items before publishing your course.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  {/* Step Checklist Items */}
                  {["Basics", "Curriculum", "Access Rules", "Pricing", "Extras"].map(
                    (stepTitle) => (
                      <div
                        key={stepTitle}
                        className="flex items-center justify-between rounded-[10px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle
                            size={20}
                            weight="fill"
                            className="text-green-500 opacity-80"
                          />
                          <strong className="text-[0.9rem] font-[650] text-(--text)">
                            {stepTitle}
                          </strong>
                        </div>
                        <div className="flex items-center gap-2 text-[0.82rem] text-(--muted)">
                          <span>Ready</span>
                          <CaretRight size={16} />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Readiness banner */}
            <div className="flex items-center justify-between rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 shadow-(--card-shadow)">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                  <Lightning size={22} weight="fill" />
                </div>
                <div>
                  <div className="mb-1 h-4.5 w-48 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                  <div className="h-3.5 w-72 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>
              <div className="h-9 w-28 rounded-lg bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export interface CourseCreatePageProps {
  courseId?: string;
  editCourseId?: string;
  onNavigatePage?: NavigateTo;
  bottomNavHidden?: boolean;
}

export function CourseCreatePage({
  courseId: propCourseId,
  editCourseId: propEditCourseId,
  onNavigatePage,
  bottomNavHidden = false,
}: CourseCreatePageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { courseId: routeCourseId, editTab: routeEditTab } = useParams<{
    courseId?: string;
    editTab?: string;
  }>();
  const searchParams = useMemo(
    () => new URLSearchParams(location?.search ?? ""),
    [location?.search],
  );
  const activeEditId =
    propCourseId ||
    propEditCourseId ||
    routeCourseId ||
    searchParams.get("edit") ||
    searchParams.get("courseId") ||
    null;

  const requestedSectionId = searchParams.get("sectionId");
  const requestedLessonId = searchParams.get("lessonId");
  const routeRequestedStep =
    parseWizardTab(routeEditTab) ||
    parseWizardTab(searchParams.get("tab")) ||
    parseWizardTab(searchParams.get("step"));
  const initialStep = routeRequestedStep || "basics";
  const editorRouteIdentity = `${activeEditId || "create"}:${routeRequestedStep || "basics"}`;
  const [activeStep, setActiveStep] = useState<CourseWizardStepId>(initialStep);
  const pendingWizardNavigationRef = useRef<CourseWizardStepId | null>(null);
  const [slideDirection, setSlideDirection] = useState<"right" | "left">("right");
  // Keep the active wizard panel and its immediate neighbors warm for smooth
  // tab navigation. Heavy lesson editors are mounted only when opened below.
  const [mountedTabs, setMountedTabs] = useState<Set<CourseWizardStepId>>(() =>
    getAdjacentWizardSteps(initialStep),
  );

  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const stepsNavRef = useRef<HTMLElement | null>(null);
  const [mountedLessonEditorIds, setMountedLessonEditorIds] = useState<string[]>([]);
  const [editingLessonTarget, setEditingLessonTarget] = useState<{
    sectionId: string;
    lessonId: string;
  } | null>(null);
  const previousEditorRouteIdentityRef = useRef(editorRouteIdentity);

  // Automatically reset lesson editor if navigating away from curriculum step
  useEffect(() => {
    if (activeStep !== "curriculum") {
      setEditingLessonTarget(null);
    }
  }, [activeStep]);

  useEffect(() => {
    setMountedLessonEditorIds([]);
  }, [activeEditId]);

  const rememberLessonEditor = useCallback((lessonId: string) => {
    setMountedLessonEditorIds((previous) => {
      const next = [
        ...previous.filter((mountedLessonId) => mountedLessonId !== lessonId),
        lessonId,
      ];
      return next.slice(-3);
    });
  }, []);

  const navigateToStepRef = useRef<(destination: CourseWizardStepId) => Promise<void>>(
    (async () => {}) as any,
  );
  const [isNavMouseDown, setIsNavMouseDown] = useState(false);
  const [navStartX, setNavStartX] = useState(0);
  const [navScrollLeft, setNavScrollLeft] = useState(0);

  const handleNavMouseDown = (e: React.MouseEvent) => {
    if (!stepsNavRef.current) return;
    setIsNavMouseDown(true);
    setNavStartX(e.pageX - stepsNavRef.current.offsetLeft);
    setNavScrollLeft(stepsNavRef.current.scrollLeft);
  };

  const handleNavMouseLeave = () => {
    setIsNavMouseDown(false);
  };

  const handleNavMouseUp = () => {
    setIsNavMouseDown(false);
  };

  const handleNavMouseMove = (e: React.MouseEvent) => {
    if (!isNavMouseDown || !stepsNavRef.current) return;
    e.preventDefault();
    const x = e.pageX - stepsNavRef.current.offsetLeft;
    const walk = (x - navStartX) * 1.5;
    stepsNavRef.current.scrollLeft = navScrollLeft - walk;
  };

  useEffect(() => {
    const updateIndicator = () => {
      const activeEl = tabRefs.current[activeStep];
      if (!activeEl) return;
      const nav = stepsNavRef.current;
      if (nav) {
        const style = getComputedStyle(activeEl);
        const indicatorToken = style.getPropertyValue("--page-tab-active-indicator").trim();
        const toneToken = style.getPropertyValue("--page-tab-tone").trim();
        const color =
          indicatorToken.includes("--page-tab-tone") || indicatorToken === "var(--page-tab-tone)"
            ? toneToken
            : indicatorToken || "var(--accent)";

        nav.style.setProperty("--page-tab-indicator-left", `${activeEl.offsetLeft}px`);
        nav.style.setProperty("--page-tab-indicator-width", `${activeEl.offsetWidth}px`);
        nav.style.setProperty("--page-tab-indicator-color", color);

        const navWidth = nav.offsetWidth;
        const elLeft = activeEl.offsetLeft;
        const elWidth = activeEl.offsetWidth;
        if (elLeft < nav.scrollLeft || elLeft + elWidth > nav.scrollLeft + navWidth) {
          nav.scrollTo({
            left: elLeft - navWidth / 2 + elWidth / 2,
            behavior: "smooth",
          });
        }
      }
    };
    updateIndicator();
    const rafId = requestAnimationFrame(updateIndicator);
    window.addEventListener("resize", updateIndicator);

    const observer = new MutationObserver(updateIndicator);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        "data-page-tab-colors",
        "data-theme",
        "data-palette",
        "data-sidebar-icon-style",
      ],
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateIndicator);
      observer.disconnect();
    };
  }, [activeStep]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.courseWizardActive = "true";
    }
    return () => {
      if (typeof document !== "undefined") {
        delete document.documentElement.dataset.courseWizardActive;
      }
    };
  }, []);

  useEffect(() => {
    const scrollport = document.getElementById("courses-main-scrollport");
    if (scrollport) {
      scrollport.scrollTop = 0;
    }
    const tabContent = document.getElementById("course-wizard-tab-panel");
    if (tabContent) {
      tabContent.scrollTop = 0;
    }
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [activeStep]);

  useEffect(() => {
    setMountedTabs(getAdjacentWizardSteps(activeStep));
  }, [activeStep]);

  useEffect(() => {
    const navigateWizardTab = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditingShortcutTarget(event.target)) return;

      let destination: WizardStepDefinition | undefined;
      if (event.altKey) {
        const index = getNumberShortcutIndex(event);
        destination = index === null ? undefined : WIZARD_STEPS[index];
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !(
          event.target instanceof Element &&
          event.target.closest(COURSE_WIZARD_ARROW_KEY_OWNER_SELECTOR)
        )
      ) {
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const currentIndex = WIZARD_STEP_IDS.indexOf(activeStep);
        const nextIndex = (currentIndex + offset + WIZARD_STEPS.length) % WIZARD_STEPS.length;
        destination = WIZARD_STEPS[nextIndex];
      }

      if (!destination) return;
      event.preventDefault();
      void navigateToStepRef.current(destination.id);
    };

    document.addEventListener("keydown", navigateWizardTab);
    return () => document.removeEventListener("keydown", navigateWizardTab);
  }, [activeStep]);

  // Keep the URL as the canonical source for the active editor step. Legacy
  // query-string URLs are replaced with the same route structure used by new
  // create and edit links.
  useEffect(() => {
    const canonicalPath = getCourseEditorPath({
      mode: activeEditId ? "edit" : "create",
      courseId: activeEditId,
      step: activeStep,
      sectionId: activeStep === "curriculum" ? requestedSectionId : null,
      lessonId: activeStep === "curriculum" ? requestedLessonId : null,
    });
    const currentPath = `${location.pathname}${location.search}`;
    if (currentPath === canonicalPath) return;

    // Let the route-to-state effect below settle when the user navigates to a
    // different course or enters the editor through a different tab URL.
    if (previousEditorRouteIdentityRef.current !== editorRouteIdentity) {
      return;
    }

    const hasLegacyQueryParams =
      searchParams.has("edit") ||
      searchParams.has("courseId") ||
      searchParams.has("tab") ||
      searchParams.has("step");
    const shouldReplace = location.pathname === "/courses/create" || hasLegacyQueryParams;
    void navigate(canonicalPath, { replace: shouldReplace });
  }, [
    activeEditId,
    activeStep,
    editorRouteIdentity,
    location.pathname,
    location.search,
    navigate,
    requestedLessonId,
    requestedSectionId,
    searchParams,
  ]);

  useEffect(() => {
    if (previousEditorRouteIdentityRef.current === editorRouteIdentity) {
      return;
    }
    previousEditorRouteIdentityRef.current = editorRouteIdentity;
    setActiveStep(initialStep);
    setEditingLessonTarget(null);
  }, [editorRouteIdentity, initialStep]);

  // Basics server-confirmed baseline and local draft states
  const [serverBasics, setServerBasics] = useState<BasicsFormState>(initialBasicsState);
  const [basicsDraft, setBasicsDraft] = useState<BasicsFormState>(initialBasicsState);

  // Derived isDirty for Basics
  const isBasicsDirty = useMemo(
    () => !isBasicsEqual(basicsDraft, serverBasics),
    [basicsDraft, serverBasics],
  );
  const isBasicsDirtyRef = useRef(isBasicsDirty);
  isBasicsDirtyRef.current = isBasicsDirty;

  const courseTitle = basicsDraft.title;
  const shortDescription = basicsDraft.shortDescription;
  const courseDescription = basicsDraft.description;
  const categoryId = basicsDraft.categoryId;
  const difficultyLevel = basicsDraft.difficulty;
  const language = basicsDraft.language;
  const instructorAlias = basicsDraft.instructorAlias;
  const showInstructorName = basicsDraft.showInstructorName;

  const serverBasicsRef = useRef<BasicsFormState>(serverBasics);
  serverBasicsRef.current = serverBasics;
  const basicsDraftRef = useRef<BasicsFormState>(basicsDraft);
  basicsDraftRef.current = basicsDraft;

  const setCourseTitle = (title: string) => {
    setBasicsDraft((prev) => ({ ...prev, title }));
    basicsDraftRef.current = { ...basicsDraftRef.current, title };
  };
  const setShortDescription = (shortDescription: string) => {
    setBasicsDraft((prev) => ({ ...prev, shortDescription }));
    basicsDraftRef.current = { ...basicsDraftRef.current, shortDescription };
  };
  const setCourseDescription = (description: string) => {
    setBasicsDraft((prev) => ({ ...prev, description }));
    basicsDraftRef.current = { ...basicsDraftRef.current, description };
  };
  const setCategoryId = (categoryId: string) => {
    setBasicsDraft((prev) => ({ ...prev, categoryId }));
    basicsDraftRef.current = { ...basicsDraftRef.current, categoryId };
  };
  const setInstructorAlias = (instructorAlias: string) => {
    setBasicsDraft((prev) => ({ ...prev, instructorAlias }));
    basicsDraftRef.current = { ...basicsDraftRef.current, instructorAlias };
  };
  const setShowInstructorName = (showInstructorName: boolean) => {
    setBasicsDraft((prev) => ({ ...prev, showInstructorName }));
    basicsDraftRef.current = { ...basicsDraftRef.current, showInstructorName };
  };

  const [currentCourseId, setCurrentCourseId] = useState<string | null>(activeEditId);
  const [courseVersion, setCourseVersion] = useState<number>(1);
  const courseVersionRef = useRef<number>(courseVersion);
  courseVersionRef.current = courseVersion;
  const currentCourseIdRef = useRef<string | null>(currentCourseId);

  useEffect(() => {
    setCurrentCourseId(activeEditId);
    currentCourseIdRef.current = activeEditId;
    setCourseVersion(1);
    courseVersionRef.current = 1;
  }, [activeEditId]);

  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [thumbnailMediaId, setThumbnailMediaId] = useState<string | null | undefined>(undefined);
  // The upload state is kept for concurrency, rollback, and server-refresh
  // protection. The selected file is shown immediately, so upload progress is
  // intentionally not rendered in the course editor.
  const [thumbnailUploadStatus, setThumbnailUploadStatus] = useState<ThumbnailUploadStatus>("idle");
  const [thumbnailUploadError, setThumbnailUploadError] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const thumbnailMediaIdRef = useRef<string | null>(null);
  const thumbnailUploadStatusRef = useRef<ThumbnailUploadStatus>("idle");
  thumbnailUploadStatusRef.current = thumbnailUploadStatus;
  const thumbnailDirtyRef = useRef(false);
  const thumbnailObjectUrlRef = useRef<string | null>(null);
  const thumbnailUploadAbortControllerRef = useRef<AbortController | null>(null);
  const thumbnailRequestIdRef = useRef(0);
  const thumbnailMountedRef = useRef(true);
  const isThumbnailBusy =
    thumbnailUploadStatus === "uploading" ||
    thumbnailUploadStatus === "confirming" ||
    thumbnailUploadStatus === "processing" ||
    thumbnailUploadStatus === "saving";

  useEffect(() => {
    thumbnailMountedRef.current = true;
    return () => {
      thumbnailMountedRef.current = false;
      thumbnailUploadAbortControllerRef.current?.abort();
      if (thumbnailObjectUrlRef.current) {
        URL.revokeObjectURL(thumbnailObjectUrlRef.current);
      }
    };
  }, []);

  const [videoTrailer, setVideoTrailer] = useState<string | null>(null);
  const videoTrailerInputRef = useRef<HTMLInputElement | null>(null);

  async function handleThumbnailFileSelect(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isThumbnailBusy) return;

    const contentType = file.type.toLowerCase();
    if (!contentType.startsWith("image/")) {
      setThumbnailUploadError("Please choose an image file for the thumbnail.");
      setThumbnailUploadStatus("error");
      return;
    }
    if (file.size <= 0) {
      setThumbnailUploadError("The selected thumbnail is empty.");
      setThumbnailUploadStatus("error");
      return;
    }
    if (file.size > MEDIA_MAX_SIZES.image) {
      setThumbnailUploadError("Thumbnail images must be 10 MB or smaller.");
      setThumbnailUploadStatus("error");
      return;
    }

    const targetCourseId = currentCourseIdRef.current || currentCourseId;
    if (!targetCourseId) {
      setThumbnailUploadError("Save the course title before uploading a thumbnail.");
      setThumbnailUploadStatus("error");
      return;
    }

    const requestId = ++thumbnailRequestIdRef.current;
    const previousThumbnail = thumbnail;
    const previousMediaId = thumbnailMediaIdRef.current;
    const previousObjectUrl = thumbnailObjectUrlRef.current;
    const imageUrl = URL.createObjectURL(file);

    thumbnailObjectUrlRef.current = imageUrl;
    thumbnailDirtyRef.current = true;
    setThumbnail(imageUrl);
    setThumbnailUploadError(null);
    setThumbnailUploadStatus("uploading");

    const requestIsActive = () =>
      thumbnailMountedRef.current && thumbnailRequestIdRef.current === requestId;

    const restorePreviousThumbnail = () => {
      if (!requestIsActive()) return;
      URL.revokeObjectURL(imageUrl);
      thumbnailObjectUrlRef.current = previousObjectUrl;
      thumbnailMediaIdRef.current = previousMediaId;
      setThumbnail(previousThumbnail);
      setThumbnailMediaId(previousMediaId);
      thumbnailDirtyRef.current = false;
    };

    const uploadAbortController = new AbortController();
    thumbnailUploadAbortControllerRef.current = uploadAbortController;

    try {
      if (!(await flushBasicsPersistence()) || !requestIsActive()) {
        throw new Error("Save the course details before uploading a thumbnail.");
      }

      const presigned = await mediaService.presignMediaUpload({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
        type: "image",
        visibility: "public",
      });

      if (!requestIsActive()) return;

      await mediaService.uploadFileToPresignedUrl(
        presigned.uploadUrl,
        file,
        undefined,
        uploadAbortController.signal,
      );

      if (!requestIsActive()) return;
      setThumbnailUploadStatus("confirming");
      const confirmation = await mediaService.confirmUpload(presigned.mediaAssetId);

      if (!requestIsActive()) return;
      setThumbnailUploadStatus("processing");
      const processedThumbnailUrl = await waitForCourseThumbnailCdnUrl(presigned.mediaAssetId, {
        signal: uploadAbortController.signal,
      });

      if (!requestIsActive()) return;
      setThumbnailUploadStatus("saving");

      const updated = await updateBasicsMutation.mutateAsync({
        id: targetCourseId,
        payload: {
          thumbnailMediaId: presigned.mediaAssetId,
          version: courseVersionRef.current,
        },
      });

      if (!requestIsActive()) return;

      setCourseVersion(updated.version);
      courseVersionRef.current = updated.version;
      thumbnailMediaIdRef.current = presigned.mediaAssetId;
      setThumbnailMediaId(presigned.mediaAssetId);
      setThumbnail(updated.thumbnailUrl ?? processedThumbnailUrl);
      thumbnailDirtyRef.current = false;
      setThumbnailUploadStatus("idle");
      setThumbnailUploadError(null);

      if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
      thumbnailObjectUrlRef.current = null;
    } catch (error: unknown) {
      if (!requestIsActive() || (error instanceof Error && error.name === "AbortError")) {
        return;
      }

      restorePreviousThumbnail();
      setThumbnailUploadStatus("error");
      setThumbnailUploadError(getThumbnailUploadErrorMessage(error));
    } finally {
      if (thumbnailUploadAbortControllerRef.current === uploadAbortController) {
        thumbnailUploadAbortControllerRef.current = null;
      }
    }
  }

  const triggerThumbnailUpload = () => {
    thumbnailInputRef.current?.click();
  };

  async function handleRemoveThumbnail(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }

    if (isThumbnailBusy) return;

    const previousThumbnail = thumbnail;
    const previousMediaId = thumbnailMediaIdRef.current;
    const previousObjectUrl = thumbnailObjectUrlRef.current;
    const targetCourseId = currentCourseIdRef.current || currentCourseId;

    if (!targetCourseId || !previousMediaId) {
      if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
      thumbnailObjectUrlRef.current = null;
      thumbnailDirtyRef.current = false;
      thumbnailMediaIdRef.current = null;
      setThumbnailMediaId(null);
      setThumbnail(null);
      setThumbnailUploadError(null);
      setThumbnailUploadStatus("idle");
      return;
    }

    const requestId = ++thumbnailRequestIdRef.current;
    thumbnailDirtyRef.current = true;
    setThumbnail(null);
    setThumbnailMediaId(null);
    setThumbnailUploadError(null);
    setThumbnailUploadStatus("saving");

    try {
      if (!(await flushBasicsPersistence())) {
        throw new Error("Save the course details before removing the thumbnail.");
      }

      const updated = await updateBasicsMutation.mutateAsync({
        id: targetCourseId,
        payload: {
          thumbnailMediaId: null,
          version: courseVersionRef.current,
        },
      });

      if (!thumbnailMountedRef.current || thumbnailRequestIdRef.current !== requestId) {
        return;
      }

      setCourseVersion(updated.version);
      courseVersionRef.current = updated.version;
      thumbnailMediaIdRef.current = null;
      thumbnailDirtyRef.current = false;
      setThumbnailUploadStatus("idle");
      setThumbnailUploadError(null);
      if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
      thumbnailObjectUrlRef.current = null;
    } catch (error: unknown) {
      if (!thumbnailMountedRef.current || thumbnailRequestIdRef.current !== requestId) {
        return;
      }

      thumbnailDirtyRef.current = false;
      thumbnailMediaIdRef.current = previousMediaId;
      setThumbnailMediaId(previousMediaId);
      setThumbnail(previousThumbnail);
      setThumbnailUploadStatus("error");
      setThumbnailUploadError(
        error instanceof Error ? error.message : "Thumbnail removal failed. Please try again.",
      );
    }
  }

  const handleVideoTrailerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const videoUrl = URL.createObjectURL(file);
      setVideoTrailer(videoUrl);
    }
  };

  const handleTrailerMediaAttached = async (mediaAssetId: string): Promise<boolean> => {
    if (!currentCourseId || !editorData?.course) return false;

    try {
      await updateBasicsMutation.mutateAsync({
        id: currentCourseId,
        payload: {
          trailerMediaId: mediaAssetId,
          version: editorData.course.version,
        },
      });
      await refetchEditor();
      return true;
    } catch {
      return false;
    }
  };

  const triggerVideoTrailerUpload = () => {
    videoTrailerInputRef.current?.click();
  };

  const handleRemoveVideoTrailer = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVideoTrailer(null);
    if (videoTrailerInputRef.current) {
      videoTrailerInputRef.current.value = "";
    }
  };

  // Immediate persistence states for Basics interactive controls
  const [savingBasicsControls, setSavingBasicsControls] = useState<Set<string>>(() => new Set());
  const savingBasicsControlsRef = useRef<Set<string>>(new Set());
  const basicsVersionRef = useRef<number>(0);
  const inFlightBasicsControlsRef = useRef<Record<string, number>>({
    title: 0,
    shortDescription: 0,
    courseDescription: 0,
    instructorAlias: 0,
    showInstructorName: 0,
  });
  const inFlightBasicsPromiseRef = useRef<Promise<unknown> | null>(null);
  /**
   * Shared in-flight new-course creation promise.
   * Registered BEFORE the first await so every concurrent caller joins the
   * same POST /courses request instead of firing a new one.
   * Cleared in the finally block after success or failure.
   */
  const inFlightCourseCreationPromiseRef = useRef<Promise<{
    id: string;
    version: number;
    title: string;
    instructorAlias?: string | null;
  }> | null>(null);

  /**
   * 1-second debounce timer for initial new-course title creation.
   * Cleared whenever the user presses Enter, blurs, navigates, saves, or unmounts.
   */
  const titleCreationDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTitleCreationDebounce = () => {
    if (titleCreationDebounceTimerRef.current) {
      clearTimeout(titleCreationDebounceTimerRef.current);
      titleCreationDebounceTimerRef.current = null;
    }
  };

  const markBasicsControlSaving = (controlKey: string, isSaving: boolean) => {
    if (isSaving) {
      savingBasicsControlsRef.current.add(controlKey);
    } else {
      savingBasicsControlsRef.current.delete(controlKey);
    }
    setSavingBasicsControls(new Set(savingBasicsControlsRef.current));
  };

  const isBasicsControlSaving = (controlKey: string) =>
    savingBasicsControlsRef.current.has(controlKey) ||
    (inFlightBasicsControlsRef.current[controlKey] ?? 0) > 0;

  const [basicsFieldStatus, setBasicsFieldStatus] = useState<
    Partial<Record<BasicsFieldKey, "saved" | "failed" | null>>
  >({});
  const basicsFieldTimersRef = useRef<
    Partial<Record<BasicsFieldKey, ReturnType<typeof setTimeout>>>
  >({});
  const [basicsSaveFailed, setBasicsSaveFailed] = useState(false);
  const [showBasicsSavedBriefly, setShowBasicsSavedBriefly] = useState(false);
  const basicsSavedBrieflyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerBasicsSavedBriefly = () => {
    if (basicsSavedBrieflyTimerRef.current) {
      clearTimeout(basicsSavedBrieflyTimerRef.current);
    }
    setShowBasicsSavedBriefly(true);
    basicsSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowBasicsSavedBriefly(false);
      basicsSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (titleCreationDebounceTimerRef.current) {
        clearTimeout(titleCreationDebounceTimerRef.current);
        titleCreationDebounceTimerRef.current = null;
      }
      Object.values(basicsFieldTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (basicsSavedBrieflyTimerRef.current) {
        clearTimeout(basicsSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearBasicsFieldStatus = (fieldKey: BasicsFieldKey) => {
    if (basicsFieldTimersRef.current[fieldKey]) {
      clearTimeout(basicsFieldTimersRef.current[fieldKey]);
      delete basicsFieldTimersRef.current[fieldKey];
    }
    setBasicsFieldStatus((prev) => {
      if (!prev[fieldKey]) return prev;
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
    setBasicsSaveFailed(false);
    if (basicsSavedBrieflyTimerRef.current) {
      clearTimeout(basicsSavedBrieflyTimerRef.current);
      basicsSavedBrieflyTimerRef.current = null;
    }
    setShowBasicsSavedBriefly(false);
  };

  const markBasicsFieldSaved = (fieldKey: BasicsFieldKey) => {
    if (basicsFieldTimersRef.current[fieldKey]) {
      clearTimeout(basicsFieldTimersRef.current[fieldKey]);
      delete basicsFieldTimersRef.current[fieldKey];
    }
    setBasicsFieldStatus((prev) => ({ ...prev, [fieldKey]: "saved" }));
    setBasicsSaveFailed(false);
    triggerBasicsSavedBriefly();

    basicsFieldTimersRef.current[fieldKey] = setTimeout(() => {
      setBasicsFieldStatus((prev) => {
        if (prev[fieldKey] !== "saved") return prev;
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
      delete basicsFieldTimersRef.current[fieldKey];
    }, 1500);
  };

  const markBasicsFieldFailed = (fieldKey: BasicsFieldKey) => {
    if (basicsFieldTimersRef.current[fieldKey]) {
      clearTimeout(basicsFieldTimersRef.current[fieldKey]);
      delete basicsFieldTimersRef.current[fieldKey];
    }
    setBasicsFieldStatus((prev) => ({ ...prev, [fieldKey]: "failed" }));
    setBasicsSaveFailed(true);
    if (basicsSavedBrieflyTimerRef.current) {
      clearTimeout(basicsSavedBrieflyTimerRef.current);
      basicsSavedBrieflyTimerRef.current = null;
    }
    setShowBasicsSavedBriefly(false);
  };

  const getBasicsFieldDisplayStatus = (
    fieldKey: BasicsFieldKey,
  ): "saving" | "saved" | "failed" | null => {
    if (
      savingBasicsControls.has(fieldKey) ||
      (inFlightBasicsControlsRef.current[fieldKey] ?? 0) > 0 ||
      (!currentCourseId && fieldKey === "title" && createCourseMutation.isPending)
    ) {
      return "saving";
    }
    return basicsFieldStatus[fieldKey] ?? null;
  };

  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addCategoryError, setAddCategoryError] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const isEditing = Boolean(activeEditId);
  const isCourseTitleFilled = Boolean(courseTitle.trim());
  const [isInitialCurriculumBootstrapInProgress, setIsInitialCurriculumBootstrapInProgress] =
    useState(false);
  const isInitialCurriculumBootstrapInProgressRef = useRef(false);
  isInitialCurriculumBootstrapInProgressRef.current = isInitialCurriculumBootstrapInProgress;

  // Downstream tabs and fields are unlocked ONLY after a confirmed server-side
  // course ID exists AND initial curriculum bootstrap (Introduction section + lesson) has completed.
  const isDownstreamUnlocked = Boolean(currentCourseId) && !isInitialCurriculumBootstrapInProgress;

  useEffect(() => {
    currentCourseIdRef.current = currentCourseId;
  }, [currentCourseId]);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);

  useEffect(() => {
    if (!currentCourseId && !isCourseTitleFilled && activeStep === "basics") {
      titleInputRef.current?.focus();
    }
  }, [currentCourseId, isCourseTitleFilled, activeStep]);

  // Keep state synced if URL params change (e.g. popstate / back-forward navigation)
  useEffect(() => {
    const tabFromUrl =
      parseWizardTab(routeEditTab) ||
      parseWizardTab(searchParams.get("tab")) ||
      parseWizardTab(searchParams.get("step"));
    const pendingWizardNavigation = pendingWizardNavigationRef.current;
    if (pendingWizardNavigation) {
      if (tabFromUrl === pendingWizardNavigation) {
        pendingWizardNavigationRef.current = null;
      } else {
        return;
      }
    }
    if (
      tabFromUrl &&
      tabFromUrl !== activeStep &&
      (isDownstreamUnlocked || Boolean(activeEditId) || tabFromUrl === "basics")
    ) {
      setActiveStep(tabFromUrl);
    }
  }, [searchParams, routeEditTab, isDownstreamUnlocked, activeEditId, activeStep]);

  const { data: serverCategories = EMPTY_CATEGORIES, isLoading: isLoadingCategories } =
    useCategories();
  const {
    data: editorData,
    isLoading: isLoadingEditor,
    isFetching: isFetchingEditor,
    isError: isEditorError,
    error: editorError,
    refetch: refetchEditor,
  } = useCourseEditor(currentCourseId);
  const isInitialLoadingCourse = isEditing && (isLoadingEditor || isFetchingEditor) && !editorData;
  const {
    data: previewData,
    isLoading: isPreviewLoading,
    isError: isPreviewError,
    refetch: refetchPreview,
  } = useCoursePreview(currentCourseId, {
    enabled: isPreviewModalOpen && Boolean(currentCourseId),
  });
  const {
    data: serverValidation,
    refetch: refetchValidation,
    isFetching: isValidating,
  } = useCourseValidation(currentCourseId, {
    enabled: activeStep === "publish",
  });
  const createCourseMutation = useCreateCourse();
  const updateBasicsMutation = useUpdateCourseBasics();
  const createSectionMutation = useCreateSection();
  const updateSectionMutation = useUpdateSection();
  const deleteSectionMutation = useDeleteSection();
  const reorderSectionsMutation = useReorderSections();
  const createLessonMutation = useCreateLesson();
  const createLessonResourceMutation = useCreateLessonResource();
  const updateLessonMutation = useUpdateLesson();
  const deleteLessonMutation = useDeleteLesson();
  const deleteLessonResourceMutation = useDeleteLessonResource();
  const reorderLessonsMutation = useReorderLessons();
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [creatingLessonSectionId, setCreatingLessonSectionId] = useState<string | null>(null);
  const [savingLessonId, setSavingLessonId] = useState<string | null>(null);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [reorderingLessonsSectionId, setReorderingLessonsSectionId] = useState<string | null>(null);
  const [isReorderingSections, setIsReorderingSections] = useState<boolean>(false);
  const [isReorderingIncludes, setIsReorderingIncludes] = useState<boolean>(false);
  const [updatingSectionId, setUpdatingSectionId] = useState<string | null>(null);
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null);
  const createCategoryMutation = useCreateCategory();
  const deleteCategoryMutation = useDeleteCategory();
  const upsertAccessRulesMutation = useUpsertAccessRules();
  const upsertSettingsMutation = useUpsertSettings();
  const upsertPricingMutation = useUpsertPricing();
  const createIncludeMutation = useCreateCourseInclude();
  const updateIncludeMutation = useUpdateCourseInclude();
  const deleteIncludeMutation = useDeleteCourseInclude();
  const reorderIncludesMutation = useReorderCourseIncludes();
  const publishCourseMutation = usePublishCourse();
  const unpublishCourseMutation = useUnpublishCourse();

  // Footer Action Loading States
  const [actionLoading, setActionLoading] = useState<
    "draft" | "save" | "publish" | "unpublish" | "validate" | null
  >(null);
  const saveActionInFlightRef = useRef(false);

  // Page-specific in-flight save states
  const [isSavingBasics, setIsSavingBasics] = useState(false);
  const [isSavingCurriculum, setIsSavingCurriculum] = useState(false);
  const [isSavingAccessRules, setIsSavingAccessRules] = useState(false);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isSavingExtras, setIsSavingExtras] = useState(false);
  const [isSavingPublish, setIsSavingPublish] = useState(false);

  const isBasicsSaving = isSavingBasics;
  const isCurriculumSaving = isSavingCurriculum;
  const isAccessRulesSaving = isSavingAccessRules;
  const isPricingSaving = isSavingPricing;
  const isExtrasSaving = isSavingExtras;
  const isPublishSaving = isSavingPublish;

  const isInitialCourseCreationPending =
    (!currentCourseId || isInitialCurriculumBootstrapInProgress) &&
    (createCourseMutation.isPending ||
      isInitialCurriculumBootstrapInProgress ||
      isSavingBasics ||
      savingBasicsControls.has("title"));

  const isAnyBasicsSaving =
    savingBasicsControls.size > 0 ||
    isSavingBasics ||
    Boolean(inFlightBasicsPromiseRef.current) ||
    (inFlightBasicsControlsRef.current.title ?? 0) > 0 ||
    (inFlightBasicsControlsRef.current.shortDescription ?? 0) > 0 ||
    (inFlightBasicsControlsRef.current.courseDescription ?? 0) > 0 ||
    (inFlightBasicsControlsRef.current.instructorAlias ?? 0) > 0 ||
    (inFlightBasicsControlsRef.current.showInstructorName ?? 0) > 0;

  const hasBasicsFieldFailed =
    basicsSaveFailed || Object.values(basicsFieldStatus).some((status) => status === "failed");

  const basicsOverallStatus = useMemo((): "saving" | "failed" | "saved" | null => {
    if (isAnyBasicsSaving) return "saving";
    if (hasBasicsFieldFailed) return "failed";
    if (showBasicsSavedBriefly) return "saved";
    return null;
  }, [isAnyBasicsSaving, hasBasicsFieldFailed, showBasicsSavedBriefly]);

  const isMutatingCount = useIsMutating();

  const isAnyApiInProgress =
    isMutatingCount > 0 ||
    actionLoading !== null ||
    isBasicsSaving ||
    isCurriculumSaving ||
    isAccessRulesSaving ||
    isPricingSaving ||
    isExtrasSaving ||
    isPublishSaving ||
    isCreatingSection ||
    creatingLessonSectionId !== null ||
    savingLessonId !== null ||
    deletingLessonId !== null ||
    isReorderingSections ||
    reorderingLessonsSectionId !== null ||
    isReorderingIncludes ||
    reorderIncludesMutation.isPending ||
    updatingSectionId !== null ||
    deletingSectionId !== null ||
    createCategoryMutation.isPending ||
    deleteCategoryMutation.isPending ||
    publishCourseMutation.isPending ||
    unpublishCourseMutation.isPending ||
    isValidating ||
    isThumbnailBusy ||
    isPreviewLoading;

  const selectedCategoryName = useMemo(() => {
    return serverCategories.find((c) => c.id === categoryId)?.name || "";
  }, [serverCategories, categoryId]);

  const handleOpenAddCategoryModal = () => {
    setNewCategoryName("");
    setAddCategoryError("");
    setIsAddCategoryModalOpen(true);
  };

  const handleCloseAddCategoryModal = () => {
    if (createCategoryMutation.isPending || deleteCategoryMutation.isPending) return;
    setIsAddCategoryModalOpen(false);
    setNewCategoryName("");
    setAddCategoryError("");
  };

  const handleCreateCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setAddCategoryError("Please enter a category name.");
      return;
    }

    const isDuplicate = serverCategories.some(
      (cat) => cat.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      setAddCategoryError("This category already exists.");
      return;
    }

    try {
      const created = await createCategoryMutation.mutateAsync({
        name: trimmed,
      });
      setCategoryId(created.id);
      setNewCategoryName("");
      setAddCategoryError("");
      setToastMessage(`Category "${created.name}" created successfully.`);
    } catch {
      setAddCategoryError("Failed to create category. Please try again.");
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const targetName = categoryToDelete.name;
    const targetId = categoryToDelete.id;
    try {
      await deleteCategoryMutation.mutateAsync(targetId);
      if (categoryId === targetId) {
        setCategoryId("");
      }
      setToastMessage(`Category "${targetName}" deleted successfully.`);
    } catch {
      setToastMessage(`Failed to delete category "${targetName}".`);
    } finally {
      setCategoryToDelete(null);
    }
  };

  const languageOptions = useMemo(() => {
    const codes = ISO6391.getAllCodes();
    const options: Array<readonly [string, string, { searchKeywords?: string }?]> = [
      ["", "Select language"],
    ];
    for (const code of codes) {
      const name = ISO6391.getName(code);
      if (name) {
        options.push([
          code,
          name,
          { searchKeywords: `${code} ${name} ${ISO6391.getNativeName(code)}` },
        ]);
      }
    }
    return options;
  }, []);

  const currencyOptions = useMemo(() => getCurrencyOptions(), []);

  const handleBack = () => {
    if (onNavigatePage) {
      onNavigatePage("courses");
    } else if (typeof window !== "undefined") {
      window.history.back();
    }
  };

  // Curriculum Data interfaces
  const getLessonInitialState = (les: CurriculumLessonItem): LessonSnapshot => {
    return (
      les.initialState || {
        title: les.title,
        description: les.description || "",
        contentType: les.contentType,
        contentMediaId: les.contentMediaId ?? null,
        isPublished: les.isPublished !== undefined ? les.isPublished : true,
        isPreview: les.isPreview !== undefined ? les.isPreview : false,
      }
    );
  };

  const isLessonDirty = (les: CurriculumLessonItem): boolean => {
    const init = getLessonInitialState(les);
    const isPub = les.isPublished !== undefined ? les.isPublished : true;
    const isPrev = les.isPreview !== undefined ? les.isPreview : false;
    const initPub = init.isPublished !== undefined ? init.isPublished : true;
    const initPrev = init.isPreview !== undefined ? init.isPreview : false;

    return (
      les.title.trim() !== init.title.trim() ||
      (les.description || "") !== (init.description || "") ||
      les.contentType !== init.contentType ||
      (les.contentMediaId ?? null) !== (init.contentMediaId ?? null) ||
      isPub !== initPub ||
      isPrev !== initPrev
    );
  };

  // Curriculum Step state
  const [sections, setSections] = useState<CurriculumSectionItem[]>([]);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const sectionHeaderElementsRef = useRef(new Map<string, HTMLDivElement>());
  const pendingAddedSectionScrollRef = useRef<string | null>(null);
  const lastSectionScrollRequestRef = useRef<string | null>(null);
  const sectionScrollDelayRef = useRef(300);
  const lessonTitleDraftsRef = useRef<Map<string, string>>(new Map());

  const scrollSectionHeaderIntoView = useCallback((sectionId: string) => {
    const header = sectionHeaderElementsRef.current.get(sectionId);
    if (!header || typeof window === "undefined") return false;

    let scrollport: HTMLElement | null = null;
    for (
      let parent = header.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        parent.scrollHeight > parent.clientHeight + 1
      ) {
        scrollport = parent;
        break;
      }
    }

    const headerTop = header.getBoundingClientRect().top;
    if (scrollport) {
      const scrollportTop = scrollport.getBoundingClientRect().top;
      const top = scrollport.scrollTop + headerTop - scrollportTop;
      const previousBehavior = scrollport.style.scrollBehavior;
      scrollport.style.scrollBehavior = "auto";
      scrollport.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      scrollport.style.scrollBehavior = previousBehavior;
      return true;
    }

    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo({
      top: Math.max(0, window.scrollY + headerTop),
      behavior: "auto",
    });
    root.style.scrollBehavior = previousBehavior;
    return true;
  }, []);

  useEffect(() => {
    const sectionId = pendingAddedSectionScrollRef.current;
    if (!sectionId || !sections.some((section) => section.id === sectionId)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (
        pendingAddedSectionScrollRef.current === sectionId &&
        scrollSectionHeaderIntoView(sectionId)
      ) {
        pendingAddedSectionScrollRef.current = null;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [sections, scrollSectionHeaderIntoView]);

  useEffect(() => {
    if (activeStep !== "curriculum" || !requestedSectionId) {
      lastSectionScrollRequestRef.current = null;
      sectionScrollDelayRef.current = 300;
      return;
    }

    const currentSections = sectionsRef.current;
    const targetIndex = currentSections.findIndex((section) => section.id === requestedSectionId);
    const targetAlreadyExpanded = currentSections.some(
      (section) => section.id === requestedSectionId && section.isExpanded,
    );
    if (targetIndex >= 0 && !targetAlreadyExpanded) {
      sectionScrollDelayRef.current = currentSections.some(
        (section, index) =>
          index < targetIndex && section.id !== requestedSectionId && section.isExpanded,
      )
        ? 300
        : 0;
    } else if (targetIndex < 0) {
      sectionScrollDelayRef.current = 300;
    }

    setSections((previous) => {
      let changed = false;
      const next = previous.map((section) => {
        const shouldExpand = section.id === requestedSectionId;
        if (section.isExpanded === shouldExpand) {
          return section;
        }
        changed = true;
        return { ...section, isExpanded: shouldExpand };
      });
      sectionsRef.current = changed ? next : previous;
      return changed ? next : previous;
    });
  }, [activeStep, requestedSectionId, sections.length]);

  useEffect(() => {
    if (activeStep !== "curriculum" || !requestedSectionId) return;
    const requestKey = `${activeEditId ?? "create"}:${requestedSectionId}`;
    if (lastSectionScrollRequestRef.current === requestKey) return;

    const delay = sectionScrollDelayRef.current;
    let frame = 0;
    let retryTimer = 0;
    let attempts = 0;
    const tryScrollToRequestedSection = () => {
      frame = window.requestAnimationFrame(() => {
        if (scrollSectionHeaderIntoView(requestedSectionId)) {
          lastSectionScrollRequestRef.current = requestKey;
        } else if (attempts++ < 20) {
          retryTimer = window.setTimeout(tryScrollToRequestedSection, 50);
        }
      });
    };
    const timeout = window.setTimeout(tryScrollToRequestedSection, delay);

    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(retryTimer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activeEditId, activeStep, requestedSectionId, scrollSectionHeaderIntoView]);

  const isCollapsingSectionRef = useRef(false);
  const inFlightLessonSavesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const isSavingAllDirtyLessonsRef = useRef(false);
  const isCurriculumDirty = useMemo(() => checkIsCurriculumDirty(sections), [sections]);
  const dragInitialSectionsStateRef = useRef<{
    sectionIds: string[];
    previousSections: CurriculumSectionItem[];
  } | null>(null);
  const dragInitialLessonStateRef = useRef<{
    sectionId: string;
    lessonIds: string[];
    previousLessons: CurriculumLessonItem[];
  } | null>(null);

  // Immediate persistence states for Curriculum interactive items
  const [curriculumItemStatus, setCurriculumItemStatus] = useState<
    Record<string, "saved" | "failed" | null>
  >({});
  const curriculumItemTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [curriculumSaveFailed, setCurriculumSaveFailed] = useState(false);
  const [showCurriculumSavedBriefly, setShowCurriculumSavedBriefly] = useState(false);
  const curriculumSavedBrieflyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerCurriculumSavedBriefly = () => {
    if (curriculumSavedBrieflyTimerRef.current) {
      clearTimeout(curriculumSavedBrieflyTimerRef.current);
    }
    setShowCurriculumSavedBriefly(true);
    curriculumSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowCurriculumSavedBriefly(false);
      curriculumSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      Object.values(curriculumItemTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (curriculumSavedBrieflyTimerRef.current) {
        clearTimeout(curriculumSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearCurriculumItemStatus = (itemId: string) => {
    if (curriculumItemTimersRef.current[itemId]) {
      clearTimeout(curriculumItemTimersRef.current[itemId]);
      delete curriculumItemTimersRef.current[itemId];
    }
    setCurriculumItemStatus((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setCurriculumSaveFailed(false);
    if (curriculumSavedBrieflyTimerRef.current) {
      clearTimeout(curriculumSavedBrieflyTimerRef.current);
      curriculumSavedBrieflyTimerRef.current = null;
    }
    setShowCurriculumSavedBriefly(false);
  };

  const markCurriculumItemSaved = (itemId: string) => {
    if (curriculumItemTimersRef.current[itemId]) {
      clearTimeout(curriculumItemTimersRef.current[itemId]);
      delete curriculumItemTimersRef.current[itemId];
    }
    setCurriculumItemStatus((prev) => ({ ...prev, [itemId]: "saved" }));
    setCurriculumSaveFailed(false);
    triggerCurriculumSavedBriefly();

    curriculumItemTimersRef.current[itemId] = setTimeout(() => {
      setCurriculumItemStatus((prev) => {
        if (prev[itemId] !== "saved") return prev;
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      delete curriculumItemTimersRef.current[itemId];
    }, 1500);
  };

  const markCurriculumItemFailed = (itemId: string) => {
    if (curriculumItemTimersRef.current[itemId]) {
      clearTimeout(curriculumItemTimersRef.current[itemId]);
      delete curriculumItemTimersRef.current[itemId];
    }
    setCurriculumItemStatus((prev) => ({ ...prev, [itemId]: "failed" }));
    setCurriculumSaveFailed(true);
    if (curriculumSavedBrieflyTimerRef.current) {
      clearTimeout(curriculumSavedBrieflyTimerRef.current);
      curriculumSavedBrieflyTimerRef.current = null;
    }
    setShowCurriculumSavedBriefly(false);
  };

  const getCurriculumItemDisplayStatus = (itemId: string): "saving" | "saved" | "failed" | null => {
    if (
      updatingSectionId === itemId ||
      savingLessonId === itemId ||
      inFlightLessonSavesRef.current.has(itemId)
    ) {
      return "saving";
    }
    return curriculumItemStatus[itemId] ?? null;
  };

  const isAnyCurriculumSaving =
    isSavingCurriculum ||
    isCreatingSection ||
    updatingSectionId !== null ||
    deletingSectionId !== null ||
    isReorderingSections ||
    creatingLessonSectionId !== null ||
    savingLessonId !== null ||
    deletingLessonId !== null ||
    reorderingLessonsSectionId !== null ||
    inFlightLessonSavesRef.current.size > 0 ||
    sections.some((s) => s.isPendingCreation || s.lessons.some((l) => l.isPendingCreation));

  const hasCurriculumItemFailed =
    curriculumSaveFailed ||
    Object.values(curriculumItemStatus).some((status) => status === "failed");

  const curriculumOverallStatus = useMemo((): "saving" | "failed" | "saved" | null => {
    if (isAnyCurriculumSaving) return "saving";
    if (hasCurriculumItemFailed) return "failed";
    if (showCurriculumSavedBriefly) return "saved";
    return null;
  }, [isAnyCurriculumSaving, hasCurriculumItemFailed, showCurriculumSavedBriefly]);

  // Access Rules Step server-confirmed and draft states
  const [accessRulesExists, setAccessRulesExists] = useState(false);
  const [serverAccessRules, setServerAccessRules] =
    useState<AccessRulesFormState>(initialAccessRulesState);
  const [accessRulesDraft, setAccessRulesDraft] =
    useState<AccessRulesFormState>(initialAccessRulesState);
  const accessRulesDraftRef = useRef(accessRulesDraft);
  accessRulesDraftRef.current = accessRulesDraft;
  const isAccessRulesDirty = useMemo(
    () => !isAccessRulesEqual(accessRulesDraft, serverAccessRules),
    [accessRulesDraft, serverAccessRules],
  );
  const isAccessRulesDirtyRef = useRef(isAccessRulesDirty);
  isAccessRulesDirtyRef.current = isAccessRulesDirty;

  const needsAccessRulesSave = isAccessRulesDirty && Boolean(accessRulesDraft.durationMode);
  const accessRules = accessRulesDraft;
  const setAccessRules = setAccessRulesDraft;

  // Immediate persistence states for Access Rules interactive controls
  const [savingAccessControls, setSavingAccessControls] = useState<Set<string>>(() => new Set());
  const savingAccessControlsRef = useRef<Set<string>>(new Set());
  const accessControlVersionsRef = useRef<{
    accessType: number;
    durationMode: number;
    fixedDuration: number;
    enableQA: number;
    enableComments: number;
    enableDownloads: number;
    enableNotes: number;
  }>({
    accessType: 0,
    durationMode: 0,
    fixedDuration: 0,
    enableQA: 0,
    enableComments: 0,
    enableDownloads: 0,
    enableNotes: 0,
  });
  const inFlightAccessControlsRef = useRef<Record<string, number>>({
    accessType: 0,
    durationMode: 0,
    fixedDuration: 0,
    enableQA: 0,
    enableComments: 0,
    enableDownloads: 0,
    enableNotes: 0,
  });
  const fixedDurationDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightDurationPromiseRef = useRef<Promise<unknown> | null>(null);

  const markAccessControlSaving = (controlKey: string, isSaving: boolean) => {
    if (isSaving) {
      savingAccessControlsRef.current.add(controlKey);
    } else {
      savingAccessControlsRef.current.delete(controlKey);
    }
    setSavingAccessControls(new Set(savingAccessControlsRef.current));
  };

  const isAccessControlSaving = (controlKey: string) =>
    savingAccessControlsRef.current.has(controlKey) ||
    (inFlightAccessControlsRef.current[controlKey] ?? 0) > 0;

  const [accessControlStatus, setAccessControlStatus] = useState<
    Partial<Record<AccessRulesControlKey, "saved" | "failed" | null>>
  >({});
  const accessControlTimersRef = useRef<
    Partial<Record<AccessRulesControlKey, ReturnType<typeof setTimeout>>>
  >({});
  const [accessRulesSaveFailed, setAccessRulesSaveFailed] = useState(false);
  const [showAccessRulesSavedBriefly, setShowAccessRulesSavedBriefly] = useState(false);
  const accessRulesSavedBrieflyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerAccessRulesSavedBriefly = () => {
    if (accessRulesSavedBrieflyTimerRef.current) {
      clearTimeout(accessRulesSavedBrieflyTimerRef.current);
    }
    setShowAccessRulesSavedBriefly(true);
    accessRulesSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowAccessRulesSavedBriefly(false);
      accessRulesSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      Object.values(accessControlTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (accessRulesSavedBrieflyTimerRef.current) {
        clearTimeout(accessRulesSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearAccessControlStatus = (controlKey: AccessRulesControlKey) => {
    if (accessControlTimersRef.current[controlKey]) {
      clearTimeout(accessControlTimersRef.current[controlKey]);
      delete accessControlTimersRef.current[controlKey];
    }
    setAccessControlStatus((prev) => {
      if (!prev[controlKey]) return prev;
      const next = { ...prev };
      delete next[controlKey];
      return next;
    });
    setAccessRulesSaveFailed(false);
    if (accessRulesSavedBrieflyTimerRef.current) {
      clearTimeout(accessRulesSavedBrieflyTimerRef.current);
      accessRulesSavedBrieflyTimerRef.current = null;
    }
    setShowAccessRulesSavedBriefly(false);
  };

  const markAccessControlSaved = (controlKey: AccessRulesControlKey) => {
    if (accessControlTimersRef.current[controlKey]) {
      clearTimeout(accessControlTimersRef.current[controlKey]);
      delete accessControlTimersRef.current[controlKey];
    }
    setAccessControlStatus((prev) => ({ ...prev, [controlKey]: "saved" }));
    setAccessRulesSaveFailed(false);
    triggerAccessRulesSavedBriefly();

    accessControlTimersRef.current[controlKey] = setTimeout(() => {
      setAccessControlStatus((prev) => {
        if (prev[controlKey] !== "saved") return prev;
        const next = { ...prev };
        delete next[controlKey];
        return next;
      });
      delete accessControlTimersRef.current[controlKey];
    }, 1500);
  };

  const markAccessControlFailed = (controlKey: AccessRulesControlKey) => {
    if (accessControlTimersRef.current[controlKey]) {
      clearTimeout(accessControlTimersRef.current[controlKey]);
      delete accessControlTimersRef.current[controlKey];
    }
    setAccessControlStatus((prev) => ({ ...prev, [controlKey]: "failed" }));
    setAccessRulesSaveFailed(true);
    if (accessRulesSavedBrieflyTimerRef.current) {
      clearTimeout(accessRulesSavedBrieflyTimerRef.current);
      accessRulesSavedBrieflyTimerRef.current = null;
    }
    setShowAccessRulesSavedBriefly(false);
  };

  const getAccessControlDisplayStatus = (
    controlKey: AccessRulesControlKey,
  ): "saving" | "saved" | "failed" | null => {
    if (
      savingAccessControls.has(controlKey) ||
      (inFlightAccessControlsRef.current[controlKey] ?? 0) > 0
    ) {
      return "saving";
    }
    return accessControlStatus[controlKey] ?? null;
  };

  const isAnyAccessRulesSaving =
    savingAccessControls.size > 0 ||
    isSavingAccessRules ||
    (inFlightAccessControlsRef.current.accessType ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.durationMode ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.fixedDuration ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.enableQA ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.enableComments ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.enableDownloads ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.enableNotes ?? 0) > 0;

  const hasAccessControlFailed =
    accessRulesSaveFailed ||
    Object.values(accessControlStatus).some((status) => status === "failed");

  const accessRulesOverallStatus = useMemo((): "saving" | "failed" | "saved" | null => {
    if (isAnyAccessRulesSaving) return "saving";
    if (hasAccessControlFailed) return "failed";
    if (showAccessRulesSavedBriefly) return "saved";
    return null;
  }, [isAnyAccessRulesSaving, hasAccessControlFailed, showAccessRulesSavedBriefly]);

  useEffect(() => {
    return () => {
      if (fixedDurationDebounceTimerRef.current) {
        clearTimeout(fixedDurationDebounceTimerRef.current);
      }
    };
  }, []);

  // Extras interfaces
  interface ExtrasInclusionItem {
    id: string;
    text: string;
  }

  type CertificateIssuanceType = "completion" | "percentage" | "custom";

  interface ExtrasState {
    inclusions: ExtrasInclusionItem[];
    enableCertificate: boolean;
    certificateTemplate: string;
    issuanceType: CertificateIssuanceType;
    minCompletionPercentage: number;
    customRuleText: string;
    autoEmailCertificate: boolean;
  }

  // Pricing Step server-confirmed and draft states
  const [serverPricing, setServerPricing] = useState<PricingFormState>(initialPricingState);
  const serverPricingRef = useRef(serverPricing);
  serverPricingRef.current = serverPricing;

  const [pricingDraft, setPricingDraft] = useState<PricingFormState>(initialPricingState);
  const pricingDraftRef = useRef(pricingDraft);
  pricingDraftRef.current = pricingDraft;

  const isPricingDirty = useMemo(
    () => !isPricingEqual(pricingDraft, serverPricing),
    [pricingDraft, serverPricing],
  );
  const isPricingDirtyRef = useRef(isPricingDirty);
  isPricingDirtyRef.current = isPricingDirty;

  const pricing = pricingDraft;
  const [pricingValidationError, setPricingValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!pricingValidationError) return;
    const timer = setTimeout(() => {
      setPricingValidationError(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [pricingValidationError]);

  // Immediate persistence states for Pricing interactive controls
  const [savingPricingControls, setSavingPricingControls] = useState<Set<string>>(() => new Set());
  const savingPricingControlsRef = useRef<Set<string>>(new Set());
  const pricingControlVersionsRef = useRef<{
    pricingType: number;
    currency: number;
    pricingDetails: number;
  }>({
    pricingType: 0,
    currency: 0,
    pricingDetails: 0,
  });
  const pricingVersionRef = useRef<number>(0);
  const inFlightPricingControlsRef = useRef<Record<string, number>>({
    pricingType: 0,
    currency: 0,
    pricingDetails: 0,
  });
  const pricingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightPricingPromiseRef = useRef<Promise<unknown> | null>(null);

  const markPricingControlSaving = (controlKey: string, isSaving: boolean) => {
    if (isSaving) {
      savingPricingControlsRef.current.add(controlKey);
    } else {
      savingPricingControlsRef.current.delete(controlKey);
    }
    setSavingPricingControls(new Set(savingPricingControlsRef.current));
  };

  const isPricingControlSaving = (controlKey: string) =>
    savingPricingControlsRef.current.has(controlKey) ||
    (inFlightPricingControlsRef.current[controlKey] ?? 0) > 0;

  const lastEditedPricingFieldRef = useRef<"sellingPrice" | "originalPrice" | null>(null);

  const [pricingControlStatus, setPricingControlStatus] = useState<
    Partial<Record<PricingControlKey, "saved" | "failed" | null>>
  >({});
  const pricingControlTimersRef = useRef<
    Partial<Record<PricingControlKey, ReturnType<typeof setTimeout>>>
  >({});
  const [pricingSaveFailed, setPricingSaveFailed] = useState(false);
  const [showPricingSavedBriefly, setShowPricingSavedBriefly] = useState(false);
  const pricingSavedBrieflyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerPricingSavedBriefly = () => {
    if (pricingSavedBrieflyTimerRef.current) {
      clearTimeout(pricingSavedBrieflyTimerRef.current);
    }
    setShowPricingSavedBriefly(true);
    pricingSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowPricingSavedBriefly(false);
      pricingSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      Object.values(pricingControlTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (pricingSavedBrieflyTimerRef.current) {
        clearTimeout(pricingSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearPricingControlStatus = (controlKey: PricingControlKey) => {
    if (pricingControlTimersRef.current[controlKey]) {
      clearTimeout(pricingControlTimersRef.current[controlKey]);
      delete pricingControlTimersRef.current[controlKey];
    }
    setPricingControlStatus((prev) => {
      if (!prev[controlKey]) return prev;
      const next = { ...prev };
      delete next[controlKey];
      return next;
    });
    setPricingSaveFailed(false);
    if (pricingSavedBrieflyTimerRef.current) {
      clearTimeout(pricingSavedBrieflyTimerRef.current);
      pricingSavedBrieflyTimerRef.current = null;
    }
    setShowPricingSavedBriefly(false);
  };

  const markPricingControlSaved = (controlKey: PricingControlKey) => {
    if (pricingControlTimersRef.current[controlKey]) {
      clearTimeout(pricingControlTimersRef.current[controlKey]);
      delete pricingControlTimersRef.current[controlKey];
    }
    setPricingControlStatus((prev) => ({ ...prev, [controlKey]: "saved" }));
    setPricingSaveFailed(false);
    triggerPricingSavedBriefly();

    pricingControlTimersRef.current[controlKey] = setTimeout(() => {
      setPricingControlStatus((prev) => {
        if (prev[controlKey] !== "saved") return prev;
        const next = { ...prev };
        delete next[controlKey];
        return next;
      });
      delete pricingControlTimersRef.current[controlKey];
    }, 1500);
  };

  const markPricingControlFailed = (controlKey: PricingControlKey) => {
    if (pricingControlTimersRef.current[controlKey]) {
      clearTimeout(pricingControlTimersRef.current[controlKey]);
      delete pricingControlTimersRef.current[controlKey];
    }
    setPricingControlStatus((prev) => ({ ...prev, [controlKey]: "failed" }));
    setPricingSaveFailed(true);
    if (pricingSavedBrieflyTimerRef.current) {
      clearTimeout(pricingSavedBrieflyTimerRef.current);
      pricingSavedBrieflyTimerRef.current = null;
    }
    setShowPricingSavedBriefly(false);
  };

  const getPricingControlDisplayStatus = (
    controlKey: PricingControlKey,
  ): "saving" | "saved" | "failed" | null => {
    if (controlKey === "sellingPrice" || controlKey === "originalPrice") {
      const isDetailsSaving =
        savingPricingControls.has("pricingDetails") ||
        (inFlightPricingControlsRef.current.pricingDetails ?? 0) > 0;
      if (
        isDetailsSaving &&
        (lastEditedPricingFieldRef.current === controlKey || !lastEditedPricingFieldRef.current)
      ) {
        return "saving";
      }
      return pricingControlStatus[controlKey] ?? null;
    }
    if (
      savingPricingControls.has(controlKey) ||
      (inFlightPricingControlsRef.current[controlKey] ?? 0) > 0
    ) {
      return "saving";
    }
    return pricingControlStatus[controlKey] ?? null;
  };

  const isAnyPricingSaving =
    savingPricingControls.size > 0 ||
    isSavingPricing ||
    (inFlightPricingControlsRef.current.pricingType ?? 0) > 0 ||
    (inFlightPricingControlsRef.current.currency ?? 0) > 0 ||
    (inFlightPricingControlsRef.current.pricingDetails ?? 0) > 0;

  const hasPricingControlFailed =
    pricingSaveFailed || Object.values(pricingControlStatus).some((status) => status === "failed");

  const pricingOverallStatus = useMemo((): "saving" | "failed" | "saved" | null => {
    if (isAnyPricingSaving) return "saving";
    if (hasPricingControlFailed) return "failed";
    if (showPricingSavedBriefly) return "saved";
    return null;
  }, [isAnyPricingSaving, hasPricingControlFailed, showPricingSavedBriefly]);

  useEffect(() => {
    return () => {
      if (pricingDebounceTimerRef.current) {
        clearTimeout(pricingDebounceTimerRef.current);
      }
    };
  }, []);

  // Publish interfaces
  type CourseVisibility = "public" | "private" | "unlisted";
  type ScheduleOption = "now" | "later";

  interface PublishState {
    visibility: CourseVisibility;
    scheduleOption: ScheduleOption;
    scheduleDate: string;
    scheduleTime: string;
  }

  // Course Life Cycle state
  const [isPublished, setIsPublished] = useState<boolean>(false);

  // Publish Step state
  const [publishSettings, setPublishSettings] = useState<PublishState>({
    visibility: "public",
    scheduleOption: "now",
    scheduleDate: "2026-08-20",
    scheduleTime: "10:00",
  });
  const [expandedValidationArea, setExpandedValidationArea] = useState<CourseValidationArea | null>(
    null,
  );

  // Course Overview Live Full Preview Modal State
  const [isUnpublishModalOpen, setIsUnpublishModalOpen] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPreviewModalOpen) {
        setIsPreviewModalOpen(false);
      }
    };
    if (isPreviewModalOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewModalOpen]);

  const [publishValidationError, setPublishValidationError] = useState<string | null>(null);

  // Auto-hide validation error message after 3.5 seconds
  useEffect(() => {
    if (!publishValidationError) return;
    const timer = setTimeout(() => {
      setPublishValidationError(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [publishValidationError]);

  // Immediate persistence states for Publish interactive controls
  const [publishControlStatus, setPublishControlStatus] = useState<
    Record<string, "saving" | "saved" | "failed" | null>
  >({});
  const publishControlTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [publishSaveFailed, setPublishSaveFailed] = useState(false);
  const [showPublishSavedBriefly, setShowPublishSavedBriefly] = useState(false);
  const publishSavedBrieflyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerPublishSavedBriefly = () => {
    if (publishSavedBrieflyTimerRef.current) {
      clearTimeout(publishSavedBrieflyTimerRef.current);
    }
    setShowPublishSavedBriefly(true);
    publishSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowPublishSavedBriefly(false);
      publishSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      Object.values(publishControlTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (publishSavedBrieflyTimerRef.current) {
        clearTimeout(publishSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const isAnyPublishSaving =
    isSavingPublish || Object.values(publishControlStatus).some((status) => status === "saving");

  const hasPublishControlFailed =
    publishSaveFailed || Object.values(publishControlStatus).some((status) => status === "failed");

  const publishOverallStatus = useMemo((): "saving" | "failed" | "saved" | null => {
    if (isAnyPublishSaving) return "saving";
    if (hasPublishControlFailed) return "failed";
    if (showPublishSavedBriefly) return "saved";
    return null;
  }, [isAnyPublishSaving, hasPublishControlFailed, showPublishSavedBriefly]);

  // Extras Step server-confirmed and draft states
  const [serverExtras, setServerExtras] = useState<ExtrasFormState>(initialExtrasState);
  const [serverIncludes, setServerIncludes] = useState<CourseIncludeItem[]>([]);
  const [manualIncludesDraft, setManualIncludesDraft] = useState<
    Array<{ id: string; text: string; isPendingCreation?: boolean }>
  >([]);
  const manualIncludesDraftRef = useRef(manualIncludesDraft);
  manualIncludesDraftRef.current = manualIncludesDraft;
  const dragInitialIncludesStateRef = useRef<{
    includeIds: string[];
    previousIncludes: Array<{
      id: string;
      text: string;
      isPendingCreation?: boolean;
    }>;
  } | null>(null);
  const deletingIncludeIdsRef = useRef<Set<string>>(new Set());
  const [deletingIncludeIds, setDeletingIncludeIds] = useState<Set<string>>(new Set());
  const savingIncludeIdsRef = useRef<Set<string>>(new Set());
  const [savingIncludeIds, setSavingIncludeIds] = useState<Set<string>>(new Set());
  const [isSavingCertificate, setIsSavingCertificate] = useState(false);
  const isSavingCertificateRef = useRef(false);

  const [extrasControlStatus, setExtrasControlStatus] = useState<
    Record<string, "saved" | "failed" | null>
  >({});
  const extrasControlTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [extrasSaveFailed, setExtrasSaveFailed] = useState(false);
  const [showExtrasSavedBriefly, setShowExtrasSavedBriefly] = useState(false);
  const extrasSavedBrieflyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerExtrasSavedBriefly = () => {
    if (extrasSavedBrieflyTimerRef.current) {
      clearTimeout(extrasSavedBrieflyTimerRef.current);
    }
    setShowExtrasSavedBriefly(true);
    extrasSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowExtrasSavedBriefly(false);
      extrasSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      Object.values(extrasControlTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (extrasSavedBrieflyTimerRef.current) {
        clearTimeout(extrasSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearExtrasControlStatus = (controlKey: string) => {
    if (extrasControlTimersRef.current[controlKey]) {
      clearTimeout(extrasControlTimersRef.current[controlKey]);
      delete extrasControlTimersRef.current[controlKey];
    }
    setExtrasControlStatus((prev) => {
      if (!prev[controlKey]) return prev;
      const next = { ...prev };
      delete next[controlKey];
      return next;
    });
    setExtrasSaveFailed(false);
    if (extrasSavedBrieflyTimerRef.current) {
      clearTimeout(extrasSavedBrieflyTimerRef.current);
      extrasSavedBrieflyTimerRef.current = null;
    }
    setShowExtrasSavedBriefly(false);
  };

  const markExtrasControlSaved = (controlKey: string) => {
    if (extrasControlTimersRef.current[controlKey]) {
      clearTimeout(extrasControlTimersRef.current[controlKey]);
      delete extrasControlTimersRef.current[controlKey];
    }
    setExtrasControlStatus((prev) => ({ ...prev, [controlKey]: "saved" }));
    setExtrasSaveFailed(false);
    triggerExtrasSavedBriefly();

    extrasControlTimersRef.current[controlKey] = setTimeout(() => {
      setExtrasControlStatus((prev) => {
        if (prev[controlKey] !== "saved") return prev;
        const next = { ...prev };
        delete next[controlKey];
        return next;
      });
      delete extrasControlTimersRef.current[controlKey];
    }, 1500);
  };

  const markExtrasControlFailed = (controlKey: string) => {
    if (extrasControlTimersRef.current[controlKey]) {
      clearTimeout(extrasControlTimersRef.current[controlKey]);
      delete extrasControlTimersRef.current[controlKey];
    }
    setExtrasControlStatus((prev) => ({ ...prev, [controlKey]: "failed" }));
    setExtrasSaveFailed(true);
    if (extrasSavedBrieflyTimerRef.current) {
      clearTimeout(extrasSavedBrieflyTimerRef.current);
      extrasSavedBrieflyTimerRef.current = null;
    }
    setShowExtrasSavedBriefly(false);
  };

  const getExtrasControlDisplayStatus = (
    controlKey: string,
  ): "saving" | "saved" | "failed" | null => {
    if (controlKey === "enableCertificate") {
      if (isSavingCertificate) return "saving";
      return extrasControlStatus["enableCertificate"] ?? null;
    }
    if (controlKey === "inclusions") {
      if (
        isReorderingIncludes ||
        reorderIncludesMutation.isPending ||
        savingIncludeIds.size > 0 ||
        deletingIncludeIds.size > 0 ||
        createIncludeMutation.isPending ||
        manualIncludesDraft.some((m) => m.isPendingCreation)
      ) {
        return "saving";
      }
      return extrasControlStatus["inclusions"] ?? null;
    }
    // Specific inclusion ID:
    if (
      savingIncludeIds.has(controlKey) ||
      deletingIncludeIds.has(controlKey) ||
      manualIncludesDraft.some((m) => m.id === controlKey && m.isPendingCreation)
    ) {
      return "saving";
    }
    return extrasControlStatus[controlKey] ?? null;
  };

  const isAnyExtrasSaving =
    isSavingExtras ||
    isSavingCertificate ||
    savingIncludeIds.size > 0 ||
    deletingIncludeIds.size > 0 ||
    isReorderingIncludes ||
    reorderIncludesMutation.isPending ||
    createIncludeMutation.isPending ||
    manualIncludesDraft.some((m) => m.isPendingCreation);

  const hasExtrasControlFailed =
    extrasSaveFailed || Object.values(extrasControlStatus).some((status) => status === "failed");

  const extrasOverallStatus = useMemo((): "saving" | "failed" | "saved" | null => {
    if (isAnyExtrasSaving) return "saving";
    if (hasExtrasControlFailed) return "failed";
    if (showExtrasSavedBriefly) return "saved";
    return null;
  }, [isAnyExtrasSaving, hasExtrasControlFailed, showExtrasSavedBriefly]);

  const [extras, setExtras] = useState<ExtrasState>({
    inclusions: [],
    enableCertificate: false,
    certificateTemplate: "purple-certificate",
    issuanceType: "percentage",
    minCompletionPercentage: 95,
    customRuleText: "Complete all quizzes with > 80% score",
    autoEmailCertificate: true,
  });

  const suggestedInclusions = useMemo<string[]>(() => {
    const hasPreviewLessons = sections.some((s) => s.lessons.some((l) => l.isPreview));
    return deriveSuggestedInclusions({
      durationMode: accessRulesDraft.durationMode,
      fixedDurationValue: accessRulesDraft.fixedDurationValue,
      fixedDurationUnit: accessRulesDraft.fixedDurationUnit,
      enableCertificate: extras.enableCertificate,
      enableDownloads: accessRulesDraft.enableDownloads,
      hasPreviewLessons,
      currentDraft: manualIncludesDraft,
    });
  }, [
    accessRulesDraft.durationMode,
    accessRulesDraft.fixedDurationValue,
    accessRulesDraft.fixedDurationUnit,
    accessRulesDraft.enableDownloads,
    extras.enableCertificate,
    sections,
    manualIncludesDraft,
  ]);

  const isManualIncludesDirty = useMemo(
    () => !isManualIncludesEqual(manualIncludesDraft, serverIncludes),
    [manualIncludesDraft, serverIncludes],
  );

  const isExtrasDirty = useMemo(
    () =>
      !isExtrasEqual({ enableCertificate: extras.enableCertificate }, serverExtras) ||
      isManualIncludesDirty,
    [extras.enableCertificate, serverExtras, isManualIncludesDirty],
  );
  const isExtrasDirtyRef = useRef(isExtrasDirty);
  isExtrasDirtyRef.current = isExtrasDirty;

  const isStepDirty = (stepId: CourseWizardStepId): boolean => {
    if (stepId === "basics") return isBasicsDirty;
    if (stepId === "curriculum") return isCurriculumDirty;
    if (stepId === "access-rules") return needsAccessRulesSave;
    if (stepId === "pricing") return isPricingDirty;
    if (stepId === "extras") return isExtrasDirty;
    return false;
  };

  const hasUnsavedChanges =
    isBasicsDirty || isCurriculumDirty || needsAccessRulesSave || isPricingDirty || isExtrasDirty;

  // Pre-populate fields when editing an existing course
  useEffect(() => {
    if (editorData?.course) {
      const c = editorData.course;
      const confirmedBasics = normalizeBasicsState({
        title: c.title || "",
        shortDescription: c.shortDescription || "",
        description: c.description || "",
        categoryId: c.categoryId || "",
        difficulty: (c.difficulty as BasicsFormState["difficulty"]) || "",
        language: editorData.settings?.language || "en",
        instructorAlias: c.instructorAlias || "",
        showInstructorName:
          editorData.settings?.showInstructorName !== undefined
            ? editorData.settings.showInstructorName
            : true,
      });
      setServerBasics(confirmedBasics);
      serverBasicsRef.current = confirmedBasics;
      setCourseVersion(c.version || 1);
      courseVersionRef.current = c.version || 1;

      const confirmedThumbnailMediaId = c.thumbnailMediaId ?? null;
      if (!thumbnailDirtyRef.current && thumbnailUploadStatusRef.current === "idle") {
        if (thumbnailObjectUrlRef.current) {
          URL.revokeObjectURL(thumbnailObjectUrlRef.current);
          thumbnailObjectUrlRef.current = null;
        }
        thumbnailMediaIdRef.current = confirmedThumbnailMediaId;
        setThumbnailMediaId(confirmedThumbnailMediaId);
        setThumbnail(c.thumbnailUrl ?? getCourseThumbnailCdnUrl(confirmedThumbnailMediaId) ?? null);
      }

      const isBasicsSavingActive =
        savingBasicsControlsRef.current.size > 0 || Boolean(inFlightBasicsPromiseRef.current);
      if (!isBasicsDirtyRef.current && !isBasicsSavingActive) {
        setBasicsDraft(confirmedBasics);
        basicsDraftRef.current = confirmedBasics;
      }
      setIsPublished(c.status === "published");

      const hasAccessRules = Boolean(editorData.accessRules && editorData.accessRules.id);
      setAccessRulesExists(hasAccessRules);

      const ar = editorData.accessRules;
      const s = editorData.settings;
      const isFixed = ar?.durationType === "fixed_duration";
      let fixedVal = 30;
      let fixedUnit: DurationUnit = "Days";

      if (hasAccessRules && isFixed && ar?.durationDays && ar.durationDays > 0) {
        const days = ar.durationDays;
        if (days % 365 === 0 && days >= 365) {
          fixedVal = days / 365;
          fixedUnit = "Years";
        } else if (days % 30 === 0 && days >= 30) {
          fixedVal = days / 30;
          fixedUnit = "Months";
        } else if (days % 7 === 0 && days >= 7) {
          fixedVal = days / 7;
          fixedUnit = "Weeks";
        } else {
          fixedVal = days;
          fixedUnit = "Days";
        }
      }

      const confirmedAccessRules: AccessRulesFormState = normalizeAccessRulesState({
        accessType: (ar?.accessType as AccessType) || "everyone",
        durationMode: hasAccessRules ? (isFixed ? "fixed" : "lifetime") : "",
        fixedDurationValue: fixedVal,
        fixedDurationUnit: fixedUnit,
        enableQA: s?.allowQa !== undefined ? Boolean(s.allowQa) : initialAccessRulesState.enableQA,
        enableComments:
          s?.allowComments !== undefined
            ? Boolean(s.allowComments)
            : initialAccessRulesState.enableComments,
        enableDownloads:
          s?.allowDownloads !== undefined
            ? Boolean(s.allowDownloads)
            : initialAccessRulesState.enableDownloads,
        enableNotes:
          s?.allowNotes !== undefined ? Boolean(s.allowNotes) : initialAccessRulesState.enableNotes,
      });

      setServerAccessRules((prev) => ({
        accessType: isAccessControlSaving("accessType")
          ? prev.accessType
          : confirmedAccessRules.accessType,
        durationMode: isAccessControlSaving("durationMode")
          ? prev.durationMode
          : confirmedAccessRules.durationMode,
        fixedDurationValue: isAccessControlSaving("fixedDuration")
          ? prev.fixedDurationValue
          : confirmedAccessRules.fixedDurationValue,
        fixedDurationUnit: isAccessControlSaving("fixedDuration")
          ? prev.fixedDurationUnit
          : confirmedAccessRules.fixedDurationUnit,
        enableQA: isAccessControlSaving("enableQA") ? prev.enableQA : confirmedAccessRules.enableQA,
        enableComments: isAccessControlSaving("enableComments")
          ? prev.enableComments
          : confirmedAccessRules.enableComments,
        enableDownloads: isAccessControlSaving("enableDownloads")
          ? prev.enableDownloads
          : confirmedAccessRules.enableDownloads,
        enableNotes: isAccessControlSaving("enableNotes")
          ? prev.enableNotes
          : confirmedAccessRules.enableNotes,
      }));

      if (!isAccessRulesDirtyRef.current && savingAccessControlsRef.current.size === 0) {
        setAccessRulesDraft((prev) => {
          const next = {
            accessType: isAccessControlSaving("accessType")
              ? prev.accessType
              : confirmedAccessRules.accessType || prev.accessType,
            durationMode: isAccessControlSaving("durationMode")
              ? prev.durationMode
              : confirmedAccessRules.durationMode || prev.durationMode,
            fixedDurationValue: isAccessControlSaving("fixedDuration")
              ? prev.fixedDurationValue
              : confirmedAccessRules.fixedDurationValue,
            fixedDurationUnit: isAccessControlSaving("fixedDuration")
              ? prev.fixedDurationUnit
              : confirmedAccessRules.fixedDurationUnit,
            enableQA: isAccessControlSaving("enableQA")
              ? prev.enableQA
              : confirmedAccessRules.enableQA,
            enableComments: isAccessControlSaving("enableComments")
              ? prev.enableComments
              : confirmedAccessRules.enableComments,
            enableDownloads: isAccessControlSaving("enableDownloads")
              ? prev.enableDownloads
              : confirmedAccessRules.enableDownloads,
            enableNotes: isAccessControlSaving("enableNotes")
              ? prev.enableNotes
              : confirmedAccessRules.enableNotes,
          };
          accessRulesDraftRef.current = next;
          return next;
        });
      }

      if (editorData.settings) {
        const s = editorData.settings;
        const confirmedExtras: ExtrasFormState = normalizeExtrasState({
          enableCertificate: s.certificateEnabled ?? false,
        });
        setServerExtras(confirmedExtras);
        setExtras((prev) => ({
          ...prev,
          enableCertificate: confirmedExtras.enableCertificate,
        }));
      }

      if (editorData.includes) {
        setServerIncludes(editorData.includes);
        if (!isExtrasDirtyRef.current) {
          const serverItems = editorData.includes.map((inc) => ({
            id: inc.id,
            text: inc.text,
          }));
          setManualIncludesDraft((prev) => {
            const pendingItems = prev.filter((p) => p.isPendingCreation);
            if (pendingItems.length === 0) return serverItems;
            const serverIds = new Set(serverItems.map((s) => s.id));
            const uniquePending = pendingItems.filter((p) => !serverIds.has(p.id));
            return [...serverItems, ...uniquePending];
          });
        }
      } else {
        setServerIncludes([]);
        if (!isExtrasDirtyRef.current) {
          setManualIncludesDraft((prev) => prev.filter((p) => p.isPendingCreation));
        }
      }

      if (editorData.pricing) {
        const p = editorData.pricing;
        const isFree = p.pricingType === "free";
        const hasSale = p.salePrice != null && p.salePrice !== undefined;
        const confirmedPricing: PricingFormState = normalizePricingState({
          pricingType: isFree ? "free" : "paid",
          sellingPrice: isFree
            ? ""
            : hasSale
              ? String(p.salePrice)
              : p.price > 0
                ? String(p.price)
                : "",
          originalPrice: !isFree && hasSale ? String(p.price) : "",
          currency: p.currency || "INR",
        });
        setServerPricing(confirmedPricing);
        serverPricingRef.current = confirmedPricing;
        if (!isPricingDirtyRef.current && savingPricingControlsRef.current.size === 0) {
          setPricingDraft(confirmedPricing);
          pricingDraftRef.current = confirmedPricing;
        }
      }
      if (editorData.sections && editorData.sections.length > 0) {
        setSections((prev) => {
          const prevMap = new Map(prev.map((s) => [s.id, s]));
          const mappedServerSections = editorData.sections.map((sec, secIdx) => {
            const existing = prevMap.get(sec.id);
            const serverLessonIds = new Set((sec.lessons || []).map((l) => l.id));
            const serverLessons = (sec.lessons || []).map((les) => {
              const existingLesson = existing?.lessons.find((l) => l.id === les.id);
              const storedLessonDraft = readLessonEditorDraft(currentCourseIdRef.current, les.id);
              const isDirty = existingLesson ? isLessonDirty(existingLesson) : false;
              const title =
                isDirty && existingLesson
                  ? existingLesson.title
                  : (storedLessonDraft?.title ?? les.title);
              const description =
                isDirty && existingLesson
                  ? existingLesson.description || ""
                  : (storedLessonDraft?.description ?? (les.description || ""));
              const contentType =
                isDirty && existingLesson
                  ? existingLesson.contentType
                  : (storedLessonDraft?.contentType ?? les.contentType);
              const contentMediaId =
                isDirty && existingLesson
                  ? (existingLesson.contentMediaId ?? null)
                  : (storedLessonDraft?.contentMediaId ?? les.contentMediaId ?? null);
              const durationSeconds =
                isDirty && existingLesson ? existingLesson.durationSeconds : les.durationSeconds;
              const isPub =
                isDirty && existingLesson
                  ? existingLesson.isPublished !== undefined
                    ? existingLesson.isPublished
                    : true
                  : (storedLessonDraft?.isPublished ??
                    (les.isPublished !== undefined ? les.isPublished : true));
              const isPrev =
                isDirty && existingLesson
                  ? existingLesson.isPreview !== undefined
                    ? existingLesson.isPreview
                    : false
                  : (storedLessonDraft?.isPreview ??
                    (les.isPreview !== undefined ? les.isPreview : false));
              const desc = les.description || "";
              return {
                id: les.id,
                title,
                isEditingTitle: existingLesson?.isEditingTitle ?? false,
                contentTypeSelected: existingLesson?.contentTypeSelected ?? true,
                description,
                contentType,
                contentMediaId,
                durationSeconds,
                isExpanded: existingLesson ? existingLesson.isExpanded : false,
                isPublished: isPub,
                isPreview: isPrev,
                initialState: existingLesson?.initialState || {
                  title: les.title,
                  description: desc,
                  contentType: les.contentType,
                  contentMediaId: les.contentMediaId ?? null,
                  isPublished: les.isPublished !== undefined ? les.isPublished : true,
                  isPreview: les.isPreview !== undefined ? les.isPreview : false,
                },
                resources: (les.resources || []).map((res) => toLessonResourceItem(res)),
              };
            });

            // Preserve any pending optimistic lessons that are still being created
            const pendingLessons = (existing?.lessons || []).filter(
              (l) => l.isPendingCreation || !serverLessonIds.has(l.id),
            );

            return {
              id: sec.id,
              title: sec.title,
              isExpanded: existing ? existing.isExpanded : secIdx === 0,
              isEditingTitle: existing ? existing.isEditingTitle : false,
              lessons: [...serverLessons, ...pendingLessons],
            };
          });

          // Preserve any pending optimistic sections that are still being created
          const serverSectionIds = new Set(editorData.sections.map((s) => s.id));
          const pendingSections = prev.filter(
            (s) => s.isPendingCreation || !serverSectionIds.has(s.id),
          );

          return [...mappedServerSections, ...pendingSections];
        });
      }
    } else {
      setIsPublished(false);
    }
  }, [editorData, serverCategories]);

  // Extras Inclusions Handlers
  const [draggedInclusionIndex, setDraggedInclusionIndex] = useState<number | null>(null);
  const [dragEnabledInclusionId, setDragEnabledInclusionId] = useState<string | null>(null);
  const [focusedInclusionId, setFocusedInclusionId] = useState<string | null>(null);

  const handleAddManualInclusion = async (customText?: string) => {
    if (manualIncludesDraftRef.current.length >= 6) return;
    const defaultText =
      customText?.trim().slice(0, 25) ||
      `Benefit ${manualIncludesDraftRef.current.length + 1}`.slice(0, 25);
    const tempId = `temp-inc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 1. Immediately append temporary pending inclusion
    setManualIncludesDraft((prev) => {
      if (prev.length >= 6) return prev;
      return [
        ...prev,
        {
          id: tempId,
          text: defaultText,
          isPendingCreation: true,
        },
      ];
    });
    setFocusedInclusionId(tempId);

    // 2. Ensure course ID exists
    let targetCourseId = currentCourseId;
    if (!targetCourseId) {
      setManualIncludesDraft((prev) => prev.filter((item) => item.id !== tempId));
      setToastMessage("Please enter a course title on the Basics tab first.");
      return;
    }

    // 3. Immediately trigger create mutation
    try {
      const created = await createIncludeMutation.mutateAsync({
        courseId: targetCourseId,
        payload: { text: defaultText },
      });

      // 4. On success: replace tempId with real server UUID and clear isPendingCreation
      setManualIncludesDraft((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? {
                id: created.id,
                text: item.text,
                isPendingCreation: false,
              }
            : item,
        ),
      );

      // Keep serverIncludes baseline in sync so existing saveExtrasStep does not duplicate it
      setServerIncludes((prev) => {
        if (prev.some((s) => s.id === created.id)) return prev;
        return [...prev, created];
      });
      markExtrasControlSaved(created.id);
      markExtrasControlSaved("inclusions");
    } catch (err: unknown) {
      // 5. On failure: remove ONLY this failed temporary inclusion
      setManualIncludesDraft((prev) => prev.filter((item) => item.id !== tempId));
      markExtrasControlFailed("inclusions");
      const errorMsg = (err as { message?: string })?.message || "Failed to add inclusion.";
      setToastMessage(errorMsg);
    }
  };

  const handleUpdateManualInclusionText = (id: string, text: string) => {
    clearExtrasControlStatus(id);
    clearExtrasControlStatus("inclusions");
    const truncated = text.slice(0, 25);
    setManualIncludesDraft((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text: truncated } : item)),
    );
  };

  const handleManualInclusionBlur = async (id: string) => {
    setFocusedInclusionId(null);

    if (savingIncludeIdsRef.current.has(id) || deletingIncludeIdsRef.current.has(id)) {
      return;
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!currentCourseId || !UUID_REGEX.test(id)) {
      return;
    }

    const currentItem = manualIncludesDraftRef.current.find((i) => i.id === id);
    if (!currentItem || currentItem.isPendingCreation) {
      return;
    }

    const serverItem = serverIncludes.find((s) => s.id === id);
    if (!serverItem) {
      return;
    }

    const trimmed = currentItem.text.trim();

    // Empty text handling: revert to server-confirmed value because backend schema requires min(1)
    if (!trimmed) {
      setManualIncludesDraft((prev) =>
        prev.map((item) => (item.id === id ? { ...item, text: serverItem.text } : item)),
      );
      return;
    }

    // Clean blur: if trimmed matches server baseline, nothing to persist
    if (trimmed === serverItem.text.trim()) {
      if (trimmed !== currentItem.text) {
        setManualIncludesDraft((prev) =>
          prev.map((item) => (item.id === id ? { ...item, text: trimmed } : item)),
        );
      }
      return;
    }

    // Normalize draft to trimmed before persisting
    setManualIncludesDraft((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text: trimmed } : item)),
    );

    savingIncludeIdsRef.current.add(id);
    setSavingIncludeIds(new Set(savingIncludeIdsRef.current));

    try {
      const updated = await updateIncludeMutation.mutateAsync({
        courseId: currentCourseId,
        includeId: id,
        payload: { text: trimmed },
      });

      // Update serverIncludes baseline so saveExtrasStep does not duplicate it
      setServerIncludes((prev) => prev.map((s) => (s.id === id ? updated : s)));
      markExtrasControlSaved(id);
      markExtrasControlSaved("inclusions");
    } catch (err: unknown) {
      markExtrasControlFailed(id);
      markExtrasControlFailed("inclusions");
      // Revert on failure to the last confirmed server value
      setManualIncludesDraft((prev) =>
        prev.map((item) => (item.id === id ? { ...item, text: serverItem.text } : item)),
      );
      const errorMsg = (err as { message?: string })?.message || "Failed to update inclusion.";
      setToastMessage(errorMsg);
    } finally {
      savingIncludeIdsRef.current.delete(id);
      setSavingIncludeIds(new Set(savingIncludeIdsRef.current));
    }
  };

  const handleDeleteManualInclusion = async (id: string) => {
    if (deletingIncludeIdsRef.current.has(id)) return;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // If it is not a real server UUID (e.g. client-only temp item) or no course ID, remove locally
    if (!currentCourseId || !UUID_REGEX.test(id)) {
      setManualIncludesDraft((prev) => prev.filter((item) => item.id !== id));
      clearExtrasControlStatus(id);
      if (focusedInclusionId === id) {
        setFocusedInclusionId(null);
      }
      if (dragEnabledInclusionId === id) {
        setDragEnabledInclusionId(null);
      }
      return;
    }

    deletingIncludeIdsRef.current.add(id);
    setDeletingIncludeIds(new Set(deletingIncludeIdsRef.current));

    try {
      await deleteIncludeMutation.mutateAsync({
        courseId: currentCourseId,
        includeId: id,
      });

      // On success: remove only this inclusion from draft and server baseline
      setManualIncludesDraft((prev) => prev.filter((item) => item.id !== id));
      setServerIncludes((prev) => prev.filter((s) => s.id !== id));
      clearExtrasControlStatus(id);
      markExtrasControlSaved("inclusions");
      if (focusedInclusionId === id) {
        setFocusedInclusionId(null);
      }
      if (dragEnabledInclusionId === id) {
        setDragEnabledInclusionId(null);
      }
    } catch (err: unknown) {
      markExtrasControlFailed(id);
      markExtrasControlFailed("inclusions");
      // On failure: keep inclusion visible and show error toast
      const errorMsg = (err as { message?: string })?.message || "Failed to delete inclusion.";
      setToastMessage(errorMsg);
    } finally {
      deletingIncludeIdsRef.current.delete(id);
      setDeletingIncludeIds(new Set(deletingIncludeIdsRef.current));
    }
  };

  const handleInclusionDragStart = (e: React.DragEvent, index: number, text: string) => {
    if (isReorderingIncludes || reorderIncludesMutation.isPending || isExtrasSaving) {
      e.preventDefault();
      return;
    }
    dragInitialIncludesStateRef.current = {
      includeIds: manualIncludesDraftRef.current.map((i) => i.id),
      previousIncludes: structuredClone(manualIncludesDraftRef.current),
    };
    setDraggedInclusionIndex(index);
    setCustomDragImage(e, e.currentTarget as HTMLElement, inclusionGhostHtml(text));
  };

  const handleInclusionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInclusionIndex === null || draggedInclusionIndex === index) return;
    setManualIncludesDraft((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(draggedInclusionIndex, 1);
      if (moved) {
        copy.splice(index, 0, moved);
      }
      return copy;
    });
    setDraggedInclusionIndex(index);
  };

  const handleInclusionDragEnd = async () => {
    const initial = dragInitialIncludesStateRef.current;
    setDraggedInclusionIndex(null);
    setDragEnabledInclusionId(null);
    dragInitialIncludesStateRef.current = null;

    if (!initial) return;

    const initialIds = initial.includeIds;
    const currentIncludes = manualIncludesDraftRef.current;
    const currentIds = currentIncludes.map((i) => i.id);

    // Check if order actually changed
    const orderChanged =
      initialIds.length === currentIds.length &&
      initialIds.some((id, idx) => id !== currentIds[idx]);

    if (!orderChanged) return;

    if (currentCourseId) {
      // Validate if all IDs are valid persisted UUIDs
      const allValidUuids = currentIds.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
      );

      if (allValidUuids && serverIncludes.length === currentIds.length) {
        setIsReorderingIncludes(true);
        try {
          await reorderIncludesMutation.mutateAsync({
            courseId: currentCourseId,
            payload: {
              orderedIds: currentIds,
            },
          });
          const reorderedServer = currentIds
            .map((id) => serverIncludes.find((s) => s.id === id))
            .filter(Boolean) as CourseIncludeItem[];
          setServerIncludes(reorderedServer);
          markExtrasControlSaved("inclusions");
        } catch (err: unknown) {
          markExtrasControlFailed("inclusions");
          // Rollback to previous order on failure
          setManualIncludesDraft(initial.previousIncludes);
          const errorMsg =
            (err as { message?: string })?.message ||
            "Failed to save inclusion order. Restored previous order.";
          setToastMessage(errorMsg);
        } finally {
          setIsReorderingIncludes(false);
        }
      }
    }
  };

  // Certificate Handlers
  const handleToggleCertificate = async () => {
    if (isSavingCertificateRef.current) return;

    clearExtrasControlStatus("enableCertificate");
    const previousValue = extras.enableCertificate;
    const nextValue = !previousValue;

    // 1. Optimistic update
    setExtras((prev) => ({
      ...prev,
      enableCertificate: nextValue,
    }));

    isSavingCertificateRef.current = true;
    setIsSavingCertificate(true);

    try {
      // 2. Ensure course ID exists
      let targetCourseId = currentCourseId;
      if (!targetCourseId) {
        throw new Error(
          "Course draft must be created before enabling certificates. Please enter a course title first.",
        );
      }

      // 3. Directly call existing settings mutation
      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          certificateEnabled: nextValue,
        },
      });

      // 4. Update serverExtras baseline
      const confirmedCertificate = res.certificateEnabled ?? nextValue;
      const newBaseline = normalizeExtrasState({
        enableCertificate: confirmedCertificate,
      });
      setServerExtras(newBaseline);
      setExtras((prev) => ({
        ...prev,
        enableCertificate: newBaseline.enableCertificate,
      }));
      markExtrasControlSaved("enableCertificate");
    } catch (err: unknown) {
      markExtrasControlFailed("enableCertificate");
      // 5. Rollback on failure
      setExtras((prev) => ({
        ...prev,
        enableCertificate: previousValue,
      }));
      const errorMsg =
        (err as { message?: string })?.message || "Failed to update certificate setting.";
      setToastMessage(errorMsg);
    } finally {
      isSavingCertificateRef.current = false;
      setIsSavingCertificate(false);
    }
  };

  const handleCertificateTemplateChange = (template: string) => {
    setExtras((prev) => ({ ...prev, certificateTemplate: template }));
  };

  const handleIssuanceTypeChange = (type: CertificateIssuanceType) => {
    setExtras((prev) => ({ ...prev, issuanceType: type }));
  };

  const handleMinPercentageChange = (val: number) => {
    const clamped = Math.min(100, Math.max(1, isNaN(val) ? 1 : val));
    setExtras((prev) => ({ ...prev, minCompletionPercentage: clamped }));
  };

  const handleCustomRuleTextChange = (text: string) => {
    setExtras((prev) => ({ ...prev, customRuleText: text }));
  };

  const handleToggleAutoEmailCertificate = () => {
    setExtras((prev) => ({
      ...prev,
      autoEmailCertificate: !prev.autoEmailCertificate,
    }));
  };

  const ensureCourseDraftForAccessRules = async (): Promise<string> => {
    let id = currentCourseIdRef.current || currentCourseId;
    if (id) return id;
    if (inFlightBasicsPromiseRef.current) {
      await inFlightBasicsPromiseRef.current;
      id = currentCourseIdRef.current || currentCourseId;
      if (id) return id;
    }
    throw new Error(
      "Course draft must be created before configuring access rules. Please enter a course title first.",
    );
  };

  // Access Rules State Handlers (Immediate Persistence)
  const handleAccessTypeChange = async (type: AccessType) => {
    if (type === "restricted") return; // Restricted is disabled/coming soon
    if (accessRulesDraftRef.current.accessType === type) return;

    clearAccessControlStatus("accessType");
    const previousValue = accessRulesDraftRef.current.accessType;
    const version = ++accessControlVersionsRef.current.accessType;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      accessType: type,
    };
    setAccessRules((prev) => ({ ...prev, accessType: type }));
    inFlightAccessControlsRef.current.accessType =
      (inFlightAccessControlsRef.current.accessType || 0) + 1;
    markAccessControlSaving("accessType", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      let durationDays: number | null = null;
      if (accessRulesDraftRef.current.durationMode === "fixed") {
        const val = Math.max(1, accessRulesDraftRef.current.fixedDurationValue || 1);
        const unitMultiplier =
          accessRulesDraftRef.current.fixedDurationUnit === "Years"
            ? 365
            : accessRulesDraftRef.current.fixedDurationUnit === "Months"
              ? 30
              : accessRulesDraftRef.current.fixedDurationUnit === "Weeks"
                ? 7
                : 1;
        durationDays = val * unitMultiplier;
      }

      await upsertAccessRulesMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          accessType: type,
          durationType:
            accessRulesDraftRef.current.durationMode === "fixed" ? "fixed_duration" : "lifetime",
          durationDays: accessRulesDraftRef.current.durationMode === "fixed" ? durationDays : null,
        },
      });

      if (accessControlVersionsRef.current.accessType === version) {
        setAccessRulesExists(true);
        setServerAccessRules((prev) => ({
          ...prev,
          accessType: type,
        }));
        markAccessControlSaved("accessType");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.accessType === version) {
        markAccessControlFailed("accessType");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          accessType: previousValue,
        };
        setAccessRules((prev) => ({
          ...prev,
          accessType: previousValue,
        }));
        const errorMsg = (err as { message?: string })?.message || "Failed to update access type.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.accessType = Math.max(
        0,
        (inFlightAccessControlsRef.current.accessType || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.accessType === 0) {
        markAccessControlSaving("accessType", false);
      }
    }
  };

  const handleDurationModeChange = async (mode: AccessDurationMode) => {
    if (accessRulesDraftRef.current.durationMode === mode) return;

    clearAccessControlStatus("durationMode");
    if (fixedDurationDebounceTimerRef.current) {
      clearTimeout(fixedDurationDebounceTimerRef.current);
      fixedDurationDebounceTimerRef.current = null;
    }
    // Invalidate in-flight fixed duration requests so an older duration response cannot overwrite
    ++accessControlVersionsRef.current.fixedDuration;

    const previousMode = accessRulesDraftRef.current.durationMode;
    const version = ++accessControlVersionsRef.current.durationMode;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      durationMode: mode,
    };
    setAccessRules((prev) => ({ ...prev, durationMode: mode }));
    inFlightAccessControlsRef.current.durationMode =
      (inFlightAccessControlsRef.current.durationMode || 0) + 1;
    markAccessControlSaving("durationMode", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      let durationDays: number | null = null;
      if (mode === "fixed") {
        const val = Math.max(1, accessRulesDraftRef.current.fixedDurationValue || 1);
        const unitMultiplier =
          accessRulesDraftRef.current.fixedDurationUnit === "Years"
            ? 365
            : accessRulesDraftRef.current.fixedDurationUnit === "Months"
              ? 30
              : accessRulesDraftRef.current.fixedDurationUnit === "Weeks"
                ? 7
                : 1;
        durationDays = val * unitMultiplier;
      }

      await upsertAccessRulesMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          accessType: accessRulesDraftRef.current.accessType || "everyone",
          durationType: mode === "fixed" ? "fixed_duration" : "lifetime",
          durationDays: mode === "fixed" ? durationDays : null,
        },
      });

      if (accessControlVersionsRef.current.durationMode === version) {
        setAccessRulesExists(true);
        setServerAccessRules((prev) => ({
          ...prev,
          durationMode: mode,
          ...(mode === "fixed"
            ? {
                fixedDurationValue: accessRulesDraftRef.current.fixedDurationValue,
                fixedDurationUnit: accessRulesDraftRef.current.fixedDurationUnit,
              }
            : {}),
        }));
        markAccessControlSaved("durationMode");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.durationMode === version) {
        markAccessControlFailed("durationMode");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          durationMode: previousMode,
        };
        setAccessRules((prev) => ({
          ...prev,
          durationMode: previousMode,
        }));
        const errorMsg =
          (err as { message?: string })?.message || "Failed to update access duration.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.durationMode = Math.max(
        0,
        (inFlightAccessControlsRef.current.durationMode || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.durationMode === 0) {
        markAccessControlSaving("durationMode", false);
      }
    }
  };

  const persistFixedDuration = async (explicitVal?: number, explicitUnit?: DurationUnit) => {
    const currentDraft = accessRulesDraftRef.current;
    if (currentDraft.durationMode !== "fixed") return;

    clearAccessControlStatus("fixedDuration");
    const val = Math.max(
      1,
      explicitVal !== undefined ? explicitVal : currentDraft.fixedDurationValue || 1,
    );
    const unit =
      explicitUnit !== undefined ? explicitUnit : currentDraft.fixedDurationUnit || "Days";

    const unitMultiplier =
      unit === "Years" ? 365 : unit === "Months" ? 30 : unit === "Weeks" ? 7 : 1;
    const durationDays = val * unitMultiplier;

    const previousVal = serverAccessRules.fixedDurationValue;
    const previousUnit = serverAccessRules.fixedDurationUnit;
    const version = ++accessControlVersionsRef.current.fixedDuration;

    inFlightAccessControlsRef.current.fixedDuration =
      (inFlightAccessControlsRef.current.fixedDuration || 0) + 1;
    markAccessControlSaving("fixedDuration", true);

    const run = async () => {
      try {
        const targetCourseId = await ensureCourseDraftForAccessRules();

        await upsertAccessRulesMutation.mutateAsync({
          courseId: targetCourseId,
          payload: {
            accessType: accessRulesDraftRef.current.accessType || "everyone",
            durationType: "fixed_duration",
            durationDays,
          },
        });

        if (
          accessControlVersionsRef.current.fixedDuration === version &&
          accessRulesDraftRef.current.durationMode === "fixed"
        ) {
          setAccessRulesExists(true);
          setServerAccessRules((prev) => ({
            ...prev,
            durationMode: "fixed",
            fixedDurationValue: val,
            fixedDurationUnit: unit,
          }));
          markAccessControlSaved("fixedDuration");
        }
      } catch (err: unknown) {
        if (
          accessControlVersionsRef.current.fixedDuration === version &&
          accessRulesDraftRef.current.durationMode === "fixed"
        ) {
          markAccessControlFailed("fixedDuration");
          accessRulesDraftRef.current = {
            ...accessRulesDraftRef.current,
            fixedDurationValue: previousVal,
            fixedDurationUnit: previousUnit,
          };
          setAccessRules((prev) => ({
            ...prev,
            fixedDurationValue: previousVal,
            fixedDurationUnit: previousUnit,
          }));
          const errorMsg =
            (err as { message?: string })?.message || "Failed to update fixed access duration.";
          setToastMessage(errorMsg);
        }
      } finally {
        inFlightAccessControlsRef.current.fixedDuration = Math.max(
          0,
          (inFlightAccessControlsRef.current.fixedDuration || 1) - 1,
        );
        if (inFlightAccessControlsRef.current.fixedDuration === 0) {
          markAccessControlSaving("fixedDuration", false);
        }
        if (accessControlVersionsRef.current.fixedDuration === version) {
          inFlightDurationPromiseRef.current = null;
        }
      }
    };

    const promise = run();
    inFlightDurationPromiseRef.current = promise;
    return await promise;
  };

  const flushFixedDurationPersistence = async () => {
    if (fixedDurationDebounceTimerRef.current) {
      clearTimeout(fixedDurationDebounceTimerRef.current);
      fixedDurationDebounceTimerRef.current = null;
    }

    const currentDraft = accessRulesDraftRef.current;
    const isDurationDirty =
      currentDraft.durationMode === "fixed" &&
      (serverAccessRules.durationMode !== "fixed" ||
        currentDraft.fixedDurationValue !== serverAccessRules.fixedDurationValue ||
        currentDraft.fixedDurationUnit !== serverAccessRules.fixedDurationUnit);

    if (isDurationDirty) {
      await persistFixedDuration();
    } else if (inFlightDurationPromiseRef.current) {
      await inFlightDurationPromiseRef.current;
    }
  };

  const handleFixedDurationValueChange = (val: number) => {
    clearAccessControlStatus("fixedDuration");
    const value = Math.max(1, isNaN(val) ? 1 : val);
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      fixedDurationValue: value,
    };
    setAccessRules((prev) => ({
      ...prev,
      fixedDurationValue: value,
    }));

    if (fixedDurationDebounceTimerRef.current) {
      clearTimeout(fixedDurationDebounceTimerRef.current);
    }
    fixedDurationDebounceTimerRef.current = setTimeout(() => {
      fixedDurationDebounceTimerRef.current = null;
      void persistFixedDuration();
    }, 400);
  };

  const handleFixedDurationUnitChange = (unit: DurationUnit) => {
    clearAccessControlStatus("fixedDuration");
    if (fixedDurationDebounceTimerRef.current) {
      clearTimeout(fixedDurationDebounceTimerRef.current);
      fixedDurationDebounceTimerRef.current = null;
    }
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      fixedDurationUnit: unit,
    };
    setAccessRules((prev) => ({ ...prev, fixedDurationUnit: unit }));
    void persistFixedDuration(accessRulesDraftRef.current.fixedDurationValue, unit);
  };

  const handleToggleQA = async () => {
    clearAccessControlStatus("enableQA");
    const previousValue = accessRulesDraftRef.current.enableQA;
    const nextValue = !previousValue;
    const version = ++accessControlVersionsRef.current.enableQA;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      enableQA: nextValue,
    };
    setAccessRules((prev) => ({ ...prev, enableQA: nextValue }));
    inFlightAccessControlsRef.current.enableQA =
      (inFlightAccessControlsRef.current.enableQA || 0) + 1;
    markAccessControlSaving("enableQA", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          allowQa: nextValue,
        },
      });

      if (accessControlVersionsRef.current.enableQA === version) {
        const confirmedQa = res.allowQa !== undefined ? Boolean(res.allowQa) : nextValue;

        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableQA: confirmedQa,
        };
        setServerAccessRules((prev) => ({
          ...prev,
          enableQA: confirmedQa,
        }));
        setAccessRules((prev) => ({
          ...prev,
          enableQA: confirmedQa,
        }));
        markAccessControlSaved("enableQA");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.enableQA === version) {
        markAccessControlFailed("enableQA");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableQA: previousValue,
        };
        setAccessRules((prev) => ({
          ...prev,
          enableQA: previousValue,
        }));
        const errorMsg = (err as { message?: string })?.message || "Failed to update Q&A setting.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.enableQA = Math.max(
        0,
        (inFlightAccessControlsRef.current.enableQA || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.enableQA === 0) {
        markAccessControlSaving("enableQA", false);
      }
    }
  };

  const handleToggleComments = async () => {
    clearAccessControlStatus("enableComments");
    const previousValue = accessRulesDraftRef.current.enableComments;
    const nextValue = !previousValue;
    const version = ++accessControlVersionsRef.current.enableComments;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      enableComments: nextValue,
    };
    setAccessRules((prev) => ({ ...prev, enableComments: nextValue }));
    inFlightAccessControlsRef.current.enableComments =
      (inFlightAccessControlsRef.current.enableComments || 0) + 1;
    markAccessControlSaving("enableComments", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          allowComments: nextValue,
        },
      });

      if (accessControlVersionsRef.current.enableComments === version) {
        const confirmedComments =
          res.allowComments !== undefined ? Boolean(res.allowComments) : nextValue;

        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableComments: confirmedComments,
        };
        setServerAccessRules((prev) => ({
          ...prev,
          enableComments: confirmedComments,
        }));
        setAccessRules((prev) => ({
          ...prev,
          enableComments: confirmedComments,
        }));
        markAccessControlSaved("enableComments");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.enableComments === version) {
        markAccessControlFailed("enableComments");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableComments: previousValue,
        };
        setAccessRules((prev) => ({
          ...prev,
          enableComments: previousValue,
        }));
        const errorMsg =
          (err as { message?: string })?.message || "Failed to update comments setting.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.enableComments = Math.max(
        0,
        (inFlightAccessControlsRef.current.enableComments || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.enableComments === 0) {
        markAccessControlSaving("enableComments", false);
      }
    }
  };

  const handleToggleDownloads = async () => {
    clearAccessControlStatus("enableDownloads");
    const previousValue = accessRulesDraftRef.current.enableDownloads;
    const nextValue = !previousValue;
    const version = ++accessControlVersionsRef.current.enableDownloads;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      enableDownloads: nextValue,
    };
    setAccessRules((prev) => ({ ...prev, enableDownloads: nextValue }));
    inFlightAccessControlsRef.current.enableDownloads =
      (inFlightAccessControlsRef.current.enableDownloads || 0) + 1;
    markAccessControlSaving("enableDownloads", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          allowDownloads: nextValue,
        },
      });

      if (accessControlVersionsRef.current.enableDownloads === version) {
        const confirmedDownloads =
          res.allowDownloads !== undefined ? Boolean(res.allowDownloads) : nextValue;

        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableDownloads: confirmedDownloads,
        };
        setServerAccessRules((prev) => ({
          ...prev,
          enableDownloads: confirmedDownloads,
        }));
        setAccessRules((prev) => ({
          ...prev,
          enableDownloads: confirmedDownloads,
        }));
        markAccessControlSaved("enableDownloads");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.enableDownloads === version) {
        markAccessControlFailed("enableDownloads");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableDownloads: previousValue,
        };
        setAccessRules((prev) => ({
          ...prev,
          enableDownloads: previousValue,
        }));
        const errorMsg =
          (err as { message?: string })?.message || "Failed to update downloads setting.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.enableDownloads = Math.max(
        0,
        (inFlightAccessControlsRef.current.enableDownloads || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.enableDownloads === 0) {
        markAccessControlSaving("enableDownloads", false);
      }
    }
  };

  const handleToggleNotes = async () => {
    clearAccessControlStatus("enableNotes");
    const previousValue = accessRulesDraftRef.current.enableNotes;
    const nextValue = !previousValue;
    const version = ++accessControlVersionsRef.current.enableNotes;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      enableNotes: nextValue,
    };
    setAccessRules((prev) => ({ ...prev, enableNotes: nextValue }));
    inFlightAccessControlsRef.current.enableNotes =
      (inFlightAccessControlsRef.current.enableNotes || 0) + 1;
    markAccessControlSaving("enableNotes", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          allowNotes: nextValue,
        },
      });

      if (accessControlVersionsRef.current.enableNotes === version) {
        const confirmedNotes = res.allowNotes !== undefined ? Boolean(res.allowNotes) : nextValue;

        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableNotes: confirmedNotes,
        };
        setServerAccessRules((prev) => ({
          ...prev,
          enableNotes: confirmedNotes,
        }));
        setAccessRules((prev) => ({
          ...prev,
          enableNotes: confirmedNotes,
        }));
        markAccessControlSaved("enableNotes");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.enableNotes === version) {
        markAccessControlFailed("enableNotes");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableNotes: previousValue,
        };
        setAccessRules((prev) => ({
          ...prev,
          enableNotes: previousValue,
        }));
        const errorMsg =
          (err as { message?: string })?.message || "Failed to update notes setting.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.enableNotes = Math.max(
        0,
        (inFlightAccessControlsRef.current.enableNotes || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.enableNotes === 0) {
        markAccessControlSaving("enableNotes", false);
      }
    }
  };

  // Drag and Drop state for Sections & Lessons
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [dragEnabledSectionId, setDragEnabledSectionId] = useState<string | null>(null);

  const [draggedLessonState, setDraggedLessonState] = useState<DraggedLessonState | null>(null);
  const pinnedVirtualizedLessonIds = useMemo(
    () =>
      new Set([
        ...mountedLessonEditorIds,
        ...(draggedLessonState ? [draggedLessonState.lessonId] : []),
      ]),
    [draggedLessonState, mountedLessonEditorIds],
  );
  const draggedLessonStateRef = useRef<DraggedLessonState | null>(null);
  const [lessonDropTarget, setLessonDropTarget] = useState<LessonDropTarget | null>(null);
  const lessonDropTargetRef = useRef<LessonDropTarget | null>(null);
  const [dragEnabledLessonId, setDragEnabledLessonId] = useState<string | null>(null);

  // Reusable Delete Confirmation Modal state
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Section actions
  const handleAddSection = async () => {
    if (isCreatingSection || createSectionMutation.isPending || createCourseMutation.isPending)
      return;

    const tempSectionId = `temp-sec-${Date.now()}`;
    const newSectionTitle = "Title";
    const optimisticSection: CurriculumSectionItem = {
      id: tempSectionId,
      title: newSectionTitle,
      isExpanded: true,
      isEditingTitle: false,
      isPendingCreation: true,
      lessons: [],
    };

    // Show temporary section immediately
    pendingAddedSectionScrollRef.current = tempSectionId;
    setSections((prev) => [...prev, optimisticSection]);
    setIsCreatingSection(true);

    let targetCourseId = currentCourseId;
    if (!targetCourseId) {
      pendingAddedSectionScrollRef.current = null;
      setSections((prev) => prev.filter((s) => s.id !== tempSectionId));
      setToastMessage("Please enter a course title on the Basics tab first.");
      setIsCreatingSection(false);
      return;
    }

    try {
      const createdSection = await createSectionMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          title: newSectionTitle,
        },
      });

      // Replace temporary ID with real backend UUID
      if (pendingAddedSectionScrollRef.current === tempSectionId) {
        pendingAddedSectionScrollRef.current = createdSection.id;
      }
      setSections((prev) => {
        const hasServerSection = prev.some((s) => s.id === createdSection.id);
        if (hasServerSection) {
          return prev
            .filter((s) => s.id !== tempSectionId)
            .map((s) => (s.id === createdSection.id ? { ...s, isPendingCreation: false } : s));
        }
        return prev.map((s) =>
          s.id === tempSectionId
            ? {
                ...s,
                id: createdSection.id,
                title: createdSection.title,
                isPendingCreation: false,
              }
            : s,
        );
      });
    } catch (err: unknown) {
      // Rollback temporary section on failure
      if (pendingAddedSectionScrollRef.current === tempSectionId) {
        pendingAddedSectionScrollRef.current = null;
      }
      setSections((prev) => prev.filter((s) => s.id !== tempSectionId));
      const errorMsg = (err as { message?: string })?.message || "Failed to create section.";
      setToastMessage(errorMsg);
    } finally {
      setIsCreatingSection(false);
    }
  };

  const handleStartEditSectionTitle = (sectionId: string) => {
    clearCurriculumItemStatus(sectionId);
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, isEditingTitle: true } : s)),
    );
  };

  const handleSaveSectionTitle = async (sectionId: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim();
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;

    if (!trimmedTitle || trimmedTitle === sec.title) {
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, isEditingTitle: false } : s)),
      );
      return;
    }

    if (currentCourseId) {
      setUpdatingSectionId(sectionId);
      try {
        await updateSectionMutation.mutateAsync({
          courseId: currentCourseId,
          sectionId,
          payload: { title: trimmedTitle },
        });
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, title: trimmedTitle, isEditingTitle: false } : s,
          ),
        );
        markCurriculumItemSaved(sectionId);
      } catch (err: unknown) {
        const errorMsg =
          (err as { message?: string })?.message || "Failed to update section title.";
        setToastMessage(errorMsg);
        setSections((prev) =>
          prev.map((s) => (s.id === sectionId ? { ...s, isEditingTitle: false } : s)),
        );
        markCurriculumItemFailed(sectionId);
      } finally {
        setUpdatingSectionId(null);
      }
    } else {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId ? { ...s, title: trimmedTitle, isEditingTitle: false } : s,
        ),
      );
    }
  };

  const handleDeleteSection = (sectionId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    setDeleteModalState({
      isOpen: true,
      title: `Delete "${sec.title}"?`,
      message: `Are you sure you want to delete "${sec.title}" and its ${sec.lessons.length} lessons? This action cannot be undone.`,
      onConfirm: async () => {
        if (currentCourseId) {
          setDeletingSectionId(sectionId);
          try {
            await deleteSectionMutation.mutateAsync({
              courseId: currentCourseId,
              sectionId,
            });
            setSections((prev) => prev.filter((s) => s.id !== sectionId));
            setToastMessage(`Section "${sec.title}" deleted.`);
          } catch (err: unknown) {
            const errorMsg = (err as { message?: string })?.message || "Failed to delete section.";
            setToastMessage(errorMsg);
          } finally {
            setDeletingSectionId(null);
          }
        } else {
          setSections((prev) => prev.filter((s) => s.id !== sectionId));
        }
      },
    });
  };

  // Section Drag and Drop handlers
  const handleSectionDragStart = (
    e: React.DragEvent,
    index: number,
    section: CurriculumSectionItem,
  ) => {
    if (
      isReorderingSections ||
      reorderSectionsMutation.isPending ||
      updatingSectionId ||
      deletingSectionId
    ) {
      e.preventDefault();
      return;
    }
    dragInitialSectionsStateRef.current = {
      sectionIds: sectionsRef.current.map((s) => s.id),
      previousSections: structuredClone(sectionsRef.current),
    };
    setDraggedSectionIndex(index);
    setCustomDragImage(
      e,
      e.currentTarget as HTMLElement,
      sectionGhostHtml(section.title, index, section.lessons.length),
    );
  };

  const handleSectionDragOver = (e: React.DragEvent, index: number) => {
    if (draggedLessonStateRef.current) return;
    e.preventDefault();
    if (draggedSectionIndex === null || draggedSectionIndex === index) return;
    setSections((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(draggedSectionIndex, 1);
      if (moved) {
        copy.splice(index, 0, moved);
      }
      return copy;
    });
    setDraggedSectionIndex(index);
  };

  const handleSectionDragEnd = async () => {
    const initial = dragInitialSectionsStateRef.current;
    setDraggedSectionIndex(null);
    setDragEnabledSectionId(null);
    dragInitialSectionsStateRef.current = null;

    if (!initial) return;

    const initialIds = initial.sectionIds;
    const currentSections = sectionsRef.current;
    const currentIds = currentSections.map((s) => s.id);

    // Check if order actually changed
    const orderChanged =
      initialIds.length === currentIds.length &&
      initialIds.some((id, idx) => id !== currentIds[idx]);

    if (!orderChanged) return;

    if (currentCourseId) {
      // Validate that all IDs are valid UUIDs (persisted sections)
      const allValidUuids = currentIds.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
      );

      if (allValidUuids) {
        setIsReorderingSections(true);
        try {
          await reorderSectionsMutation.mutateAsync({
            courseId: currentCourseId,
            payload: {
              orderedSectionIds: currentIds,
              version: courseVersion || 1,
            },
          });
          setCourseVersion((prev) => prev + 1);
        } catch (err: unknown) {
          // Rollback to previous sections order on failure
          setSections(initial.previousSections);
          const errorMsg =
            (err as { message?: string })?.message ||
            "Failed to save section order. Restored previous order.";
          setToastMessage(errorMsg);
        } finally {
          setIsReorderingSections(false);
        }
      }
    }
  };

  // Lesson actions
  const handleAddLesson = async (sectionId: string) => {
    if (
      creatingLessonSectionId ||
      createLessonMutation.isPending ||
      createCourseMutation.isPending ||
      createSectionMutation.isPending
    ) {
      return;
    }

    const sec = sections.find((s) => s.id === sectionId);
    if (!sec || sec.isPendingCreation) return;

    const tempLessonId = `temp-les-${Date.now()}`;
    const newLessonTitle = `New Lesson ${sec.lessons.length + 1}`;
    const optimisticLesson: CurriculumLessonItem = {
      id: tempLessonId,
      title: newLessonTitle,
      description: "",
      contentType: "video" as const,
      contentTypeSelected: true,
      isExpanded: true,
      isPublished: true,
      isPreview: false,
      contentMediaId: null,
      isPendingCreation: true,
      initialState: {
        title: newLessonTitle,
        description: "",
        contentType: "video",
        isPublished: true,
        isPreview: false,
      },
      resources: [],
    };

    // Show temporary lesson immediately
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          lessons: [...s.lessons.map((l) => ({ ...l, isExpanded: false })), optimisticLesson],
        };
      }),
    );
    setCreatingLessonSectionId(sectionId);
    let targetCourseId = currentCourseId;

    if (!targetCourseId) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                lessons: s.lessons.filter((l) => l.id !== tempLessonId),
              }
            : s,
        ),
      );
      setToastMessage("Please enter a course title on the Basics tab first.");
      setCreatingLessonSectionId(null);
      return;
    }

    let targetSectionId = sectionId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetSectionId)) {
      try {
        const createdSection = await createSectionMutation.mutateAsync({
          courseId: targetCourseId,
          payload: { title: sec.title },
        });
        targetSectionId = createdSection.id;
        setSections((prev) =>
          prev.map((s) => (s.id === sectionId ? { ...s, id: targetSectionId } : s)),
        );
      } catch (err: unknown) {
        // Rollback temporary lesson
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  lessons: s.lessons.filter((l) => l.id !== tempLessonId),
                }
              : s,
          ),
        );
        const errorMsg =
          (err as { message?: string })?.message || "Failed to create section on server.";
        setToastMessage(errorMsg);
        setCreatingLessonSectionId(null);
        return;
      }
    }

    try {
      const createdLesson = await createLessonMutation.mutateAsync({
        courseId: targetCourseId,
        sectionId: targetSectionId,
        payload: {
          title: newLessonTitle,
          contentType: "video",
          description: "",
        },
      });

      // Replace temporary ID with real backend UUID
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== targetSectionId && s.id !== sectionId) return s;
          const hasServerLesson = s.lessons.some((l) => l.id === createdLesson.id);
          if (hasServerLesson) {
            return {
              ...s,
              id: targetSectionId,
              lessons: s.lessons
                .filter((l) => l.id !== tempLessonId)
                .map((l) => (l.id === createdLesson.id ? { ...l, isPendingCreation: false } : l)),
            };
          }
          return {
            ...s,
            id: targetSectionId,
            lessons: s.lessons.map((l) =>
              l.id === tempLessonId
                ? {
                    ...l,
                    id: createdLesson.id,
                    isPendingCreation: false,
                    initialState: l.initialState || {
                      title: l.title,
                      description: l.description || "",
                      contentType: l.contentType,
                      contentMediaId: l.contentMediaId ?? null,
                      isPublished: l.isPublished !== undefined ? l.isPublished : true,
                      isPreview: l.isPreview !== undefined ? l.isPreview : false,
                    },
                  }
                : l,
            ),
          };
        }),
      );
    } catch (err: unknown) {
      // Rollback temporary lesson on failure
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== targetSectionId && s.id !== sectionId) return s;
          return {
            ...s,
            lessons: s.lessons.filter((l) => l.id !== tempLessonId),
          };
        }),
      );
      const errorMsg = (err as { message?: string })?.message || "Failed to create lesson.";
      setToastMessage(errorMsg);
    } finally {
      setCreatingLessonSectionId(null);
    }
  };

  const handleDeleteLesson = (sectionId: string, lessonId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les) return;

    setDeleteModalState({
      isOpen: true,
      title: `Delete "${les.title}"?`,
      message: `Are you sure you want to delete lesson "${les.title}"? This action cannot be undone.`,
      onConfirm: async () => {
        if (
          currentCourseId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lessonId)
        ) {
          setDeletingLessonId(lessonId);
          try {
            await deleteLessonMutation.mutateAsync({
              courseId: currentCourseId,
              lessonId,
            });
            setSections((prev) =>
              prev.map((s) => {
                if (s.id !== sectionId) return s;
                return {
                  ...s,
                  lessons: s.lessons.filter((l) => l.id !== lessonId),
                };
              }),
            );
            setToastMessage(`Lesson "${les.title}" deleted.`);
          } catch (err: unknown) {
            const errorMsg = (err as { message?: string })?.message || "Failed to delete lesson.";
            setToastMessage(errorMsg);
          } finally {
            setDeletingLessonId(null);
          }
        } else {
          setSections((prev) =>
            prev.map((s) => {
              if (s.id !== sectionId) return s;
              return {
                ...s,
                lessons: s.lessons.filter((l) => l.id !== lessonId),
              };
            }),
          );
        }
      },
    });
  };

  const handleUpdateLesson = (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ) => {
    clearCurriculumItemStatus(lessonId);
    const currentSections = sectionsRef.current || sections;
    const nextSections = currentSections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lessons: sec.lessons.map((l) => (l.id === lessonId ? { ...l, ...updates } : l)),
      };
    });
    sectionsRef.current = nextSections;
    setSections(nextSections);
  };

  const handleCancelLessonDraft = (
    sectionId: string,
    lessonId: string,
    draft: LessonEditorDraft,
  ) => {
    const currentSections = sectionsRef.current || sections;
    const currentLesson = currentSections
      .find((section) => section.id === sectionId)
      ?.lessons.find((lesson) => lesson.id === lessonId);
    if (!currentLesson) return;

    writeLessonEditorDraft(currentCourseId, lessonId, {
      title: draft.title,
      description: currentLesson.description || "",
      contentType: draft.contentType,
      contentMediaId: currentLesson.contentMediaId ?? null,
      isPublished: draft.isPublished,
      isPreview: draft.isPreview,
    });

    handleUpdateLesson(sectionId, lessonId, {
      title: draft.title,
      contentType: draft.contentType,
      contentMediaId: currentLesson.contentMediaId ?? null,
      isPublished: draft.isPublished,
      isPreview: draft.isPreview,
    });
  };

  interface PersistLessonOptions {
    collapseOnSuccess?: boolean;
    showCleanToast?: boolean;
    explicitCourseId?: string | null;
  }

  const persistLesson = async (
    sectionId: string,
    lessonId: string,
    options?: PersistLessonOptions,
  ): Promise<boolean> => {
    // If a save is already in-flight for this lesson, await it, then persist any subsequent edits
    const existingSave = inFlightLessonSavesRef.current.get(lessonId);
    if (existingSave) {
      await existingSave;
      return persistLesson(sectionId, lessonId, options);
    }

    const savePromise = (async () => {
      // 1. Find the freshest lesson draft
      const currentSections = sectionsRef.current || sections;
      const sec = currentSections.find((s) => s.id === sectionId);
      const les = sec?.lessons.find((l) => l.id === lessonId);
      if (!les || les.isPendingCreation) return false;

      // 2. Check whether it is dirty
      if (!isLessonDirty(les)) {
        clearLessonEditorDraft(currentCourseId, lessonId);
        return true;
      }

      // 3. Validate existing lesson title rules
      const trimmedTitle = les.title.trim();
      if (!trimmedTitle) {
        setToastMessage("Lesson title cannot be empty.");
        return false;
      }

      const isPublishedVal = les.isPublished !== undefined ? les.isPublished : true;
      const isPreviewVal = les.isPreview !== undefined ? les.isPreview : false;

      // 4. Snapshot the exact payload being persisted
      const persistedSnapshot = {
        title: trimmedTitle,
        description: les.description || "",
        contentType: (les.contentType === "audio"
          ? "video"
          : les.contentType === "image"
            ? "document"
            : les.contentType) as "video" | "document" | "quiz",
        contentMediaId: les.contentMediaId ?? null,
        durationSeconds: les.durationSeconds,
        isPublished: isPublishedVal,
        isPreview: isPreviewVal,
      };

      const targetCourseId = options?.explicitCourseId || currentCourseId;

      if (
        targetCourseId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lessonId)
      ) {
        setSavingLessonId(lessonId);
        try {
          await updateLessonMutation.mutateAsync({
            courseId: targetCourseId,
            lessonId,
            payload: persistedSnapshot,
          });

          setSections((prev) => {
            const next = prev.map((s) => {
              if (s.id !== sectionId) return s;
              return {
                ...s,
                lessons: s.lessons.map((l) => {
                  if (l.id !== lessonId) return l;
                  return {
                    ...l,
                    isExpanded: options?.collapseOnSuccess ? false : l.isExpanded,
                    initialState: {
                      ...persistedSnapshot,
                    },
                  };
                }),
              };
            });
            sectionsRef.current = next;
            return next;
          });

          markCurriculumItemSaved(lessonId);
          clearLessonEditorDraft(targetCourseId, lessonId);
          return true;
        } catch (err: unknown) {
          const errorMsg = (err as { message?: string })?.message || "Failed to update lesson.";
          setToastMessage(errorMsg);
          markCurriculumItemFailed(lessonId);
          return false;
        } finally {
          setSavingLessonId(null);
        }
      } else {
        setSections((prev) => {
          const next = prev.map((s) => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              lessons: s.lessons.map((l) => {
                if (l.id !== lessonId) return l;
                return {
                  ...l,
                  isExpanded: options?.collapseOnSuccess ? false : l.isExpanded,
                  initialState: {
                    ...persistedSnapshot,
                  },
                };
              }),
            };
          });
          sectionsRef.current = next;
          return next;
        });
        clearLessonEditorDraft(targetCourseId, lessonId);
        return true;
      }
    })();

    inFlightLessonSavesRef.current.set(lessonId, savePromise);
    savePromise.finally(() => {
      inFlightLessonSavesRef.current.delete(lessonId);
    });

    return savePromise;
  };

  const handleSaveLesson = async (sectionId: string, lessonId: string): Promise<boolean> => {
    return await persistLesson(sectionId, lessonId, {
      collapseOnSuccess: true,
      showCleanToast: true,
    });
  };

  const handleLessonFieldBlur = async (sectionId: string, lessonId: string) => {
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les || les.isPendingCreation) return;
    if (!isLessonDirty(les)) return;

    await persistLesson(sectionId, lessonId, {
      collapseOnSuccess: false,
    });
  };

  const handleStartEditLessonTitle = (sectionId: string, lessonId: string) => {
    const currentSections = sectionsRef.current || sections;
    const lesson = currentSections
      .find((section) => section.id === sectionId)
      ?.lessons.find((item) => item.id === lessonId);
    if (!lesson || lesson.isPendingCreation) return;

    lessonTitleDraftsRef.current.set(lessonId, lesson.title);
    clearCurriculumItemStatus(lessonId);
    setSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              lessons: section.lessons.map((item) =>
                item.id === lessonId ? { ...item, isEditingTitle: true } : item,
              ),
            },
      ),
    );
  };

  const handleCancelEditLessonTitle = (sectionId: string, lessonId: string) => {
    const originalTitle = lessonTitleDraftsRef.current.get(lessonId);
    lessonTitleDraftsRef.current.delete(lessonId);
    setSections((prev) => {
      const next = prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              lessons: section.lessons.map((lesson) =>
                lesson.id === lessonId
                  ? {
                      ...lesson,
                      ...(originalTitle !== undefined ? { title: originalTitle } : {}),
                      isEditingTitle: false,
                    }
                  : lesson,
              ),
            },
      );
      sectionsRef.current = next;
      return next;
    });
  };

  const handleLessonTitleBlur = async (sectionId: string, lessonId: string) => {
    lessonTitleDraftsRef.current.delete(lessonId);
    await handleLessonFieldBlur(sectionId, lessonId);
    setSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              lessons: section.lessons.map((lesson) =>
                lesson.id === lessonId ? { ...lesson, isEditingTitle: false } : lesson,
              ),
            },
      ),
    );
  };

  const handleCancelLessonDescriptionEdit = (sectionId: string, lessonId: string) => {
    const currentSections = sectionsRef.current || sections;
    const lesson = currentSections
      .find((section) => section.id === sectionId)
      ?.lessons.find((item) => item.id === lessonId);
    if (!lesson) return;

    handleUpdateLesson(sectionId, lessonId, {
      description: lesson.initialState?.description || "",
    });
  };

  const handleLessonDiscreteChange = async (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ): Promise<boolean> => {
    const isContentTypeChange = Boolean(updates.contentType);
    handleUpdateLesson(sectionId, lessonId, updates);
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les || les.isPendingCreation) return false;
    if (!isLessonDirty(les)) {
      if (isContentTypeChange) {
        handleUpdateLesson(sectionId, lessonId, {
          contentTypeSelected: true,
          pendingContentType: undefined,
        });
      }
      return true;
    }

    const persisted = await persistLesson(sectionId, lessonId, {
      collapseOnSuccess: false,
    });
    if (persisted && isContentTypeChange) {
      handleUpdateLesson(sectionId, lessonId, {
        contentTypeSelected: true,
        pendingContentType: undefined,
      });
    }
    return persisted;
  };

  const handleLessonMediaAttached = async (
    sectionId: string,
    lessonId: string,
    mediaAssetId: string,
  ): Promise<boolean> => {
    const currentSections = sectionsRef.current || sections;
    const lesson = currentSections
      .find((section) => section.id === sectionId)
      ?.lessons.find((item) => item.id === lessonId);
    if (!lesson) return false;

    const courseId = currentCourseIdRef.current || currentCourseId;
    const isPersistedLesson =
      !lesson.isPendingCreation &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lessonId);
    if (!courseId || !isPersistedLesson) {
      // Unsaved lessons carry the media ID in their creation payload.
      handleUpdateLesson(sectionId, lessonId, { contentMediaId: mediaAssetId });
      return true;
    }

    // Persist the binding before exposing it to the editor. The media
    // workspace requests playback for the lesson as soon as it sees the new
    // media ID, and that request fails until the API lesson references it.
    try {
      await updateLessonMutation.mutateAsync({
        courseId,
        lessonId,
        payload: { contentMediaId: mediaAssetId },
      });
    } catch (err: unknown) {
      setToastMessage(
        (err as { message?: string })?.message || "The video could not be attached to this lesson.",
      );
      return false;
    }

    clearVideoPlaybackBootstrapCache();
    // A cancelled editor leaves a local draft that wins over server data on
    // the next editor refresh. Keep its media in sync so the draft cannot
    // restore the replaced video.
    const storedDraft = readLessonEditorDraft(courseId, lessonId);
    if (storedDraft) {
      const { savedAt: _savedAt, ...draft } = storedDraft;
      writeLessonEditorDraft(courseId, lessonId, {
        ...draft,
        contentMediaId: mediaAssetId,
      });
    }
    const latestLesson = (sectionsRef.current || sections)
      .find((section) => section.id === sectionId)
      ?.lessons.find((item) => item.id === lessonId);
    handleUpdateLesson(sectionId, lessonId, {
      contentMediaId: mediaAssetId,
      ...(latestLesson?.initialState
        ? {
            initialState: {
              ...latestLesson.initialState,
              contentMediaId: mediaAssetId,
            },
          }
        : {}),
    });
    return true;
  };

  const handleLessonProcessingComplete = async (): Promise<void> => {
    if (!currentCourseIdRef.current) return;

    // The media stream is the source of truth for the terminal state. Once it
    // reports completion, refresh the derived editor/preview data so
    // duration and readiness are reflected everywhere without polling.
    await Promise.allSettled([refetchEditor(), refetchPreview()]);
  };

  const saveAllDirtyLessons = async (explicitCourseId?: string | null): Promise<boolean> => {
    if (isSavingAllDirtyLessonsRef.current) return false;
    isSavingAllDirtyLessonsRef.current = true;
    try {
      const currentSections = sectionsRef.current || sections;
      const dirtyLessons: Array<{ sectionId: string; lessonId: string }> = [];
      for (const sec of currentSections) {
        for (const les of sec.lessons) {
          if (isLessonDirty(les) && !les.isPendingCreation) {
            dirtyLessons.push({ sectionId: sec.id, lessonId: les.id });
          }
        }
      }

      if (dirtyLessons.length === 0) {
        return true;
      }

      const results = await Promise.all(
        dirtyLessons.map(({ sectionId, lessonId }) =>
          persistLesson(sectionId, lessonId, {
            collapseOnSuccess: false,
            explicitCourseId,
          }),
        ),
      );

      return results.every(Boolean);
    } finally {
      isSavingAllDirtyLessonsRef.current = false;
    }
  };

  const handleToggleLessonExpand = async (
    sectionId: string,
    lessonId: string,
    nextExpanded = true,
  ): Promise<boolean> => {
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les) return false;

    if (!nextExpanded && isLessonDirty(les)) {
      return await handleSaveLesson(sectionId, lessonId);
    }

    return true;
  };

  const navigateToCurriculumFocus = (sectionId?: string | null, lessonId?: string | null) => {
    void navigate(
      getCourseEditorPath({
        mode: isEditing ? "edit" : "create",
        courseId: activeEditId,
        step: "curriculum",
        sectionId,
        lessonId,
      }),
    );
  };

  const handleToggleSectionExpand = async (sectionId: string) => {
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    if (!sec) return;

    // 1. When the section is being EXPANDED:
    if (!sec.isExpanded) {
      if (isCollapsingSectionRef.current || isSavingAllDirtyLessonsRef.current) {
        return;
      }

      const sectionsToCollapse = currentSections.filter(
        (section) => section.id !== sectionId && section.isExpanded,
      );
      const targetIndex = currentSections.findIndex((section) => section.id === sectionId);
      sectionScrollDelayRef.current = currentSections
        .slice(0, targetIndex)
        .some((section) => section.isExpanded)
        ? 300
        : 0;
      const dirtyLessons = sectionsToCollapse.flatMap((section) =>
        section.lessons
          .filter((lesson) => isLessonDirty(lesson) && !lesson.isPendingCreation)
          .map((lesson) => ({ sectionId: section.id, lesson })),
      );

      if (dirtyLessons.length > 0) {
        isCollapsingSectionRef.current = true;
        let allSuccessful = true;
        try {
          for (const { sectionId: dirtySectionId, lesson } of dirtyLessons) {
            const success = await persistLesson(dirtySectionId, lesson.id, {
              collapseOnSuccess: true,
            });
            if (!success) {
              allSuccessful = false;
              break;
            }
          }
        } finally {
          isCollapsingSectionRef.current = false;
        }
        if (!allSuccessful) return;
      }

      setSections((prev) => {
        const next = prev.map((section) =>
          section.id === sectionId
            ? { ...section, isExpanded: true }
            : section.isExpanded
              ? { ...section, isExpanded: false }
              : section,
        );
        sectionsRef.current = next;
        return next;
      });
      navigateToCurriculumFocus(sectionId);
      return;
    }

    // 2. When the section is being COLLAPSED:
    // Find dirty lessons in that section
    const dirtyLessons = sec.lessons.filter((l) => isLessonDirty(l) && !l.isPendingCreation);

    // No dirty lessons? Collapse immediately
    if (dirtyLessons.length === 0) {
      setSections((prev) => {
        const next = prev.map((s) => (s.id === sectionId ? { ...s, isExpanded: false } : s));
        sectionsRef.current = next;
        return next;
      });
      navigateToCurriculumFocus();
      return;
    }

    // Guard against re-entrancy if already collapsing or saving
    if (isCollapsingSectionRef.current || isSavingAllDirtyLessonsRef.current) {
      return;
    }

    // Dirty lessons? Save dirty lesson(s)
    isCollapsingSectionRef.current = true;
    let allSuccessful = true;
    try {
      for (const lesson of dirtyLessons) {
        const success = await persistLesson(sectionId, lesson.id, {
          collapseOnSuccess: true,
        });
        if (!success) {
          allSuccessful = false;
          break;
        }
      }
    } finally {
      isCollapsingSectionRef.current = false;
    }

    // All saves successful?
    // Yes -> Collapse section
    // No  -> Keep section expanded
    if (allSuccessful) {
      setSections((prev) => {
        const next = prev.map((s) => (s.id === sectionId ? { ...s, isExpanded: false } : s));
        sectionsRef.current = next;
        return next;
      });
      navigateToCurriculumFocus();
    }
  };

  const handleCreateLessonResource = async (
    lessonId: string,
    payload: CreateLessonResourceRequest,
  ): Promise<LessonResource> => {
    if (!currentCourseId) {
      throw new Error("Save the course before adding lesson resources.");
    }
    return await createLessonResourceMutation.mutateAsync({
      courseId: currentCourseId,
      lessonId,
      payload,
    });
  };

  const handleLessonResourceAdded = (
    sectionId: string,
    lessonId: string,
    resource: LessonResourceItem,
  ) => {
    setSections((prev) => {
      const next = prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) => {
            if (l.id !== lessonId) return l;
            if (l.resources.some((existing) => existing.id === resource.id)) {
              return l;
            }
            return {
              ...l,
              resources: [...l.resources, resource],
            };
          }),
        };
      });
      sectionsRef.current = next;
      return next;
    });
  };

  const handleDeleteLessonResource = async (resourceId: string): Promise<void> => {
    if (!currentCourseId) {
      throw new Error("Save the course before removing lesson resources.");
    }
    await deleteLessonResourceMutation.mutateAsync({
      courseId: currentCourseId,
      resourceId,
    });
  };

  const handleLessonResourceRemoved = (
    sectionId: string,
    lessonId: string,
    resource: LessonResourceItem,
  ) => {
    setSections((prev) => {
      const next = prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) => {
            if (l.id !== lessonId) return l;
            return {
              ...l,
              resources: l.resources.filter((r) => r.id !== resource.id),
            };
          }),
        };
      });
      sectionsRef.current = next;
      return next;
    });
  };

  // Lesson Drag and Drop handlers
  const handleLessonDragStart = (
    e: React.DragEvent,
    sectionId: string,
    lessonIndex: number,
    lesson: CurriculumLessonItem,
  ) => {
    if (
      reorderingLessonsSectionId ||
      reorderLessonsMutation.isPending ||
      savingLessonId ||
      deletingLessonId
    ) {
      e.preventDefault();
      return;
    }
    const currentSec = sectionsRef.current.find((s) => s.id === sectionId);
    const nextDraggedLessonState = { sectionId, lessonId: lesson.id };
    dragInitialLessonStateRef.current = {
      sectionId,
      lessonIds: currentSec ? currentSec.lessons.map((l) => l.id) : [],
      previousLessons: currentSec ? structuredClone(currentSec.lessons) : [],
    };
    draggedLessonStateRef.current = nextDraggedLessonState;
    setDraggedLessonState(nextDraggedLessonState);
    lessonDropTargetRef.current = null;
    setLessonDropTarget(null);
    setCustomDragImage(
      e,
      e.currentTarget as HTMLElement,
      lessonGhostHtml(lesson.title, lessonIndex, lesson.pendingContentType || lesson.contentType),
    );
    e.stopPropagation();
  };

  const handleLessonDragOver = (
    e: React.DragEvent,
    targetSectionId: string,
    targetLessonId: string,
  ) => {
    const draggedLesson = draggedLessonStateRef.current;
    if (!draggedLesson || targetSectionId !== draggedLesson.sectionId) return;
    e.preventDefault();
    e.stopPropagation();
    if (targetLessonId === draggedLesson.lessonId) {
      lessonDropTargetRef.current = null;
      setLessonDropTarget(null);
      return;
    }

    const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const position = e.clientY < targetRect.top + targetRect.height / 2 ? "before" : "after";
    const nextDropTarget = {
      sectionId: targetSectionId,
      lessonId: targetLessonId,
      position,
    } satisfies LessonDropTarget;
    lessonDropTargetRef.current = nextDropTarget;
    setLessonDropTarget(nextDropTarget);
  };

  const handleLessonDragEnd = async () => {
    const initial = dragInitialLessonStateRef.current;
    const draggedLesson = draggedLessonStateRef.current;
    const dropTarget = lessonDropTargetRef.current;
    setDraggedLessonState(null);
    setDragEnabledLessonId(null);
    draggedLessonStateRef.current = null;
    lessonDropTargetRef.current = null;
    setLessonDropTarget(null);
    dragInitialLessonStateRef.current = null;

    if (!initial || !draggedLesson || !dropTarget || dropTarget.sectionId !== initial.sectionId) {
      return;
    }

    const currentSec = sectionsRef.current.find((s) => s.id === initial.sectionId);
    if (!currentSec) return;

    const sourceIndex = currentSec.lessons.findIndex(
      (lesson) => lesson.id === draggedLesson.lessonId,
    );
    const targetIndex = currentSec.lessons.findIndex((lesson) => lesson.id === dropTarget.lessonId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    let insertionIndex = targetIndex + (dropTarget.position === "after" ? 1 : 0);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    if (sourceIndex === insertionIndex) return;

    const nextLessons = [...currentSec.lessons];
    const [movedLesson] = nextLessons.splice(sourceIndex, 1);
    if (!movedLesson) return;
    nextLessons.splice(insertionIndex, 0, movedLesson);

    const nextSections = sectionsRef.current.map((section) =>
      section.id === initial.sectionId ? { ...section, lessons: nextLessons } : section,
    );
    sectionsRef.current = nextSections;
    setSections(nextSections);

    const currentLessonIds = nextLessons.map((l) => l.id);
    const initialLessonIds = initial.lessonIds;

    const orderChanged =
      initialLessonIds.length === currentLessonIds.length &&
      initialLessonIds.some((id, idx) => id !== currentLessonIds[idx]);

    if (!orderChanged) return;

    if (
      currentCourseId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(initial.sectionId)
    ) {
      const allValidUuids = currentLessonIds.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
      );

      if (allValidUuids) {
        setReorderingLessonsSectionId(initial.sectionId);
        try {
          await reorderLessonsMutation.mutateAsync({
            courseId: currentCourseId,
            sectionId: initial.sectionId,
            payload: {
              orderedLessonIds: currentLessonIds,
              version: courseVersion || 1,
            },
          });
          setCourseVersion((prev) => prev + 1);
        } catch (err: unknown) {
          // Rollback to previous order on failure
          setSections((prev) =>
            prev.map((s) => {
              if (s.id !== initial.sectionId) return s;
              return {
                ...s,
                lessons: initial.previousLessons,
              };
            }),
          );
          const errorMsg =
            (err as { message?: string })?.message ||
            "Failed to save lesson order. Restored previous order.";
          setToastMessage(errorMsg);
        } finally {
          setReorderingLessonsSectionId(null);
        }
      }
    }
  };

  // Computed total stats
  const totalSections = sections.length;
  const totalLessons = sections.reduce((acc, sec) => acc + sec.lessons.length, 0);

  // Prefer the server-calculated duration or estimated duration from editor data.
  const courseDurationSeconds = resolveCourseDurationSeconds(
    editorData?.course?.totalDurationSeconds,
    editorData?.settings?.estimatedDuration,
  );
  const computedDuration = formatDuration(courseDurationSeconds);

  // Student-facing Preview Object Adapter
  const previewCourse: Course = {
    id: currentCourseId || "preview-course",
    title: courseTitle.trim() || "Course Title",
    description: courseDescription.trim() || "This is a short description of your course.",
    level: (difficultyLevel
      ? difficultyLevel.charAt(0).toUpperCase() + difficultyLevel.slice(1)
      : "Beginner") as CourseLevel,
    category: (selectedCategoryName || "Development") as CourseCategory,
    sections: totalSections,
    lectures: totalLessons,
    progress: null,
    enrolled: false,
    duration: computedDuration,
    students: 0,
    thumbnail: thumbnail || "/static/instructor-poster.jpg",
    lifecycleStatus: isPublished ? "published" : "draft",
  };

  const previewInclusions: string[] = useMemo(() => {
    return manualIncludesDraft
      .map((m) => m.text.trim())
      .filter(Boolean)
      .slice(0, 6);
  }, [manualIncludesDraft]);

  const previewIncludes: CourseInclude[] = useMemo(() => {
    return previewInclusions.map((text) => ({
      icon: /certificate/i.test(text)
        ? Certificate
        : /download/i.test(text)
          ? DownloadSimple
          : /lifetime|access/i.test(text)
            ? Clock
            : /preview/i.test(text)
              ? PlayCircle
              : CheckCircle,
      label: text,
    }));
  }, [previewInclusions]);

  const ensureCourseDraftForPricing = async (explicitCourseId?: string | null): Promise<string> => {
    let targetId = explicitCourseId || currentCourseIdRef.current || currentCourseId;
    if (targetId) return targetId;
    if (inFlightBasicsPromiseRef.current) {
      await inFlightBasicsPromiseRef.current;
      targetId = explicitCourseId || currentCourseIdRef.current || currentCourseId;
      if (targetId) return targetId;
    }
    throw new Error(
      "Course draft must be created before setting pricing. Please enter a course title first.",
    );
  };

  const executeSerializedPricingMutation = async (
    controlKey: "pricingType" | "currency" | "pricingDetails",
    targetVersion: number,
    previousSnapshot: PricingFormState,
  ) => {
    const priorPromise = inFlightPricingPromiseRef.current;

    const run = async () => {
      if (priorPromise) {
        try {
          await priorPromise;
        } catch {
          // Allow subsequent queued requests to proceed even if previous failed
        }
      }

      // If a newer version was triggered while waiting in queue, abort obsolete execution
      if (pricingVersionRef.current !== targetVersion) {
        return;
      }

      const latestDraft = pricingDraftRef.current;
      const validation = validatePricing(latestDraft);
      if (!validation.isValid) {
        return;
      }

      const targetCourseId = await ensureCourseDraftForPricing();
      const payload = buildPricingPayload(latestDraft);

      const res = await upsertPricingMutation.mutateAsync({
        courseId: targetCourseId,
        payload,
      });

      // Stale-response protection: Only update baseline if we are still at targetVersion
      if (pricingVersionRef.current === targetVersion) {
        const isFree = res.pricingType === "free";
        const hasSale = res.salePrice != null && res.salePrice !== undefined;
        const newBaseline: PricingFormState = normalizePricingState({
          pricingType: isFree ? "free" : "paid",
          sellingPrice: isFree
            ? ""
            : hasSale
              ? String(res.salePrice)
              : res.price > 0
                ? String(res.price)
                : "",
          originalPrice: !isFree && hasSale ? String(res.price) : "",
          currency: res.currency || "INR",
        });
        setServerPricing(newBaseline);
        serverPricingRef.current = newBaseline;

        if (controlKey === "pricingDetails") {
          const field = lastEditedPricingFieldRef.current;
          if (field) {
            markPricingControlSaved(field);
          }
          markPricingControlSaved("pricingDetails");
        } else {
          markPricingControlSaved(controlKey);
        }
      }
      return res;
    };

    const execute = async () => {
      try {
        return await run();
      } catch (err: unknown) {
        // Rollback only if no newer edit has superseded this one
        if (pricingVersionRef.current === targetVersion) {
          if (controlKey === "pricingType") {
            pricingDraftRef.current = {
              ...pricingDraftRef.current,
              pricingType: previousSnapshot.pricingType,
            };
            setPricingDraft((prev) => ({
              ...prev,
              pricingType: previousSnapshot.pricingType,
            }));
            markPricingControlFailed("pricingType");
          } else if (controlKey === "currency") {
            pricingDraftRef.current = {
              ...pricingDraftRef.current,
              currency: previousSnapshot.currency,
            };
            setPricingDraft((prev) => ({
              ...prev,
              currency: previousSnapshot.currency,
            }));
            markPricingControlFailed("currency");
          } else if (controlKey === "pricingDetails") {
            pricingDraftRef.current = {
              ...pricingDraftRef.current,
              sellingPrice: previousSnapshot.sellingPrice,
              originalPrice: previousSnapshot.originalPrice,
            };
            setPricingDraft((prev) => ({
              ...prev,
              sellingPrice: previousSnapshot.sellingPrice,
              originalPrice: previousSnapshot.originalPrice,
            }));
            const field = lastEditedPricingFieldRef.current;
            if (field) {
              markPricingControlFailed(field);
            }
            markPricingControlFailed("pricingDetails");
          }
          const errorMsg =
            err instanceof Error
              ? err.message
              : "Failed to save pricing changes. Reverting to last saved state.";
          setToastMessage(errorMsg);
        }
        throw err;
      } finally {
        inFlightPricingControlsRef.current[controlKey] = Math.max(
          0,
          (inFlightPricingControlsRef.current[controlKey] || 1) - 1,
        );
        if (inFlightPricingControlsRef.current[controlKey] === 0) {
          markPricingControlSaving(controlKey, false);
        }
        if (pricingVersionRef.current === targetVersion) {
          inFlightPricingPromiseRef.current = null;
        }
      }
    };

    const promise = execute();
    inFlightPricingPromiseRef.current = promise;
    return await promise;
  };

  const persistPricingDetails = async () => {
    const currentDraft = pricingDraftRef.current;
    const validation = validatePricing(currentDraft);
    if (!validation.isValid) {
      return;
    }

    const version = ++pricingVersionRef.current;
    pricingControlVersionsRef.current.pricingDetails = version;
    inFlightPricingControlsRef.current.pricingDetails =
      (inFlightPricingControlsRef.current.pricingDetails || 0) + 1;
    markPricingControlSaving("pricingDetails", true);

    const previousSnapshot = { ...serverPricingRef.current };
    return await executeSerializedPricingMutation("pricingDetails", version, previousSnapshot);
  };

  const flushPricingPersistence = async () => {
    if (pricingDebounceTimerRef.current) {
      clearTimeout(pricingDebounceTimerRef.current);
      pricingDebounceTimerRef.current = null;
    }

    const currentDraft = pricingDraftRef.current;
    const isDirty = !isPricingEqual(currentDraft, serverPricingRef.current);

    if (isDirty) {
      const validation = validatePricing(currentDraft);
      if (validation.isValid) {
        await persistPricingDetails();
      }
    } else if (inFlightPricingPromiseRef.current) {
      await inFlightPricingPromiseRef.current;
    }
  };

  const handlePricingTypeChange = async (type: PricingType) => {
    if (pricingDraftRef.current.pricingType === type) return;

    clearPricingControlStatus("pricingType");
    if (pricingDebounceTimerRef.current) {
      clearTimeout(pricingDebounceTimerRef.current);
      pricingDebounceTimerRef.current = null;
    }

    const previousSnapshot = { ...pricingDraftRef.current };
    const version = ++pricingVersionRef.current;
    pricingControlVersionsRef.current.pricingType = version;

    // 1. Optimistic update
    pricingDraftRef.current = {
      ...pricingDraftRef.current,
      pricingType: type,
    };
    setPricingDraft((prev) => ({ ...prev, pricingType: type }));
    if (pricingValidationError) setPricingValidationError(null);

    // 2. If switching to paid and price is not valid yet, keep in local draft without firing API
    if (type === "paid") {
      const validation = validatePricing(pricingDraftRef.current);
      if (!validation.isValid) {
        return;
      }
    }

    // 3. Persist immediately
    inFlightPricingControlsRef.current.pricingType =
      (inFlightPricingControlsRef.current.pricingType || 0) + 1;
    markPricingControlSaving("pricingType", true);

    try {
      await executeSerializedPricingMutation("pricingType", version, previousSnapshot);
    } catch {
      // Error handled in executeSerializedPricingMutation
    }
  };

  const handleSellingPriceChange = (val: string) => {
    lastEditedPricingFieldRef.current = "sellingPrice";
    clearPricingControlStatus("sellingPrice");
    clearPricingControlStatus("pricingDetails");
    const digitsOnly = val.replace(/\D/g, "");
    pricingDraftRef.current = {
      ...pricingDraftRef.current,
      sellingPrice: digitsOnly,
    };
    setPricingDraft((prev) => ({ ...prev, sellingPrice: digitsOnly }));
    if (pricingValidationError) setPricingValidationError(null);

    if (pricingDebounceTimerRef.current) {
      clearTimeout(pricingDebounceTimerRef.current);
    }
    pricingDebounceTimerRef.current = setTimeout(() => {
      pricingDebounceTimerRef.current = null;
      void persistPricingDetails();
    }, 400);
  };

  const handleOriginalPriceChange = (val: string) => {
    lastEditedPricingFieldRef.current = "originalPrice";
    clearPricingControlStatus("originalPrice");
    clearPricingControlStatus("pricingDetails");
    const digitsOnly = val.replace(/\D/g, "");
    pricingDraftRef.current = {
      ...pricingDraftRef.current,
      originalPrice: digitsOnly,
    };
    setPricingDraft((prev) => ({ ...prev, originalPrice: digitsOnly }));
    if (pricingValidationError) setPricingValidationError(null);

    if (pricingDebounceTimerRef.current) {
      clearTimeout(pricingDebounceTimerRef.current);
    }
    pricingDebounceTimerRef.current = setTimeout(() => {
      pricingDebounceTimerRef.current = null;
      void persistPricingDetails();
    }, 400);
  };

  const handleCurrencyChange = async (val: string) => {
    if (pricingDraftRef.current.currency === val) return;

    clearPricingControlStatus("currency");
    const previousSnapshot = { ...pricingDraftRef.current };
    const version = ++pricingVersionRef.current;
    pricingControlVersionsRef.current.currency = version;

    // 1. Optimistic update
    pricingDraftRef.current = {
      ...pricingDraftRef.current,
      currency: val,
    };
    setPricingDraft((prev) => ({ ...prev, currency: val }));
    if (pricingValidationError) setPricingValidationError(null);

    // If paid and current price is invalid, keep currency in local draft until price is valid
    if (pricingDraftRef.current.pricingType === "paid") {
      const validation = validatePricing(pricingDraftRef.current);
      if (!validation.isValid) {
        return;
      }
    }

    inFlightPricingControlsRef.current.currency =
      (inFlightPricingControlsRef.current.currency || 0) + 1;
    markPricingControlSaving("currency", true);

    try {
      await executeSerializedPricingMutation("currency", version, previousSnapshot);
    } catch {
      // Error handled in executeSerializedPricingMutation
    }
  };

  const currencySymbol = getCurrencySymbol(pricing.currency || "INR");
  const previewCurrency = pricing.currency || "INR";
  const previewSellingAmount = pricing.sellingPrice.trim()
    ? parseFloat(pricing.sellingPrice.replace(/,/g, ""))
    : 0;
  const previewOriginalAmount = pricing.originalPrice.trim()
    ? parseFloat(pricing.originalPrice.replace(/,/g, ""))
    : 0;

  const previewPricing: CourseOverviewPricingProps =
    pricing.pricingType === "free"
      ? { price: "Free", amount: 0, currency: previewCurrency }
      : {
          price: pricing.sellingPrice.trim()
            ? `${currencySymbol}${pricing.sellingPrice.trim()}`
            : `${currencySymbol}1,999`,
          originalPrice: pricing.originalPrice.trim()
            ? `${currencySymbol}${pricing.originalPrice.trim()}`
            : undefined,
          discount:
            pricing.originalPrice.trim() &&
            pricing.sellingPrice.trim() &&
            previewOriginalAmount > previewSellingAmount
              ? `${Math.round(
                  ((previewOriginalAmount - previewSellingAmount) / previewOriginalAmount) * 100,
                )}% OFF`
              : undefined,
          amount: Number.isFinite(previewSellingAmount) ? previewSellingAmount : 0,
          currency: previewCurrency,
        };

  const editorCourseSlug = editorData?.course?.slug;
  const editorCourseStatus = editorData?.course?.status;
  const editorCourseCreatorId = editorData?.course?.creatorId;
  const editorCourseThumbnailMediaId = editorData?.course?.thumbnailMediaId;
  const editorCourseTrailerMediaId = editorData?.course?.trailerMediaId;
  const editorCourseCreatedAt = editorData?.course?.createdAt;
  const editorCourseUpdatedAt = editorData?.course?.updatedAt;
  const editorCoursePublishedAt = editorData?.course?.publishedAt;
  const editorCourseTotalDurationSeconds = editorData?.course?.totalDurationSeconds;
  const editorAccessRulesId = editorData?.accessRules?.id;
  const editorPricingId = editorData?.pricing?.id;
  const editorSettingsId = editorData?.settings?.id;
  const editorEstimatedDuration = editorData?.settings?.estimatedDuration;

  const localPreviewData = useMemo<CourseEditorDataResponse | null>(() => {
    if (!isPreviewModalOpen) return null;

    return buildLocalPreviewData({
      currentCourseId,
      courseTitle,
      shortDescription,
      courseDescription,
      categoryId,
      difficultyLevel,
      language,
      instructorAlias,
      showInstructorName,
      courseVersion,
      isPublished,
      thumbnailMediaId,
      trailerMediaId: editorCourseTrailerMediaId || null,
      sections,
      pricingDraft,
      accessRulesDraft,
      enableCertificate: extras.enableCertificate,
      manualIncludesDraft,
      editorDefaults: {
        course: {
          slug: editorCourseSlug,
          status: editorCourseStatus,
          creatorId: editorCourseCreatorId,
          thumbnailMediaId: editorCourseThumbnailMediaId,
          trailerMediaId: editorCourseTrailerMediaId,
          createdAt: editorCourseCreatedAt,
          updatedAt: editorCourseUpdatedAt,
          publishedAt: editorCoursePublishedAt,
          totalDurationSeconds: editorCourseTotalDurationSeconds,
        },
        accessRules: { id: editorAccessRulesId },
        pricing: { id: editorPricingId },
        settings: {
          id: editorSettingsId,
          estimatedDuration: editorEstimatedDuration,
        },
      },
      totalDurationSeconds: resolveCourseDurationSeconds(
        editorCourseTotalDurationSeconds,
        editorEstimatedDuration,
      ),
    });
  }, [
    isPreviewModalOpen,
    currentCourseId,
    courseTitle,
    shortDescription,
    courseDescription,
    difficultyLevel,
    categoryId,
    instructorAlias,
    showInstructorName,
    language,
    courseVersion,
    isPublished,
    thumbnailMediaId,
    editorCourseSlug,
    editorCourseStatus,
    editorCourseCreatorId,
    editorCourseThumbnailMediaId,
    editorCourseTrailerMediaId,
    editorCourseCreatedAt,
    editorCourseUpdatedAt,
    editorCoursePublishedAt,
    editorCourseTotalDurationSeconds,
    editorAccessRulesId,
    editorPricingId,
    editorSettingsId,
    editorEstimatedDuration,
    sections,
    accessRulesDraft,
    pricingDraft,
    extras.enableCertificate,
    manualIncludesDraft,
  ]);

  // Explicit non-reconciliation: when local preview data is available from wizard state,
  // it renders immediately. previewData remains fetched in the background without overwriting.
  const activePreviewData = localPreviewData || previewData;

  // Publish Checklist Validation based strictly on server validation response
  const getChecklistState = (area: CourseValidationArea): ChecklistState => {
    if (isValidating) return "validating";
    if (!serverValidation) return "idle";
    return serverValidation.sections[area].valid ? "valid" : "invalid";
  };

  const validationChecklistItems: Array<{
    area: CourseValidationArea;
    label: string;
    summary: string;
  }> = [
    { area: "basics", label: "Basics", summary: "Completed" },
    {
      area: "curriculum",
      label: "Curriculum",
      summary: `${totalSections} Sections, ${totalLessons} Lessons`,
    },
    {
      area: "accessRules",
      label: "Access Rules",
      summary: accessRules.accessType === "everyone" ? "Everyone" : "Restricted Access",
    },
    {
      area: "pricing",
      label: "Pricing",
      summary: pricing.pricingType === "free" ? "Free" : `₹${pricing.sellingPrice}`,
    },
    {
      area: "extras",
      label: "Extras",
      summary: extras.enableCertificate ? "Certificate Enabled" : "Disabled",
    },
  ];

  useEffect(() => {
    if (isValidating) setExpandedValidationArea(null);
  }, [isValidating]);

  const isCourseReadyToPublish = serverValidation?.canPublish ?? false;

  const handlePreviewAction = async () => {
    if (
      isAnyApiInProgress ||
      isPreviewLoading ||
      actionLoading !== null ||
      isSavingAllDirtyLessonsRef.current ||
      isInitialCourseCreationPending
    )
      return;

    if (activeStep === "curriculum") {
      const currentSections = sectionsRef.current || sections;
      const hasDirty = currentSections.some((s) =>
        s.lessons.some((l) => isLessonDirty(l) && !l.isPendingCreation),
      );
      if (hasDirty) {
        setActionLoading("save");
        try {
          const success = await saveAllDirtyLessons();
        } catch {
          return;
        } finally {
          setActionLoading(null);
        }
      }
    }

    if (activeStep === "basics") {
      await flushBasicsPersistence();
    }

    setIsPreviewModalOpen(true);
  };

  const executeSerializedBasicsMetaMutation = async (
    controlKey: "title" | "shortDescription" | "courseDescription" | "instructorAlias",
    targetVersion: number,
    previousSnapshot: BasicsFormState,
  ) => {
    const priorPromise = inFlightBasicsPromiseRef.current;

    const run = async () => {
      if (priorPromise) {
        try {
          await priorPromise;
        } catch {
          // Allow subsequent queued requests to proceed even if previous failed
        }
      }

      // If a newer version was triggered while waiting in queue, abort obsolete execution
      if (basicsVersionRef.current !== targetVersion) {
        return;
      }

      // CRITICAL: Read LATEST draft values and LATEST courseVersion at actual execution time!
      const latestDraft = basicsDraftRef.current;
      const currentVersion = courseVersionRef.current;

      const trimmedTitle = latestDraft.title.trim();
      if (!trimmedTitle) {
        return;
      }

      const targetCourseId = currentCourseIdRef.current || currentCourseId;
      if (!targetCourseId) {
        return;
      }

      const payload = {
        title: trimmedTitle,
        shortDescription: latestDraft.shortDescription.trim() || null,
        description: latestDraft.description.trim() || null,
        categoryId: latestDraft.categoryId || null,
        difficulty: latestDraft.difficulty || null,
        instructorAlias: latestDraft.instructorAlias.trim() || null,
        version: currentVersion,
      };

      const updated = await updateBasicsMutation.mutateAsync({
        id: targetCourseId,
        payload,
      });

      // Stale-response protection: Only update baseline if we are still at targetVersion
      if (basicsVersionRef.current === targetVersion) {
        setCourseVersion(updated.version);
        courseVersionRef.current = updated.version;

        const newBaseline: BasicsFormState = normalizeBasicsState({
          title: updated.title,
          shortDescription: updated.shortDescription || "",
          description: updated.description || "",
          categoryId: updated.categoryId || "",
          difficulty: (updated.difficulty as BasicsFormState["difficulty"]) || "",
          language: serverBasicsRef.current.language,
          instructorAlias: updated.instructorAlias || "",
          showInstructorName: serverBasicsRef.current.showInstructorName,
        });
        setServerBasics(newBaseline);
        serverBasicsRef.current = newBaseline;
      }
      return updated;
    };

    const execute = async () => {
      try {
        const result = await run();
        if (result && basicsVersionRef.current === targetVersion) {
          if (
            controlKey === "title" ||
            controlKey === "shortDescription" ||
            controlKey === "courseDescription" ||
            controlKey === "instructorAlias"
          ) {
            markBasicsFieldSaved(controlKey);
          }
        }
        return result;
      } catch (err: unknown) {
        // Rollback only if no newer edit has superseded this one
        if (basicsVersionRef.current === targetVersion) {
          if (
            controlKey === "title" ||
            controlKey === "shortDescription" ||
            controlKey === "courseDescription" ||
            controlKey === "instructorAlias"
          ) {
            markBasicsFieldFailed(controlKey);
          }
          if (controlKey === "title") {
            setCourseTitle(previousSnapshot.title);
          } else if (controlKey === "shortDescription") {
            setShortDescription(previousSnapshot.shortDescription);
          } else if (controlKey === "courseDescription") {
            setCourseDescription(previousSnapshot.description);
          } else if (controlKey === "instructorAlias") {
            setInstructorAlias(previousSnapshot.instructorAlias);
          }
          const errorMsg =
            err instanceof Error
              ? err.message
              : "Failed to save course basics changes. Reverting to last saved state.";
          setToastMessage(errorMsg);
        }
        throw err;
      } finally {
        inFlightBasicsControlsRef.current[controlKey] = Math.max(
          0,
          (inFlightBasicsControlsRef.current[controlKey] || 1) - 1,
        );
        if (inFlightBasicsControlsRef.current[controlKey] === 0) {
          markBasicsControlSaving(controlKey, false);
        }
        if (basicsVersionRef.current === targetVersion) {
          inFlightBasicsPromiseRef.current = null;
        }
      }
    };

    const promise = execute();
    inFlightBasicsPromiseRef.current = promise;
    return await promise;
  };

  /**
   * Ensures a brand-new course has been created exactly once.
   *
   * Invariant:
   *   - If a creation request is already in flight, the caller JOINS that
   *     shared promise — no second POST /courses is issued.
   *   - If no creation is in flight, one is started and its promise is
   *     registered synchronously (before the first await) so every subsequent
   *     concurrent caller will find it and join rather than fork.
   *   - currentCourseIdRef.current is updated immediately on success so every
   *     caller that awaited the shared promise can read the confirmed ID.
   *   - The promise is cleared in finally so a failed attempt can be retried.
   */
  const ensureCourseCreated = async (
    title: string,
    instructorAlias: string | null,
  ): Promise<{
    id: string;
    version: number;
    title: string;
    instructorAlias?: string | null;
  }> => {
    // Cancel any pending title creation debounce since creation is now starting/joining.
    cancelTitleCreationDebounce();

    // If course already exists, return it.
    if (currentCourseIdRef.current) {
      return {
        id: currentCourseIdRef.current,
        version: courseVersionRef.current,
        title: serverBasicsRef.current.title || title,
        instructorAlias: serverBasicsRef.current.instructorAlias || instructorAlias,
      };
    }

    // Join an existing in-flight creation rather than starting a new one.
    if (inFlightCourseCreationPromiseRef.current) {
      return await inFlightCourseCreationPromiseRef.current;
    }

    // Register the promise SYNCHRONOUSLY before the first await so any
    // concurrent caller that checks immediately after this line will find it.
    const promise = (async () => {
      isInitialCurriculumBootstrapInProgressRef.current = true;
      setIsInitialCurriculumBootstrapInProgress(true);

      const created = await createCourseMutation.mutateAsync({
        title,
        instructorAlias,
      });

      // Write the confirmed ID to the ref immediately so all awaiting callers
      // can use it as soon as the shared promise resolves.
      currentCourseIdRef.current = created.id;
      if (typeof window !== "undefined") {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get("edit") !== created.id) {
          currentUrl.searchParams.set("edit", created.id);
          currentUrl.searchParams.delete("courseId");
          window.history.replaceState(window.history.state, "", currentUrl.toString());
        }
      }

      // Prebuild initial section ("Introduction") and initial lesson ("New Lesson 1")
      try {
        const createdSection = await createSectionMutation.mutateAsync({
          courseId: created.id,
          payload: { title: "Introduction" },
        });

        const createdLesson = await createLessonMutation.mutateAsync({
          courseId: created.id,
          sectionId: createdSection.id,
          payload: {
            title: "New Lesson 1",
            contentType: "video",
            description: "",
          },
        });

        const prebuiltLesson: CurriculumLessonItem = {
          id: createdLesson.id,
          title: "New Lesson 1",
          description: "",
          contentType: "video",
          contentTypeSelected: true,
          isExpanded: true,
          isPublished: true,
          isPreview: false,
          contentMediaId: null,
          isPendingCreation: false,
          initialState: {
            title: "New Lesson 1",
            description: "",
            contentType: "video",
            contentMediaId: null,
            isPublished: true,
            isPreview: false,
          },
          resources: [],
        };

        const prebuiltSection: CurriculumSectionItem = {
          id: createdSection.id,
          title: createdSection.title || "Introduction",
          isEditingTitle: false,
          isExpanded: true,
          isPendingCreation: false,
          lessons: [prebuiltLesson],
        };

        setSections([prebuiltSection]);
        sectionsRef.current = [prebuiltSection];
      } catch (bootstrapErr: unknown) {
        const errorMsg =
          bootstrapErr instanceof Error
            ? bootstrapErr.message
            : "Course created, but default section setup could not be completed.";
        setToastMessage(errorMsg);
      }

      return created;
    })();

    inFlightCourseCreationPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      isInitialCurriculumBootstrapInProgressRef.current = false;
      setIsInitialCurriculumBootstrapInProgress(false);
      // Clear regardless of success/failure so a failed attempt can be retried.
      inFlightCourseCreationPromiseRef.current = null;
    }
  };

  const persistBasicsField = async (
    fieldKey: "title" | "shortDescription" | "courseDescription" | "instructorAlias",
  ) => {
    const currentDraft = basicsDraftRef.current;
    const baseline = serverBasicsRef.current;

    if (fieldKey === "title") {
      const trimmed = currentDraft.title.trim();
      if (!currentCourseIdRef.current && !currentCourseId) {
        // Creation gate: do not call the API for an empty title.
        if (!trimmed) {
          return;
        }
        markBasicsControlSaving("title", true);
        try {
          // ensureCourseCreated guarantees at most one POST /courses even when
          // multiple callers (blur, tab-switch, flush, preview) race here.
          const created = await ensureCourseCreated(
            trimmed,
            currentDraft.instructorAlias.trim() || null,
          );
          // currentCourseIdRef.current is already set inside ensureCourseCreated.
          setCurrentCourseId(created.id);
          setCourseVersion(created.version);
          courseVersionRef.current = created.version;
          setShowTitleTooltip(false);

          const newBaseline: BasicsFormState = normalizeBasicsState({
            ...baseline,
            title: created.title,
            instructorAlias: created.instructorAlias || "",
          });
          setServerBasics(newBaseline);
          serverBasicsRef.current = newBaseline;

          // Check if title was edited while creation was in flight
          const latestTitle = basicsDraftRef.current.title.trim();
          if (latestTitle && latestTitle !== created.title) {
            // User modified title while creation was in flight.
            // Preserve user's latest draft in local state:
            setBasicsDraft((prev) => ({
              ...prev,
              instructorAlias: created.instructorAlias ?? prev.instructorAlias,
            }));
            basicsDraftRef.current = {
              ...basicsDraftRef.current,
              instructorAlias: created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
            };
            // Now that currentCourseId is established, persist the latest title
            // through the EXISTING COURSE update path (executeSerializedBasicsMetaMutation).
            void persistBasicsField("title");
          } else {
            // CRITICAL: Preserve existing local draft fields! Do NOT reset other draft fields
            setBasicsDraft((prev) => ({
              ...prev,
              title: created.title,
              instructorAlias: created.instructorAlias ?? prev.instructorAlias,
            }));
            basicsDraftRef.current = {
              ...basicsDraftRef.current,
              title: created.title,
              instructorAlias: created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
            };
            markBasicsFieldSaved("title");
          }
          return created;
        } catch (err: unknown) {
          markBasicsFieldFailed("title");
          const errorMsg =
            err instanceof Error ? err.message : "Failed to create course. Please try again.";
          setToastMessage(errorMsg);
        } finally {
          markBasicsControlSaving("title", false);
        }
        return;
      }

      // Course already exists
      if (!trimmed) {
        setCourseTitle(baseline.title);
        setToastMessage("Course title cannot be empty.");
        return;
      }
      if (trimmed === baseline.title) {
        return;
      }
    } else {
      let targetCourseId = currentCourseIdRef.current || currentCourseId;
      if (!targetCourseId) {
        if (inFlightBasicsPromiseRef.current) {
          await inFlightBasicsPromiseRef.current;
        } else if (basicsDraftRef.current.title.trim()) {
          await persistBasicsField("title");
        }
        targetCourseId = currentCourseIdRef.current || currentCourseId;
      }
      if (!targetCourseId) {
        return;
      }
      if (fieldKey === "shortDescription") {
        if (currentDraft.shortDescription.trim() === baseline.shortDescription.trim()) {
          return;
        }
      } else if (fieldKey === "courseDescription") {
        if (currentDraft.description.trim() === baseline.description.trim()) {
          return;
        }
      } else if (fieldKey === "instructorAlias") {
        if (currentDraft.instructorAlias.trim() === baseline.instructorAlias.trim()) {
          return;
        }
      }
    }

    const version = ++basicsVersionRef.current;
    markBasicsControlSaving(fieldKey, true);
    inFlightBasicsControlsRef.current[fieldKey] =
      (inFlightBasicsControlsRef.current[fieldKey] || 0) + 1;
    const previousSnapshot = { ...serverBasicsRef.current };

    return await executeSerializedBasicsMetaMutation(fieldKey, version, previousSnapshot);
  };

  const handleShowInstructorNameChange = async (nextValue: boolean) => {
    let targetCourseId = currentCourseIdRef.current || currentCourseId;
    if (!targetCourseId) {
      if (inFlightBasicsPromiseRef.current) {
        await inFlightBasicsPromiseRef.current;
      } else if (basicsDraftRef.current.title.trim()) {
        await persistBasicsField("title");
      }
      targetCourseId = currentCourseIdRef.current || currentCourseId;
    }
    if (!targetCourseId) return;

    const previousValue = serverBasicsRef.current.showInstructorName;
    const version = ++basicsVersionRef.current;

    // 1. Optimistic UI update
    setShowInstructorName(nextValue);
    clearBasicsFieldStatus("showInstructorName");
    markBasicsControlSaving("showInstructorName", true);
    inFlightBasicsControlsRef.current.showInstructorName =
      (inFlightBasicsControlsRef.current.showInstructorName || 0) + 1;

    try {
      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          showInstructorName: nextValue,
          language: basicsDraftRef.current.language || "en",
        },
      });

      if (basicsVersionRef.current === version) {
        const confirmedShow =
          res.showInstructorName !== undefined ? res.showInstructorName : nextValue;
        const newBaseline: BasicsFormState = {
          ...serverBasicsRef.current,
          showInstructorName: confirmedShow,
        };
        setServerBasics(newBaseline);
        serverBasicsRef.current = newBaseline;
        markBasicsFieldSaved("showInstructorName");
      }
    } catch (err: unknown) {
      if (basicsVersionRef.current === version) {
        setShowInstructorName(previousValue);
        markBasicsFieldFailed("showInstructorName");
        const errorMsg =
          err instanceof Error ? err.message : "Failed to update instructor name visibility.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightBasicsControlsRef.current.showInstructorName = Math.max(
        0,
        (inFlightBasicsControlsRef.current.showInstructorName || 1) - 1,
      );
      if (inFlightBasicsControlsRef.current.showInstructorName === 0) {
        markBasicsControlSaving("showInstructorName", false);
      }
    }
  };

  const flushBasicsPersistence = async (): Promise<boolean> => {
    const currentDraft = basicsDraftRef.current;
    const baseline = serverBasicsRef.current;

    let targetCourseId = currentCourseIdRef.current || currentCourseId;
    if (!targetCourseId) {
      if (!currentDraft.title.trim()) {
        return false;
      }
      try {
        await persistBasicsField("title");
        return Boolean(currentCourseIdRef.current || currentCourseId);
      } catch {
        return false;
      }
    }

    // If a basics save is already in-flight (e.g. started by the description
    // field's blur handler), await it before re-evaluating dirtiness.  Without
    // this guard both blur and navigation call executeSerializedBasicsMetaMutation
    // with the same courseVersion, producing an optimistic-lock conflict:
    //   1. blur fires → inFlightBasicsPromiseRef set synchronously → run() reads
    //      courseVersionRef but the stale-response guard skips updating it when
    //      basicsVersionRef has already been bumped by the navigation path.
    //   2. navigation's run() then reads the un-updated courseVersionRef and
    //      sends a PUT with the old version → backend rejects with 409.
    // Awaiting here joins the in-flight save, lets it complete (which updates
    // courseVersionRef and serverBasicsRef), and then the isMetaDirty check
    // below correctly finds nothing left to save.
    if (inFlightBasicsPromiseRef.current) {
      try {
        await inFlightBasicsPromiseRef.current;
      } catch {
        // Ignored – isMetaDirty is re-evaluated below with fresh ref values.
      }
    }

    const isMetaDirty = !isBasicsMetaEqual(basicsDraftRef.current, serverBasicsRef.current);
    if (isMetaDirty) {
      if (!basicsDraftRef.current.title.trim()) {
        setCourseTitle(serverBasicsRef.current.title);
        setToastMessage("Course title cannot be empty.");
        return false;
      }
      const version = ++basicsVersionRef.current;
      markBasicsControlSaving("title", true);
      inFlightBasicsControlsRef.current.title = (inFlightBasicsControlsRef.current.title || 0) + 1;
      const previousSnapshot = { ...serverBasicsRef.current };
      try {
        await executeSerializedBasicsMetaMutation("title", version, previousSnapshot);
        return true;
      } catch {
        return false;
      }
    } else if (inFlightCourseCreationPromiseRef.current || inFlightBasicsPromiseRef.current) {
      try {
        // Await whichever in-flight operation is active (creation takes priority).
        await (inFlightCourseCreationPromiseRef.current ?? inFlightBasicsPromiseRef.current);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  };

  const saveBasicsStep = async (explicitCourseId?: string | null) => {
    const targetCourseId = explicitCourseId || currentCourseId;
    if (targetCourseId && isBasicsEqual(basicsDraftRef.current, serverBasicsRef.current)) {
      return serverBasicsRef.current;
    }

    if (!basicsDraftRef.current.title.trim()) {
      throw new Error("Please enter a course title.");
    }
    setIsSavingBasics(true);
    try {
      if (!targetCourseId) {
        // Use the shared creation helper so concurrent callers (e.g. onBlur
        // and saveBasicsStep both firing while courseId is still null) join the
        // same POST /courses rather than issuing duplicate requests.
        const created = await ensureCourseCreated(
          basicsDraftRef.current.title.trim(),
          basicsDraftRef.current.instructorAlias.trim() || null,
        );
        // currentCourseIdRef.current is already set inside ensureCourseCreated.
        setCurrentCourseId(created.id);
        setCourseVersion(created.version);
        courseVersionRef.current = created.version;

        const newBaseline: BasicsFormState = normalizeBasicsState({
          ...serverBasicsRef.current,
          title: created.title,
          instructorAlias: created.instructorAlias || "",
        });
        setServerBasics(newBaseline);
        serverBasicsRef.current = newBaseline;

        const latestTitle = basicsDraftRef.current.title.trim();
        if (latestTitle && latestTitle !== created.title) {
          setBasicsDraft((prev) => ({
            ...prev,
            instructorAlias: created.instructorAlias ?? prev.instructorAlias,
          }));
          basicsDraftRef.current = {
            ...basicsDraftRef.current,
            instructorAlias: created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
          };
          void persistBasicsField("title");
        } else {
          setBasicsDraft((prev) => ({
            ...prev,
            title: created.title,
            instructorAlias: created.instructorAlias ?? prev.instructorAlias,
          }));
          basicsDraftRef.current = {
            ...basicsDraftRef.current,
            title: created.title,
            instructorAlias: created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
          };
        }

        if (
          basicsDraftRef.current.shortDescription.trim() ||
          basicsDraftRef.current.description.trim() ||
          basicsDraftRef.current.categoryId ||
          basicsDraftRef.current.difficulty
        ) {
          const updated = await updateBasicsMutation.mutateAsync({
            id: created.id,
            payload: {
              title: created.title,
              shortDescription: basicsDraftRef.current.shortDescription.trim() || null,
              description: basicsDraftRef.current.description.trim() || null,
              categoryId: basicsDraftRef.current.categoryId || null,
              difficulty: basicsDraftRef.current.difficulty || null,
              instructorAlias: basicsDraftRef.current.instructorAlias.trim() || null,
              version: created.version,
            },
          });
          setCourseVersion(updated.version);
          courseVersionRef.current = updated.version;
          const updatedBaseline = normalizeBasicsState({
            ...newBaseline,
            shortDescription: updated.shortDescription || "",
            description: updated.description || "",
            categoryId: updated.categoryId || "",
            difficulty: (updated.difficulty as BasicsFormState["difficulty"]) || "",
          });
          setServerBasics(updatedBaseline);
          serverBasicsRef.current = updatedBaseline;
        }
        markBasicsFieldSaved("title");
        setBasicsSaveFailed(false);
        triggerBasicsSavedBriefly();
        return created;
      } else {
        const ok = await flushBasicsPersistence();
        if (!ok) {
          setBasicsSaveFailed(true);
        } else {
          setBasicsSaveFailed(false);
          triggerBasicsSavedBriefly();
        }
        return serverBasicsRef.current;
      }
    } catch (err) {
      setBasicsSaveFailed(true);
      throw err;
    } finally {
      setIsSavingBasics(false);
    }
  };

  const saveCurriculumStep = async (explicitCourseId?: string | null) => {
    setIsSavingCurriculum(true);
    setCurriculumSaveFailed(false);
    try {
      let targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        throw new Error("Please enter a course title on the Basics tab first.");
      }

      // 1. Save any pending section title edits
      const editingSections = sections.filter(
        (s) =>
          s.isEditingTitle &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id),
      );
      if (editingSections.length > 0) {
        await Promise.all(
          editingSections.map(async (sec) => {
            const trimmed = sec.title.trim();
            if (trimmed) {
              await updateSectionMutation.mutateAsync({
                courseId: targetCourseId,
                sectionId: sec.id,
                payload: { title: trimmed },
              });
              setSections((prev) =>
                prev.map((s) => (s.id === sec.id ? { ...s, isEditingTitle: false } : s)),
              );
              markCurriculumItemSaved(sec.id);
            }
          }),
        );
      }

      // 2. Save all dirty lessons across all sections
      const allSaved = await saveAllDirtyLessons(targetCourseId);
      if (!allSaved) {
        throw new Error("Failed to save some lessons in curriculum.");
      }

      triggerCurriculumSavedBriefly();
      return true;
    } catch (err) {
      setCurriculumSaveFailed(true);
      throw err;
    } finally {
      setIsSavingCurriculum(false);
    }
  };

  const saveAccessRulesStep = async (explicitCourseId?: string | null) => {
    await flushFixedDurationPersistence();

    const currentDraft = accessRulesDraftRef.current;
    if (!currentDraft.durationMode) {
      throw new Error("Please select an access duration option.");
    }
    setIsSavingAccessRules(true);
    try {
      let targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        throw new Error("Please enter a course title on the Basics tab first.");
      }

      let durationDays: number | null = null;
      if (accessRulesDraftRef.current.durationMode === "fixed") {
        const val = Math.max(1, accessRulesDraftRef.current.fixedDurationValue || 1);
        const unitMultiplier =
          accessRulesDraftRef.current.fixedDurationUnit === "Years"
            ? 365
            : accessRulesDraftRef.current.fixedDurationUnit === "Months"
              ? 30
              : accessRulesDraftRef.current.fixedDurationUnit === "Weeks"
                ? 7
                : 1;
        durationDays = val * unitMultiplier;
      }

      const isRulesConfigDirty = !isAccessRuleConfigEqual(
        accessRulesDraftRef.current,
        serverAccessRules,
      );

      let accessRuleRes: any = null;

      if (isRulesConfigDirty) {
        accessRuleRes = await upsertAccessRulesMutation.mutateAsync({
          courseId: targetCourseId,
          payload: {
            accessType: accessRulesDraftRef.current.accessType || "everyone",
            durationType:
              accessRulesDraftRef.current.durationMode === "fixed" ? "fixed_duration" : "lifetime",
            durationDays:
              accessRulesDraftRef.current.durationMode === "fixed" ? durationDays : null,
          },
        });
      }

      const isFixed = accessRuleRes
        ? accessRuleRes.durationType === "fixed_duration"
        : serverAccessRules.durationMode === "fixed";

      const newBaseline: AccessRulesFormState = normalizeAccessRulesState({
        accessType: accessRulesDraftRef.current.accessType || "everyone",
        durationMode: isFixed ? "fixed" : "lifetime",
        fixedDurationValue: accessRulesDraftRef.current.fixedDurationValue,
        fixedDurationUnit: accessRulesDraftRef.current.fixedDurationUnit,
        enableQA: accessRulesDraftRef.current.enableQA,
        enableComments: accessRulesDraftRef.current.enableComments,
        enableDownloads: accessRulesDraftRef.current.enableDownloads,
        enableNotes: accessRulesDraftRef.current.enableNotes,
      });

      setAccessRulesExists(true);
      setServerAccessRules(newBaseline);
      setAccessRulesDraft(newBaseline);
      setAccessRulesSaveFailed(false);
      triggerAccessRulesSavedBriefly();
      return { accessRule: accessRuleRes };
    } catch (err) {
      setAccessRulesSaveFailed(true);
      throw err;
    } finally {
      setIsSavingAccessRules(false);
    }
  };

  const savePricingStep = async (explicitCourseId?: string | null) => {
    await flushPricingPersistence();

    // If already saved and clean, do not fire redundant duplicate mutation
    const isDirty = !isPricingEqual(pricingDraftRef.current, serverPricingRef.current);
    if (!isDirty) {
      return { ...serverPricingRef.current };
    }

    const validation = validatePricing(pricingDraftRef.current);
    if (!validation.isValid) {
      setPricingValidationError(validation.error);
      setToastMessage(validation.error || "Please fix pricing errors.");
      throw new Error(validation.error || "Validation failed");
    }
    setPricingValidationError(null);

    setIsSavingPricing(true);
    try {
      const targetCourseId = await ensureCourseDraftForPricing(explicitCourseId);
      const payload = buildPricingPayload(pricingDraftRef.current);
      const res = await upsertPricingMutation.mutateAsync({
        courseId: targetCourseId,
        payload,
      });

      const isFree = res.pricingType === "free";
      const hasSale = res.salePrice != null && res.salePrice !== undefined;
      const newBaseline: PricingFormState = normalizePricingState({
        pricingType: isFree ? "free" : "paid",
        sellingPrice: isFree
          ? ""
          : hasSale
            ? String(res.salePrice)
            : res.price > 0
              ? String(res.price)
              : "",
        originalPrice: !isFree && hasSale ? String(res.price) : "",
        currency: res.currency || "INR",
      });

      setServerPricing(newBaseline);
      serverPricingRef.current = newBaseline;
      setPricingDraft(newBaseline);
      pricingDraftRef.current = newBaseline;
      setPricingSaveFailed(false);
      triggerPricingSavedBriefly();
      return res;
    } catch (err) {
      setPricingSaveFailed(true);
      throw err;
    } finally {
      setIsSavingPricing(false);
    }
  };

  const saveExtrasStep = async (explicitCourseId?: string | null) => {
    setIsSavingExtras(true);
    try {
      let targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        throw new Error("Please enter a course title on the Basics tab first.");
      }

      // Sync manual includes if dirty
      if (isManualIncludesDirty) {
        // Delete removed items
        const deleted = serverIncludes.filter(
          (s) => !manualIncludesDraft.some((m) => m.id === s.id),
        );
        if (deleted.length > 0) {
          await Promise.all(
            deleted.map((d) =>
              deleteIncludeMutation.mutateAsync({
                courseId: targetCourseId!,
                includeId: d.id,
              }),
            ),
          );
        }

        // Update items with changed text
        const updated = manualIncludesDraft.filter((m) => {
          const existing = serverIncludes.find((s) => s.id === m.id);
          return existing && existing.text.trim() !== m.text.trim();
        });
        if (updated.length > 0) {
          await Promise.all(
            updated.map((u) =>
              updateIncludeMutation.mutateAsync({
                courseId: targetCourseId!,
                includeId: u.id,
                payload: { text: u.text.trim() },
              }),
            ),
          );
        }

        // Create new items (client-generated IDs)
        const newItems = manualIncludesDraft.filter(
          (m) => !serverIncludes.some((s) => s.id === m.id),
        );
        for (const n of newItems) {
          if (n.text.trim()) {
            await createIncludeMutation.mutateAsync({
              courseId: targetCourseId!,
              payload: { text: n.text.trim() },
            });
          }
        }

        // Refetch latest includes list from server
        const listRes = await coursesService.listIncludes(targetCourseId!);
        setServerIncludes(listRes.items);
        setManualIncludesDraft(listRes.items.map((inc) => ({ id: inc.id, text: inc.text })));
      }

      setExtrasSaveFailed(false);
      triggerExtrasSavedBriefly();
      return { success: true };
    } catch (err) {
      setExtrasSaveFailed(true);
      throw err;
    } finally {
      setIsSavingExtras(false);
    }
  };

  const savePublishStep = async (explicitCourseId?: string | null) => {
    setIsSavingPublish(true);
    setPublishSaveFailed(false);
    try {
      await reconcileDirtyState();
      triggerPublishSavedBriefly();
      return true;
    } catch (err) {
      setPublishSaveFailed(true);
      throw err;
    } finally {
      setIsSavingPublish(false);
    }
  };

  const saveCurrentStep = async () => {
    if (activeStep === "basics") {
      return await saveBasicsStep();
    } else if (activeStep === "curriculum") {
      return await saveCurriculumStep();
    } else if (activeStep === "access-rules") {
      return await saveAccessRulesStep();
    } else if (activeStep === "pricing") {
      return await savePricingStep();
    } else if (activeStep === "extras") {
      return await saveExtrasStep();
    } else if (activeStep === "publish") {
      return await savePublishStep();
    }
  };

  const navigateToStep = async (destination: CourseWizardStepId) => {
    cancelTitleCreationDebounce();
    if (
      actionLoading !== null ||
      saveActionInFlightRef.current ||
      isSavingAllDirtyLessonsRef.current
    ) {
      return;
    }
    if (destination === activeStep) {
      return;
    }

    const leavingStep = activeStep;

    if (leavingStep === "basics" && !currentCourseIdRef.current && !currentCourseId) {
      const flushed = await flushBasicsPersistence();
      if (!flushed) {
        setShowTitleTooltip(true);
        titleInputRef.current?.focus();
        setToastMessage("Add a course title to continue.");
        return;
      }
    }

    if (!currentCourseIdRef.current && !isDownstreamUnlocked && destination !== "basics") {
      setShowTitleTooltip(true);
      titleInputRef.current?.focus();
      setToastMessage("Add a course title to continue.");
      return;
    }

    if (saveActionInFlightRef.current) return;
    saveActionInFlightRef.current = true;

    const wasDirty = isStepDirty(leavingStep);

    // Prepare and activate the destination before persisting the previous
    // step. This keeps the tab and panel responsive while draft persistence
    // continues in the background.
    setMountedTabs((current) => {
      const next = getAdjacentWizardSteps(destination);
      next.add(leavingStep);
      const hasSameTabs = next.size === current.size && [...next].every((id) => current.has(id));
      return hasSameTabs ? current : next;
    });
    pendingWizardNavigationRef.current = destination;
    setActiveStep(destination);

    const persistPreviousStep = async () => {
      if (wasDirty) setActionLoading("save");

      try {
        if (leavingStep === "basics") {
          await flushBasicsPersistence();
        } else if (leavingStep === "access-rules") {
          await flushFixedDurationPersistence();
        } else if (leavingStep === "pricing") {
          await flushPricingPersistence();
        }

        if (!wasDirty) return;

        if (leavingStep === "curriculum") {
          await saveCurriculumStep();
        } else {
          await saveCurrentStep();
        }
      } catch (err: unknown) {
        const stepLabel = WIZARD_STEPS.find((s) => s.id === leavingStep)?.label || leavingStep;
        setToastMessage(`Failed to save ${stepLabel}. Your changes are kept locally.`);
      } finally {
        setActionLoading(null);
        saveActionInFlightRef.current = false;
      }
    };

    if (
      wasDirty ||
      leavingStep === "basics" ||
      leavingStep === "access-rules" ||
      leavingStep === "pricing"
    ) {
      await persistPreviousStep();
    } else {
      saveActionInFlightRef.current = false;
    }
  };

  navigateToStepRef.current = navigateToStep;

  const currentStepIndex = WIZARD_STEP_IDS.indexOf(activeStep);
  const previousStepId = currentStepIndex > 0 ? WIZARD_STEP_IDS[currentStepIndex - 1] : null;
  const nextStepId =
    currentStepIndex < WIZARD_STEP_IDS.length - 1 ? WIZARD_STEP_IDS[currentStepIndex + 1] : null;

  const reconcileDirtyState = async (explicitCourseId?: string | null) => {
    let targetCourseId = explicitCourseId || currentCourseId;

    if (inFlightBasicsPromiseRef.current) {
      await inFlightBasicsPromiseRef.current;
    }
    if (activeStep === "basics") {
      await flushBasicsPersistence();
    }

    // 1. If basics is dirty or course has not been created yet, save basics first
    if (!targetCourseId || isBasicsDirty) {
      const createdOrUpdated = await saveBasicsStep(targetCourseId);
      if (createdOrUpdated && typeof createdOrUpdated === "object" && "id" in createdOrUpdated) {
        targetCourseId = (createdOrUpdated as { id: string }).id;
      } else if (!targetCourseId) {
        targetCourseId = currentCourseId;
      }
    }

    if (!targetCourseId) {
      throw new Error("Cannot validate course without a valid course ID.");
    }

    // 2. Save only the other dirty / unpersisted server-backed pages
    const pendingSaves: Promise<unknown>[] = [];
    if (activeStep === "access-rules") {
      await flushFixedDurationPersistence();
    }
    if (activeStep === "pricing") {
      await flushPricingPersistence();
    }
    if (needsAccessRulesSave) {
      pendingSaves.push(saveAccessRulesStep(targetCourseId));
    }
    if (isPricingDirty) {
      pendingSaves.push(savePricingStep(targetCourseId));
    }
    if (isExtrasDirty) {
      pendingSaves.push(saveExtrasStep(targetCourseId));
    }

    if (pendingSaves.length > 0) {
      await Promise.all(pendingSaves);
    }

    return targetCourseId;
  };

  const handleValidateCourseAction = async () => {
    if (actionLoading || isValidating || saveActionInFlightRef.current) return;
    saveActionInFlightRef.current = true;
    setActionLoading("validate");
    try {
      await reconcileDirtyState();

      // Trigger server validation API
      const res = await refetchValidation();
      if (res.data?.canPublish) {
        setToastMessage("Course is valid and ready to publish!");
      } else {
        const errorCount = res.data?.errors?.length ?? 0;
        setToastMessage(
          errorCount > 0
            ? `Found ${errorCount} issue${errorCount > 1 ? "s" : ""} to fix before publishing.`
            : "Please fix incomplete sections before publishing.",
        );
      }
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message || "Failed to save changes or validate course.";
      setToastMessage(errorMsg);
    } finally {
      setActionLoading(null);
      saveActionInFlightRef.current = false;
    }
  };

  const handleFinalPublishCourse = async () => {
    if (actionLoading || isValidating || saveActionInFlightRef.current) return;
    saveActionInFlightRef.current = true;
    setActionLoading("publish");
    setPublishValidationError(null);

    try {
      // 1. Flush any uncommitted dirty server-backed form state
      const targetCourseId = await reconcileDirtyState();

      // 2. Re-validate to ensure server state is 100% compliant
      const validationRes = await refetchValidation();
      const validationData = validationRes.data;

      if (!validationData || !validationData.canPublish) {
        const errorMsg =
          validationData?.errors?.[0]?.message ||
          "Course failed validation checks. Please review highlighted steps.";
        setPublishValidationError(errorMsg);
        setToastMessage(errorMsg);
        return;
      }

      // 3. Trigger publish API mutation
      const publishedCourse = await publishCourseMutation.mutateAsync(targetCourseId);

      // 4. Synchronize server-returned state & version
      setIsPublished(publishedCourse.status === "published");
      setCourseVersion(publishedCourse.version);

      setToastMessage(
        isPublished
          ? "Course updated and published successfully!"
          : "Course published successfully!",
      );
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message ||
        "Failed to publish course. Please resolve issues and try again.";
      setPublishValidationError(errorMsg);
      setToastMessage(errorMsg);
    } finally {
      setActionLoading(null);
      saveActionInFlightRef.current = false;
    }
  };

  const handleConfirmUnpublishCourse = async () => {
    if (!currentCourseId || actionLoading || saveActionInFlightRef.current) return;
    saveActionInFlightRef.current = true;
    setActionLoading("unpublish");
    try {
      const draftCourse = await unpublishCourseMutation.mutateAsync(currentCourseId);
      setIsPublished(draftCourse.status === "published");
      setCourseVersion(draftCourse.version);
      setToastMessage("Course unpublished and returned to draft.");
      setIsUnpublishModalOpen(false);
    } catch (err: unknown) {
      const errorMsg = (err as { message?: string })?.message || "Failed to unpublish course.";
      setToastMessage(errorMsg);
    } finally {
      setActionLoading(null);
      saveActionInFlightRef.current = false;
    }
  };

  if (isEditorError && !editorData && isEditing) {
    return (
      <div className="relative box-border flex min-h-[calc(100dvh-130px)] w-full flex-1 flex-col p-0 text-[--text] max-[768px]:pb-0">
        <header className="relative mb-4 shrink-0 max-[768px]:mb-2 max-[768px]:box-border max-[768px]:w-full max-[768px]:max-w-full max-[768px]:min-w-0">
          <div className="mb-3 flex items-start justify-between gap-4 max-[768px]:mb-2 max-[768px]:flex-col max-[768px]:gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] text-(--text-secondary) transition-[border-color,background-color,color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
                onClick={handleBack}
                aria-label="Go back to courses"
              >
                <ArrowLeft size={17} weight="bold" />
              </button>
              <div className="min-w-0 pt-0.5">
                <h1 className="m-0 text-[clamp(1.2rem,1.8vw,1.55rem)] leading-[1.2] font-bold tracking-[-0.015em] text-(--text)">
                  Edit Course
                </h1>
                <p className="m-0 mt-1 max-w-155 text-[0.84rem] leading-[1.4] text-(--muted)">
                  Unable to load course data.
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="relative my-auto flex min-h-[calc(100dvh-230px)] w-full flex-1 flex-col items-center justify-center rounded-[14px] border border-red-500/20 bg-(--surface) p-8 text-center shadow-(--card-shadow)">
          <div className="relative mb-5 flex h-18 w-18 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <WarningCircle size={38} weight="bold" />
          </div>
          <h2 className="m-0 text-[1.28rem] font-bold tracking-[-0.015em] text-(--text)">
            Unable to load course details
          </h2>
          <p className="m-0 mt-2 max-w-md text-[0.88rem] leading-relaxed text-(--muted)">
            {editorError?.message ||
              "There was an error communicating with the server to fetch this course."}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 text-[0.82rem] font-semibold text-(--text) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text)"
              onClick={handleBack}
            >
              Back to Courses
            </button>
            <button
              type="button"
              className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border-none bg-(--accent) px-4 text-[0.82rem] font-semibold text-(--on-accent,#ffffff) shadow-[0_2px_8px_var(--accent-shadow,rgba(0,0,0,0.2))] transition-all hover:bg-(--accent-hover,var(--accent)) hover:brightness-110 active:scale-[0.98]"
              onClick={() => void refetchEditor()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative box-border flex min-h-full w-full flex-1 flex-col p-0 text-[--text]"
      data-course-wizard
    >
      <CourseStaticPageRefreshNotice courseId={currentCourseId} />
      {/* Wizard Header */}
      <header className="relative mb-2 shrink-0 max-[768px]:mb-1.5 max-[768px]:box-border max-[768px]:w-full max-[768px]:max-w-full max-[768px]:min-w-0">
        <div className="mb-1 flex items-start justify-between gap-4 max-[768px]:mb-1.5 max-[768px]:flex-col max-[768px]:gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] text-(--text-secondary) transition-[border-color,background-color,color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
              onClick={handleBack}
              aria-label="Go back to courses"
            >
              <ArrowLeft size={17} weight="bold" />
            </button>
            <div className="min-w-0 pt-0.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="m-0 text-[clamp(1.2rem,1.8vw,1.55rem)] leading-[1.2] font-bold tracking-[-0.015em] text-(--text)">
                  {isEditing ? "Edit Course" : "Create New Course"}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.72rem] font-medium tracking-[0.02em] ${
                    isPublished
                      ? "is-published border border-green-500/35 bg-green-500/12 text-green-400"
                      : "border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-(--muted)"
                  }`}
                >
                  {isPublished ? "Published" : "Draft"}
                </span>
              </div>
              <p className="m-0 mt-0.5 max-w-155 text-[0.82rem] leading-[1.35] text-(--muted)">
                {activeStep === "curriculum"
                  ? isEditing
                    ? "Manage and organize your course sections, lessons, and resources."
                    : "Build your course structure by adding sections and lessons."
                  : activeStep === "access-rules"
                    ? isEditing
                      ? "Update who can access this course and how long their access lasts."
                      : "Control who can access this course and how long their access lasts."
                    : activeStep === "pricing"
                      ? isEditing
                        ? "Update pricing, currency, and sale discounts for this course."
                        : "Set how learners will purchase this course."
                      : activeStep === "extras"
                        ? isEditing
                          ? "Update extra course settings, inclusions, and completion certificate."
                          : "Add extra information and settings to enhance your course."
                        : activeStep === "publish"
                          ? isPublished
                            ? "Review your changes and update the published course."
                            : isEditing
                              ? "Review your course checklist and publish when ready."
                              : "Review your course and publish it when you're ready."
                          : isEditing
                            ? "Update the essential details of your course."
                            : "Add the essential details of your course. You can always edit these later."}
              </p>
            </div>
          </div>
        </div>

        {/* Publish validation error toast if any */}
        {publishValidationError && activeStep === "publish" && (
          <div className="mb-3 flex animate-[bannerSlideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] items-center gap-2.5 rounded-[10px] border border-red-400/35 bg-red-500/12 px-4 py-2 text-[0.84rem] font-semibold text-red-400 shadow-[0_4px_16px_rgba(239,68,68,0.15)] backdrop-blur-md">
            <Info size={16} weight="bold" />
            <span>{publishValidationError}</span>
          </div>
        )}
      </header>

      {/* Wizard Steps Navigation */}
      <nav
        ref={stepsNavRef}
        className="course-wizard-steps-nav settings-tabs page-tabs border-b border-[color-mix(in_srgb,var(--text)_12%,transparent)] [&::after]:hidden!"
        aria-label={isEditing ? "Course editing steps" : "Course creation steps"}
        role="tablist"
        onMouseDown={handleNavMouseDown}
        onMouseLeave={handleNavMouseLeave}
        onMouseUp={handleNavMouseUp}
        onMouseMove={handleNavMouseMove}
      >
        {/* Standard page-tabs indicator - driven by --page-tab-indicator-* CSS vars */}
        <span className="page-tabs__indicator" aria-hidden="true" />
        {WIZARD_STEPS.map((step, idx) => {
          const Icon = step.Icon;
          const isActive = activeStep === step.id;
          const isDirty = isStepDirty(step.id);
          return (
            <button
              key={step.id}
              id={`course-wizard-tab-${step.id}`}
              ref={(el) => {
                tabRefs.current[step.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="course-wizard-tab-panel"
              aria-keyshortcuts={`Alt+${idx + 1}`}
              tabIndex={isActive ? 0 : -1}
              data-page-tab-tone={step.tone}
              data-swipe-tab-id={step.id}
              title={
                !isDownstreamUnlocked && step.id !== "basics"
                  ? "Add a course title to continue."
                  : undefined
              }
              disabled={actionLoading !== null || (!isDownstreamUnlocked && step.id !== "basics")}
              className={`inline-flex shrink-0 flex-row items-center gap-2 !border-b-transparent whitespace-nowrap disabled:!cursor-not-allowed disabled:!opacity-50 ${isActive ? "is-active" : ""}`}
              onClick={() => {
                if (isInitialLoadingCourse) return;
                void navigateToStep(step.id);
              }}
              onKeyDown={handleRovingTabKeyDown}
            >
              <Icon size={17} weight={isActive ? "fill" : "regular"} className="shrink-0" />
              <span className="inline-flex items-center gap-1.5">
                <span>{step.label}</span>
                {isDirty && (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent)"
                    title="Unsaved changes"
                    aria-label="Unsaved changes"
                  />
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Wizard Step Panels using SwipeableTabPanel */}
      {isInitialLoadingCourse ? (
        <CourseWizardSkeleton activeStep={activeStep} />
      ) : (
        <Suspense
          fallback={
            <CenteredLoadingSpinner
              label="Loading course details"
              className="min-h-80 w-full flex-1"
            />
          }
        >
          <SwipeableTabPanel
            tabs={WIZARD_STEP_IDS}
            activeTab={activeStep}
            onTabChange={(newStep) => {
              void navigateToStep(newStep);
            }}
            tabListRef={stepsNavRef}
            id="course-wizard-tab-panel"
            className="course-wizard-tab-content relative flex min-h-0 flex-1 flex-col pt-4 pb-6 max-[640px]:pt-3"
            stateAttribute="data-wizard-step"
            labelledBy={`course-wizard-tab-${activeStep}`}
            disabled={actionLoading !== null || (!isDownstreamUnlocked && activeStep === "basics")}
            spaceBetween={32}
          >
            {(panelStep) =>
              !mountedTabs.has(panelStep) ? null : panelStep === "basics" ? (
                <div className="relative z-10 grid w-full min-w-0 grid-cols-1 items-start gap-6 max-[768px]:gap-4.5 md:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
                  {/* Left Column: Form Sections */}
                  <div className="flex flex-col gap-5">
                    {/* Basic Information Section */}
                    <section className="relative z-10 rounded-[14px] bg-(--surface) p-6 shadow-(--card-shadow) max-[768px]:p-4">
                      <div className="mb-4.5 flex items-center justify-between">
                        <div>
                          <h2 className="m-0 text-[1.18rem] font-[650] tracking-[-0.015em] text-(--text)">
                            Basic Information
                          </h2>
                          <p className="m-0 mt-1 mb-0 text-[0.82rem] text-(--muted)">
                            {isEditing
                              ? "Update the essential details of your course."
                              : "Add the essential details of your course."}
                          </p>
                        </div>
                      </div>

                      <div className="relative mb-5 flex flex-col gap-2">
                        {showTitleTooltip &&
                          !isDownstreamUnlocked &&
                          !isInitialCourseCreationPending && (
                            <div
                              role="tooltip"
                              id="course-title-tooltip"
                              data-testid="basics-title-tooltip"
                              onClick={() => titleInputRef.current?.focus()}
                              className="group absolute -top-9 left-0 z-30 flex cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-(--surface-strong) px-3 py-1.5 text-[0.78rem] font-medium text-(--text) shadow-[0_6px_20px_color-mix(in_srgb,var(--accent-shadow)_22%,transparent)] transition-all select-none"
                            >
                              <Info size={15} weight="fill" className="shrink-0 text-(--accent)" />
                              <span>Continue course creation by entering a course title</span>
                              <button
                                type="button"
                                aria-label="Dismiss tooltip"
                                className="ml-1 inline-flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-0.5 text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowTitleTooltip(false);
                                }}
                              >
                                <X size={13} />
                              </button>
                              <div
                                className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 border-r border-b border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-(--surface-strong)"
                                aria-hidden="true"
                              />
                            </div>
                          )}
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="course-title"
                            className="text-[0.84rem] font-semibold text-(--text-secondary)"
                          >
                            Course Title <span className="ml-0.5 text-[#ff5252]">*</span>
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
                              if (!currentCourseIdRef.current && !currentCourseId && !isEditing) {
                                cancelTitleCreationDebounce();
                                if (val.trim()) {
                                  titleCreationDebounceTimerRef.current = setTimeout(() => {
                                    titleCreationDebounceTimerRef.current = null;
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
                                if (!currentCourseIdRef.current && !currentCourseId && !isEditing) {
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
                            className="h-11 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] py-0 pr-[75px] pl-3.5 text-[0.88rem] text-(--text) transition-[border-color] duration-150 outline-none focus:border-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <span className="pointer-events-none absolute right-3.5 text-[0.76rem] text-(--muted)">
                            {courseTitle.length} / 120
                          </span>
                        </div>
                        {!isDownstreamUnlocked && (
                          <p
                            className="m-0 mt-0.5 flex items-center gap-1.5 text-[0.78rem] text-(--muted)"
                            role="status"
                            data-testid="basics-title-helper"
                          >
                            {createCourseMutation.isPending || isInitialCourseCreationPending ? (
                              <>
                                <CircleNotch
                                  size={13}
                                  className="shrink-0 animate-spin text-(--accent)"
                                />
                                <span>Creating course…</span>
                              </>
                            ) : (
                              "Add a course title to continue."
                            )}
                          </p>
                        )}
                      </div>
                      <div className="mb-5 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="course-short-description"
                            className="text-[0.84rem] font-semibold text-(--text-secondary)"
                          >
                            Short Description
                          </label>
                          <BasicsFieldStatusIndicator
                            status={getBasicsFieldDisplayStatus("shortDescription")}
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
                            className="max-h-[140px] min-h-[68px] w-full resize-y rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] py-2.5 pr-[75px] pl-3.5 font-[inherit] text-[0.88rem] text-(--text) transition-[border-color] duration-150 outline-none focus:border-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <span className="pointer-events-none absolute right-3.5 bottom-2.5 text-[0.76rem] text-(--muted)">
                            {shortDescription.length} / 150
                          </span>
                        </div>
                      </div>

                      <div
                        className="mb-5 flex flex-col gap-2"
                        onBlur={() => {
                          void persistBasicsField("courseDescription");
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="course-description"
                            className="text-[0.84rem] font-semibold text-(--text-secondary)"
                          >
                            Course Description <span className="ml-0.5 text-[#ff5252]">*</span>
                          </label>
                          <BasicsFieldStatusIndicator
                            status={getBasicsFieldDisplayStatus("courseDescription")}
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
                      <div className="mb-4.5 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="instructor-alias"
                            className="text-[0.84rem] font-semibold text-(--text-secondary)"
                          >
                            Instructor Alias
                          </label>
                          <BasicsFieldStatusIndicator
                            status={getBasicsFieldDisplayStatus("instructorAlias")}
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
                          className="h-11 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5 py-0 text-[0.88rem] text-(--text) transition-[border-color] duration-150 outline-none focus:border-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <p className="m-0 text-[0.78rem] text-(--muted)">
                          Optional custom name shown to students instead of your account name.
                        </p>
                      </div>

                      {/* Show Instructor Name Settings Row */}
                      <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4.5 py-3.5">
                        <div className="flex min-w-0 flex-col pr-3">
                          <div className="flex items-center gap-2">
                            <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
                              Show Instructor Name
                            </strong>
                            <BasicsFieldStatusIndicator
                              status={getBasicsFieldDisplayStatus("showInstructorName")}
                              testId="basics-field-status-showInstructorName"
                            />
                          </div>
                          <p className="m-0 text-[0.8rem] text-(--muted)">
                            Control whether the instructor name is shown to students.
                          </p>
                        </div>
                        <SettingsToggle
                          checked={showInstructorName}
                          disabled={
                            !isDownstreamUnlocked || isBasicsControlSaving("showInstructorName")
                          }
                          onChange={() => void handleShowInstructorNameChange(!showInstructorName)}
                          label="Toggle Show Instructor Name"
                        />
                      </div>
                    </section>

                    {/* Course Media Section */}
                    <section className="relative z-10 rounded-[14px] bg-(--surface) p-6 shadow-(--card-shadow) max-[768px]:p-4">
                      <div className="mb-4.5">
                        <h2 className="m-0 text-[1.18rem] font-[650] tracking-[-0.015em] text-(--text)">
                          Course Media
                        </h2>
                        <p className="m-0 mt-1 mb-5 text-[0.82rem] text-(--muted)">
                          Add media that best represents your course.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Hidden Thumbnail File Input */}
                        <input
                          type="file"
                          ref={thumbnailInputRef}
                          disabled={!isDownstreamUnlocked || isBasicsSaving || isThumbnailBusy}
                          onChange={(event) => {
                            void handleThumbnailFileSelect(event);
                          }}
                          accept="image/*"
                          style={{ display: "none" }}
                        />

                        {/* Hidden Video Trailer File Input */}
                        <input
                          type="file"
                          ref={videoTrailerInputRef}
                          disabled={!isDownstreamUnlocked || isBasicsSaving}
                          onChange={handleVideoTrailerFileSelect}
                          accept="video/*"
                          style={{ display: "none" }}
                        />

                        {/* Thumbnail Upload */}
                        <div className="flex min-w-0 flex-col">
                          <h3 className="m-0 mb-1 text-[0.86rem] font-semibold text-(--text-secondary)">
                            Thumbnail <span className="ml-0.5 text-[#ff5252]">*</span>
                          </h3>
                          <p className="m-0 mb-3 min-h-[1.15rem] text-[0.78rem] text-(--muted)">
                            Upload a thumbnail for your course.
                          </p>
                          {thumbnail ? (
                            <div className="group relative box-border flex aspect-video min-h-43.75 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-solid border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] p-0 text-center">
                              <img
                                src={thumbnail}
                                alt="Course thumbnail preview"
                                className="block h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 p-3 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
                                <button
                                  type="button"
                                  disabled={
                                    !isDownstreamUnlocked || isBasicsSaving || isThumbnailBusy
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
                                  className="inline-flex cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={triggerThumbnailUpload}
                                >
                                  <ImageIcon size={15} /> Change Image
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !isDownstreamUnlocked || isBasicsSaving || isThumbnailBusy
                                  }
                                  style={{
                                    fontSize: "0.80rem",
                                    fontWeight: 500,
                                    height: "34px",
                                    borderRadius: "8px",
                                    gap: "6px",
                                    paddingLeft: "14px",
                                    paddingRight: "14px",
                                  }}
                                  className="inline-flex cursor-pointer items-center border-none bg-red-500 text-white transition-all duration-150 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={handleRemoveThumbnail}
                                  title="Remove Thumbnail"
                                >
                                  <Trash size={15} /> Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="relative box-border flex aspect-video min-h-43.75 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] p-4 text-center transition-[border-color,background-color] duration-180 ease-out">
                              <div className="mb-2 text-(--muted)">
                                <ImageIcon size={30} weight="light" />
                              </div>
                              <div className="flex flex-wrap items-center justify-center gap-2.5">
                                <button
                                  type="button"
                                  disabled={
                                    !isDownstreamUnlocked || isBasicsSaving || isThumbnailBusy
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
                                  className="inline-flex cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={triggerThumbnailUpload}
                                >
                                  <UploadSimple size={15} /> Upload
                                </button>
                              </div>
                              <p className="m-0 mt-2 text-[0.74rem] text-(--muted)">
                                Recommended: 1280x720px (16:9)
                              </p>
                            </div>
                          )}
                          {thumbnailUploadError ? (
                            <p className="m-0 mt-2 text-[0.75rem] text-red-400" role="alert">
                              {thumbnailUploadError}
                            </p>
                          ) : null}
                        </div>

                        {/* Video Trailer Upload */}
                        <div className="flex min-w-0 flex-col">
                          <h3 className="m-0 mb-1 text-[0.86rem] font-semibold text-(--text-secondary)">
                            Video Trailer (Optional)
                          </h3>
                          <p className="m-0 mb-3 min-h-[1.15rem] text-[0.78rem] text-(--muted)">
                            Add a trailer video to your course.
                          </p>
                          {videoTrailer ? (
                            <div className="group relative box-border flex aspect-video min-h-43.75 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-solid border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] p-0 text-center">
                              <video
                                src={videoTrailer}
                                className="block h-full w-full object-cover"
                                controls
                              />
                              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 p-3 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
                                <button
                                  type="button"
                                  disabled={!isDownstreamUnlocked || isBasicsSaving}
                                  style={{
                                    fontSize: "0.80rem",
                                    fontWeight: 700,
                                    height: "34px",
                                    borderRadius: "8px",
                                    gap: "6px",
                                    paddingLeft: "16px",
                                    paddingRight: "16px",
                                  }}
                                  className="inline-flex cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={triggerVideoTrailerUpload}
                                >
                                  <PlayCircle size={15} /> Change Video
                                </button>
                                <button
                                  type="button"
                                  disabled={!isDownstreamUnlocked || isBasicsSaving}
                                  style={{
                                    fontSize: "0.80rem",
                                    fontWeight: 500,
                                    height: "34px",
                                    borderRadius: "8px",
                                    gap: "6px",
                                    paddingLeft: "14px",
                                    paddingRight: "14px",
                                  }}
                                  className="inline-flex cursor-pointer items-center border-none bg-red-500 text-white transition-all duration-150 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={handleRemoveVideoTrailer}
                                  title="Remove Video Trailer"
                                >
                                  <Trash size={15} /> Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="relative box-border flex aspect-video min-h-43.75 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] p-4 text-center transition-[border-color,background-color] duration-180 ease-out">
                              <div className="mb-2 text-(--muted)">
                                <PlayCircle size={30} weight="light" />
                              </div>
                              <div className="flex flex-wrap items-center justify-center gap-2.5">
                                <LessonVideoUpload
                                  disabled={!isDownstreamUnlocked || isBasicsSaving}
                                  mediaAssetId={editorData?.course?.trailerMediaId}
                                  visibility="public"
                                  hideUploadWhenAttached={Boolean(
                                    editorData?.course?.trailerMediaId,
                                  )}
                                  attachedActionLabel="Replace trailer"
                                  stackStatusBelow
                                  onMediaAttached={handleTrailerMediaAttached}
                                  onProcessingComplete={() => {
                                    void refetchEditor();
                                  }}
                                />
                              </div>
                              <p className="m-0 mt-2 text-[0.74rem] text-(--muted)">
                                Recommended: 16:9 video
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Right Column: Live Course Preview */}
                  <div className="flex min-w-0 flex-col gap-5 md:sticky md:top-0 md:self-start">
                    <section className="rounded-[14px] bg-(--surface) p-5 shadow-(--card-shadow)">
                      <h2 className="m-0 text-[1.1rem] font-[650] text-(--text)">Course Preview</h2>
                      <p className="m-0 mt-1 mb-4 text-[0.8rem] text-(--muted)">
                        This is how your course will appear to students.
                      </p>

                      <div
                        className={`relative aspect-video overflow-hidden rounded-[10px] border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] transition-[border-color,background-color] duration-180 ease-out ${
                          !thumbnail
                            ? "is-clickable cursor-pointer hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]"
                            : ""
                        }`}
                        onClick={!thumbnail ? triggerThumbnailUpload : undefined}
                        title={!thumbnail ? "Click to upload thumbnail" : undefined}
                        role={!thumbnail ? "button" : undefined}
                        tabIndex={!thumbnail ? 0 : undefined}
                        onKeyDown={
                          !thumbnail
                            ? (e) => {
                                if (e.key === "Enter" || e.key === "") {
                                  triggerThumbnailUpload();
                                }
                              }
                            : undefined
                        }
                      >
                        {thumbnail ? (
                          <div className="relative h-full w-full">
                            <img
                              src={thumbnail}
                              alt="Course Thumbnail"
                              className="block h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-[0.8rem] text-(--muted)">
                            <div className="flex items-center justify-center text-(--muted) opacity-60">
                              <ImageIcon size={32} weight="light" />
                            </div>
                            <span className="text-(--muted) opacity-70">
                              Course thumbnail will appear here
                            </span>
                            <span className="mt-0.5 inline-block rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[0.72rem] font-semibold text-(--accent) transition-colors duration-150">
                              Click to upload
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4">
                        <h3 className="m-0 mb-3 text-[1.15rem] leading-[1.3] font-bold text-(--text)">
                          {courseTitle.trim() ? courseTitle : "Course Title"}
                        </h3>

                        <div className="flex items-center gap-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-3.5 text-[0.8rem] text-(--muted)">
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

                        <div className="mt-3.5 max-w-full min-w-0 overflow-hidden wrap-anywhere wrap-break-word">
                          <h4 className="m-0 mb-1.5 text-[0.84rem] font-[650] text-(--text-secondary)">
                            About this course
                          </h4>
                          {courseDescription.trim() ? (
                            <DiscussionMarkdown
                              content={createDiscussionDraft(courseDescription.trim())}
                              label="Course description preview"
                              className="max-w-none [&>:first-child]:mt-0"
                            />
                          ) : (
                            <p className="m-0 text-[0.82rem] leading-normal wrap-anywhere wrap-break-word text-(--muted)">
                              This is a short description of your course. It will appear here on the
                              course card.
                            </p>
                          )}
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              ) : panelStep === "curriculum" ? (
                editingLessonTarget &&
                sections.some(
                  (s) =>
                    s.id === editingLessonTarget.sectionId &&
                    s.lessons.some((l) => l.id === editingLessonTarget.lessonId),
                ) ? (
                  (() => {
                    const activeSection = sections.find(
                      (s) => s.id === editingLessonTarget.sectionId,
                    )!;
                    const activeLesson = activeSection.lessons.find(
                      (l) => l.id === editingLessonTarget.lessonId,
                    )!;
                    const secIdx = sections.findIndex((s) => s.id === activeSection.id);
                    const lesIdx = activeSection.lessons.findIndex((l) => l.id === activeLesson.id);

                    return (
                      <div className="course-wizard-curriculum-panel flex min-h-0 w-full flex-1 flex-col gap-4">
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
                            (activeLesson.contentType as StudioLessonContentType) || "video"
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
                          onBack={() => setEditingLessonTarget(null)}
                          onCancel={(draft) =>
                            handleCancelLessonDraft(activeSection.id, activeLesson.id, draft)
                          }
                          onSave={async (payload) => {
                            handleUpdateLesson(activeSection.id, activeLesson.id, {
                              title: payload.title,
                              contentType: payload.contentType,
                              isPublished: payload.isPublished,
                              isPreview: payload.isPreview,
                            });
                            const saved = await persistLesson(activeSection.id, activeLesson.id, {
                              collapseOnSuccess: false,
                            });
                            if (saved) {
                              setToastMessage("Lesson changes saved successfully.");
                              setEditingLessonTarget(null);
                            }
                          }}
                          onContentTypeChange={(contentType) => {
                            handleUpdateLesson(activeSection.id, activeLesson.id, {
                              contentType,
                            });
                          }}
                          onDeleteLesson={() => {
                            handleDeleteLesson(activeSection.id, activeLesson.id);
                            setEditingLessonTarget(null);
                          }}
                          onPreviewLesson={() => {
                            if (currentCourseId) {
                              window.open(`/courses/${currentCourseId}`, "_blank");
                            }
                          }}
                          onMediaAttached={(mediaAssetId) =>
                            handleLessonMediaAttached(
                              activeSection.id,
                              activeLesson.id,
                              mediaAssetId,
                            )
                          }
                          onProcessingComplete={() => handleLessonProcessingComplete()}
                          onUploadMedia={async (file) => {
                            try {
                              const presigned = await mediaService.presignMediaUpload({
                                filename: file.name,
                                contentType: file.type || "application/octet-stream",
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
                              await mediaService.confirmUpload(presigned.mediaAssetId);
                              const attached = await handleLessonMediaAttached(
                                activeSection.id,
                                activeLesson.id,
                                presigned.mediaAssetId,
                              );
                              // A failed attach has already shown its own error.
                              if (!attached) return;
                              setToastMessage("Media uploaded and attached successfully.");
                            } catch (err: unknown) {
                              setToastMessage(
                                err instanceof Error ? err.message : "Media upload failed.",
                              );
                            }
                          }}
                          onAddResourceFile={async (file) => {
                            try {
                              const presigned = await mediaService.presignMediaUpload({
                                filename: file.name,
                                contentType: file.type || "application/octet-stream",
                                fileSize: file.size,
                                type: "document",
                                visibility: "protected",
                              });
                              await mediaService.uploadFileToPresignedUrl(
                                presigned.uploadUrl,
                                file,
                              );
                              await mediaService.confirmUpload(presigned.mediaAssetId);
                              const created = await handleCreateLessonResource(activeLesson.id, {
                                title: file.name,
                                mediaAssetId: presigned.mediaAssetId,
                              });
                              handleLessonResourceAdded(activeSection.id, activeLesson.id, {
                                id: created.id,
                                name: created.title,
                                type: "document",
                                size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
                                mediaAssetId: created.mediaAssetId,
                              });
                              setToastMessage("Resource attached successfully.");
                            } catch (err: unknown) {
                              setToastMessage(
                                err instanceof Error ? err.message : "Resource upload failed.",
                              );
                            }
                          }}
                          onDeleteResource={async (resId) => {
                            try {
                              await handleDeleteLessonResource(resId);
                              const resItem = activeLesson.resources.find((r) => r.id === resId);
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
                                err instanceof Error ? err.message : "Could not remove resource.",
                              );
                            }
                          }}
                          descriptionSection={
                            <div className="flex flex-col gap-2">
                              <LessonDescriptionEditor
                                id={`lesson-description-${activeLesson.id}`}
                                disabled={
                                  activeLesson.isPendingCreation ||
                                  savingLessonId === activeLesson.id
                                }
                                value={activeLesson.description}
                                onChange={(val) =>
                                  handleUpdateLesson(activeSection.id, activeLesson.id, {
                                    description: val,
                                  })
                                }
                                placeholder="Add a detailed description of what students will learn in this lesson..."
                                maxLength={10000}
                              />
                            </div>
                          }
                          quizSection={
                            currentCourseId &&
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
                                Save the course and lesson before configuring an attached Quiz.
                              </div>
                            )
                          }
                        />
                      </div>
                    );
                  })()
                ) : (
                  <div className="course-wizard-curriculum-panel flex min-h-0 w-full flex-1 flex-col gap-4">
                    {/* Header row */}
                    <div className="mb-2 flex items-center justify-between max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3">
                      <div className="">
                        <h2 className="m-0 text-[1.25rem] font-bold tracking-[-0.015em] text-(--text)">
                          Course Curriculum
                        </h2>
                        <p className="m-0 mt-1 text-[0.85rem] text-(--muted)">
                          Organize your course into sections and lessons. You can reorder them
                          anytime.
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {(isReorderingSections || reorderSectionsMutation.isPending) && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2.5 py-1 text-[0.74rem] font-bold text-(--accent)">
                            <CircleNotch size={13} className="animate-spin text-(--accent)" />
                            <span>Saving section order...</span>
                          </span>
                        )}
                        <button
                          type="button"
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
                          className="inline-flex cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:cursor-not-allowed disabled:opacity-60 max-[768px]:self-start max-[768px]:whitespace-nowrap"
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
                      <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center p-8 text-center">
                        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                          <BookOpen size={24} weight="bold" />
                        </div>
                        <h3 className="m-0 text-[1.05rem] font-bold text-(--text)">
                          No sections added yet
                        </h3>
                        <p className="m-0 mt-1.5 max-w-[320px] text-[0.84rem] text-(--muted)">
                          Add your first section to start building your course curriculum.
                        </p>
                        <button
                          type="button"
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
                          className="inline-flex cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:cursor-not-allowed disabled:opacity-60"
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
                          className={`overflow-hidden rounded-[14px] border bg-(--surface) shadow-(--card-shadow) transition-[border-color,box-shadow,opacity] duration-150 ${
                            deletingSectionId === sec.id
                              ? "pointer-events-none border-red-500/30 opacity-45"
                              : draggedSectionIndex === secIndex
                                ? "border-dashed border-(--accent) opacity-35"
                                : "border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                          }`}
                          draggable={
                            dragEnabledSectionId === sec.id &&
                            !sec.isPendingCreation &&
                            !updatingSectionId &&
                            !deletingSectionId &&
                            !isReorderingSections &&
                            !reorderSectionsMutation.isPending
                          }
                          onDragStart={(e) => handleSectionDragStart(e, secIndex, sec)}
                          onDragOver={(e) => handleSectionDragOver(e, secIndex)}
                          onDragEnd={handleSectionDragEnd}
                        >
                          {/* Section Header */}
                          <div
                            ref={(element) => {
                              if (element) {
                                sectionHeaderElementsRef.current.set(sec.id, element);
                              } else {
                                sectionHeaderElementsRef.current.delete(sec.id);
                              }
                            }}
                            className="flex cursor-pointer items-center justify-between bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-[18px] py-3.5 select-none max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[12px_14px]"
                            onClick={() => handleToggleSectionExpand(sec.id)}
                            title="Click to toggle section"
                          >
                            <div className="flex items-center gap-3 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:flex-1 max-[768px]:gap-2">
                              <span
                                className={`flex items-center justify-center text-(--muted) transition-opacity duration-150 ${
                                  sec.isPendingCreation ||
                                  isReorderingSections ||
                                  reorderSectionsMutation.isPending
                                    ? "pointer-events-none cursor-not-allowed opacity-25"
                                    : "cursor-grab opacity-60 hover:opacity-100"
                                }`}
                                title={
                                  sec.isPendingCreation
                                    ? "Creating section..."
                                    : isReorderingSections || reorderSectionsMutation.isPending
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
                                  if (draggedSectionIndex === null) setDragEnabledSectionId(null);
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
                                  if (draggedSectionIndex === null) setDragEnabledSectionId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <DotsSixVertical size={18} />
                              </span>
                              <div className="flex items-center gap-2.5 max-[768px]:min-w-0 max-[768px]:flex-1 max-[768px]:flex-wrap max-[768px]:gap-1.5">
                                <span className="text-[0.92rem] font-bold text-(--text) max-[768px]:shrink-0 max-[768px]:whitespace-nowrap">
                                  Section {secIndex + 1}
                                </span>
                                {sec.isEditingTitle ? (
                                  <div
                                    className="flex items-center gap-2 max-[768px]:w-full"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="text"
                                      className="rounded-md border border-(--accent) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-2 py-0.75 text-[0.9rem] font-semibold text-(--text) outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                      defaultValue={sec.title}
                                      autoFocus
                                      disabled={
                                        sec.isPendingCreation || updatingSectionId === sec.id
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      onBlur={(e) => handleSaveSectionTitle(sec.id, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <span
                                    className={`text-[0.92rem] font-semibold text-(--text) max-[768px]:min-w-0 max-[768px]:break-words ${
                                      sec.isPendingCreation ||
                                      updatingSectionId === sec.id ||
                                      deletingSectionId === sec.id
                                        ? "pointer-events-none opacity-60"
                                        : ""
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (
                                        sec.isPendingCreation ||
                                        updatingSectionId === sec.id ||
                                        deletingSectionId === sec.id
                                      )
                                        return;
                                      handleStartEditSectionTitle(sec.id);
                                    }}
                                    title={
                                      sec.isPendingCreation
                                        ? "Creating section..."
                                        : "Click to edit section title"
                                    }
                                  >
                                    {sec.title}
                                  </span>
                                )}
                                <span className="ml-1 text-[0.76rem] font-normal text-(--muted)">
                                  {sec.lessons.length}{" "}
                                  {sec.lessons.length === 1 ? "Lesson" : "Lessons"}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 max-[768px]:w-full max-[768px]:justify-between max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[768px]:pt-2">
                              {sec.isPendingCreation ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[0.74rem] font-bold text-(--accent)">
                                  <CircleNotch size={12} className="animate-spin text-(--accent)" />
                                  <span>Creating...</span>
                                </span>
                              ) : deletingSectionId === sec.id ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-red-500/28 bg-red-500/10 px-2 py-0.5 text-[0.74rem] font-bold text-red-400">
                                  <CircleNotch size={12} className="animate-spin text-red-400" />
                                  <span>Deleting...</span>
                                </span>
                              ) : reorderingLessonsSectionId === sec.id ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[0.74rem] font-bold text-(--accent)">
                                  <CircleNotch size={12} className="animate-spin text-(--accent)" />
                                  <span>Saving order...</span>
                                </span>
                              ) : (
                                <CurriculumItemStatusIndicator
                                  status={getCurriculumItemDisplayStatus(sec.id)}
                                  testId={`curriculum-status-section-${sec.id}`}
                                />
                              )}
                              <button
                                type="button"
                                disabled={
                                  sec.isPendingCreation ||
                                  updatingSectionId === sec.id ||
                                  deletingSectionId === sec.id
                                }
                                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] bg-transparent p-0 text-(--muted) transition-[color,background-color,border-color] duration-150 hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:text-(--text) disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Edit section title"
                                title="Edit section title"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEditSectionTitle(sec.id);
                                }}
                              >
                                {updatingSectionId === sec.id ? (
                                  <CircleNotch size={14} className="animate-spin text-(--accent)" />
                                ) : (
                                  <PencilSimple size={15} />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  sec.isPendingCreation ||
                                  deletingSectionId === sec.id ||
                                  updatingSectionId === sec.id
                                }
                                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] bg-transparent p-0 text-(--muted) transition-all duration-150 hover:!border-red-500/30 hover:!bg-red-500/10 hover:!text-[#ef4444] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Delete section"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSection(sec.id);
                                }}
                              >
                                {deletingSectionId === sec.id ? (
                                  <CircleNotch size={14} className="animate-spin text-red-400" />
                                ) : (
                                  <Trash size={15} />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={deletingSectionId === sec.id}
                                className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] bg-transparent p-0 text-(--muted) transition-all duration-150 hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:text-(--text) disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:transition-transform [&>svg]:duration-200 ${
                                  sec.isExpanded ? "is-expanded [&>svg]:rotate-180" : ""
                                }`}
                                aria-label={sec.isExpanded ? "Collapse section" : "Expand section"}
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
                              sec.isExpanded ? "is-open grid-rows-[1fr]" : "grid-rows-[0fr]"
                            }`}
                          >
                            <div
                              className={`min-h-0 overflow-hidden border-t border-transparent transition-[padding,border-color] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                sec.isExpanded
                                  ? "border-t-[color-mix(in_srgb,var(--text)_8%,transparent)] px-4 pt-3 pb-4"
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
                                      draggedLessonState?.sectionId === sec.id &&
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
                                        {isDropBefore && <LessonDropIndicator />}
                                        <MemoizedLessonCard
                                          lesson={les}
                                          sectionId={sec.id}
                                          lessonIndex={lesIndex}
                                          isDragged={isDraggedLesson}
                                          isDragEnabled={dragEnabledLessonId === les.id}
                                          isSaving={savingLessonId === les.id}
                                          isDeleting={deletingLessonId === les.id}
                                          isSectionReordering={Boolean(reorderingLessonsSectionId)}
                                          isReorderPending={reorderLessonsMutation.isPending}
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
                                          onLessonEditorOpen={rememberLessonEditor}
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
                                              isEditorOpen || isLessonEditorMounted;
                                            const toggleLesson = async () => {
                                              const nextExpanded = !isExpanded;
                                              if (nextExpanded) {
                                                setExpanded(true);
                                                setEditorOpen(true);
                                                onLessonEditorOpen(les.id);
                                              }
                                              const canToggle = await handleToggleLessonExpand(
                                                sec.id,
                                                les.id,
                                                nextExpanded,
                                              );
                                              if (!canToggle) {
                                                setExpanded(isExpanded);
                                                if (nextExpanded) setEditorOpen(false);
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
                                                className={`overflow-hidden rounded-[10px] border bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] shadow-(--card-shadow) transition-[border-color,box-shadow,opacity] duration-150 ${
                                                  isDraggedLesson
                                                    ? "border-dashed border-(--accent) opacity-35"
                                                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                                                }`}
                                                draggable={
                                                  dragEnabledLessonId === les.id &&
                                                  !les.isPendingCreation &&
                                                  !reorderingLessonsSectionId &&
                                                  !reorderLessonsMutation.isPending
                                                }
                                                onDragStart={(e) => {
                                                  e.stopPropagation();
                                                  handleLessonDragStart(e, sec.id, lesIndex, les);
                                                }}
                                                onDragOver={(e) => {
                                                  e.stopPropagation();
                                                  handleLessonDragOver(e, sec.id, les.id);
                                                }}
                                                onDragEnd={(e) => {
                                                  e.stopPropagation();
                                                  void handleLessonDragEnd();
                                                }}
                                              >
                                                <>
                                                  {/* Lesson Header */}
                                                  <div
                                                    className="flex cursor-pointer items-center justify-between px-4 py-3 select-none max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[10px_12px]"
                                                    onClick={() => void toggleLesson()}
                                                    title="Expand lesson editor"
                                                  >
                                                    <div className="flex min-w-0 flex-1 items-center gap-2.5 max-[768px]:w-full max-[768px]:gap-2">
                                                      <span
                                                        className={`flex items-center justify-center text-(--muted) transition-opacity duration-150 ${
                                                          les.isPendingCreation ||
                                                          reorderingLessonsSectionId ||
                                                          reorderLessonsMutation.isPending
                                                            ? "pointer-events-none cursor-not-allowed opacity-25"
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
                                                            setDragEnabledLessonId(les.id);
                                                          }
                                                        }}
                                                        onMouseLeave={() => {
                                                          if (!draggedLessonState)
                                                            setDragEnabledLessonId(null);
                                                        }}
                                                        onMouseDown={() => {
                                                          if (
                                                            !les.isPendingCreation &&
                                                            !reorderingLessonsSectionId &&
                                                            !reorderLessonsMutation.isPending
                                                          ) {
                                                            setDragEnabledLessonId(les.id);
                                                          }
                                                        }}
                                                        onMouseUp={() => {
                                                          if (!draggedLessonState)
                                                            setDragEnabledLessonId(null);
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                      >
                                                        <DotsSixVertical size={18} />
                                                      </span>
                                                      <LessonContentTypeIcon
                                                        contentType={
                                                          les.pendingContentType || les.contentType
                                                        }
                                                      />
                                                      {les.isEditingTitle ? (
                                                        <div
                                                          className="flex min-w-0 flex-1 items-center gap-2"
                                                          onClick={(e) => e.stopPropagation()}
                                                        >
                                                          <span className="shrink-0 text-[0.88rem] font-medium text-(--text)">
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
                                                              fontFamily: "inherit",
                                                              fontSize: "0.88rem",
                                                              fontWeight: 500,
                                                              lineHeight: 1.5,
                                                              borderRadius: "6px",
                                                            }}
                                                            disabled={
                                                              les.isPendingCreation ||
                                                              savingLessonId === les.id
                                                            }
                                                            onChange={(e) =>
                                                              handleUpdateLesson(sec.id, les.id, {
                                                                title: e.target.value,
                                                              })
                                                            }
                                                            onBlur={() => {
                                                              void handleLessonTitleBlur(
                                                                sec.id,
                                                                les.id,
                                                              );
                                                            }}
                                                            onKeyDown={(e) => {
                                                              if (e.key === "Enter") {
                                                                e.preventDefault();
                                                                e.currentTarget.blur();
                                                              } else if (e.key === "Escape") {
                                                                e.preventDefault();
                                                                handleCancelEditLessonTitle(
                                                                  sec.id,
                                                                  les.id,
                                                                );
                                                              }
                                                            }}
                                                            placeholder="e.g. Introduction to React Hooks"
                                                            className="h-7 min-w-0 flex-1 rounded-[6px] border border-[color-mix(in_srgb,var(--accent)_52%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-2 py-0.5 [font-family:inherit] text-[0.88rem] leading-[1.5] font-medium text-(--text) outline-none focus:border-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                                                          />
                                                          <button
                                                            type="button"
                                                            aria-label="Cancel lesson title edit"
                                                            title="Cancel title edit"
                                                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-(--muted) transition-colors hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:text-(--text)"
                                                            onMouseDown={(e) => {
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
                                                          <span className="min-w-0 flex-1 cursor-pointer truncate text-[0.88rem] font-medium whitespace-nowrap text-(--text)">
                                                            {lesIndex + 1}. {les.title}
                                                          </span>
                                                          <button
                                                            type="button"
                                                            aria-label="Edit lesson title"
                                                            title="Edit lesson title"
                                                            disabled={les.isPendingCreation}
                                                            className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-transparent bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--muted) opacity-0 transition-[opacity,color,background-color] duration-150 group-focus-within/title:opacity-100 group-hover/title:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:text-(--text) focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-30"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleStartEditLessonTitle(
                                                                sec.id,
                                                                les.id,
                                                              );
                                                            }}
                                                          >
                                                            <PencilSimple size={14} weight="bold" />
                                                          </button>
                                                        </div>
                                                      )}
                                                    </div>
                                                    <div className="flex items-center gap-2 max-[768px]:w-full max-[768px]:justify-between max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[768px]:pt-2">
                                                      {les.isPendingCreation ? (
                                                        <span className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[0.74rem] font-bold text-(--accent)">
                                                          <CircleNotch
                                                            size={12}
                                                            className="animate-spin text-(--accent)"
                                                          />
                                                          <span>Creating...</span>
                                                        </span>
                                                      ) : deletingLessonId === les.id ? (
                                                        <span className="inline-flex items-center gap-1 rounded-md border border-red-500/28 bg-red-500/10 px-2 py-0.5 text-[0.74rem] font-bold text-red-400">
                                                          <CircleNotch
                                                            size={12}
                                                            className="animate-spin text-red-400"
                                                          />
                                                          <span>Deleting...</span>
                                                        </span>
                                                      ) : (
                                                        <CurriculumItemStatusIndicator
                                                          status={getCurriculumItemDisplayStatus(
                                                            les.id,
                                                          )}
                                                          testId={`curriculum-status-lesson-${les.id}`}
                                                        />
                                                      )}
                                                      {les.isPublished === false && (
                                                        <span
                                                          className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,#f59e0b_28%,transparent)] bg-[color-mix(in_srgb,#f59e0b_12%,transparent)] px-2 py-0.5 text-[0.74rem] font-bold text-[#f59e0b]"
                                                          title="Draft mode: This lesson is not published and is hidden from students."
                                                        >
                                                          <EyeSlash size={13} weight="bold" />{" "}
                                                          Unpublished
                                                        </span>
                                                      )}
                                                      {isEditorOpen && (
                                                        <>
                                                          <button
                                                            type="button"
                                                            disabled={
                                                              savingLessonId === les.id ||
                                                              deletingLessonId === les.id
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
                                                              savingLessonId === les.id ||
                                                              deletingLessonId === les.id
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
                                                        disabled={
                                                          les.isPendingCreation ||
                                                          deletingLessonId === les.id
                                                        }
                                                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] bg-transparent p-0 text-(--muted) transition-all duration-150 hover:!border-red-500/30 hover:!bg-red-500/10 hover:!text-[#ef4444] disabled:cursor-not-allowed disabled:opacity-40"
                                                        aria-label="Delete lesson"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleDeleteLesson(sec.id, les.id);
                                                        }}
                                                      >
                                                        {deletingLessonId === les.id ? (
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
                                                        className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] bg-transparent p-0 text-(--muted) transition-all duration-150 hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:text-(--text) [&>svg]:transition-transform [&>svg]:duration-200 ${
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

                                                  {(isExpanded || shouldKeepEditorMounted) && (
                                                    <div
                                                      aria-hidden={!isExpanded}
                                                      className={isExpanded ? undefined : "hidden"}
                                                    >
                                                      {les.isPendingCreation ? (
                                                        <div className="flex min-h-48 items-center justify-center border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-5 py-8">
                                                          <div className="flex items-center gap-2 text-[0.86rem] font-semibold text-(--muted)">
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
                                                            ref={lessonEditorRef}
                                                            hideHeader
                                                            sectionNumber={
                                                              sections.findIndex(
                                                                (item) => item.id === sec.id,
                                                              ) + 1
                                                            }
                                                            sectionTitle={sec.title}
                                                            lessonNumber={lesIndex + 1}
                                                            playbackLessonNumber={getCourseWideLessonNumber(
                                                              sections,
                                                              les.id,
                                                            )}
                                                            lessonTitle={les.title}
                                                            courseSlug={editorData?.course?.slug}
                                                            courseTitle={courseTitle || undefined}
                                                            contentType={
                                                              (les.contentType as StudioLessonContentType) ||
                                                              "video"
                                                            }
                                                            isPublished={les.isPublished !== false}
                                                            isPreview={les.isPreview === true}
                                                            playbackSuspended={!isExpanded}
                                                            mediaInfo={getLessonMediaInfo(les)}
                                                            resources={les.resources.map(
                                                              (resource) => ({
                                                                id: resource.id,
                                                                name: resource.name,
                                                                type: resource.type,
                                                                size: resource.size,
                                                                mediaAssetId: resource.mediaAssetId,
                                                              }),
                                                            )}
                                                            isSaving={savingLessonId === les.id}
                                                            onBack={() => {
                                                              setExpanded(false);
                                                              setEditorOpen(false);
                                                              setQuizOpen(false);
                                                            }}
                                                            onCancel={(draft) =>
                                                              handleCancelLessonDraft(
                                                                sec.id,
                                                                les.id,
                                                                draft,
                                                              )
                                                            }
                                                            onSave={async (payload) => {
                                                              handleUpdateLesson(sec.id, les.id, {
                                                                title: payload.title,
                                                                contentType: payload.contentType,
                                                                isPublished: payload.isPublished,
                                                                isPreview: payload.isPreview,
                                                              });
                                                              const saved = await persistLesson(
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
                                                                setEditorOpen(false);
                                                              }
                                                            }}
                                                            onContentTypeChange={(contentType) => {
                                                              handleUpdateLesson(sec.id, les.id, {
                                                                contentType,
                                                              });
                                                            }}
                                                            onMediaAttached={(mediaAssetId) =>
                                                              handleLessonMediaAttached(
                                                                sec.id,
                                                                les.id,
                                                                mediaAssetId,
                                                              )
                                                            }
                                                            onProcessingComplete={() =>
                                                              handleLessonProcessingComplete()
                                                            }
                                                            onUploadMedia={async (file) => {
                                                              try {
                                                                const presigned =
                                                                  await mediaService.presignMediaUpload(
                                                                    {
                                                                      filename: file.name,
                                                                      contentType:
                                                                        file.type ||
                                                                        "application/octet-stream",
                                                                      fileSize: file.size,
                                                                      type:
                                                                        les.contentType === "image"
                                                                          ? "image"
                                                                          : les.contentType ===
                                                                              "document"
                                                                            ? "document"
                                                                            : "video",
                                                                      visibility: "protected",
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
                                                            }}
                                                            descriptionSection={
                                                              <LessonDescriptionEditor
                                                                id={`lesson-description-${les.id}`}
                                                                disabled={
                                                                  les.isPendingCreation ||
                                                                  savingLessonId === les.id
                                                                }
                                                                value={les.description}
                                                                onChange={(value) =>
                                                                  handleUpdateLesson(
                                                                    sec.id,
                                                                    les.id,
                                                                    {
                                                                      description: value,
                                                                    },
                                                                  )
                                                                }
                                                                placeholder="Add a detailed description of what students will learn in this lesson..."
                                                                maxLength={10000}
                                                              />
                                                            }
                                                            resourcesSection={
                                                              <LessonResourceManager
                                                                courseId={currentCourseId}
                                                                lessonId={les.id}
                                                                resources={les.resources}
                                                                disabled={
                                                                  les.isPendingCreation ||
                                                                  createLessonResourceMutation.isPending ||
                                                                  deleteLessonResourceMutation.isPending
                                                                }
                                                                onCreateResource={(payload) =>
                                                                  handleCreateLessonResource(
                                                                    les.id,
                                                                    payload,
                                                                  )
                                                                }
                                                                onResourceAdded={(resource) =>
                                                                  handleLessonResourceAdded(
                                                                    sec.id,
                                                                    les.id,
                                                                    resource,
                                                                  )
                                                                }
                                                                onDeleteResource={(resourceId) =>
                                                                  handleDeleteLessonResource(
                                                                    resourceId,
                                                                  )
                                                                }
                                                                onResourceRemoved={(resource) =>
                                                                  handleLessonResourceRemoved(
                                                                    sec.id,
                                                                    les.id,
                                                                    resource,
                                                                  )
                                                                }
                                                              />
                                                            }
                                                            quizSection={
                                                              currentCourseId &&
                                                              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                                                                les.id,
                                                              ) ? (
                                                                <QuizAuthoringPanel
                                                                  courseId={currentCourseId}
                                                                  lessonId={les.id}
                                                                  lessonTitle={les.title}
                                                                  onQuizDeleted={() => {}}
                                                                />
                                                              ) : (
                                                                <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-4 text-sm text-(--muted)">
                                                                  Save the course and lesson before
                                                                  configuring an attached Quiz.
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
                                                          onMouseDown={(e) => e.stopPropagation()}
                                                        >
                                                          <div
                                                            className={`min-h-0 overflow-hidden border-t border-transparent bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] transition-[padding,border-color] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                                              isExpanded
                                                                ? "border-t-[color-mix(in_srgb,var(--text)_8%,transparent)] px-5 pt-4 pb-5 max-[768px]:p-[14px_12px_16px]"
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
                                                                        className="text-[0.84rem] font-semibold text-(--text-secondary)"
                                                                      >
                                                                        Lesson Description
                                                                      </label>
                                                                      <button
                                                                        type="button"
                                                                        className="inline-flex min-h-8 items-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent px-2.5 text-xs font-semibold text-(--muted) transition-colors hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                                                                        onMouseDown={(e) => {
                                                                          e.preventDefault();
                                                                          e.stopPropagation();
                                                                        }}
                                                                        onClick={(e) => {
                                                                          e.stopPropagation();
                                                                          handleCancelLessonDescriptionEdit(
                                                                            sec.id,
                                                                            les.id,
                                                                          );
                                                                          setEditorOpen(false);
                                                                        }}
                                                                      >
                                                                        Cancel
                                                                      </button>
                                                                    </div>
                                                                    <div
                                                                      className={
                                                                        les.isPendingCreation
                                                                          ? "pointer-events-none opacity-60"
                                                                          : ""
                                                                      }
                                                                      onBlur={(e) => {
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
                                                                        value={les.description}
                                                                        onChange={(val) =>
                                                                          handleUpdateLesson(
                                                                            sec.id,
                                                                            les.id,
                                                                            {
                                                                              description: val,
                                                                            },
                                                                          )
                                                                        }
                                                                        placeholder="Add a detailed description of what students will learn in this lesson..."
                                                                        maxLength={10000}
                                                                      />
                                                                    </div>
                                                                  </div>
                                                                ) : (
                                                                  <LessonDescriptionPreview
                                                                    description={les.description}
                                                                    onEdit={() => {
                                                                      setEditorOpen(true);
                                                                      onLessonEditorOpen(les.id);
                                                                    }}
                                                                  />
                                                                )}
                                                              </div>

                                                              {/* Right column */}
                                                              <div className="order-1 flex min-w-0 flex-col gap-4.5">
                                                                {/* Content Type Selector */}
                                                                <div className="mb-4 flex flex-col gap-2">
                                                                  <label className="text-[0.84rem] font-semibold text-(--text-secondary)">
                                                                    Content Type
                                                                    {""}
                                                                    <span className="ml-0.5 text-[#ff5252]">
                                                                      *
                                                                    </span>
                                                                  </label>
                                                                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                                                    <div
                                                                      className={`relative flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                                                        les.isPendingCreation
                                                                          ? "cursor-not-allowed opacity-60"
                                                                          : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                                                      } ${
                                                                        les.contentType === "video"
                                                                          ? "is-selected border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                                                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                                                      }`}
                                                                      onClick={() => {
                                                                        if (les.isPendingCreation)
                                                                          return;
                                                                        void handleLessonDiscreteChange(
                                                                          sec.id,
                                                                          les.id,
                                                                          {
                                                                            contentType: "video",
                                                                          },
                                                                        );
                                                                      }}
                                                                    >
                                                                      <div
                                                                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${les.contentType === "video" ? "border-(--accent)" : "border-(--muted)"}`}
                                                                      >
                                                                        {les.contentType ===
                                                                          "video" && (
                                                                          <div className="h-1.5 w-1.5 rounded-full bg-(--accent)" />
                                                                        )}
                                                                      </div>
                                                                      <div className="flex items-center justify-center text-(--accent)">
                                                                        <Video
                                                                          size={16}
                                                                          weight="fill"
                                                                        />
                                                                      </div>
                                                                      <div className="flex min-w-0 flex-col">
                                                                        <span className="truncate text-[0.82rem] leading-tight font-bold text-(--text)">
                                                                          Video
                                                                        </span>
                                                                        <span className="truncate text-[0.70rem] text-(--muted)">
                                                                          Video lesson
                                                                        </span>
                                                                      </div>
                                                                    </div>

                                                                    <div
                                                                      className={`relative flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                                                        les.isPendingCreation
                                                                          ? "cursor-not-allowed opacity-60"
                                                                          : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                                                      } ${
                                                                        les.contentType ===
                                                                        "document"
                                                                          ? "is-selected border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                                                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                                                      }`}
                                                                      onClick={() => {
                                                                        if (les.isPendingCreation)
                                                                          return;
                                                                        void handleLessonDiscreteChange(
                                                                          sec.id,
                                                                          les.id,
                                                                          {
                                                                            contentType: "document",
                                                                          },
                                                                        );
                                                                      }}
                                                                    >
                                                                      <div
                                                                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${les.contentType === "document" ? "border-(--accent)" : "border-(--muted)"}`}
                                                                      >
                                                                        {les.contentType ===
                                                                          "document" && (
                                                                          <div className="h-1.5 w-1.5 rounded-full bg-(--accent)" />
                                                                        )}
                                                                      </div>
                                                                      <div className="flex items-center justify-center text-(--accent)">
                                                                        <FileText
                                                                          size={16}
                                                                          weight="fill"
                                                                        />
                                                                      </div>
                                                                      <div className="flex min-w-0 flex-col">
                                                                        <span className="truncate text-[0.82rem] leading-tight font-bold text-(--text)">
                                                                          Document
                                                                        </span>
                                                                        <span className="truncate text-[0.70rem] text-(--muted)">
                                                                          PDF / Reading
                                                                        </span>
                                                                      </div>
                                                                    </div>
                                                                  </div>
                                                                </div>

                                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                                  {/* Content Source Controls (Video or Document) */}
                                                                  <div className="mb-0 flex flex-col gap-2">
                                                                    <label className="text-[0.84rem] font-semibold text-(--text-secondary)">
                                                                      {les.contentType === "video"
                                                                        ? "Video Source"
                                                                        : "Document / PDF Source"}
                                                                      <span className="ml-0.5 text-[#ff5252]">
                                                                        *
                                                                      </span>
                                                                    </label>
                                                                    {les.contentType === "video" ? (
                                                                      <LessonVideoUpload
                                                                        mediaAssetId={
                                                                          les.contentMediaId
                                                                        }
                                                                        disabled={
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
                                                                        onProcessingComplete={() =>
                                                                          handleLessonProcessingComplete()
                                                                        }
                                                                      />
                                                                    ) : (
                                                                      <div className="flex items-center gap-2 max-[768px]:flex max-[768px]:w-full max-[768px]:gap-2">
                                                                        <button
                                                                          type="button"
                                                                          disabled={
                                                                            les.isPendingCreation
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
                                                                          className="inline-flex cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:cursor-not-allowed disabled:opacity-60 max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                                                        >
                                                                          <UploadSimple size={15} />
                                                                          Upload
                                                                        </button>
                                                                        <button
                                                                          type="button"
                                                                          disabled={
                                                                            les.isPendingCreation
                                                                          }
                                                                          style={{
                                                                            fontSize: "0.80rem",
                                                                            fontWeight: 500,
                                                                            height: "34px",
                                                                            borderRadius: "8px",
                                                                            gap: "6px",
                                                                            paddingLeft: "14px",
                                                                            paddingRight: "14px",
                                                                          }}
                                                                          className="inline-flex cursor-pointer items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-(--text) transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                                                        >
                                                                          <FileText
                                                                            size={15}
                                                                            className="text-(--text-secondary)"
                                                                          />
                                                                          Select from Media
                                                                        </button>
                                                                      </div>
                                                                    )}
                                                                  </div>

                                                                  {/* Lesson Publishing Status */}
                                                                  <div className="mb-0 flex flex-col gap-2">
                                                                    <label className="text-[0.84rem] font-semibold text-(--text-secondary)">
                                                                      Publishing Status
                                                                    </label>
                                                                    <ThemedSelect
                                                                      value={
                                                                        les.isPublished !== false
                                                                          ? "published"
                                                                          : "draft"
                                                                      }
                                                                      onValueChange={(value) => {
                                                                        if (les.isPendingCreation)
                                                                          return;
                                                                        void handleLessonDiscreteChange(
                                                                          sec.id,
                                                                          les.id,
                                                                          {
                                                                            isPublished:
                                                                              value === "published",
                                                                          },
                                                                        );
                                                                      }}
                                                                      options={[
                                                                        ["published", "Published"],
                                                                        ["draft", "Draft (Hidden)"],
                                                                      ]}
                                                                      disabled={
                                                                        les.isPendingCreation
                                                                      }
                                                                      ariaLabel="Publishing status"
                                                                      triggerClassName="!h-9 !w-full !rounded-[8px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !px-3 !text-[0.84rem] !text-(--text) !bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] font-semibold disabled:!opacity-60"
                                                                    />
                                                                  </div>
                                                                </div>

                                                                {/* Free Preview Toggle */}
                                                                <div
                                                                  className={`mb-3 flex items-center justify-between rounded-[8px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-3 py-2 ${les.isPendingCreation ? "pointer-events-none opacity-60" : ""}`}
                                                                >
                                                                  <div className="pr-3">
                                                                    <strong className="mb-0.5 block text-[0.88rem] font-[650] text-(--text)">
                                                                      Free Preview
                                                                    </strong>
                                                                    <p className="m-0 text-[0.78rem] text-(--muted)">
                                                                      Allow prospective students to
                                                                      view this lesson before
                                                                      enrolling or purchasing.
                                                                    </p>
                                                                  </div>
                                                                  <SettingsToggle
                                                                    checked={les.isPreview === true}
                                                                    onChange={(checked) => {
                                                                      if (les.isPendingCreation)
                                                                        return;
                                                                      void handleLessonDiscreteChange(
                                                                        sec.id,
                                                                        les.id,
                                                                        {
                                                                          isPreview: checked,
                                                                        },
                                                                      );
                                                                    }}
                                                                    label="Toggle Free Preview"
                                                                  />
                                                                </div>

                                                                {/* Lesson Resources */}
                                                                <LessonResourceManager
                                                                  courseId={currentCourseId}
                                                                  lessonId={les.id}
                                                                  resources={les.resources}
                                                                  disabled={
                                                                    les.isPendingCreation ||
                                                                    createLessonResourceMutation.isPending ||
                                                                    deleteLessonResourceMutation.isPending
                                                                  }
                                                                  onCreateResource={(payload) =>
                                                                    handleCreateLessonResource(
                                                                      les.id,
                                                                      payload,
                                                                    )
                                                                  }
                                                                  onResourceAdded={(resource) =>
                                                                    handleLessonResourceAdded(
                                                                      sec.id,
                                                                      les.id,
                                                                      resource,
                                                                    )
                                                                  }
                                                                  onDeleteResource={(resourceId) =>
                                                                    handleDeleteLessonResource(
                                                                      resourceId,
                                                                    )
                                                                  }
                                                                  onResourceRemoved={(resource) =>
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
                                                                        size={16}
                                                                        className="text-(--accent)"
                                                                        weight="fill"
                                                                      />
                                                                      <span>Quiz Assessment</span>
                                                                    </div>
                                                                    <button
                                                                      type="button"
                                                                      className="inline-flex min-h-8 items-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent px-2.5 text-xs font-semibold text-(--muted) transition-colors hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:text-(--text)"
                                                                      onClick={() =>
                                                                        setQuizOpen(false)
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
                                                                      courseId={currentCourseId}
                                                                      lessonId={les.id}
                                                                      lessonTitle={les.title}
                                                                      onQuizDeleted={() => {
                                                                        // Quiz deleted, query invalidation in hook updates UI
                                                                      }}
                                                                    />
                                                                  ) : (
                                                                    <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-4 text-sm text-(--muted)">
                                                                      Save the course and lesson
                                                                      before configuring an attached
                                                                      Quiz.
                                                                    </div>
                                                                  )}
                                                                </div>
                                                              ) : (
                                                                <button
                                                                  type="button"
                                                                  disabled={les.isPendingCreation}
                                                                  className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 text-xs font-semibold text-(--accent-ink,var(--accent)) transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                                                                  onClick={() => setQuizOpen(true)}
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
                              <div className="mt-3.5">
                                <button
                                  type="button"
                                  disabled={
                                    sec.isPendingCreation ||
                                    creatingLessonSectionId === sec.id ||
                                    createLessonMutation.isPending
                                  }
                                  className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[0.82rem] font-medium text-(--muted) transition-colors enabled:cursor-pointer enabled:hover:text-(--text) disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
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
              ) : panelStep === "access-rules" ? (
                <div className="flex w-full flex-col gap-5">
                  {/* Top Grid: 1. Who can access & 2. Access duration */}
                  <div className="grid w-full min-w-0 grid-cols-1 gap-5 max-[768px]:gap-3.5 md:grid-cols-2">
                    {/* Card 1: Who can access this course? */}
                    <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                      <div className="mb-4.5 flex items-center justify-between">
                        <div>
                          <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                            1. Who can access this course?
                          </h3>
                          <p className="m-0 text-[0.83rem] text-(--muted)">
                            Choose who is allowed to access this course.
                          </p>
                        </div>
                        <AccessRulesControlStatusIndicator
                          status={getAccessControlDisplayStatus("accessType")}
                          testId="access-rules-status-accessType"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        {/* Radio option: Everyone */}
                        <label
                          className={`relative flex items-center gap-3.5 rounded-xl border p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                            isAccessRulesSaving || savingAccessControls.has("accessType")
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                          } ${
                            accessRules.accessType === "everyone"
                              ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                          }`}
                          onClick={() => {
                            if (!isAccessRulesSaving && !savingAccessControls.has("accessType")) {
                              handleAccessTypeChange("everyone");
                            }
                          }}
                        >
                          <div
                            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                              accessRules.accessType === "everyone"
                                ? "border-(--accent)"
                                : "border-(--muted)"
                            }`}
                          >
                            {accessRules.accessType === "everyone" && (
                              <div className="h-2 w-2 rounded-full bg-(--accent)" />
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-0.75">
                            <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                              Everyone
                            </strong>
                            <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                              Anyone with access to the platform can access this course.
                            </p>
                          </div>
                        </label>

                        {/* Radio option: Restricted access (Coming soon - Disabled) */}
                        <div
                          className="relative flex cursor-not-allowed items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-3.5 px-4 opacity-60 select-none"
                          aria-disabled="true"
                        >
                          <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.75">
                            <div className="flex items-center gap-2">
                              <strong className="text-[0.9rem] leading-[18px] font-[650] text-(--text)">
                                Restricted access
                              </strong>
                              <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-(--muted)">
                                Coming soon
                              </span>
                            </div>
                            <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                              Only users who meet the selected requirements can access this course.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Access duration */}
                    <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                      <div className="mb-4.5 flex items-center justify-between">
                        <div>
                          <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                            2. Access duration
                          </h3>
                          <p className="m-0 text-[0.83rem] text-(--muted)">
                            Set how long learners can access this course.
                          </p>
                        </div>
                        <AccessRulesControlStatusIndicator
                          status={getAccessControlDisplayStatus("durationMode")}
                          testId="access-rules-status-durationMode"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        {/* Option 1: Lifetime access */}
                        <div
                          className={`relative flex items-center gap-3.5 rounded-xl border p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                            isAccessRulesSaving || savingAccessControls.has("durationMode")
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                          } ${
                            accessRules.durationMode === "lifetime"
                              ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                          }`}
                          onClick={() =>
                            !isAccessRulesSaving &&
                            !savingAccessControls.has("durationMode") &&
                            handleDurationModeChange("lifetime")
                          }
                        >
                          <div
                            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                              accessRules.durationMode === "lifetime"
                                ? "border-(--accent)"
                                : "border-(--muted)"
                            }`}
                          >
                            {accessRules.durationMode === "lifetime" && (
                              <div className="h-2 w-2 rounded-full bg-(--accent)" />
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-0.75">
                            <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                              Lifetime access
                            </strong>
                            <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                              Learners can access this course forever.
                            </p>
                          </div>
                        </div>

                        {/* Option 2: Fixed duration */}
                        <div
                          className={`relative flex items-center gap-3.5 rounded-xl border p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                            isAccessRulesSaving || savingAccessControls.has("durationMode")
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                          } ${
                            accessRules.durationMode === "fixed"
                              ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                          }`}
                          onClick={() =>
                            !isAccessRulesSaving &&
                            !savingAccessControls.has("durationMode") &&
                            handleDurationModeChange("fixed")
                          }
                        >
                          <div
                            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                              accessRules.durationMode === "fixed"
                                ? "border-(--accent)"
                                : "border-(--muted)"
                            }`}
                          >
                            {accessRules.durationMode === "fixed" && (
                              <div className="h-2 w-2 rounded-full bg-(--accent)" />
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-0.75">
                            <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                              Fixed duration
                            </strong>
                            <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                              Set a duration for how long learners can access this course.
                            </p>

                            {accessRules.durationMode === "fixed" && (
                              <div
                                className="mt-3 flex flex-wrap items-center gap-2.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="number"
                                  disabled={
                                    isAccessRulesSaving || savingAccessControls.has("durationMode")
                                  }
                                  className="box-border h-9 w-[80px] rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3 py-0 text-center text-[0.84rem] font-semibold text-(--text) transition-[border-color] duration-150 outline-none hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] focus:border-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                                  min={1}
                                  value={accessRules.fixedDurationValue}
                                  onChange={(e) =>
                                    handleFixedDurationValueChange(parseInt(e.target.value, 10))
                                  }
                                  onBlur={() => {
                                    void flushFixedDurationPersistence();
                                  }}
                                />
                                <ThemedSelect
                                  disabled={
                                    isAccessRulesSaving ||
                                    savingAccessControls.has("durationMode") ||
                                    savingAccessControls.has("fixedDuration")
                                  }
                                  value={accessRules.fixedDurationUnit}
                                  onValueChange={(val) =>
                                    handleFixedDurationUnitChange(val as DurationUnit)
                                  }
                                  options={[
                                    ["Days", "Days"],
                                    ["Weeks", "Weeks"],
                                    ["Months", "Months"],
                                    ["Years", "Years"],
                                  ]}
                                  ariaLabel="Select duration unit"
                                  triggerClassName="!w-[130px] !h-9 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-(--text) !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all flex items-center justify-between disabled:!opacity-60 disabled:!cursor-not-allowed"
                                />
                                <AccessRulesControlStatusIndicator
                                  status={getAccessControlDisplayStatus("fixedDuration")}
                                  testId="access-rules-status-fixedDuration"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Card: 3. Learner interactions */}
                  <div className="flex w-full flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                    <div className="mb-4.5">
                      <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                        3. Learner interactions
                      </h3>
                      <p className="m-0 text-[0.83rem] text-(--muted)">
                        Manage how learners can interact within this course.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3">
                      {/* Toggle 1: Q&A */}
                      <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4.5 py-3.5">
                        <div className="flex min-w-0 items-center gap-3.5 pr-3">
                          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                            <Question size={20} weight="bold" />
                          </div>
                          <div className="min-w-0">
                            <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
                              Q&A
                            </strong>
                            <p className="m-0 text-[0.8rem] text-(--muted)">
                              Allow learners to ask questions about lessons.
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <AccessRulesControlStatusIndicator
                            status={getAccessControlDisplayStatus("enableQA")}
                            testId="access-rules-status-enableQA"
                          />
                          <SettingsToggle
                            checked={accessRules.enableQA}
                            disabled={isAccessRulesSaving || savingAccessControls.has("enableQA")}
                            onChange={handleToggleQA}
                            label="Toggle Q&A"
                          />
                        </div>
                      </div>

                      {/* Toggle 2: Comments */}
                      <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4.5 py-3.5">
                        <div className="flex min-w-0 items-center gap-3.5 pr-3">
                          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                            <ChatCircleText size={20} weight="fill" />
                          </div>
                          <div className="min-w-0">
                            <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
                              Comments
                            </strong>
                            <p className="m-0 text-[0.8rem] text-(--muted)">
                              Allow learners to comment on course content.
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <AccessRulesControlStatusIndicator
                            status={getAccessControlDisplayStatus("enableComments")}
                            testId="access-rules-status-enableComments"
                          />
                          <SettingsToggle
                            checked={accessRules.enableComments}
                            disabled={
                              isAccessRulesSaving || savingAccessControls.has("enableComments")
                            }
                            onChange={handleToggleComments}
                            label="Toggle Comments"
                          />
                        </div>
                      </div>

                      {/* Toggle 3: Notes */}
                      <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4.5 py-3.5">
                        <div className="flex min-w-0 items-center gap-3.5 pr-3">
                          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                            <NotePencil size={20} weight="bold" />
                          </div>
                          <div className="min-w-0">
                            <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
                              Notes
                            </strong>
                            <p className="m-0 text-[0.8rem] text-(--muted)">
                              Allow learners to take notes while learning.
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <AccessRulesControlStatusIndicator
                            status={getAccessControlDisplayStatus("enableNotes")}
                            testId="access-rules-status-enableNotes"
                          />
                          <SettingsToggle
                            checked={accessRules.enableNotes}
                            disabled={
                              isAccessRulesSaving || savingAccessControls.has("enableNotes")
                            }
                            onChange={handleToggleNotes}
                            label="Toggle Notes"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : panelStep === "pricing" ? (
                <div className="flex w-full flex-col gap-5">
                  {pricingValidationError && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[0.84rem] font-semibold text-red-400">
                      <WarningCircle size={18} weight="bold" className="shrink-0" />
                      <span>{pricingValidationError}</span>
                    </div>
                  )}

                  {/* Top 2-Column Grid: 1. Course pricing & 2. Price details */}
                  <div className="grid w-full min-w-0 grid-cols-1 gap-5 max-[768px]:gap-3.5 md:grid-cols-2">
                    {/* Card 1: Course pricing */}
                    <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow) transition-opacity duration-200">
                      <div className="mb-4.5 flex items-center justify-between">
                        <div>
                          <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                            1. Course pricing
                          </h3>
                          <p className="m-0 text-[0.83rem] text-(--muted)">
                            Choose how you want to sell this course.
                          </p>
                        </div>
                        <PricingControlStatusIndicator
                          status={getPricingControlDisplayStatus("pricingType")}
                          testId="pricing-field-status-pricingType"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        {/* Radio Option: Free */}
                        <div
                          className={`relative flex items-center gap-3.5 rounded-xl border p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                            isSavingPricing || isPricingControlSaving("pricingType")
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                          } ${
                            pricing.pricingType === "free"
                              ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                          }`}
                          onClick={() =>
                            !isSavingPricing &&
                            !isPricingControlSaving("pricingType") &&
                            handlePricingTypeChange("free")
                          }
                        >
                          <div
                            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                              pricing.pricingType === "free"
                                ? "border-(--accent)"
                                : "border-(--muted)"
                            }`}
                          >
                            {pricing.pricingType === "free" && (
                              <div className="h-2 w-2 rounded-full bg-(--accent)" />
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-0.75">
                            <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                              Free
                            </strong>
                            <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                              Anyone who can access the course can enroll for free.
                            </p>
                          </div>
                        </div>

                        {/* Radio Option: Paid */}
                        <div
                          className={`relative flex items-center gap-3.5 rounded-xl border p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                            isSavingPricing || isPricingControlSaving("pricingType")
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                          } ${
                            pricing.pricingType === "paid"
                              ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                          }`}
                          onClick={() =>
                            !isSavingPricing &&
                            !isPricingControlSaving("pricingType") &&
                            handlePricingTypeChange("paid")
                          }
                        >
                          <div
                            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                              pricing.pricingType === "paid"
                                ? "border-(--accent)"
                                : "border-(--muted)"
                            }`}
                          >
                            {pricing.pricingType === "paid" && (
                              <div className="h-2 w-2 rounded-full bg-(--accent)" />
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-0.75">
                            <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                              Paid
                            </strong>
                            <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                              Learners must purchase the course to get access.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Price details */}
                    <div
                      className={`flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow) transition-opacity duration-200 ${
                        pricing.pricingType === "free"
                          ? "is-disabled pointer-events-none opacity-55"
                          : ""
                      }`}
                    >
                      <div className="mb-4.5 flex items-center justify-between">
                        <div>
                          <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                            2. Price details
                          </h3>
                          <p className="m-0 text-[0.83rem] text-(--muted)">
                            Set the pricing for your course.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.75">
                        {/* Currency Combobox Field */}
                        <div className="mb-5 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <label
                              id="currency-label"
                              className="text-[0.84rem] font-semibold text-(--text-secondary)"
                            >
                              Currency <span className="ml-0.5 text-[#ff5252]">*</span>
                            </label>
                            <PricingControlStatusIndicator
                              status={getPricingControlDisplayStatus("currency")}
                              testId="pricing-field-status-currency"
                            />
                          </div>
                          <ThemedSelect
                            value={pricing.currency || "INR"}
                            onValueChange={handleCurrencyChange}
                            options={currencyOptions}
                            disabled={
                              pricing.pricingType === "free" ||
                              isSavingPricing ||
                              isPricingControlSaving("pricingType") ||
                              isPricingControlSaving("currency")
                            }
                            ariaLabel="Select currency"
                            searchable
                            searchPlaceholder="Search currencies by name or code..."
                            triggerClassName="!w-full !h-11 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-[10px] !px-3.5 !py-0 !text-(--text) !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.88rem] !font-medium disabled:!opacity-60 disabled:!cursor-not-allowed"
                          />
                          <p className="m-0 mt-1 text-[0.78rem] text-(--muted)">
                            Choose the currency for course pricing.
                          </p>
                        </div>

                        {/* Selling Price Field */}
                        <div className="mb-5 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor="selling-price"
                              className="text-[0.84rem] font-semibold text-(--text-secondary)"
                            >
                              Selling price <span className="ml-0.5 text-[#ff5252]">*</span>
                            </label>
                            <PricingControlStatusIndicator
                              status={getPricingControlDisplayStatus("sellingPrice")}
                              testId="pricing-field-status-sellingPrice"
                            />
                          </div>
                          <div className="relative flex w-full items-center">
                            <span className="pointer-events-none absolute left-3.5 text-[0.9rem] font-semibold text-(--muted)">
                              {getCurrencySymbol(pricing.currency || "INR")}
                            </span>
                            <input
                              id="selling-price"
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              disabled={
                                pricing.pricingType === "free" ||
                                isSavingPricing ||
                                isPricingControlSaving("pricingType")
                              }
                              value={pricing.sellingPrice}
                              onChange={(e) => handleSellingPriceChange(e.target.value)}
                              onBlur={() => {
                                void flushPricingPersistence();
                              }}
                              placeholder="1999"
                              className="w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] py-2.5 pr-3.5 pl-8 text-[0.9rem] font-semibold text-(--text) transition-[border-color] duration-150 outline-none focus:border-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </div>
                          <p className="m-0 mt-1 text-[0.78rem] text-(--muted)">
                            This is the price learners will pay.
                          </p>
                        </div>

                        {/* Original Price Field */}
                        <div className="mb-5 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor="original-price"
                              className="text-[0.84rem] font-semibold text-(--text-secondary)"
                            >
                              Original price
                            </label>
                            <PricingControlStatusIndicator
                              status={getPricingControlDisplayStatus("originalPrice")}
                              testId="pricing-field-status-originalPrice"
                            />
                          </div>
                          <div className="relative flex w-full items-center">
                            <span className="pointer-events-none absolute left-3.5 text-[0.9rem] font-semibold text-(--muted)">
                              {getCurrencySymbol(pricing.currency || "INR")}
                            </span>
                            <input
                              id="original-price"
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              disabled={
                                pricing.pricingType === "free" ||
                                isSavingPricing ||
                                isPricingControlSaving("pricingType")
                              }
                              value={pricing.originalPrice}
                              onChange={(e) => handleOriginalPriceChange(e.target.value)}
                              onBlur={() => {
                                void flushPricingPersistence();
                              }}
                              placeholder="2999"
                              className="w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] py-2.5 pr-3.5 pl-8 text-[0.9rem] font-semibold text-(--text) transition-[border-color] duration-150 outline-none focus:border-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </div>
                          <p className="m-0 mt-1 text-[0.78rem] text-(--muted)">
                            Enter original price to show discount.
                          </p>
                        </div>

                        {/* Dynamic Discount Calculation Badge */}
                        {(() => {
                          const sell = parseFloat(pricing.sellingPrice.replace(/,/g, ""));
                          const orig = parseFloat(pricing.originalPrice.replace(/,/g, ""));
                          let discountPercent = 0;
                          let isValidDiscount = false;

                          if (!isNaN(sell) && !isNaN(orig) && sell > 0 && orig > sell) {
                            discountPercent = Math.round(((orig - sell) / orig) * 100);
                            isValidDiscount = discountPercent > 0;
                          }

                          return (
                            <div className="mt-1 flex flex-wrap items-center gap-3">
                              <div
                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.80rem] font-bold whitespace-nowrap transition-[border-color,background-color,color] duration-150 ease-out ${
                                  isValidDiscount && pricing.pricingType === "paid"
                                    ? "is-active border-green-500/40 bg-green-500/12 text-green-400"
                                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-(--muted)"
                                }`}
                              >
                                <Tag size={15} weight="bold" className="shrink-0" />
                                <span className="leading-none whitespace-nowrap">
                                  {isValidDiscount && pricing.pricingType === "paid"
                                    ? `${discountPercent}% OFF`
                                    : "0% OFF"}
                                </span>
                              </div>
                              <span className="text-[0.8rem] leading-tight text-(--muted)">
                                Discount is calculated automatically.
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Quiz Pricing */}
                  <CourseQuizPricingCard
                    courseId={currentCourseId}
                    courseCurrency={pricing.currency || "INR"}
                    onNavigateTab={(tab) => {
                      const stepId = parseWizardTab(tab);
                      if (stepId) void navigateToStep(stepId);
                    }}
                  />

                  {/* Bottom Card: Coupons Banner */}
                  <div className="flex items-center justify-between rounded-[14px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) px-5.5 py-4 shadow-(--card-shadow) max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3.5">
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                        <Info size={20} weight="bold" />
                      </div>
                      <div>
                        <strong className="mb-0.5 block text-[0.92rem] font-[650] text-(--text)">
                          Coupons
                        </strong>
                        <p className="m-0 text-[0.82rem] text-(--muted)">
                          Create and manage coupon codes separately from the Coupons section.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      style={{
                        fontSize: "0.80rem",
                        fontWeight: 700,
                        height: "34px",
                        borderRadius: "8px",
                        gap: "6px",
                        paddingLeft: "18px",
                        paddingRight: "18px",
                      }}
                      className="inline-flex cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] max-[768px]:w-full max-[768px]:justify-center"
                      onClick={() => {
                        if (!onNavigatePage) return;
                        if (!currentCourseId) {
                          onNavigatePage("/coupons/create");
                          return;
                        }
                        const params = new URLSearchParams({
                          courseId: currentCourseId,
                        });
                        params.set(
                          "returnTo",
                          `${window.location.pathname}${window.location.search}`,
                        );
                        onNavigatePage(`/coupons/create?${params.toString()}`);
                      }}
                    >
                      Go to Coupons <ArrowUpRight size={15} weight="bold" />
                    </button>
                  </div>
                </div>
              ) : panelStep === "extras" ? (
                <div className="flex w-full flex-col gap-5">
                  {/* Top 2-Column Grid: 1. Certificates & 2. This course includes */}
                  <div className="grid w-full min-w-0 grid-cols-1 items-start gap-5 max-[768px]:gap-3.5 md:grid-cols-2">
                    {/* Card 1: Certificates */}
                    <div className="flex h-fit flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                      <div className="mb-4.5">
                        <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                          1. Certificates
                        </h3>
                        <p className="m-0 text-[0.83rem] text-(--muted)">
                          Configure how certificates will be issued for this course.
                        </p>
                      </div>

                      {/* Enable Certificate Toggle Row */}
                      <div className="mb-4.5 flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4.5 py-3.5">
                        <div className="flex min-w-0 flex-col pr-3">
                          <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
                            Enable certificate
                          </strong>
                          <p className="m-0 text-[0.8rem] text-(--muted)">
                            Issue certificates to learners on course completion.
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <ExtrasControlStatusIndicator
                            status={getExtrasControlDisplayStatus("enableCertificate")}
                            testId="extras-field-status-enableCertificate"
                          />
                          <SettingsToggle
                            checked={extras.enableCertificate}
                            disabled={isSavingCertificate}
                            onChange={handleToggleCertificate}
                            label="Toggle certificate"
                          />
                        </div>
                      </div>

                      {/* Certificate Configuration Controls */}
                      <div
                        className={`flex flex-col gap-4.5 transition-opacity duration-200 ${
                          !extras.enableCertificate
                            ? "is-disabled pointer-events-none opacity-50"
                            : ""
                        }`}
                      >
                        {/* Template Selector */}
                        <div className="mb-5 flex flex-col gap-2">
                          <div className="mb-0.5 flex items-center justify-between">
                            <label className="text-[0.84rem] font-semibold text-(--text-secondary)">
                              Certificate template
                            </label>
                            <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-(--muted)">
                              Coming soon
                            </span>
                          </div>
                          <p className="m-0 mt-0.5 mb-2 text-[0.78rem] text-(--muted)">
                            Choose from pre-designed certificate templates.
                          </p>
                          <div className="pointer-events-none cursor-not-allowed opacity-60">
                            <ThemedSelect
                              value={extras.certificateTemplate}
                              onValueChange={handleCertificateTemplateChange}
                              options={[
                                ["purple-certificate", "Modern Purple Certificate"],
                                ["blue-certificate", "Classic Blue Certificate"],
                                ["dark-certificate", "Minimal Dark Certificate"],
                              ]}
                              ariaLabel="Select certificate template"
                              className="w-full"
                              disabled
                              triggerClassName="!w-full !h-10 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-(--text) !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all"
                            />
                          </div>
                        </div>

                        {/* Certificate Issuance Options */}
                        <div className="mb-5 flex flex-col gap-2">
                          <div className="mb-0.5 flex items-center justify-between">
                            <label className="text-[0.84rem] font-semibold text-(--text-secondary)">
                              Certificate issuance
                            </label>
                            <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-(--muted)">
                              Coming soon
                            </span>
                          </div>
                          <p className="m-0 mt-0.5 mb-2 text-[0.78rem] text-(--muted)">
                            Choose when the certificate should be issued.
                          </p>

                          <div className="pointer-events-none flex cursor-not-allowed flex-col gap-2.5 opacity-60 select-none">
                            {/* Option 1: On course completion */}
                            <div
                              className={`relative flex items-center gap-3.5 rounded-xl border p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                                extras.issuanceType === "completion"
                                  ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                              }`}
                            >
                              <div
                                className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                                  extras.issuanceType === "completion"
                                    ? "border-(--accent)"
                                    : "border-(--muted)"
                                }`}
                              >
                                {extras.issuanceType === "completion" && (
                                  <div className="h-2 w-2 rounded-full bg-(--accent)" />
                                )}
                              </div>
                              <div className="flex flex-1 flex-col gap-0.75">
                                <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                                  On course completion
                                </strong>
                                <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                                  Issue certificate when the learner completes all lessons.
                                </p>
                              </div>
                            </div>

                            {/* Option 2: Minimum completion percentage */}
                            <div
                              className={`relative flex items-center gap-3.5 rounded-xl border p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                                extras.issuanceType === "percentage"
                                  ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                              }`}
                            >
                              <div
                                className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                                  extras.issuanceType === "percentage"
                                    ? "border-(--accent)"
                                    : "border-(--muted)"
                                }`}
                              >
                                {extras.issuanceType === "percentage" && (
                                  <div className="h-2 w-2 rounded-full bg-(--accent)" />
                                )}
                              </div>
                              <div className="flex flex-1 flex-col gap-0.75">
                                <div className="flex w-full items-center justify-between">
                                  <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                                    Minimum completion percentage
                                  </strong>
                                  {extras.issuanceType === "percentage" && (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        disabled
                                        className="w-[76px] cursor-not-allowed rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3 py-1.75 text-center text-[0.86rem] font-semibold text-(--text) outline-none"
                                        min={1}
                                        max={100}
                                        value={extras.minCompletionPercentage}
                                        readOnly
                                      />
                                      <span className="text-[0.86rem] font-bold text-(--text)">
                                        %
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                                  Issue certificate when learner reaches the selected percentage.
                                </p>
                              </div>
                            </div>

                            {/* Option 3: Custom rule */}
                            <div
                              className={`relative flex items-center gap-3.5 rounded-xl border p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                                extras.issuanceType === "custom"
                                  ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                              }`}
                            >
                              <div
                                className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                                  extras.issuanceType === "custom"
                                    ? "border-(--accent)"
                                    : "border-(--muted)"
                                }`}
                              >
                                {extras.issuanceType === "custom" && (
                                  <div className="h-2 w-2 rounded-full bg-(--accent)" />
                                )}
                              </div>
                              <div className="flex flex-1 flex-col gap-0.75">
                                <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                                  Custom rule
                                </strong>
                                <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                                  Define your own custom rule for certificate issuance.
                                </p>

                                {extras.issuanceType === "custom" && (
                                  <div className="mt-2 w-full">
                                    <input
                                      type="text"
                                      disabled
                                      readOnly
                                      className="w-full cursor-not-allowed rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3 py-1.75 text-[0.84rem] text-(--text) outline-none"
                                      value={extras.customRuleText}
                                      placeholder="e.g. Complete all quizzes with > 80% score"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Delivery Toggle Row */}
                        <div className="flex cursor-not-allowed items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3.5 opacity-60">
                          <div>
                            <div className="mb-0.5 flex items-center gap-2">
                              <strong className="text-[0.88rem] font-[650] text-(--text)">
                                Delivery
                              </strong>
                              <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-(--muted)">
                                Coming soon
                              </span>
                            </div>
                            <p className="m-0 text-[0.78rem] text-(--muted)">
                              Automatically email the certificate to learners.
                            </p>
                          </div>
                          <div className="pointer-events-none">
                            <SettingsToggle
                              checked={extras.autoEmailCertificate}
                              onChange={handleToggleAutoEmailCertificate}
                              label="Toggle certificate delivery"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: This course includes */}
                    <div className="flex h-fit flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                      <div className="mb-4.5">
                        <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                          2. This course includes
                        </h3>
                        <p className="m-0 text-[0.83rem] text-(--muted)">
                          These details are calculated from your curriculum.
                        </p>
                      </div>

                      {/* Derived Live Stats Summary Grid */}
                      <div className="mb-6 grid grid-cols-1 gap-3 max-[768px]:gap-2.5 min-[1024px]:grid-cols-3">
                        <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] px-3 py-3.5 max-[768px]:gap-3.5 max-[768px]:p-[12px_14px]">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-indigo-500/[0.14] text-indigo-500 max-[768px]:h-10 max-[768px]:w-10">
                            <BookOpen size={20} weight="fill" />
                          </div>
                          <div className="flex flex-col">
                            <strong className="text-base leading-[1.2] font-[750] text-(--text) max-[768px]:text-[1.05rem]">
                              {totalSections}
                            </strong>
                            <span className="text-[0.74rem] font-medium text-(--muted) max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                              Sections
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] px-3 py-3.5 max-[768px]:gap-3.5 max-[768px]:p-[12px_14px]">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-purple-500/[0.14] text-purple-500 max-[768px]:h-10 max-[768px]:w-10">
                            <PlayCircle size={20} weight="fill" />
                          </div>
                          <div className="flex flex-col">
                            <strong className="text-base leading-[1.2] font-[750] text-(--text) max-[768px]:text-[1.05rem]">
                              {totalLessons}
                            </strong>
                            <span className="text-[0.74rem] font-medium text-(--muted) max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                              Lessons
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] px-3 py-3.5 max-[768px]:gap-3.5 max-[768px]:p-[12px_14px]">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-500/[0.14] text-blue-500 max-[768px]:h-10 max-[768px]:w-10">
                            <Clock size={20} weight="bold" />
                          </div>
                          <div className="flex flex-col">
                            <strong
                              className="text-base leading-[1.2] font-[750] text-(--text) max-[768px]:text-[1.05rem]"
                              data-testid="course-extra-duration"
                            >
                              {computedDuration}
                            </strong>
                            <span className="text-[0.74rem] font-medium text-(--muted) max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                              Content length
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Divider between Stats & Inclusions */}
                      <div className="my-4.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]" />

                      {/* Additional Inclusions Section */}
                      <div className="flex flex-col gap-3.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <h4 className="m-0 text-[0.95rem] font-bold text-(--text)">
                              Course inclusions
                            </h4>
                            {isReorderingIncludes || reorderIncludesMutation.isPending ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2.5 py-0.5 text-[0.72rem] font-bold text-(--accent)">
                                <CircleNotch size={12} className="animate-spin text-(--accent)" />
                                <span>Saving inclusion order...</span>
                              </span>
                            ) : (
                              <ExtrasControlStatusIndicator
                                status={extrasControlStatus["inclusions"] ?? null}
                                testId="extras-field-status-inclusions"
                              />
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.75 text-[0.72rem] font-bold tracking-wide ${
                              manualIncludesDraft.length >= 6
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted)"
                            }`}
                          >
                            {manualIncludesDraft.length} / 6
                          </span>
                        </div>
                        <p className="m-0 text-[0.82rem] leading-normal text-(--muted)">
                          Perks and benefits your learners will receive upon enrolling (max 6
                          items). Click suggestions below or add custom inclusions.
                        </p>

                        {/* Active Inclusions List */}
                        <div className="flex flex-col gap-2.5">
                          {manualIncludesDraft.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] p-5 text-center text-[0.82rem] text-(--muted)">
                              No inclusions added yet. Choose from the suggested perks below or add
                              a custom benefit.
                            </div>
                          ) : (
                            manualIncludesDraft.map((item, index) => (
                              <div
                                key={item.id}
                                draggable={
                                  !isReorderingIncludes &&
                                  !reorderIncludesMutation.isPending &&
                                  !isExtrasSaving &&
                                  !item.isPendingCreation &&
                                  !deletingIncludeIds.has(item.id) &&
                                  !savingIncludeIds.has(item.id) &&
                                  dragEnabledInclusionId === item.id
                                }
                                onDragStart={(e) => handleInclusionDragStart(e, index, item.text)}
                                onDragOver={(e) => handleInclusionDragOver(e, index)}
                                onDragEnd={handleInclusionDragEnd}
                                className={`flex items-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-2.5 px-3.5 transition-all ${
                                  item.isPendingCreation ||
                                  deletingIncludeIds.has(item.id) ||
                                  savingIncludeIds.has(item.id)
                                    ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] opacity-75"
                                    : isReorderingIncludes || isExtrasSaving
                                      ? "opacity-60"
                                      : "shadow-xs hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                                }`}
                              >
                                {item.isPendingCreation ? (
                                  <span
                                    className="flex shrink-0 items-center justify-center rounded-md p-1 text-(--accent)"
                                    title="Adding inclusion..."
                                  >
                                    <CircleNotch
                                      size={18}
                                      className="animate-spin text-(--accent)"
                                    />
                                  </span>
                                ) : (
                                  <span
                                    className={`flex shrink-0 items-center justify-center rounded-md p-1 transition-colors ${
                                      isReorderingIncludes ||
                                      reorderIncludesMutation.isPending ||
                                      isExtrasSaving ||
                                      deletingIncludeIds.has(item.id) ||
                                      savingIncludeIds.has(item.id)
                                        ? "pointer-events-none cursor-not-allowed opacity-30"
                                        : "cursor-grab text-(--muted) select-none hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) active:cursor-grabbing"
                                    }`}
                                    onMouseEnter={() => {
                                      if (
                                        !isReorderingIncludes &&
                                        !reorderIncludesMutation.isPending &&
                                        !isExtrasSaving &&
                                        !deletingIncludeIds.has(item.id) &&
                                        !savingIncludeIds.has(item.id)
                                      ) {
                                        setDragEnabledInclusionId(item.id);
                                      }
                                    }}
                                    onMouseLeave={() => setDragEnabledInclusionId(null)}
                                    title={
                                      isReorderingIncludes
                                        ? "Saving order..."
                                        : deletingIncludeIds.has(item.id)
                                          ? "Deleting..."
                                          : savingIncludeIds.has(item.id)
                                            ? "Saving..."
                                            : "Drag to reorder"
                                    }
                                  >
                                    <DotsSixVertical size={18} />
                                  </span>
                                )}
                                <input
                                  type="text"
                                  disabled={
                                    isReorderingIncludes ||
                                    reorderIncludesMutation.isPending ||
                                    isExtrasSaving ||
                                    item.isPendingCreation ||
                                    deletingIncludeIds.has(item.id) ||
                                    savingIncludeIds.has(item.id)
                                  }
                                  className="min-w-0 flex-1 border-none bg-transparent text-[0.88rem] font-medium text-(--text) outline-none placeholder:text-(--muted) disabled:cursor-not-allowed disabled:opacity-60"
                                  value={item.text}
                                  onFocus={() => setFocusedInclusionId(item.id)}
                                  onBlur={() => {
                                    void handleManualInclusionBlur(item.id);
                                  }}
                                  onChange={(e) =>
                                    handleUpdateManualInclusionText(
                                      item.id,
                                      e.target.value.slice(0, 25),
                                    )
                                  }
                                  placeholder="e.g. Personal guidance"
                                  maxLength={25}
                                />
                                {getExtrasControlDisplayStatus(item.id) ? (
                                  <ExtrasControlStatusIndicator
                                    status={getExtrasControlDisplayStatus(item.id)}
                                    testId={`extras-field-status-inclusion-${item.id}`}
                                  />
                                ) : focusedInclusionId === item.id ? (
                                  <span className="shrink-0 px-1 text-[0.74rem] font-medium text-(--muted) select-none">
                                    {item.text.length} / 25
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={
                                    isReorderingIncludes ||
                                    reorderIncludesMutation.isPending ||
                                    isExtrasSaving ||
                                    item.isPendingCreation ||
                                    deletingIncludeIds.has(item.id) ||
                                    savingIncludeIds.has(item.id)
                                  }
                                  onClick={() => handleDeleteManualInclusion(item.id)}
                                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] bg-transparent p-0 text-(--muted) transition-all hover:!border-red-500/30 hover:!bg-red-500/10 hover:!text-[#ef4444] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-30"
                                  aria-label={
                                    deletingIncludeIds.has(item.id)
                                      ? "Deleting inclusion..."
                                      : "Remove inclusion"
                                  }
                                  title={
                                    deletingIncludeIds.has(item.id)
                                      ? "Deleting..."
                                      : "Remove inclusion"
                                  }
                                >
                                  {deletingIncludeIds.has(item.id) ? (
                                    <CircleNotch size={14} className="animate-spin text-red-500" />
                                  ) : (
                                    <Trash size={15} />
                                  )}
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Suggested quick-add chips */}
                        {manualIncludesDraft.length < 6 && suggestedInclusions.length > 0 && (
                          <div className="mt-1 flex flex-col gap-2">
                            <span className="text-[0.74rem] font-bold tracking-wider text-(--muted) uppercase">
                              Suggested perks (click to add)
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {suggestedInclusions
                                .slice(0, 6 - manualIncludesDraft.length)
                                .map((suggestion) => (
                                  <button
                                    key={suggestion}
                                    type="button"
                                    disabled={
                                      isReorderingIncludes ||
                                      reorderIncludesMutation.isPending ||
                                      isExtrasSaving ||
                                      manualIncludesDraft.length >= 6
                                    }
                                    onClick={() => handleAddManualInclusion(suggestion)}
                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-3 py-1.5 text-[0.78rem] font-semibold text-(--text-secondary) transition-all hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] hover:text-(--text) disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Plus size={13} weight="bold" />
                                    <span>{suggestion}</span>
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Add inclusion button */}
                        <button
                          type="button"
                          disabled={
                            isReorderingIncludes ||
                            reorderIncludesMutation.isPending ||
                            isExtrasSaving ||
                            manualIncludesDraft.length >= 6
                          }
                          onClick={() => handleAddManualInclusion()}
                          className={`mt-1 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-[0.84rem] font-bold transition-all ${
                            manualIncludesDraft.length >= 6 ||
                            isReorderingIncludes ||
                            isExtrasSaving
                              ? "cursor-not-allowed border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) opacity-50"
                              : "cursor-pointer border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] text-(--accent) hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]"
                          }`}
                          title={
                            isReorderingIncludes
                              ? "Saving inclusion order..."
                              : manualIncludesDraft.length >= 6
                                ? "Maximum 6 inclusions reached"
                                : "Add custom inclusion"
                          }
                        >
                          <Plus size={15} weight="bold" />
                          <span>
                            {manualIncludesDraft.length >= 6
                              ? "Maximum 6 inclusions reached"
                              : "Add custom inclusion"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : panelStep === "publish" ? (
                <div className="flex w-full flex-col gap-5">
                  {/* Top 2-Column Grid: 1. Publish settings & 2. Final checklist */}
                  <div className="grid w-full min-w-0 grid-cols-1 items-start gap-5 max-[768px]:gap-3.5 md:grid-cols-2">
                    {/* Card 1: Publish settings */}
                    <div className="flex h-fit flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                      <div className="mb-4.5">
                        <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                          1. Publish settings
                        </h3>
                        <p className="m-0 text-[0.83rem] text-(--muted)">
                          Choose when and how your course becomes visible.
                        </p>
                      </div>

                      {/* Informational Course Status Display */}
                      <div className="mb-4.5 flex flex-col gap-1.5">
                        <label className="text-[0.86rem] font-[650] text-(--text)">
                          Course status
                        </label>
                        <div className="mt-0.5 flex items-center">
                          <span
                            className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.8rem] font-bold tracking-[0.04em] uppercase ${
                              isPublished
                                ? "is-published border border-green-500/35 bg-green-500/12 text-green-500"
                                : "is-draft border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-(--muted)"
                            }`}
                          >
                            {isPublished ? "Published" : "Draft"}
                          </span>
                        </div>
                        <p className="m-0 mt-1 text-[0.78rem] leading-[1.4] text-(--muted)">
                          {isPublished
                            ? "Your course is currently published and visible to students according to your settings."
                            : "Your course is currently a draft and hasn't been published yet."}
                        </p>
                      </div>
                      {/* Course visibility select */}
                      <div className="mb-4.5 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[0.86rem] font-[650] text-(--text)">
                            Course visibility
                          </label>
                          <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-(--muted)">
                            Coming soon
                          </span>
                        </div>
                        <div className="pointer-events-none cursor-not-allowed opacity-60">
                          <ThemedSelect
                            disabled
                            value={publishSettings.visibility}
                            onValueChange={(val) =>
                              setPublishSettings((prev) => ({
                                ...prev,
                                visibility: val as CourseVisibility,
                              }))
                            }
                            options={[
                              [
                                "public",
                                "Public — Anyone on the platform can discover and enroll in this course.",
                              ],
                              [
                                "private",
                                "Private — Only invited students can access this course.",
                              ],
                              [
                                "unlisted",
                                "Unlisted — Only users with a direct link can view this course.",
                              ],
                            ]}
                            ariaLabel="Select course visibility (Coming soon)"
                            triggerClassName="!w-full !h-10 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-(--muted) !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold !cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Publish on radio options */}
                      <div className="mb-4.5 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[0.86rem] font-[650] text-(--text)">
                            Publish on
                          </label>
                          <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-(--muted)">
                            Coming soon
                          </span>
                        </div>

                        <div className="pointer-events-none flex cursor-not-allowed flex-col gap-2.5 opacity-60 select-none">
                          {/* Option 1: Publish immediately */}
                          <div
                            className={`relative flex cursor-not-allowed items-center gap-3.5 rounded-xl border p-3.5 px-4 select-none ${
                              publishSettings.scheduleOption === "now"
                                ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                            }`}
                          >
                            <div
                              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                                publishSettings.scheduleOption === "now"
                                  ? "border-(--accent)"
                                  : "border-(--muted)"
                              }`}
                            >
                              {publishSettings.scheduleOption === "now" && (
                                <div className="h-2 w-2 rounded-full bg-(--accent)" />
                              )}
                            </div>
                            <div className="flex flex-1 flex-col gap-0.75">
                              <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                                Publish immediately
                              </strong>
                              <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                                Make this course live immediately upon saving.
                              </p>
                            </div>
                          </div>

                          {/* Option 2: Schedule for later */}
                          <div
                            className={`relative flex cursor-not-allowed items-center gap-3.5 rounded-xl border p-3.5 px-4 select-none ${
                              publishSettings.scheduleOption === "later"
                                ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                            }`}
                          >
                            <div
                              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                                publishSettings.scheduleOption === "later"
                                  ? "border-(--accent)"
                                  : "border-(--muted)"
                              }`}
                            >
                              {publishSettings.scheduleOption === "later" && (
                                <div className="h-2 w-2 rounded-full bg-(--accent)" />
                              )}
                            </div>
                            <div className="flex flex-1 flex-col gap-0.75">
                              <strong className="text-[0.9rem] leading-4.5 font-[650] text-(--text)">
                                Schedule for a future date
                              </strong>
                              <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                                Set a specific date and time when this course should go live.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Pre-publish Checklist */}
                    <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                      <div className="mb-4.5">
                        <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
                          2. Pre-publish Checklist
                        </h3>
                        <p className="m-0 text-[0.83rem] text-(--muted)">
                          Review all required items before publishing your course.
                        </p>
                      </div>

                      <div className="mb-5 flex flex-col gap-2.5">
                        {validationChecklistItems.map((item) => {
                          const state = getChecklistState(item.area);
                          const sectionErrors = serverValidation?.sections[item.area].errors ?? [];
                          const isInvalid = state === "invalid";
                          const isExpanded = isInvalid && expandedValidationArea === item.area;
                          const errorSummary =
                            sectionErrors.length > 1
                              ? String(sectionErrors.length) + " issues"
                              : sectionErrors[0] || "Needs attention";

                          return (
                            <div key={item.area}>
                              <div
                                className={[
                                  "flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4 py-3 transition-[border-color,background-color] duration-150 ease-out",
                                  isExpanded ? "rounded-t-[10px] rounded-b-none" : "rounded-[10px]",
                                ].join(" ")}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  {state === "validating" ? (
                                    <CircleNotch
                                      size={20}
                                      className="shrink-0 animate-spin text-(--accent)"
                                    />
                                  ) : state === "valid" ? (
                                    <CheckCircle
                                      size={20}
                                      weight="fill"
                                      className="shrink-0 text-green-500"
                                    />
                                  ) : state === "invalid" ? (
                                    <WarningCircle
                                      size={20}
                                      weight="fill"
                                      className="shrink-0 text-rose-400"
                                    />
                                  ) : (
                                    <Info
                                      size={20}
                                      weight="fill"
                                      className="shrink-0 text-(--muted)"
                                    />
                                  )}
                                  <strong className="truncate text-[0.9rem] font-[650] text-(--text)">
                                    {item.label}
                                  </strong>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 text-[0.82rem]">
                                  {state === "validating" ? (
                                    <span className="text-(--accent)">Validating...</span>
                                  ) : state === "idle" ? (
                                    <span className="text-(--muted)">Not checked</span>
                                  ) : state === "valid" ? (
                                    <span className="text-(--muted)">{item.summary}</span>
                                  ) : (
                                    <>
                                      <span className="max-w-[15rem] truncate text-rose-400">
                                        {errorSummary}
                                      </span>
                                      <button
                                        type="button"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
                                        onClick={() =>
                                          setExpandedValidationArea(isExpanded ? null : item.area)
                                        }
                                        aria-expanded={isExpanded}
                                        aria-controls={"validation-errors-" + item.area}
                                        aria-label={
                                          (isExpanded ? "Hide" : "Show") +
                                          " " +
                                          item.label +
                                          " validation errors"
                                        }
                                      >
                                        <CaretRight
                                          size={16}
                                          weight="bold"
                                          className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${isExpanded ? "rotate-90" : "rotate-0"}`}
                                        />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div
                                id={"validation-errors-" + item.area}
                                aria-hidden={!isExpanded}
                                className={[
                                  "grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                                  isExpanded
                                    ? "grid-rows-[1fr] opacity-100"
                                    : "pointer-events-none grid-rows-[0fr] opacity-0",
                                ].join(" ")}
                              >
                                <div className="min-h-0">
                                  <div className="-mt-px rounded-b-[10px] border-x border-b border-[color-mix(in_srgb,#fb7185_24%,transparent)] bg-[color-mix(in_srgb,#fb7185_5%,var(--surface))] px-4 py-3 text-[0.78rem] leading-[1.45] text-(--text-secondary)">
                                    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 marker:text-rose-400">
                                      {sectionErrors.map((message, index) => (
                                        <li key={item.area + "-error-" + index}>{message}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Ready-to-publish State Box */}
                      {isCourseReadyToPublish ? (
                        <div className="flex items-center gap-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-4.5 py-4">
                          <div className="flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-(--accent)">
                            <BookOpen size={24} weight="fill" />
                          </div>
                          <div>
                            <strong className="mb-0.75 block text-[0.94rem] font-bold text-(--text)">
                              Your course is ready to be published!
                            </strong>
                            <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                              Once published, students can see and enroll in this course according
                              to your settings.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4 rounded-xl border border-red-500/30 bg-red-500/8 px-4.5 py-4">
                          <div className="flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-xl bg-red-500/16 text-red-500">
                            <Info size={24} weight="bold" />
                          </div>
                          <div>
                            <strong className="mb-0.75 block text-[0.94rem] font-bold text-(--text)">
                              Course needs attention
                            </strong>
                            <p className="m-0 text-[0.8rem] text-(--muted)">
                              Please fix incomplete sections highlighted above before publishing.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Card 3: What happens after publishing? */}
                  <div className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
                    <h3 className="m-0 mb-4.5 text-[1.05rem] font-bold text-(--text)">
                      3. What happens after publishing?
                    </h3>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                      {/* Feature 1: Visible to students */}
                      <div className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-indigo-500/[0.14] text-indigo-500">
                          <Eye size={22} weight="bold" />
                        </div>
                        <div>
                          <strong className="mb-1 block text-[0.9rem] font-[650] text-(--text)">
                            Visible to students
                          </strong>
                          <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                            Students will be able to discover your course on the platform.
                          </p>
                        </div>
                      </div>

                      {/* Feature 2: Enrollment starts */}
                      <div className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-purple-500/[0.14] text-purple-500">
                          <UserPlus size={22} weight="bold" />
                        </div>
                        <div>
                          <strong className="mb-1 block text-[0.9rem] font-[650] text-(--text)">
                            Enrollment starts
                          </strong>
                          <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                            Students who meet the access rules can enroll in your course.
                          </p>
                        </div>
                      </div>

                      {/* Feature 3: Track performance */}
                      <div className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-blue-500/[0.14] text-blue-500">
                          <PlayCircle size={22} weight="fill" />
                        </div>
                        <div>
                          <strong className="mb-1 block text-[0.9rem] font-[650] text-(--text)">
                            Track performance
                          </strong>
                          <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                            Monitor enrollments, progress, and engagement in real-time.
                          </p>
                        </div>
                      </div>

                      {/* Feature 4: Earn with every sale */}
                      <div className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-pink-500/[0.14] text-pink-500">
                          <ChartBar size={22} weight="bold" />
                        </div>
                        <div>
                          <strong className="mb-1 block text-[0.9rem] font-[650] text-(--text)">
                            Earn with every sale
                          </strong>
                          <p className="m-0 text-[0.8rem] leading-[1.4] text-(--muted)">
                            Get paid for every successful enrollment.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 grid w-full min-w-0 grid-cols-1 items-start gap-6 max-[768px]:gap-4.5 min-[1100px]:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
                  <section className="relative z-10 rounded-[14px] bg-(--surface) p-6 shadow-(--card-shadow) max-[768px]:p-4">
                    <div className="mb-4.5">
                      <h2 className="m-0 text-[1.18rem] font-[650] tracking-[-0.015em] text-(--text)">
                        {WIZARD_STEPS.find((s) => s.id === panelStep)?.label}
                      </h2>
                      <p className="m-0 mt-1 mb-5 text-[0.82rem] text-(--muted)">
                        This section will allow configuring course {panelStep}.
                      </p>
                    </div>
                  </section>
                </div>
              )
            }
          </SwipeableTabPanel>
        </Suspense>
      )}

      {/* Sticky Bottom Action Bar (Desktop / Tablet) */}
      <div
        className="course-wizard-sticky-bottom-bar"
        data-testid="course-wizard-sticky-bottom-bar"
      >
        <div className="relative mx-auto flex w-full max-w-[1400px] items-center justify-between gap-2.5 sm:gap-3">
          {/* Left: Preview Button */}
          <div className="flex shrink-0 items-center gap-2.5">
            {!(activeStep === "publish" && isPublished) && (
              <button
                type="button"
                style={{
                  fontSize: "0.80rem",
                  fontWeight: 700,
                  height: "34px",
                  borderRadius: "8px",
                  gap: "6px",
                  paddingLeft: "14px",
                  paddingRight: "14px",
                }}
                className={`inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-(--text-secondary) transition-all duration-150 ${
                  isAnyApiInProgress || isPreviewLoading
                    ? "!pointer-events-none !cursor-not-allowed !opacity-40 hover:!bg-transparent hover:!text-(--text-secondary)"
                    : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
                }`}
                onClick={handlePreviewAction}
                disabled={isAnyApiInProgress || isPreviewLoading}
              >
                {isPreviewLoading ? (
                  <>
                    <CircleNotch size={14} className="animate-spin text-(--accent)" />
                    <span>Opening...</span>
                  </>
                ) : (
                  <>
                    <Eye size={15} />
                    <span>Preview</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Center: True horizontal center save status */}
          {activeStep === "basics" && basicsOverallStatus && (
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-all duration-200 select-none"
              data-testid="basics-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-3 py-1 text-[0.78rem] font-medium shadow-xs backdrop-blur-xs select-none">
                {basicsOverallStatus === "saving" && (
                  <>
                    <CircleNotch size={14} className="animate-spin text-(--accent)" />
                    <span className="text-(--text-secondary)">Saving changes...</span>
                  </>
                )}
                {basicsOverallStatus === "failed" && (
                  <>
                    <WarningCircle size={14} weight="fill" className="shrink-0 text-rose-500" />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {basicsOverallStatus === "saved" && (
                  <>
                    <CheckCircle size={14} weight="fill" className="shrink-0 text-emerald-500" />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Curriculum */}
          {activeStep === "curriculum" && curriculumOverallStatus && (
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-all duration-200 select-none"
              data-testid="curriculum-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-3 py-1 text-[0.78rem] font-medium shadow-xs backdrop-blur-xs select-none">
                {curriculumOverallStatus === "saving" && (
                  <>
                    <CircleNotch size={14} className="animate-spin text-(--accent)" />
                    <span className="text-(--text-secondary)">Saving changes...</span>
                  </>
                )}
                {curriculumOverallStatus === "failed" && (
                  <>
                    <WarningCircle size={14} weight="fill" className="shrink-0 text-rose-500" />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {curriculumOverallStatus === "saved" && (
                  <>
                    <CheckCircle size={14} weight="fill" className="shrink-0 text-emerald-500" />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Access Rules */}
          {activeStep === "access-rules" && accessRulesOverallStatus && (
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-all duration-200 select-none"
              data-testid="access-rules-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-3 py-1 text-[0.78rem] font-medium shadow-xs backdrop-blur-xs select-none">
                {accessRulesOverallStatus === "saving" && (
                  <>
                    <CircleNotch size={14} className="animate-spin text-(--accent)" />
                    <span className="text-(--text-secondary)">Saving changes...</span>
                  </>
                )}
                {accessRulesOverallStatus === "failed" && (
                  <>
                    <WarningCircle size={14} weight="fill" className="shrink-0 text-rose-500" />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {accessRulesOverallStatus === "saved" && (
                  <>
                    <CheckCircle size={14} weight="fill" className="shrink-0 text-emerald-500" />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Pricing */}
          {activeStep === "pricing" && pricingOverallStatus && (
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-all duration-200 select-none"
              data-testid="pricing-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-3 py-1 text-[0.78rem] font-medium shadow-xs backdrop-blur-xs select-none">
                {pricingOverallStatus === "saving" && (
                  <>
                    <CircleNotch size={14} className="animate-spin text-(--accent)" />
                    <span className="text-(--text-secondary)">Saving changes...</span>
                  </>
                )}
                {pricingOverallStatus === "failed" && (
                  <>
                    <WarningCircle size={14} weight="fill" className="shrink-0 text-rose-500" />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {pricingOverallStatus === "saved" && (
                  <>
                    <CheckCircle size={14} weight="fill" className="shrink-0 text-emerald-500" />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Extras */}
          {activeStep === "extras" && extrasOverallStatus && (
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-all duration-200 select-none"
              data-testid="extras-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-3 py-1 text-[0.78rem] font-medium shadow-xs backdrop-blur-xs select-none">
                {extrasOverallStatus === "saving" && (
                  <>
                    <CircleNotch size={14} className="animate-spin text-(--accent)" />
                    <span className="text-(--text-secondary)">Saving changes...</span>
                  </>
                )}
                {extrasOverallStatus === "failed" && (
                  <>
                    <WarningCircle size={14} weight="fill" className="shrink-0 text-rose-500" />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {extrasOverallStatus === "saved" && (
                  <>
                    <CheckCircle size={14} weight="fill" className="shrink-0 text-emerald-500" />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Publish */}
          {activeStep === "publish" && publishOverallStatus && (
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-all duration-200 select-none"
              data-testid="publish-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-3 py-1 text-[0.78rem] font-medium shadow-xs backdrop-blur-xs select-none">
                {publishOverallStatus === "saving" && (
                  <>
                    <CircleNotch size={14} className="animate-spin text-(--accent)" />
                    <span className="text-(--text-secondary)">Saving changes...</span>
                  </>
                )}
                {publishOverallStatus === "failed" && (
                  <>
                    <WarningCircle size={14} weight="fill" className="shrink-0 text-rose-500" />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {publishOverallStatus === "saved" && (
                  <>
                    <CheckCircle size={14} weight="fill" className="shrink-0 text-emerald-500" />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Right: Previous & Next / Validate / Publish Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
            {/* Previous Button */}
            {!(activeStep === "publish" && isPublished) && (
              <button
                type="button"
                style={{
                  fontSize: "0.80rem",
                  fontWeight: 700,
                  height: "34px",
                  borderRadius: "8px",
                  gap: "6px",
                  paddingLeft: "14px",
                  paddingRight: "14px",
                }}
                className={`inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-(--text-secondary) transition-all duration-150 ${
                  activeStep === "basics" || actionLoading !== null
                    ? "!pointer-events-none !cursor-not-allowed !opacity-40 hover:!bg-transparent hover:!text-(--text-secondary)"
                    : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
                }`}
                onClick={() => {
                  if (previousStepId) void navigateToStep(previousStepId);
                }}
                disabled={activeStep === "basics" || actionLoading !== null}
                aria-label="Previous Step"
              >
                <CaretLeft size={15} />
                <span>Previous</span>
              </button>
            )}

            {/* Next Button / Validate on Publish */}
            {activeStep === "publish" ? (
              <button
                type="button"
                style={{
                  fontSize: "0.80rem",
                  fontWeight: 700,
                  height: "34px",
                  borderRadius: "8px",
                  gap: "6px",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                }}
                className="inline-flex cursor-pointer items-center border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] text-(--accent) transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleValidateCourseAction}
                disabled={actionLoading !== null || isValidating}
              >
                {actionLoading === "validate" || isValidating ? (
                  <>
                    <CircleNotch size={14} className="animate-spin text-(--accent)" />
                    <span>Validating...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={15} weight="bold" />
                    <span>Validate</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                style={{
                  fontSize: "0.80rem",
                  fontWeight: 700,
                  height: "34px",
                  borderRadius: "8px",
                  gap: "6px",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                }}
                className={`inline-flex items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out ${
                  actionLoading !== null || (!isDownstreamUnlocked && activeStep === "basics")
                    ? "!cursor-not-allowed !opacity-40 !shadow-none"
                    : "cursor-pointer hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
                }`}
                onClick={() => {
                  if (nextStepId) void navigateToStep(nextStepId);
                }}
                title={
                  !isDownstreamUnlocked && activeStep === "basics"
                    ? "Add a course title to continue."
                    : undefined
                }
                disabled={
                  actionLoading !== null || (!isDownstreamUnlocked && activeStep === "basics")
                }
                aria-label="Next Step"
              >
                {actionLoading === "save" ? (
                  <>
                    <CircleNotch size={14} className="animate-spin text-white" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Next</span>
                    <CaretRight size={15} weight="bold" />
                  </>
                )}
              </button>
            )}

            {/* Publish CTA Button only when on publish step */}
            {activeStep === "publish" && (
              <>
                {isPublished && (
                  <button
                    type="button"
                    style={{
                      fontSize: "0.80rem",
                      fontWeight: 700,
                      height: "34px",
                      borderRadius: "8px",
                      gap: "6px",
                      paddingLeft: "14px",
                      paddingRight: "14px",
                    }}
                    className="inline-flex cursor-pointer items-center justify-center border border-red-500/30 bg-red-500/10 text-red-400 transition-all duration-150 hover:bg-red-500/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={actionLoading !== null}
                    onClick={() => setIsUnpublishModalOpen(true)}
                    title="Unpublish this course and return it to draft state"
                  >
                    {actionLoading === "unpublish" ? (
                      <>
                        <CircleNotch size={14} className="animate-spin text-red-400" />
                        <span>Unpublishing...</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={15} weight="bold" />
                        <span>Unpublish</span>
                      </>
                    )}
                  </button>
                )}

                {!isPublished && (
                  <button
                    type="button"
                    style={{
                      fontSize: "0.80rem",
                      fontWeight: 700,
                      height: "34px",
                      borderRadius: "8px",
                      gap: "6px",
                      paddingLeft: "18px",
                      paddingRight: "18px",
                    }}
                    className={`inline-flex items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out ${
                      !isCourseReadyToPublish
                        ? "pointer-events-none !cursor-not-allowed !opacity-40 !shadow-none blur-[0.4px] filter select-none"
                        : "cursor-pointer hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
                    }`}
                    disabled={actionLoading !== null || !isCourseReadyToPublish}
                    onClick={handleFinalPublishCourse}
                    title={
                      !isCourseReadyToPublish
                        ? "Please resolve incomplete sections before publishing."
                        : undefined
                    }
                  >
                    {actionLoading === "publish" ? (
                      <>
                        <CircleNotch size={15} className="animate-spin text-white" />
                        <span>Publishing...</span>
                      </>
                    ) : (
                      <>
                        <Lightning size={15} weight="bold" />
                        <span>Publish</span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Basics only, above mobile bar) */}
      {activeStep === "basics" && basicsOverallStatus && (
        <div
          className={`pointer-events-none fixed left-1/2 z-[136] -translate-x-1/2 transition-all duration-200 select-none min-[641px]:hidden ${
            bottomNavHidden
              ? "pointer-events-none translate-y-3 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
          style={{
            bottom: "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="basics-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] px-3 py-1 text-[0.75rem] font-medium shadow-md backdrop-blur-sm">
            {basicsOverallStatus === "saving" && (
              <>
                <CircleNotch size={13} className="animate-spin text-(--accent)" />
                <span className="text-(--text-secondary)">Saving changes...</span>
              </>
            )}
            {basicsOverallStatus === "failed" && (
              <>
                <WarningCircle size={13} weight="fill" className="shrink-0 text-rose-500" />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {basicsOverallStatus === "saved" && (
              <>
                <CheckCircle size={13} weight="fill" className="shrink-0 text-emerald-500" />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Curriculum only, above mobile bar) */}
      {activeStep === "curriculum" && curriculumOverallStatus && (
        <div
          className={`pointer-events-none fixed left-1/2 z-[136] -translate-x-1/2 transition-all duration-200 select-none min-[641px]:hidden ${
            bottomNavHidden
              ? "pointer-events-none translate-y-3 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
          style={{
            bottom: "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="curriculum-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] px-3 py-1 text-[0.75rem] font-medium shadow-md backdrop-blur-sm">
            {curriculumOverallStatus === "saving" && (
              <>
                <CircleNotch size={13} className="animate-spin text-(--accent)" />
                <span className="text-(--text-secondary)">Saving changes...</span>
              </>
            )}
            {curriculumOverallStatus === "failed" && (
              <>
                <WarningCircle size={13} weight="fill" className="shrink-0 text-rose-500" />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {curriculumOverallStatus === "saved" && (
              <>
                <CheckCircle size={13} weight="fill" className="shrink-0 text-emerald-500" />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Access Rules only, above mobile bar) */}
      {activeStep === "access-rules" && accessRulesOverallStatus && (
        <div
          className={`pointer-events-none fixed left-1/2 z-[136] -translate-x-1/2 transition-all duration-200 select-none min-[641px]:hidden ${
            bottomNavHidden
              ? "pointer-events-none translate-y-3 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
          style={{
            bottom: "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="access-rules-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] px-3 py-1 text-[0.75rem] font-medium shadow-md backdrop-blur-sm">
            {accessRulesOverallStatus === "saving" && (
              <>
                <CircleNotch size={13} className="animate-spin text-(--accent)" />
                <span className="text-(--text-secondary)">Saving changes...</span>
              </>
            )}
            {accessRulesOverallStatus === "failed" && (
              <>
                <WarningCircle size={13} weight="fill" className="shrink-0 text-rose-500" />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {accessRulesOverallStatus === "saved" && (
              <>
                <CheckCircle size={13} weight="fill" className="shrink-0 text-emerald-500" />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Pricing only, above mobile bar) */}
      {activeStep === "pricing" && pricingOverallStatus && (
        <div
          className={`pointer-events-none fixed left-1/2 z-[136] -translate-x-1/2 transition-all duration-200 select-none min-[641px]:hidden ${
            bottomNavHidden
              ? "pointer-events-none translate-y-3 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
          style={{
            bottom: "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="pricing-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] px-3 py-1 text-[0.75rem] font-medium shadow-md backdrop-blur-sm">
            {pricingOverallStatus === "saving" && (
              <>
                <CircleNotch size={13} className="animate-spin text-(--accent)" />
                <span className="text-(--text-secondary)">Saving changes...</span>
              </>
            )}
            {pricingOverallStatus === "failed" && (
              <>
                <WarningCircle size={13} weight="fill" className="shrink-0 text-rose-500" />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {pricingOverallStatus === "saved" && (
              <>
                <CheckCircle size={13} weight="fill" className="shrink-0 text-emerald-500" />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Extras only, above mobile bar) */}
      {activeStep === "extras" && extrasOverallStatus && (
        <div
          className={`pointer-events-none fixed left-1/2 z-[136] -translate-x-1/2 transition-all duration-200 select-none min-[641px]:hidden ${
            bottomNavHidden
              ? "pointer-events-none translate-y-3 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
          style={{
            bottom: "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="extras-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] px-3 py-1 text-[0.75rem] font-medium shadow-md backdrop-blur-sm">
            {extrasOverallStatus === "saving" && (
              <>
                <CircleNotch size={13} className="animate-spin text-(--accent)" />
                <span className="text-(--text-secondary)">Saving changes...</span>
              </>
            )}
            {extrasOverallStatus === "failed" && (
              <>
                <WarningCircle size={13} weight="fill" className="shrink-0 text-rose-500" />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {extrasOverallStatus === "saved" && (
              <>
                <CheckCircle size={13} weight="fill" className="shrink-0 text-emerald-500" />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Publish only, above mobile bar) */}
      {activeStep === "publish" && publishOverallStatus && (
        <div
          className={`pointer-events-none fixed left-1/2 z-[136] -translate-x-1/2 transition-all duration-200 select-none min-[641px]:hidden ${
            bottomNavHidden
              ? "pointer-events-none translate-y-3 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
          style={{
            bottom: "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="publish-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] px-3 py-1 text-[0.75rem] font-medium shadow-md backdrop-blur-sm">
            {publishOverallStatus === "saving" && (
              <>
                <CircleNotch size={13} className="animate-spin text-(--accent)" />
                <span className="text-(--text-secondary)">Saving changes...</span>
              </>
            )}
            {publishOverallStatus === "failed" && (
              <>
                <WarningCircle size={13} weight="fill" className="shrink-0 text-rose-500" />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {publishOverallStatus === "saved" && (
              <>
                <CheckCircle size={13} weight="fill" className="shrink-0 text-emerald-500" />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Action Bar */}
      <div
        className={`course-wizard-mobile-action-bar${
          bottomNavHidden ||
          isPreviewModalOpen ||
          isAddCategoryModalOpen ||
          Boolean(categoryToDelete)
            ? "is-scroll-hidden"
            : ""
        }`}
      >
        {/* Preview Button */}
        {!(activeStep === "publish" && isPublished) && (
          <button
            type="button"
            style={{
              fontSize: "0.84rem",
              fontWeight: 500,
              height: "44px",
              borderRadius: "12px",
              gap: "6px",
            }}
            className={`inline-flex flex-1 items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-(--text-secondary) transition-all active:scale-[0.98] ${
              isAnyApiInProgress || isPreviewLoading
                ? "!pointer-events-none !cursor-not-allowed !opacity-40 hover:!bg-transparent hover:!text-(--text-secondary)"
                : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
            }`}
            onClick={handlePreviewAction}
            disabled={isAnyApiInProgress || isPreviewLoading}
          >
            {isPreviewLoading ? (
              <>
                <CircleNotch size={14} className="animate-spin text-(--accent)" />
                <span>Opening...</span>
              </>
            ) : (
              <>
                <Eye size={14} />
                <span>Preview</span>
              </>
            )}
          </button>
        )}

        {/* Previous Button */}
        {!(activeStep === "publish" && isPublished) && (
          <button
            type="button"
            style={{
              fontSize: "0.84rem",
              fontWeight: 500,
              height: "44px",
              borderRadius: "12px",
              gap: "6px",
            }}
            className={`inline-flex flex-1 items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-(--text-secondary) transition-all active:scale-[0.98] ${
              activeStep === "basics" || actionLoading !== null
                ? "!pointer-events-none !cursor-not-allowed !opacity-40 hover:!bg-transparent hover:!text-(--text-secondary)"
                : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
            }`}
            onClick={() => {
              if (previousStepId) void navigateToStep(previousStepId);
            }}
            disabled={activeStep === "basics" || actionLoading !== null}
            aria-label="Previous Step"
          >
            <CaretLeft size={14} />
            <span>Previous</span>
          </button>
        )}

        {/* Next Button / Validate on Publish */}
        {activeStep === "publish" ? (
          <button
            type="button"
            style={{
              fontSize: "0.84rem",
              fontWeight: 500,
              height: "44px",
              borderRadius: "12px",
              gap: "6px",
            }}
            className="inline-flex flex-1 cursor-pointer items-center justify-center border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] text-(--accent) transition-all hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleValidateCourseAction}
            disabled={actionLoading !== null || isValidating}
          >
            {actionLoading === "validate" || isValidating ? (
              <>
                <CircleNotch size={14} className="animate-spin text-(--accent)" />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <CheckCircle size={14} weight="bold" />
                <span>Validate</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            style={{
              fontSize: "0.84rem",
              fontWeight: 600,
              height: "44px",
              borderRadius: "12px",
              gap: "6px",
            }}
            className={`inline-flex flex-1 items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all ${
              actionLoading !== null || (!isDownstreamUnlocked && activeStep === "basics")
                ? "!cursor-not-allowed !opacity-40 !shadow-none"
                : "cursor-pointer hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98]"
            }`}
            onClick={() => {
              if (nextStepId) void navigateToStep(nextStepId);
            }}
            title={
              !isDownstreamUnlocked && activeStep === "basics"
                ? "Add a course title to continue."
                : undefined
            }
            disabled={actionLoading !== null || (!isDownstreamUnlocked && activeStep === "basics")}
            aria-label="Next Step"
          >
            {actionLoading === "save" ? (
              <>
                <CircleNotch size={14} className="animate-spin text-white" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>Next</span>
                <CaretRight size={14} weight="bold" />
              </>
            )}
          </button>
        )}

        {/* Publish CTA Button only when on publish step */}
        {activeStep === "publish" && (
          <>
            {isPublished && (
              <button
                type="button"
                style={{
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  height: "44px",
                  borderRadius: "14px",
                  gap: "6px",
                }}
                className="inline-flex flex-1 cursor-pointer items-center justify-center border border-red-500/35 bg-red-500/10 text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={actionLoading !== null}
                onClick={() => setIsUnpublishModalOpen(true)}
              >
                {actionLoading === "unpublish" ? (
                  <>
                    <CircleNotch size={14} className="animate-spin text-red-400" />
                    <span>Unpublishing...</span>
                  </>
                ) : (
                  <>
                    <XCircle size={15} weight="bold" />
                    <span>Unpublish</span>
                  </>
                )}
              </button>
            )}

            {!isPublished && (
              <button
                type="button"
                style={{
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  height: "44px",
                  borderRadius: "14px",
                  gap: "6px",
                }}
                className={`inline-flex flex-1 items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all ${
                  !isCourseReadyToPublish
                    ? "pointer-events-none !cursor-not-allowed !opacity-40 !shadow-none blur-[0.4px] filter select-none"
                    : "cursor-pointer hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98]"
                }`}
                disabled={actionLoading !== null || !isCourseReadyToPublish}
                onClick={handleFinalPublishCourse}
                title={
                  !isCourseReadyToPublish
                    ? "Please resolve incomplete sections before publishing."
                    : undefined
                }
              >
                {actionLoading === "publish" ? (
                  <>
                    <CircleNotch size={15} className="animate-spin text-white" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Lightning size={15} weight="bold" />
                    <span>Publish</span>
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Floating Action Feedback Toast */}
      {toastMessage && (
        <ToastNotification
          message={toastMessage}
          type="success"
          onDismiss={() => setToastMessage(null)}
        />
      )}
      {/* Reusable Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalState.isOpen}
        title={deleteModalState.title}
        message={deleteModalState.message}
        onConfirm={deleteModalState.onConfirm}
        onClose={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Realistic Student-Facing Course Overview Full Preview Modal */}
      {isPreviewModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-1200 box-border flex animate-[deleteModalFadeIn_0.2s_ease-out] flex-col bg-black/80 p-4 backdrop-blur-xl max-[640px]:p-0"
            onClick={() => setIsPreviewModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Course Overview Preview"
          >
            <div
              className="relative m-auto flex h-full max-h-[94vh] w-full max-w-345 animate-[deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] flex-col overflow-hidden rounded-[20px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--surface)_24%,var(--canvas))] shadow-[0_24px_64px_rgba(0,0,0,0.6)] max-[640px]:h-screen max-[640px]:max-h-screen max-[640px]:rounded-none max-[640px]:border-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Bar */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) px-5 py-3 max-[640px]:px-3.5 max-[640px]:py-2.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 max-[640px]:gap-1.5">
                  <div className="inline-flex items-center gap-2 overflow-hidden text-[0.92rem] font-bold tracking-[-0.01em] text-ellipsis whitespace-nowrap text-(--text) max-[640px]:text-[0.85rem]">
                    <Eye size={18} weight="bold" />
                    <span>Student Course Overview Preview</span>
                  </div>
                  {hasUnsavedChanges ? (
                    <span className="inline-flex shrink-0 items-center gap-1.25 rounded-full border border-[color-mix(in_srgb,#f59e0b_35%,transparent)] bg-[color-mix(in_srgb,#f59e0b_15%,transparent)] px-2.25 py-0.75 text-[0.7rem] font-[650] whitespace-nowrap text-[#d97706] max-[640px]:px-1.75 max-[640px]:py-0.5 max-[640px]:text-[0.66rem] dark:text-[#fbbf24]">
                      <Info size={12} weight="bold" />
                      Last saved version
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1.25 rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_40%,transparent)] px-2.25 py-0.75 text-[0.7rem] font-medium whitespace-nowrap text-(--muted) max-[640px]:px-1.75 max-[640px]:py-0.5 max-[640px]:text-[0.66rem]">
                      <CheckCircle size={12} weight="fill" className="text-(--accent)" />
                      Previewing saved version
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--surface-strong)72%,transparent)] bg-transparent p-0 text-(--muted) transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:text-(--text)"
                  onClick={() => setIsPreviewModalOpen(false)}
                  aria-label="Close Preview"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Informational banner when unsaved changes exist in editor */}
              {hasUnsavedChanges && currentCourseId && (
                <div className="flex shrink-0 items-center gap-2 border-b border-[color-mix(in_srgb,#f59e0b_22%,transparent)] bg-[color-mix(in_srgb,#f59e0b_10%,var(--surface))] px-5 py-2 text-[0.79rem] font-medium text-[#d97706] max-[640px]:px-3.5 max-[640px]:py-1.75 dark:text-[#fbbf24]">
                  <Info size={15} className="shrink-0 text-[#f59e0b]" weight="bold" />
                  <span className="leading-snug">
                    This preview reflects the last saved version on the server. Save your current
                    changes in the editor to update the preview.
                  </span>
                </div>
              )}

              {/* Modal Body: Render authentic CourseOverviewPage */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
                {!currentCourseId ? (
                  <div className="my-auto flex min-h-[420px] flex-1 flex-col items-center justify-center p-8 text-center text-(--muted)">
                    <BookOpen size={44} className="mb-3.5 text-(--accent) opacity-60" />
                    <h3 className="mb-1.5 text-[1.15rem] font-bold text-(--text)">
                      No Saved Course Data
                    </h3>
                    <p className="mb-5 max-w-[420px] text-[0.88rem] leading-[1.45] text-(--muted)">
                      Please save the course before opening Preview.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsPreviewModalOpen(false)}
                      style={{
                        fontSize: "0.80rem",
                        fontWeight: 700,
                        height: "34px",
                        borderRadius: "8px",
                        gap: "6px",
                        paddingLeft: "16px",
                        paddingRight: "16px",
                      }}
                      className="inline-flex cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
                    >
                      <ArrowLeft size={15} weight="bold" />
                      <span>Back to Editor</span>
                    </button>
                  </div>
                ) : activePreviewData ? (
                  <CourseOverviewPage
                    previewData={activePreviewData}
                    categories={serverCategories}
                    isReadOnlyPreview={true}
                    onNavigateCourses={() => setIsPreviewModalOpen(false)}
                  />
                ) : isPreviewLoading ? (
                  <div className="w-full p-6 max-[640px]:p-3">
                    <CourseOverviewSkeleton
                      onNavigateCourses={() => setIsPreviewModalOpen(false)}
                    />
                  </div>
                ) : isPreviewError ? (
                  <div className="my-auto flex min-h-[420px] flex-1 flex-col items-center justify-center p-12 text-center text-(--muted)">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(239,68,68,0.12)] text-[#ef4444]">
                      <X size={20} />
                    </div>
                    <h3 className="mb-1 text-[1.05rem] font-bold text-(--text)">
                      Failed to Load Preview
                    </h3>
                    <p className="mb-4 max-w-[400px] text-[0.86rem] text-(--muted)">
                      An error occurred while fetching the course preview from the server.
                    </p>
                    <button
                      type="button"
                      onClick={() => refetchPreview()}
                      style={{
                        fontSize: "0.80rem",
                        fontWeight: 700,
                        height: "34px",
                        borderRadius: "8px",
                        gap: "6px",
                        paddingLeft: "16px",
                        paddingRight: "16px",
                      }}
                      className="inline-flex cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
                    >
                      <span>Retry</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Manage Categories Modal */}
      {isAddCategoryModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[1200] flex [animation:deleteModalFadeIn_0.18s_ease-out] items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
            onClick={handleCloseAddCategoryModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-category-modal-title"
          >
            <div
              className="relative w-full max-w-[460px] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) p-6 shadow-[0_20px_48px_rgba(0,0,0,0.45)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3
                    id="add-category-modal-title"
                    className="m-0 text-[1.1rem] font-bold tracking-tight text-(--text)"
                  >
                    Manage Categories
                  </h3>
                  <p className="m-0 mt-0.5 text-[0.78rem] text-(--muted)">
                    Create new categories or remove existing ones.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-transparent p-0 text-(--muted) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
                  onClick={handleCloseAddCategoryModal}
                  aria-label="Close modal"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Add New Category Form */}
              <form
                onSubmit={handleCreateCategory}
                className="flex flex-col gap-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="new-category-name-input"
                    className="text-[0.82rem] font-semibold text-(--text-secondary)"
                  >
                    Add New Category <span className="ml-0.5 text-[#ff5252]">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="new-category-name-input"
                      type="text"
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => {
                        setNewCategoryName(e.target.value);
                        if (addCategoryError) setAddCategoryError("");
                      }}
                      placeholder="e.g. Mobile Development"
                      maxLength={100}
                      className="h-10 flex-1 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3 text-[0.88rem] text-(--text) transition-colors placeholder:text-(--muted) focus:border-(--accent) focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                      style={{
                        fontSize: "0.80rem",
                        fontWeight: 700,
                        height: "40px",
                        borderRadius: "9px",
                        gap: "6px",
                        paddingLeft: "16px",
                        paddingRight: "16px",
                      }}
                      className="inline-flex shrink-0 cursor-pointer items-center justify-center border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {createCategoryMutation.isPending ? (
                        <>
                          <CircleNotch size={14} className="animate-spin" />
                          <span>Adding...</span>
                        </>
                      ) : (
                        <>
                          <Plus size={14} weight="bold" />
                          <span>Add</span>
                        </>
                      )}
                    </button>
                  </div>
                  {addCategoryError && (
                    <p className="m-0 text-[0.78rem] font-medium text-[#ff5252]">
                      {addCategoryError}
                    </p>
                  )}
                </div>
              </form>

              {/* Existing Categories List */}
              <div className="pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[0.80rem] font-semibold text-(--text-secondary)">
                    Existing Categories ({serverCategories.length})
                  </span>
                  {isLoadingCategories && (
                    <CircleNotch size={13} className="animate-spin text-(--muted)" />
                  )}
                </div>

                <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto pr-1">
                  {serverCategories.length === 0 ? (
                    <div className="py-6 text-center text-[0.82rem] text-(--muted) italic">
                      No categories found. Add your first category above.
                    </div>
                  ) : (
                    serverCategories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between gap-3 rounded-[8px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-3 py-2 transition-all duration-150 hover:border-[color-mix(in_srgb,var(--text)_16%,transparent)]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Tag size={15} className="shrink-0 text-(--accent)" weight="duotone" />
                          <span className="truncate text-[0.86rem] font-medium text-(--text)">
                            {cat.name}
                          </span>
                          <span className="shrink-0 rounded-[4px] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-1.5 py-0.5 text-[0.72rem] text-(--muted)">
                            {cat.slug}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCategoryToDelete({ id: cat.id, name: cat.name })}
                          disabled={deleteCategoryMutation.isPending}
                          title={`Delete category ${cat.name}`}
                          aria-label={`Delete category ${cat.name}`}
                          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent p-0 text-(--muted) transition-colors duration-150 hover:bg-red-500/10 hover:text-red-500"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mt-2 flex items-center justify-end border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-4">
                <button
                  type="button"
                  onClick={handleCloseAddCategoryModal}
                  style={{
                    fontSize: "0.80rem",
                    fontWeight: 700,
                    height: "34px",
                    borderRadius: "8px",
                    paddingLeft: "16px",
                    paddingRight: "16px",
                  }}
                  className="inline-flex cursor-pointer items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-(--text-secondary) transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Delete Category Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={Boolean(categoryToDelete)}
        title="Delete Category"
        message={`Are you sure you want to delete the category "${categoryToDelete?.name}"? This action will remove it from available course categories.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteCategory}
        onClose={() => setCategoryToDelete(null)}
      />

      {/* Unpublish Course Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={isUnpublishModalOpen}
        title="Unpublish Course"
        message="Are you sure you want to unpublish this course? It will return to Draft state and will no longer be visible to new students in the catalogue. Existing course content, curriculum, and settings will remain fully preserved."
        confirmLabel="Unpublish"
        cancelLabel="Keep Published"
        onConfirm={handleConfirmUnpublishCourse}
        onClose={() => setIsUnpublishModalOpen(false)}
      />
    </div>
  );
}
