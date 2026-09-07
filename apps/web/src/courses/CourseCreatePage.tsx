import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router";
import { createPortal } from "react-dom";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "../learning/discussion-editor/types";
import {
  CourseDescriptionEditor,
  LessonDescriptionEditor,
} from "./CourseDescriptionEditor";
import { useBackDismiss } from "../navigation/useBackDismiss";
import { ToastNotification } from "../ToastNotification";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CaretDown,
  CaretLeft,
  CaretRight,
  Certificate,
  ChartBar,
  ChatCircleText,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  DotsSixVertical,
  DownloadSimple,
  Eye,
  EyeSlash,
  FileText,
  Image as ImageIcon,
  Info,
  Lightning,
  ListBullets,
  LockKey,
  PencilSimple,
  PlayCircle,
  Plus,
  Question,
  Sparkle,
  Tag,
  Trash,
  UploadSimple,
  UserPlus,
  Video,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import ISO6391 from "iso-639-1";
import { ThemedSelect } from "../ThemedSelect";
import { SettingsToggle } from "../settings/SettingsControls";
import type { NavigateTo } from "../routing/navigation";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import {
  getNumberShortcutIndex,
  isEditingShortcutTarget,
} from "../keyboardShortcuts";
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
  useCreateSection,
  useDeleteCategory,
  useDeleteCourseInclude,
  useDeleteLesson,
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
import { useIsMutating } from "@tanstack/react-query";
import type {
  Category,
  CourseEditorDataResponse,
  CourseIncludeItem,
} from "@veolms/contracts";
import {
  CourseOverviewPage,
  CourseOverviewSkeleton,
} from "./CourseOverviewPage";
import type {
  CourseInclude,
  CourseOverviewPricingProps,
} from "./CourseOverviewPage";
import type { Course, CourseLevel, CourseCategory } from "./catalogue";
import type { CourseSection, Lesson } from "../learning/courseContent";

const EMPTY_CATEGORIES: Category[] = [];

export type CourseWizardStepId =
  | "basics"
  | "curriculum"
  | "access-rules"
  | "pricing"
  | "extras"
  | "publish";

type WizardStepIcon = ComponentType<{
  size?: number;
  weight?: "bold" | "duotone" | "fill" | "regular";
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
  { id: "extras", label: "Extras", Icon: Sparkle, tone: "orange" },
  { id: "publish", label: "Publish", Icon: Lightning, tone: "rose" },
];

export const WIZARD_STEP_IDS: readonly CourseWizardStepId[] = WIZARD_STEPS.map(
  ({ id }) => id,
);

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

export const normalizeBasicsState = (
  raw?: Partial<BasicsFormState> | null,
): BasicsFormState => ({
  title: raw?.title ?? "",
  shortDescription: raw?.shortDescription ?? "",
  description: raw?.description ?? "",
  categoryId: raw?.categoryId ?? "",
  difficulty: (raw?.difficulty ?? "") as BasicsFormState["difficulty"],
  language: raw?.language || "en",
  instructorAlias: raw?.instructorAlias ?? "",
  showInstructorName:
    raw?.showInstructorName !== undefined
      ? Boolean(raw.showInstructorName)
      : true,
});

export const isBasicsMetaEqual = (
  a: BasicsFormState,
  b: BasicsFormState,
): boolean => {
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

export const isBasicsSettingsEqual = (
  a: BasicsFormState,
  b: BasicsFormState,
): boolean => {
  const normA = normalizeBasicsState(a);
  const normB = normalizeBasicsState(b);
  return (
    normA.language === normB.language &&
    normA.showInstructorName === normB.showInstructorName
  );
};

export const isBasicsEqual = (
  a: BasicsFormState,
  b: BasicsFormState,
): boolean => {
  return isBasicsMetaEqual(a, b) && isBasicsSettingsEqual(a, b);
};

export type BasicsFieldKey =
  | "title"
  | "shortDescription"
  | "courseDescription"
  | "instructorAlias"
  | "showInstructorName";

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
        <CircleNotch size={12} className="animate-spin text-(--accent) shrink-0" />
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
  | "enableDownloads";

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
        <CircleNotch size={12} className="animate-spin text-(--accent) shrink-0" />
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
  | "pricingType"
  | "currency"
  | "sellingPrice"
  | "originalPrice"
  | "pricingDetails";

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
        <CircleNotch size={12} className="animate-spin text-(--accent) shrink-0" />
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

export type ExtrasControlKey =
  | "enableCertificate"
  | "inclusions"
  | (string & {});

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
        <CircleNotch size={12} className="animate-spin text-(--accent) shrink-0" />
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
        <CircleNotch size={12} className="animate-spin text-(--accent) shrink-0" />
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
        <CircleNotch size={12} className="animate-spin text-(--accent) shrink-0" />
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

export function formatDatetimeLocalToIso(
  localString?: string | null,
): string | null {
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
}

export const initialAccessRulesState: AccessRulesFormState = {
  accessType: "everyone",
  durationMode: "",
  fixedDurationValue: 30,
  fixedDurationUnit: "Days",
  enableQA: true,
  enableComments: true,
  enableDownloads: false,
};

export const normalizeAccessRulesState = (
  raw?: Partial<AccessRulesFormState> | null,
): AccessRulesFormState => ({
  accessType: (raw?.accessType || "everyone") as AccessType,
  durationMode: (raw?.durationMode || "") as AccessDurationMode,
  fixedDurationValue:
    typeof raw?.fixedDurationValue === "number" ? raw.fixedDurationValue : 30,
  fixedDurationUnit: (raw?.fixedDurationUnit || "Days") as DurationUnit,
  enableQA: raw?.enableQA !== undefined ? Boolean(raw.enableQA) : true,
  enableComments:
    raw?.enableComments !== undefined ? Boolean(raw.enableComments) : true,
  enableDownloads:
    raw?.enableDownloads !== undefined ? Boolean(raw.enableDownloads) : false,
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
    normA.enableDownloads === normB.enableDownloads
  );
};

export const isAccessRulesEqual = (
  a: AccessRulesFormState,
  b: AccessRulesFormState,
): boolean => {
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

export const isPricingEqual = (
  a: PricingFormState,
  b: PricingFormState,
): boolean => {
  const normA = normalizePricingState(a);
  const normB = normalizePricingState(b);

  if (normA.pricingType !== normB.pricingType) return false;
  if (normA.currency !== normB.currency) return false;

  if (normA.pricingType === "free") {
    return true;
  }

  return (
    normA.sellingPrice === normB.sellingPrice &&
    normA.originalPrice === normB.originalPrice
  );
};

// Extras State Model & Normalization (server-backed: certificateEnabled)
export interface ExtrasFormState {
  enableCertificate: boolean;
}

export const initialExtrasState: ExtrasFormState = {
  enableCertificate: false,
};

export const normalizeExtrasState = (
  raw?: Partial<ExtrasFormState> | null,
): ExtrasFormState => ({
  enableCertificate: Boolean(raw?.enableCertificate),
});

export const isExtrasEqual = (
  a: ExtrasFormState,
  b: ExtrasFormState,
): boolean => {
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

  const existing = new Set(
    (params.currentDraft || []).map((d) => d.text.trim().toLowerCase()),
  );

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
      contentType: "video" | "document";
      isPublished?: boolean;
      isPreview?: boolean;
      isPendingCreation?: boolean;
      initialState?: {
        title: string;
        description: string;
        contentType: "video" | "document";
        isPublished?: boolean;
        isPreview?: boolean;
      };
    }>;
  }>,
): boolean => {
  const hasEditingSection = sections.some(
    (s) =>
      s.isEditingTitle &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        s.id,
      ),
  );
  if (hasEditingSection) return true;

  return sections.some((sec) =>
    sec.lessons.some((les) => {
      if (les.isPendingCreation) return false;
      const init = les.initialState || {
        title: les.title,
        description: les.description || "",
        contentType: les.contentType,
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
        : [
            "USD",
            "EUR",
            "GBP",
            "INR",
            "AUD",
            "CAD",
            "JPY",
            "CNY",
            "SGD",
            "NZD",
            "CHF",
            "AED",
          ];

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

  const offsetX = Math.min(
    Math.max(e.clientX - rect.left, 24),
    Math.max(rect.width - 24, 24),
  );
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

const sectionGhostHtml = (
  title: string,
  index: number,
  lessonCount: number,
) => `
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
  contentType: "video" | "document",
) => {
  const isVideo = contentType === "video";
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
      <span style="display: inline-flex; min-width: 22px; height: 22px; align-items: center; justify-content: center; border-radius: 4px; background: rgba(128,128,128,0.18); color: var(--muted, #888); font-size: 0.72rem; font-weight: 600;">
        ${index + 1}
      </span>
      <span style="font-weight: 600; font-size: 0.88rem; color: var(--text, #fff);">
        ${escapeHtml(title)}
      </span>
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.74rem;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 6px;
        color: var(--accent-ink, var(--accent, #6366f1));
        background: color-mix(in srgb, var(--accent, #6366f1) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent, #6366f1) 28%, transparent);
      ">
        ${isVideo ? "Video" : "Document"}
      </span>
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

  const price = origNum && origNum > 0 ? origNum : (isNaN(sellNum) ? 0 : sellNum);
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
      contentType: "video" | "document";
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
  editorData?: CourseEditorDataResponse | null;
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
  editorData,
  now = new Date().toISOString(),
}: BuildLocalPreviewParams): CourseEditorDataResponse | null {
  // Preserve course-title/course-ID boundary without "Untitled Course" fallback
  if (!currentCourseId || !courseTitle.trim()) {
    return null;
  }

  const totalSectionsCount = sections.length;
  const totalLessonsCount = sections.reduce(
    (acc, sec) => acc + (sec.lessons?.length ?? 0),
    0,
  );

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
    slug: editorData?.course?.slug || "",
    title: courseTitle.trim(),
    shortDescription: shortDescription.trim() || null,
    description: courseDescription.trim() || null,
    difficulty: difficultyLevel ? difficultyLevel : null,
    status: isPublished ? "published" : (editorData?.course?.status || "draft"),
    creatorId: editorData?.course?.creatorId || null,
    categoryId: categoryId || null,
    thumbnailMediaId: thumbnailMediaId ?? (editorData?.course?.thumbnailMediaId || null),
    trailerMediaId: trailerMediaId ?? (editorData?.course?.trailerMediaId || null),
    instructorAlias: instructorAlias.trim() || null,
    version: courseVersion,
    createdAt: editorData?.course?.createdAt || now,
    updatedAt: editorData?.course?.updatedAt || now,
    publishedAt: editorData?.course?.publishedAt || null,
    totalSections: totalSectionsCount,
    totalLessons: totalLessonsCount,
    totalDurationSeconds: editorData?.course?.totalDurationSeconds || 0,
  };

  const sectionsData: CourseEditorDataResponse["sections"] = sections.map(
    (sec, secIdx) => ({
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
        contentType: les.contentType,
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
    }),
  );

  const accessRulesData: CourseEditorDataResponse["accessRules"] = {
    id: editorData?.accessRules?.id || "preview-access-rules",
    courseId: currentCourseId,
    accessType: (accessRulesDraft.accessType as AccessType) || "everyone",
    durationType: isFixedDuration ? "fixed_duration" : "lifetime",
    durationDays,
  };

  const pricingData: CourseEditorDataResponse["pricing"] = {
    id: editorData?.pricing?.id || "preview-pricing",
    courseId: currentCourseId,
    pricingType: pricingPayload.pricingType,
    price: pricingPayload.price,
    salePrice: pricingPayload.salePrice,
    currency: pricingPayload.currency,
  };

  const settingsData: CourseEditorDataResponse["settings"] = {
    id: editorData?.settings?.id || "preview-settings",
    courseId: currentCourseId,
    allowQa: accessRulesDraft.enableQA,
    allowComments: accessRulesDraft.enableComments,
    allowDownloads: accessRulesDraft.enableDownloads,
    certificateEnabled: enableCertificate,
    showInstructorName: showInstructorName !== false,
    language: language || "en",
    estimatedDuration: editorData?.settings?.estimatedDuration ?? null,
  };

  const includesData: CourseEditorDataResponse["includes"] =
    manualIncludesDraft
      .filter((inc) => Boolean(inc.text.trim()))
      .map((inc, index) => ({
        id: inc.id,
        courseId: currentCourseId,
        text: inc.text.trim(),
        icon: null,
        position: index,
        createdAt:
          editorData?.includes?.find((i) => i.id === inc.id)?.createdAt || now,
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

export function parseWizardTab(
  rawParam: string | null | undefined,
): CourseWizardStepId | null {
  if (!rawParam) return null;
  const normalized = rawParam.toLowerCase().trim();
  if (
    normalized === "access" ||
    normalized === "accessrules" ||
    normalized === "access-rules"
  ) {
    return "access-rules";
  }
  if (WIZARD_STEPS.some((s) => s.id === normalized)) {
    return normalized as CourseWizardStepId;
  }
  return null;
}

export function CourseWizardSkeleton({
  activeStep = "basics",
  isEditing = true,
  onBack,
}: {
  activeStep?: CourseWizardStepId;
  isEditing?: boolean;
  onBack?: () => void;
}) {
  return (
    <div
      className="relative flex w-full flex-col p-0 text-[--text] box-border animate-pulse"
      data-testid="course-wizard-skeleton"
    >
      {/* Wizard Header Skeleton */}
      <header className="relative shrink-0 mb-2 max-[768px]:mb-1.5 max-[768px]:w-full">
        <div className="flex items-start justify-between gap-4 mb-1 max-[768px]:flex-col max-[768px]:gap-2 max-[768px]:mb-1.5">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              className="flex w-9 h-9 shrink-0 items-center justify-center border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg text-(--text-secondary) bg-[color-mix(in_srgb,var(--text)_4%,transparent)] cursor-pointer"
              onClick={onBack}
              aria-label="Go back to courses"
            >
              <ArrowLeft size={17} weight="bold" />
            </button>
            <div className="pt-0.5 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="m-0 text-(--text) text-[clamp(1.2rem,1.8vw,1.55rem)] font-bold tracking-[-0.015em] leading-[1.2]">
                  {isEditing ? "Edit Course" : "Create New Course"}
                </h1>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.72rem] font-medium border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--muted) bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  Draft
                </span>
              </div>
              <p className="m-0 mt-0.5 text-(--muted) text-[0.82rem] max-w-155 leading-[1.35]">
                {activeStep === "curriculum"
                  ? "Manage and organize your course sections, lessons, and resources."
                  : activeStep === "access-rules"
                    ? "Control who can access this course and how long their access lasts."
                    : activeStep === "pricing"
                      ? "Set how learners will purchase this course."
                      : activeStep === "extras"
                        ? "Add extra information and settings to enhance your course."
                        : activeStep === "publish"
                          ? "Review your course checklist and publish when ready."
                          : "Update the essential details of your course."}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Wizard Steps Navigation Bar */}
      <nav
        className="course-wizard-steps-nav settings-tabs page-tabs border-b border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
        aria-label={isEditing ? "Course editing steps" : "Course creation steps"}
      >
        {WIZARD_STEPS.map((step) => {
          const Icon = step.Icon;
          const isActive = activeStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              className={`!border-b-transparent shrink-0 whitespace-nowrap ${
                isActive ? "is-active font-bold text-(--text)" : "opacity-60"
              }`}
              disabled
            >
              <Icon size={18} />
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main step content skeleton matching activeStep */}
      <div className="flex-1 w-full min-w-0">
        {activeStep === "basics" ? (
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)] gap-6 items-start max-[768px]:gap-4.5 w-full min-w-0">
            {/* Left Column: Basic Information Form */}
            <div className="flex flex-col gap-5">
              <section className="relative z-10 rounded-[14px] p-6 bg-(--surface) shadow-(--card-shadow) max-[768px]:p-4">
                <div className="mb-4.5">
                  <h2 className="m-0 text-(--text) text-[1.18rem] font-[650] tracking-[-0.015em]">
                    Basic Information
                  </h2>
                  <p className="m-0 mt-1 mb-5 text-(--muted) text-[0.82rem]">
                    Update the essential details of your course.
                  </p>
                </div>

                {/* Course Title */}
                <div className="flex flex-col gap-2 mb-5">
                  <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                  <div className="h-11 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                </div>

                {/* Short Description */}
                <div className="flex flex-col gap-2 mb-5">
                  <div className="h-4 w-36 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                  <div className="h-18 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                </div>

                {/* Course Description with Rich Text Toolbar */}
                <div className="flex flex-col gap-2 mb-5">
                  <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                  <div className="border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] overflow-hidden bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                    <div className="h-10 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] flex items-center gap-2 px-3">
                      <div className="h-6 w-16 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                    </div>
                    <div className="h-36 w-full p-3.5">
                      <div className="h-4 w-3/4 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)] mb-2.5" />
                      <div className="h-4 w-1/2 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    </div>
                  </div>
                </div>

                {/* 2-Column: Category & Difficulty */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="aspect-video w-full rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] flex flex-col items-center justify-center p-3">
                    <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mb-2" />
                    <div className="h-7 w-20 rounded-md bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
                  </div>
                  <div className="aspect-video w-full rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] flex flex-col items-center justify-center p-3">
                    <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mb-2" />
                    <div className="h-7 w-20 rounded-md bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Live Course Preview */}
            <div className="hidden lg:flex max-lg:hidden flex-col gap-5 sticky top-0 self-start">
              <section className="rounded-[14px] p-5 bg-(--surface) shadow-(--card-shadow)">
                <h2 className="m-0 text-(--text) text-[1.1rem] font-[650]">
                  Course Preview
                </h2>
                <p className="m-0 mt-1 mb-4 text-(--muted) text-[0.8rem]">
                  This is how your course will appear to students.
                </p>

                {/* Aspect-video dashed preview */}
                <div className="aspect-video w-full border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-[10px] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] flex flex-col items-center justify-center gap-2 p-4 mb-4">
                  <div className="w-9 h-9 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center">
                    <div className="w-4 h-4 rounded bg-[color-mix(in_srgb,var(--text)_15%,transparent)]" />
                  </div>
                  <div className="h-3 w-44 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="h-5 w-3/4 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                  <div className="flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-3 text-(--muted) text-[0.8rem]">
                    <div className="h-3.5 w-20 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    <div className="h-3.5 w-20 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    <div className="h-3.5 w-16 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="pt-1 flex flex-col gap-2">
                    <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                    <div className="h-3 w-full rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    <div className="h-3 w-4/5 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : activeStep === "curriculum" ? (
          <div className="flex flex-col gap-4 w-full flex-1 min-h-0">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between mb-2 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3">
              <div>
                <h2 className="m-0 text-(--text) text-[1.25rem] font-bold tracking-[-0.015em]">
                  Course Curriculum
                </h2>
                <p className="m-0 mt-1 text-(--muted) text-[0.85rem]">
                  Organize your course into sections and lessons. You can reorder them anytime.
                </p>
              </div>
              <div className="inline-flex items-center justify-center gap-1.5 h-[34px] px-4 rounded-lg bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-white text-[0.80rem] font-bold max-[768px]:self-start">
                <Plus size={15} weight="bold" />
                <span>Add Section</span>
              </div>
            </div>

            {/* Section 1 Card */}
            <div className="border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] bg-(--surface) shadow-(--card-shadow) overflow-hidden">
              {/* Section Header */}
              <div className="flex items-center justify-between px-[18px] py-3.5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] select-none max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[12px_14px]">
                <div className="flex items-center gap-3 max-[768px]:flex-1 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:gap-2">
                  <DotsSixVertical size={18} className="text-(--muted) opacity-40 shrink-0" />
                  <CaretDown size={16} className="text-(--muted) shrink-0" />
                  <div className="h-4.5 w-40 max-[640px]:w-28 max-[480px]:w-24 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] shrink-0" />
                  <div className="h-4.5 flex-1 max-w-36 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                  <div className="h-5 w-18 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] shrink-0 max-[480px]:hidden" />
                </div>
                <div className="flex items-center gap-1.5 max-[768px]:w-full max-[768px]:justify-end max-[768px]:pt-2 max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>

              {/* Lessons List inside Section 1 */}
              <div className="p-[14px_18px] max-[768px]:p-[12px_14px] flex flex-col gap-2.5">
                {/* Lesson 1 */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-2.5 gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <DotsSixVertical size={16} className="text-(--muted) opacity-40 shrink-0" />
                    <PlayCircle size={20} className="text-(--accent) opacity-60 shrink-0" weight="fill" />
                    <div className="h-4 flex-1 max-w-64 min-w-16 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-4 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="h-6 w-16 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[640px]:hidden" />
                    <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>

                {/* Lesson 2 */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-2.5 gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <DotsSixVertical size={16} className="text-(--muted) opacity-40 shrink-0" />
                    <PlayCircle size={20} className="text-(--accent) opacity-60 shrink-0" weight="fill" />
                    <div className="h-4 flex-1 max-w-48 min-w-16 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-4 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="h-6 w-16 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[640px]:hidden" />
                    <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>

                {/* Lesson 3 */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-2.5 gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <DotsSixVertical size={16} className="text-(--muted) opacity-40 shrink-0" />
                    <PlayCircle size={20} className="text-(--accent) opacity-60 shrink-0" weight="fill" />
                    <div className="h-4 flex-1 max-w-56 min-w-16 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-4 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="h-6 w-16 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[640px]:hidden" />
                    <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>

                {/* Add Lesson action */}
                <div className="mt-1">
                  <div className="inline-flex items-center gap-1.5 text-(--muted) text-[0.82rem] font-semibold">
                    <Plus size={16} />
                    <span>Add Lesson</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2 Card */}
            <div className="border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] bg-(--surface) shadow-(--card-shadow) overflow-hidden">
              <div className="flex items-center justify-between px-[18px] py-3.5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] select-none max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[12px_14px]">
                <div className="flex items-center gap-3 max-[768px]:flex-1 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:gap-2">
                  <DotsSixVertical size={18} className="text-(--muted) opacity-40 shrink-0" />
                  <CaretRight size={16} className="text-(--muted) shrink-0" />
                  <div className="h-4.5 w-40 max-[640px]:w-28 max-[480px]:w-24 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] shrink-0" />
                  <div className="h-4.5 flex-1 max-w-44 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                  <div className="h-5 w-18 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] shrink-0 max-[480px]:hidden" />
                </div>
                <div className="flex items-center gap-1.5 max-[768px]:w-full max-[768px]:justify-end max-[768px]:pt-2 max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "access-rules" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top Grid: 1. Who can access & 2. Access duration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Who can access this course? */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    1. Who can access this course?
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Choose who is allowed to access this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Option: Everyone */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                      <div className="w-2 h-2 rounded-full bg-(--accent)" />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Everyone
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Anyone with access to the platform can access this course.
                      </p>
                    </div>
                  </div>

                  {/* Option: Restricted access */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] opacity-60">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                    <div className="flex flex-1 flex-col gap-0.75">
                      <div className="flex items-center gap-2">
                        <strong className="text-(--text) text-[0.9rem] font-[650] leading-[18px]">
                          Restricted access
                        </strong>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                          Coming soon
                        </span>
                      </div>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Only users who meet the selected requirements can access this course.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Access duration */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    2. Access duration
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Set how long learners can access this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Option 1: Lifetime access */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                      <div className="w-2 h-2 rounded-full bg-(--accent)" />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Lifetime access
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Learners can access this course forever.
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Fixed duration */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Fixed duration
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Set a specific number of days or months learners have access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Additional Settings (Toggles) */}
            <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
              <div className="mb-4.5">
                <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                  3. Additional Settings
                </h3>
                <p className="m-0 text-(--muted) text-[0.83rem]">
                  Configure social and learning features for this course.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5 min-w-0 pr-3">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                      <ChatCircleText size={20} weight="fill" />
                    </div>
                    <div>
                      <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">Comments</strong>
                      <p className="m-0 text-(--muted) text-[0.8rem]">Allow learners to comment on course content.</p>
                    </div>
                  </div>
                  <div className="w-11 h-6 rounded-full bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" />
                </div>

                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5 min-w-0 pr-3">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                      <DownloadSimple size={20} weight="bold" />
                    </div>
                    <div>
                      <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">Downloads</strong>
                      <p className="m-0 text-(--muted) text-[0.8rem]">Allow learners to download lesson resources for offline access.</p>
                    </div>
                  </div>
                  <div className="w-11 h-6 rounded-full bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" />
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "pricing" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Course pricing & 2. Price details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Course pricing */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    1. Course pricing
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Choose how you want to sell this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Radio Option: Free */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Free
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Anyone who can access the course can enroll for free.
                      </p>
                    </div>
                  </div>

                  {/* Radio Option: Paid */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                      <div className="w-2 h-2 rounded-full bg-(--accent)" />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Paid
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Learners must purchase the course to get access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Price details */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    2. Price details
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Set the pricing for your course.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                      Currency <span className="text-[#ff5252] ml-0.5">*</span>
                    </label>
                    <div className="h-11 w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] px-3.5 flex items-center justify-between bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                      <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      <CaretDown size={14} className="text-(--muted)" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="flex flex-col gap-2">
                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Price (INR) <span className="text-[#ff5252] ml-0.5">*</span>
                      </label>
                      <div className="h-11 w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] px-3.5 flex items-center bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                        <div className="h-4 w-16 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Original Price (Optional)
                      </label>
                      <div className="h-11 w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] px-3.5 flex items-center bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                        <div className="h-4 w-16 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Pricing Summary */}
            <div className="border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 bg-(--surface) shadow-(--card-shadow) flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] flex items-center justify-center text-(--accent)">
                  <Tag size={20} weight="bold" />
                </div>
                <div>
                  <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] mb-1" />
                  <div className="h-3 w-48 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>
              <div className="h-7 w-24 rounded-lg bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]" />
            </div>
          </div>
        ) : activeStep === "extras" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Certificates & 2. This course includes */}
            <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Certificates */}
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    1. Certificates
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Configure how certificates will be issued for this course.
                  </p>
                </div>

                {/* Enable Certificate Toggle Row */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] mb-4.5">
                  <div className="flex flex-col min-w-0 pr-3">
                    <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                      Enable certificate
                    </strong>
                    <p className="m-0 text-(--muted) text-[0.8rem]">
                      Issue certificates to learners on course completion.
                    </p>
                  </div>
                  <div className="w-11 h-6 rounded-full bg-[color-mix(in_srgb,var(--text)_18%,transparent)] shrink-0" />
                </div>

                {/* Certificate Configuration Controls */}
                <div className="flex flex-col gap-4.5 opacity-60">
                  {/* Template Selector */}
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Certificate template
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-(--muted) text-[0.78rem]">
                      Choose from pre-designed certificate templates.
                    </p>
                    <div className="h-10 w-full rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5 flex items-center justify-between">
                      <div className="h-4 w-44 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                      <CaretDown size={14} className="text-(--muted)" />
                    </div>
                  </div>

                  {/* Certificate Issuance Options */}
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Certificate issuance
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-(--muted) text-[0.78rem]">
                      Choose when the certificate should be issued.
                    </p>

                    <div className="flex flex-col gap-2.5">
                      {/* Option 1: On course completion */}
                      <div className="relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                        <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                          <div className="w-2 h-2 rounded-full bg-(--accent)" />
                        </div>
                        <div className="flex flex-1 flex-col gap-0.75">
                          <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                            On course completion
                          </strong>
                          <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                            Issue certificate when the learner completes all lessons.
                          </p>
                        </div>
                      </div>

                      {/* Option 2: Minimum completion percentage */}
                      <div className="relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                        <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                        <div className="flex flex-1 flex-col gap-0.75">
                          <div className="flex items-center justify-between w-full">
                            <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                              Minimum completion percentage
                            </strong>
                            <div className="flex items-center gap-1.5">
                              <div className="w-[76px] h-8 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] flex items-center justify-center text-(--muted) text-[0.86rem] font-semibold">
                                95
                              </div>
                              <span className="text-(--text) text-[0.86rem] font-bold">%</span>
                            </div>
                          </div>
                          <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                            Issue certificate when learner reaches the selected percentage.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: This course includes */}
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    2. This course includes
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    These details are calculated from your curriculum.
                  </p>
                </div>

                {/* 3 Metrics Cards */}
                <div className="grid grid-cols-1 min-[1024px]:grid-cols-3 gap-3 mb-6 max-[768px]:gap-2.5">
                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-indigo-500 bg-indigo-500/[0.14]">
                      <BookOpen size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-4 w-6 rounded bg-[color-mix(in_srgb,var(--text)_16%,transparent)]" />
                      <span className="text-(--muted) text-[0.74rem] font-medium">Sections</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-purple-500 bg-purple-500/[0.14]">
                      <PlayCircle size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-4 w-6 rounded bg-[color-mix(in_srgb,var(--text)_16%,transparent)]" />
                      <span className="text-(--muted) text-[0.74rem] font-medium">Lessons</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-blue-500 bg-blue-500/[0.14]">
                      <Clock size={20} weight="bold" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-4 w-8 rounded bg-[color-mix(in_srgb,var(--text)_16%,transparent)]" />
                      <span className="text-(--muted) text-[0.74rem] font-medium">Content length</span>
                    </div>
                  </div>
                </div>

                {/* Course Inclusions Header */}
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="m-0 text-(--text) text-[0.95rem] font-bold">
                      Course inclusions
                    </h4>
                    <span className="inline-flex items-center px-2.5 py-0.75 rounded-full text-[0.72rem] font-bold bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                      3 / 6
                    </span>
                  </div>
                  <p className="m-0 text-(--muted) text-[0.82rem] leading-normal">
                    Perks and benefits your learners will receive upon enrolling (max 6 items). Click suggestions below or add custom inclusions.
                  </p>

                  {/* Inclusion items */}
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 px-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                      <DotsSixVertical size={18} className="text-(--muted) opacity-40 shrink-0" />
                      <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] flex-1" />
                      <div className="w-7 h-7 rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] flex items-center justify-center text-(--muted) opacity-40">
                        <Trash size={14} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 px-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                      <DotsSixVertical size={18} className="text-(--muted) opacity-40 shrink-0" />
                      <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] flex-1" />
                      <div className="w-7 h-7 rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] flex items-center justify-center text-(--muted) opacity-40">
                        <Trash size={14} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 px-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                      <DotsSixVertical size={18} className="text-(--muted) opacity-40 shrink-0" />
                      <div className="h-4 w-36 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] flex-1" />
                      <div className="w-7 h-7 rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] flex items-center justify-center text-(--muted) opacity-40">
                        <Trash size={14} />
                      </div>
                    </div>
                  </div>

                  {/* Suggested perks chips */}
                  <div className="flex flex-col gap-2 mt-2">
                    <span className="text-(--muted) text-[0.74rem] font-bold uppercase tracking-wider">
                      Suggested perks (click to add)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-(--muted) text-[0.8rem] font-medium bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                        <Plus size={13} weight="bold" />
                        <span>Community access</span>
                      </div>
                      <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-(--muted) text-[0.8rem] font-medium bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
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
            <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Publish settings */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    1. Publish settings
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Choose when and how your course becomes visible.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Status row */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-(--text) text-[0.86rem] font-[650]">Course status</label>
                    <div className="flex items-center mt-0.5">
                      <span className="inline-flex items-center rounded-md px-2.5 py-1 text-[0.8rem] font-bold uppercase tracking-[0.04em] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--muted) bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                        Draft
                      </span>
                    </div>
                  </div>

                  {/* Visibility */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-(--text) text-[0.86rem] font-[650]">Course visibility</label>
                    <div className="h-10 w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3.5 flex items-center justify-between bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                      <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      <CaretDown size={14} className="text-(--muted)" />
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="flex flex-col gap-2">
                    <label className="text-(--text) text-[0.86rem] font-[650]">Publish on</label>
                    <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] rounded-xl p-3 px-4 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                      <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                        <div className="w-2 h-2 rounded-full bg-(--accent)" />
                      </div>
                      <strong className="text-(--text) text-[0.88rem] font-[650]">Publish immediately</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Pre-publish Checklist */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    2. Pre-publish Checklist
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Review all required items before publishing your course.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  {/* Step Checklist Items */}
                  {["Basics", "Curriculum", "Access Rules", "Pricing", "Extras"].map((stepTitle) => (
                    <div
                      key={stepTitle}
                      className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle size={20} weight="fill" className="text-green-500 opacity-80" />
                        <strong className="text-(--text) text-[0.9rem] font-[650]">{stepTitle}</strong>
                      </div>
                      <div className="flex items-center gap-2 text-(--muted) text-[0.82rem]">
                        <span>Ready</span>
                        <CaretRight size={16} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Readiness banner */}
            <div className="border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 bg-(--surface) shadow-(--card-shadow) flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] flex items-center justify-center text-(--accent)">
                  <Lightning size={22} weight="fill" />
                </div>
                <div>
                  <div className="h-4.5 w-48 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] mb-1" />
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
  const searchParams = useMemo(
    () => new URLSearchParams(location?.search ?? ""),
    [location?.search],
  );
  const activeEditId =
    propCourseId ||
    propEditCourseId ||
    searchParams.get("edit") ||
    searchParams.get("courseId") ||
    null;

  const initialStep =
    activeEditId
      ? parseWizardTab(searchParams.get("tab")) ||
        parseWizardTab(searchParams.get("step")) ||
        "basics"
      : "basics";
  const [activeStep, setActiveStep] =
    useState<CourseWizardStepId>(initialStep);

  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const stepsNavRef = useRef<HTMLElement | null>(null);
  const navigateToStepRef = useRef<
    (destination: CourseWizardStepId) => Promise<void>
  >((async () => {}) as any);
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
        const indicatorToken = style
          .getPropertyValue("--page-tab-active-indicator")
          .trim();
        const toneToken = style.getPropertyValue("--page-tab-tone").trim();
        const color =
          indicatorToken.includes("--page-tab-tone") ||
          indicatorToken === "var(--page-tab-tone)"
            ? toneToken
            : indicatorToken || "var(--accent)";

        nav.style.setProperty(
          "--page-tab-indicator-left",
          `${activeEl.offsetLeft}px`,
        );
        nav.style.setProperty(
          "--page-tab-indicator-width",
          `${activeEl.offsetWidth}px`,
        );
        nav.style.setProperty("--page-tab-indicator-color", color);

        const navWidth = nav.offsetWidth;
        const elLeft = activeEl.offsetLeft;
        const elWidth = activeEl.offsetWidth;
        if (
          elLeft < nav.scrollLeft ||
          elLeft + elWidth > nav.scrollLeft + navWidth
        ) {
          nav.scrollTo({
            left: elLeft - navWidth / 2 + elWidth / 2,
            behavior: "smooth",
          });
        }
      }
    };
    updateIndicator();
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
      window.removeEventListener("resize", updateIndicator);
      observer.disconnect();
    };
  }, [activeStep]);

  useEffect(() => {
    const navigateWizardTab = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !event.altKey ||
        isEditingShortcutTarget(event.target)
      )
        return;
      const index = getNumberShortcutIndex(event);
      if (index === null) return;
      const destination = WIZARD_STEPS[index];
      if (!destination) return;
      event.preventDefault();
      void navigateToStepRef.current(destination.id);
    };

    document.addEventListener("keydown", navigateWizardTab);
    return () => document.removeEventListener("keydown", navigateWizardTab);
  }, []);

  // Synchronize URL search params with active wizard tab
  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentUrl = new URL(window.location.href);
    const currentTabInUrl = currentUrl.searchParams.get("tab");
    if (currentTabInUrl !== activeStep) {
      if (
        activeStep === "basics" &&
        !currentTabInUrl &&
        !currentUrl.searchParams.has("step")
      ) {
        return;
      }
      currentUrl.searchParams.set("tab", activeStep);
      currentUrl.searchParams.delete("step");
      window.history.replaceState(null, "", currentUrl.toString());
    }
  }, [activeStep]);

  // Basics server-confirmed baseline and local draft states
  const [serverBasics, setServerBasics] =
    useState<BasicsFormState>(initialBasicsState);
  const [basicsDraft, setBasicsDraft] =
    useState<BasicsFormState>(initialBasicsState);

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

  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);

  const [videoTrailer, setVideoTrailer] = useState<string | null>(null);
  const videoTrailerInputRef = useRef<HTMLInputElement | null>(null);

  const handleThumbnailFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setThumbnail(imageUrl);
    }
  };

  const triggerThumbnailUpload = () => {
    thumbnailInputRef.current?.click();
  };

  const handleRemoveThumbnail = (e: React.MouseEvent) => {
    e.stopPropagation();
    setThumbnail(null);
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }
  };

  const handleVideoTrailerFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const videoUrl = URL.createObjectURL(file);
      setVideoTrailer(videoUrl);
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

  const [currentCourseId, setCurrentCourseId] = useState<string | null>(
    activeEditId,
  );
  const [courseVersion, setCourseVersion] = useState<number>(1);
  const courseVersionRef = useRef<number>(courseVersion);
  courseVersionRef.current = courseVersion;

  // Immediate persistence states for Basics interactive controls
  const [savingBasicsControls, setSavingBasicsControls] = useState<Set<string>>(
    () => new Set(),
  );
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
  const titleCreationDebounceTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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
  const basicsSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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
      (!currentCourseId &&
        fieldKey === "title" &&
        createCourseMutation.isPending)
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
  // Downstream tabs and fields are unlocked ONLY after a confirmed server-side
  // course ID exists. A non-empty title alone (isCourseTitleFilled) is NOT
  // sufficient — allowing that caused tabs to become clickable before creation
  // completed, which let concurrent callers each fire their own POST /courses.
  const isDownstreamUnlocked = Boolean(currentCourseId);

  const currentCourseIdRef = useRef<string | null>(currentCourseId);
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
      parseWizardTab(searchParams.get("tab")) ||
      parseWizardTab(searchParams.get("step"));
    if (
      tabFromUrl &&
      tabFromUrl !== activeStep &&
      (isDownstreamUnlocked || Boolean(activeEditId) || tabFromUrl === "basics")
    ) {
      setActiveStep(tabFromUrl);
    }
  }, [searchParams, isDownstreamUnlocked, activeEditId, activeStep]);

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
  const isInitialLoadingCourse =
    isEditing && (isLoadingEditor || isFetchingEditor) && !editorData;
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
  const updateLessonMutation = useUpdateLesson();
  const deleteLessonMutation = useDeleteLesson();
  const reorderLessonsMutation = useReorderLessons();
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [creatingLessonSectionId, setCreatingLessonSectionId] = useState<
    string | null
  >(null);
  const [savingLessonId, setSavingLessonId] = useState<string | null>(null);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [reorderingLessonsSectionId, setReorderingLessonsSectionId] = useState<
    string | null
  >(null);
  const [isReorderingSections, setIsReorderingSections] =
    useState<boolean>(false);
  const [isReorderingIncludes, setIsReorderingIncludes] =
    useState<boolean>(false);
  const [updatingSectionId, setUpdatingSectionId] = useState<string | null>(
    null,
  );
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(
    null,
  );
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
    !currentCourseId &&
    (createCourseMutation.isPending ||
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
    basicsSaveFailed ||
    Object.values(basicsFieldStatus).some((status) => status === "failed");

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
    if (createCategoryMutation.isPending || deleteCategoryMutation.isPending)
      return;
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
    const options: Array<
      readonly [string, string, { searchKeywords?: string }?]
    > = [["", "Select language"]];
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
  interface LessonResourceItem {
    id: string;
    name: string;
    type: "PDF" | "TXT" | "DOC" | "DOCX" | "ZIP" | "PNG" | "MP4";
    size: string;
    mediaAssetId?: string;
  }

  interface LessonSnapshot {
    title: string;
    description: string;
    contentType: "video" | "document";
    isPublished?: boolean;
    isPreview?: boolean;
  }

  interface CurriculumLessonItem {
    id: string;
    title: string;
    description: string;
    contentType: "video" | "document";
    isExpanded: boolean;
    isPublished?: boolean;
    isPreview?: boolean;
    isPendingCreation?: boolean;
    initialState?: LessonSnapshot;
    resources: LessonResourceItem[];
  }

  interface CurriculumSectionItem {
    id: string;
    title: string;
    isExpanded: boolean;
    isEditingTitle?: boolean;
    isPendingCreation?: boolean;
    lessons: CurriculumLessonItem[];
  }

  const getLessonInitialState = (les: CurriculumLessonItem): LessonSnapshot => {
    return (
      les.initialState || {
        title: les.title,
        description: les.description || "",
        contentType: les.contentType,
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
      isPub !== initPub ||
      isPrev !== initPrev
    );
  };

  // Curriculum Step state
  const [sections, setSections] = useState<CurriculumSectionItem[]>([]);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const isCollapsingSectionRef = useRef(false);
  const inFlightLessonSavesRef = useRef<Map<string, Promise<boolean>>>(
    new Map(),
  );
  const isSavingAllDirtyLessonsRef = useRef(false);
  const isCurriculumDirty = useMemo(
    () => checkIsCurriculumDirty(sections),
    [sections],
  );
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
  const curriculumItemTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const [curriculumSaveFailed, setCurriculumSaveFailed] = useState(false);
  const [showCurriculumSavedBriefly, setShowCurriculumSavedBriefly] =
    useState(false);
  const curriculumSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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

  const getCurriculumItemDisplayStatus = (
    itemId: string,
  ): "saving" | "saved" | "failed" | null => {
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
    sections.some(
      (s) => s.isPendingCreation || s.lessons.some((l) => l.isPendingCreation),
    );

  const hasCurriculumItemFailed =
    curriculumSaveFailed ||
    Object.values(curriculumItemStatus).some((status) => status === "failed");

  const curriculumOverallStatus = useMemo(
    (): "saving" | "failed" | "saved" | null => {
      if (isAnyCurriculumSaving) return "saving";
      if (hasCurriculumItemFailed) return "failed";
      if (showCurriculumSavedBriefly) return "saved";
      return null;
    },
    [isAnyCurriculumSaving, hasCurriculumItemFailed, showCurriculumSavedBriefly],
  );

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

  const needsAccessRulesSave =
    isAccessRulesDirty && Boolean(accessRulesDraft.durationMode);
  const accessRules = accessRulesDraft;
  const setAccessRules = setAccessRulesDraft;

  // Immediate persistence states for Access Rules interactive controls
  const [savingAccessControls, setSavingAccessControls] = useState<Set<string>>(
    () => new Set(),
  );
  const savingAccessControlsRef = useRef<Set<string>>(new Set());
  const accessControlVersionsRef = useRef<{
    accessType: number;
    durationMode: number;
    fixedDuration: number;
    enableQA: number;
    enableComments: number;
    enableDownloads: number;
  }>({
    accessType: 0,
    durationMode: 0,
    fixedDuration: 0,
    enableQA: 0,
    enableComments: 0,
    enableDownloads: 0,
  });
  const inFlightAccessControlsRef = useRef<Record<string, number>>({
    accessType: 0,
    durationMode: 0,
    fixedDuration: 0,
    enableQA: 0,
    enableComments: 0,
    enableDownloads: 0,
  });
  const fixedDurationDebounceTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
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
  const [showAccessRulesSavedBriefly, setShowAccessRulesSavedBriefly] =
    useState(false);
  const accessRulesSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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
    (inFlightAccessControlsRef.current.enableDownloads ?? 0) > 0;

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
  const [serverPricing, setServerPricing] =
    useState<PricingFormState>(initialPricingState);
  const serverPricingRef = useRef(serverPricing);
  serverPricingRef.current = serverPricing;

  const [pricingDraft, setPricingDraft] =
    useState<PricingFormState>(initialPricingState);
  const pricingDraftRef = useRef(pricingDraft);
  pricingDraftRef.current = pricingDraft;

  const isPricingDirty = useMemo(
    () => !isPricingEqual(pricingDraft, serverPricing),
    [pricingDraft, serverPricing],
  );
  const isPricingDirtyRef = useRef(isPricingDirty);
  isPricingDirtyRef.current = isPricingDirty;

  const pricing = pricingDraft;
  const [pricingValidationError, setPricingValidationError] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!pricingValidationError) return;
    const timer = setTimeout(() => {
      setPricingValidationError(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [pricingValidationError]);

  // Immediate persistence states for Pricing interactive controls
  const [savingPricingControls, setSavingPricingControls] = useState<Set<string>>(
    () => new Set(),
  );
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
  const pricingDebounceTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
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

  const lastEditedPricingFieldRef = useRef<
    "sellingPrice" | "originalPrice" | null
  >(null);

  const [pricingControlStatus, setPricingControlStatus] = useState<
    Partial<Record<PricingControlKey, "saved" | "failed" | null>>
  >({});
  const pricingControlTimersRef = useRef<
    Partial<Record<PricingControlKey, ReturnType<typeof setTimeout>>>
  >({});
  const [pricingSaveFailed, setPricingSaveFailed] = useState(false);
  const [showPricingSavedBriefly, setShowPricingSavedBriefly] = useState(false);
  const pricingSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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
        (lastEditedPricingFieldRef.current === controlKey ||
          !lastEditedPricingFieldRef.current)
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
    pricingSaveFailed ||
    Object.values(pricingControlStatus).some((status) => status === "failed");

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

  // Course Overview Live Full Preview Modal State
  const [isUnpublishModalOpen, setIsUnpublishModalOpen] =
    useState<boolean>(false);

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

  const [publishValidationError, setPublishValidationError] = useState<
    string | null
  >(null);

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
  const publishControlTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const [publishSaveFailed, setPublishSaveFailed] = useState(false);
  const [showPublishSavedBriefly, setShowPublishSavedBriefly] = useState(false);
  const publishSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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
    isSavingPublish ||
    Object.values(publishControlStatus).some((status) => status === "saving");

  const hasPublishControlFailed =
    publishSaveFailed ||
    Object.values(publishControlStatus).some((status) => status === "failed");

  const publishOverallStatus = useMemo(
    (): "saving" | "failed" | "saved" | null => {
      if (isAnyPublishSaving) return "saving";
      if (hasPublishControlFailed) return "failed";
      if (showPublishSavedBriefly) return "saved";
      return null;
    },
    [isAnyPublishSaving, hasPublishControlFailed, showPublishSavedBriefly],
  );

  // Extras Step server-confirmed and draft states
  const [serverExtras, setServerExtras] =
    useState<ExtrasFormState>(initialExtrasState);
  const [serverIncludes, setServerIncludes] = useState<CourseIncludeItem[]>([]);
  const [manualIncludesDraft, setManualIncludesDraft] = useState<
    Array<{ id: string; text: string; isPendingCreation?: boolean }>
  >([]);
  const manualIncludesDraftRef = useRef(manualIncludesDraft);
  manualIncludesDraftRef.current = manualIncludesDraft;
  const dragInitialIncludesStateRef = useRef<{
    includeIds: string[];
    previousIncludes: Array<{ id: string; text: string; isPendingCreation?: boolean }>;
  } | null>(null);
  const deletingIncludeIdsRef = useRef<Set<string>>(new Set());
  const [deletingIncludeIds, setDeletingIncludeIds] = useState<Set<string>>(
    new Set(),
  );
  const savingIncludeIdsRef = useRef<Set<string>>(new Set());
  const [savingIncludeIds, setSavingIncludeIds] = useState<Set<string>>(
    new Set(),
  );
  const [isSavingCertificate, setIsSavingCertificate] = useState(false);
  const isSavingCertificateRef = useRef(false);

  const [extrasControlStatus, setExtrasControlStatus] = useState<
    Record<string, "saved" | "failed" | null>
  >({});
  const extrasControlTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const [extrasSaveFailed, setExtrasSaveFailed] = useState(false);
  const [showExtrasSavedBriefly, setShowExtrasSavedBriefly] = useState(false);
  const extrasSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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
    extrasSaveFailed ||
    Object.values(extrasControlStatus).some((status) => status === "failed");

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
    const hasPreviewLessons = sections.some((s) =>
      s.lessons.some((l) => l.isPreview),
    );
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
      !isExtrasEqual(
        { enableCertificate: extras.enableCertificate },
        serverExtras,
      ) || isManualIncludesDirty,
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
    isBasicsDirty ||
    isCurriculumDirty ||
    needsAccessRulesSave ||
    isPricingDirty ||
    isExtrasDirty;

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

      const isBasicsSavingActive =
        savingBasicsControlsRef.current.size > 0 ||
        Boolean(inFlightBasicsPromiseRef.current);
      if (!isBasicsDirtyRef.current && !isBasicsSavingActive) {
        setBasicsDraft(confirmedBasics);
        basicsDraftRef.current = confirmedBasics;
      }
      setIsPublished(c.status === "published");

      const hasAccessRules = Boolean(
        editorData.accessRules && editorData.accessRules.id,
      );
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

      const confirmedAccessRules: AccessRulesFormState =
        normalizeAccessRulesState({
          accessType: (ar?.accessType as AccessType) || "everyone",
          durationMode: hasAccessRules
            ? isFixed
              ? "fixed"
              : "lifetime"
            : "",
          fixedDurationValue: fixedVal,
          fixedDurationUnit: fixedUnit,
          enableQA:
            s?.allowQa !== undefined
              ? Boolean(s.allowQa)
              : initialAccessRulesState.enableQA,
          enableComments:
            s?.allowComments !== undefined
              ? Boolean(s.allowComments)
              : initialAccessRulesState.enableComments,
          enableDownloads:
            s?.allowDownloads !== undefined
              ? Boolean(s.allowDownloads)
              : initialAccessRulesState.enableDownloads,
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
        enableQA: isAccessControlSaving("enableQA")
          ? prev.enableQA
          : confirmedAccessRules.enableQA,
        enableComments: isAccessControlSaving("enableComments")
          ? prev.enableComments
          : confirmedAccessRules.enableComments,
        enableDownloads: isAccessControlSaving("enableDownloads")
          ? prev.enableDownloads
          : confirmedAccessRules.enableDownloads,
      }));

      if (
        !isAccessRulesDirtyRef.current &&
        savingAccessControlsRef.current.size === 0
      ) {
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
            const uniquePending = pendingItems.filter(
              (p) => !serverIds.has(p.id),
            );
            return [...serverItems, ...uniquePending];
          });
        }
      } else {
        setServerIncludes([]);
        if (!isExtrasDirtyRef.current) {
          setManualIncludesDraft((prev) =>
            prev.filter((p) => p.isPendingCreation),
          );
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
        if (
          !isPricingDirtyRef.current &&
          savingPricingControlsRef.current.size === 0
        ) {
          setPricingDraft(confirmedPricing);
          pricingDraftRef.current = confirmedPricing;
        }
      }
      if (editorData.sections && editorData.sections.length > 0) {
        setSections((prev) => {
          const prevMap = new Map(prev.map((s) => [s.id, s]));
          const mappedServerSections = editorData.sections.map(
            (sec, secIdx) => {
              const existing = prevMap.get(sec.id);
              const serverLessonIds = new Set(
                (sec.lessons || []).map((l) => l.id),
              );
              const serverLessons = (sec.lessons || []).map((les) => {
                const existingLesson = existing?.lessons.find(
                  (l) => l.id === les.id,
                );
                const isDirty = existingLesson
                  ? isLessonDirty(existingLesson)
                  : false;
                const title =
                  isDirty && existingLesson ? existingLesson.title : les.title;
                const description =
                  isDirty && existingLesson
                    ? existingLesson.description || ""
                    : les.description || "";
                const contentType =
                  isDirty && existingLesson
                    ? existingLesson.contentType
                    : les.contentType;
                const isPub =
                  isDirty && existingLesson
                    ? existingLesson.isPublished !== undefined
                      ? existingLesson.isPublished
                      : true
                    : les.isPublished !== undefined
                      ? les.isPublished
                      : true;
                const isPrev =
                  isDirty && existingLesson
                    ? existingLesson.isPreview !== undefined
                      ? existingLesson.isPreview
                      : false
                    : les.isPreview !== undefined
                      ? les.isPreview
                      : false;
                const desc = les.description || "";
                return {
                  id: les.id,
                  title,
                  description,
                  contentType,
                  isExpanded: existingLesson
                    ? existingLesson.isExpanded
                    : false,
                  isPublished: isPub,
                  isPreview: isPrev,
                  initialState: existingLesson?.initialState || {
                    title: les.title,
                    description: desc,
                    contentType: les.contentType,
                    isPublished: isPub,
                    isPreview: isPrev,
                  },
                  resources: (les.resources || []).map((res) => ({
                    id: res.id,
                    name: res.title || "Resource",
                    type: "PDF" as const,
                    size: "1.0 MB",
                  })),
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
            },
          );

          // Preserve any pending optimistic sections that are still being created
          const serverSectionIds = new Set(
            editorData.sections.map((s) => s.id),
          );
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
  const [draggedInclusionIndex, setDraggedInclusionIndex] = useState<
    number | null
  >(null);
  const [dragEnabledInclusionId, setDragEnabledInclusionId] = useState<
    string | null
  >(null);
  const [focusedInclusionId, setFocusedInclusionId] = useState<string | null>(
    null,
  );

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
      setManualIncludesDraft((prev) =>
        prev.filter((item) => item.id !== tempId),
      );
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
      setManualIncludesDraft((prev) =>
        prev.filter((item) => item.id !== tempId),
      );
      markExtrasControlFailed("inclusions");
      const errorMsg =
        (err as { message?: string })?.message || "Failed to add inclusion.";
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

    if (
      savingIncludeIdsRef.current.has(id) ||
      deletingIncludeIdsRef.current.has(id)
    ) {
      return;
    }

    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        prev.map((item) =>
          item.id === id ? { ...item, text: serverItem.text } : item,
        ),
      );
      return;
    }

    // Clean blur: if trimmed matches server baseline, nothing to persist
    if (trimmed === serverItem.text.trim()) {
      if (trimmed !== currentItem.text) {
        setManualIncludesDraft((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, text: trimmed } : item,
          ),
        );
      }
      return;
    }

    // Normalize draft to trimmed before persisting
    setManualIncludesDraft((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, text: trimmed } : item,
      ),
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
      setServerIncludes((prev) =>
        prev.map((s) => (s.id === id ? updated : s)),
      );
      markExtrasControlSaved(id);
      markExtrasControlSaved("inclusions");
    } catch (err: unknown) {
      markExtrasControlFailed(id);
      markExtrasControlFailed("inclusions");
      // Revert on failure to the last confirmed server value
      setManualIncludesDraft((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, text: serverItem.text } : item,
        ),
      );
      const errorMsg =
        (err as { message?: string })?.message || "Failed to update inclusion.";
      setToastMessage(errorMsg);
    } finally {
      savingIncludeIdsRef.current.delete(id);
      setSavingIncludeIds(new Set(savingIncludeIdsRef.current));
    }
  };

  const handleDeleteManualInclusion = async (id: string) => {
    if (deletingIncludeIdsRef.current.has(id)) return;

    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      const errorMsg =
        (err as { message?: string })?.message || "Failed to delete inclusion.";
      setToastMessage(errorMsg);
    } finally {
      deletingIncludeIdsRef.current.delete(id);
      setDeletingIncludeIds(new Set(deletingIncludeIdsRef.current));
    }
  };

  const handleInclusionDragStart = (
    e: React.DragEvent,
    index: number,
    text: string,
  ) => {
    if (
      isReorderingIncludes ||
      reorderIncludesMutation.isPending ||
      isExtrasSaving
    ) {
      e.preventDefault();
      return;
    }
    dragInitialIncludesStateRef.current = {
      includeIds: manualIncludesDraftRef.current.map((i) => i.id),
      previousIncludes: structuredClone(manualIncludesDraftRef.current),
    };
    setDraggedInclusionIndex(index);
    setCustomDragImage(
      e,
      e.currentTarget as HTMLElement,
      inclusionGhostHtml(text),
    );
  };

  const handleInclusionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInclusionIndex === null || draggedInclusionIndex === index)
      return;
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
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
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
        (err as { message?: string })?.message ||
        "Failed to update certificate setting.";
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
        const val = Math.max(
          1,
          accessRulesDraftRef.current.fixedDurationValue || 1,
        );
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
            accessRulesDraftRef.current.durationMode === "fixed"
              ? "fixed_duration"
              : "lifetime",
          durationDays:
            accessRulesDraftRef.current.durationMode === "fixed"
              ? durationDays
              : null,
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
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to update access type.";
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
        const val = Math.max(
          1,
          accessRulesDraftRef.current.fixedDurationValue || 1,
        );
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
                fixedDurationValue:
                  accessRulesDraftRef.current.fixedDurationValue,
                fixedDurationUnit:
                  accessRulesDraftRef.current.fixedDurationUnit,
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
          (err as { message?: string })?.message ||
          "Failed to update access duration.";
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

  const persistFixedDuration = async (
    explicitVal?: number,
    explicitUnit?: DurationUnit,
  ) => {
    const currentDraft = accessRulesDraftRef.current;
    if (currentDraft.durationMode !== "fixed") return;

    clearAccessControlStatus("fixedDuration");
    const val = Math.max(
      1,
      explicitVal !== undefined
        ? explicitVal
        : currentDraft.fixedDurationValue || 1,
    );
    const unit =
      explicitUnit !== undefined
        ? explicitUnit
        : currentDraft.fixedDurationUnit || "Days";

    const unitMultiplier =
      unit === "Years"
        ? 365
        : unit === "Months"
          ? 30
          : unit === "Weeks"
            ? 7
            : 1;
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
            (err as { message?: string })?.message ||
            "Failed to update fixed access duration.";
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
        currentDraft.fixedDurationValue !==
          serverAccessRules.fixedDurationValue ||
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
    void persistFixedDuration(
      accessRulesDraftRef.current.fixedDurationValue,
      unit,
    );
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
        const confirmedQa =
          res.allowQa !== undefined ? Boolean(res.allowQa) : nextValue;

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
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to update Q&A setting.";
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
          res.allowComments !== undefined
            ? Boolean(res.allowComments)
            : nextValue;

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
          (err as { message?: string })?.message ||
          "Failed to update comments setting.";
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
          res.allowDownloads !== undefined
            ? Boolean(res.allowDownloads)
            : nextValue;

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
          (err as { message?: string })?.message ||
          "Failed to update downloads setting.";
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

  // Drag and Drop state for Sections & Lessons
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(
    null,
  );
  const [dragEnabledSectionId, setDragEnabledSectionId] = useState<
    string | null
  >(null);

  const [draggedLessonState, setDraggedLessonState] = useState<{
    sectionId: string;
    lessonIndex: number;
  } | null>(null);
  const [dragEnabledLessonId, setDragEnabledLessonId] = useState<string | null>(
    null,
  );

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
    if (
      isCreatingSection ||
      createSectionMutation.isPending ||
      createCourseMutation.isPending
    )
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
    setSections((prev) => [...prev, optimisticSection]);
    setIsCreatingSection(true);

    let targetCourseId = currentCourseId;
    if (!targetCourseId) {
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
      setSections((prev) => {
        const hasServerSection = prev.some((s) => s.id === createdSection.id);
        if (hasServerSection) {
          return prev
            .filter((s) => s.id !== tempSectionId)
            .map((s) =>
              s.id === createdSection.id
                ? { ...s, isPendingCreation: false }
                : s,
            );
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
      setSections((prev) => prev.filter((s) => s.id !== tempSectionId));
      const errorMsg =
        (err as { message?: string })?.message || "Failed to create section.";
      setToastMessage(errorMsg);
    } finally {
      setIsCreatingSection(false);
    }
  };

  const handleStartEditSectionTitle = (sectionId: string) => {
    clearCurriculumItemStatus(sectionId);
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, isEditingTitle: true } : s,
      ),
    );
  };

  const handleSaveSectionTitle = async (
    sectionId: string,
    newTitle: string,
  ) => {
    const trimmedTitle = newTitle.trim();
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;

    if (!trimmedTitle || trimmedTitle === sec.title) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId ? { ...s, isEditingTitle: false } : s,
        ),
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
            s.id === sectionId
              ? { ...s, title: trimmedTitle, isEditingTitle: false }
              : s,
          ),
        );
        markCurriculumItemSaved(sectionId);
      } catch (err: unknown) {
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to update section title.";
        setToastMessage(errorMsg);
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, isEditingTitle: false } : s,
          ),
        );
        markCurriculumItemFailed(sectionId);
      } finally {
        setUpdatingSectionId(null);
      }
    } else {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, title: trimmedTitle, isEditingTitle: false }
            : s,
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
            const errorMsg =
              (err as { message?: string })?.message ||
              "Failed to delete section.";
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
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
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
      isExpanded: true,
      isPublished: true,
      isPreview: false,
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
          lessons: [
            ...s.lessons.map((l) => ({ ...l, isExpanded: false })),
            optimisticLesson,
          ],
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
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetSectionId,
      )
    ) {
      try {
        const createdSection = await createSectionMutation.mutateAsync({
          courseId: targetCourseId,
          payload: { title: sec.title },
        });
        targetSectionId = createdSection.id;
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, id: targetSectionId } : s,
          ),
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
          (err as { message?: string })?.message ||
          "Failed to create section on server.";
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
          const hasServerLesson = s.lessons.some(
            (l) => l.id === createdLesson.id,
          );
          if (hasServerLesson) {
            return {
              ...s,
              id: targetSectionId,
              lessons: s.lessons
                .filter((l) => l.id !== tempLessonId)
                .map((l) =>
                  l.id === createdLesson.id
                    ? { ...l, isPendingCreation: false }
                    : l,
                ),
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
                      isPublished:
                        l.isPublished !== undefined ? l.isPublished : true,
                      isPreview:
                        l.isPreview !== undefined ? l.isPreview : false,
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
      const errorMsg =
        (err as { message?: string })?.message || "Failed to create lesson.";
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
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            lessonId,
          )
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
            const errorMsg =
              (err as { message?: string })?.message ||
              "Failed to delete lesson.";
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
        lessons: sec.lessons.map((l) =>
          l.id === lessonId ? { ...l, ...updates } : l,
        ),
      };
    });
    sectionsRef.current = nextSections;
    setSections(nextSections);
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
        return true;
      }

      // 3. Validate existing lesson title rules
      const trimmedTitle = les.title.trim();
      if (!trimmedTitle) {
        setToastMessage("Lesson title cannot be empty.");
        return false;
      }

      const isPublishedVal =
        les.isPublished !== undefined ? les.isPublished : true;
      const isPreviewVal = les.isPreview !== undefined ? les.isPreview : false;

      // 4. Snapshot the exact payload being persisted
      const persistedSnapshot = {
        title: trimmedTitle,
        description: les.description || "",
        contentType: les.contentType,
        isPublished: isPublishedVal,
        isPreview: isPreviewVal,
      };

      const targetCourseId = options?.explicitCourseId || currentCourseId;

      if (
        targetCourseId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          lessonId,
        )
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
                    isExpanded: options?.collapseOnSuccess
                      ? false
                      : l.isExpanded,
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
          return true;
        } catch (err: unknown) {
          const errorMsg =
            (err as { message?: string })?.message ||
            "Failed to update lesson.";
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
                  isExpanded: options?.collapseOnSuccess
                    ? false
                    : l.isExpanded,
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
        return true;
      }
    })();

    inFlightLessonSavesRef.current.set(lessonId, savePromise);
    savePromise.finally(() => {
      inFlightLessonSavesRef.current.delete(lessonId);
    });

    return savePromise;
  };

  const handleSaveLesson = async (
    sectionId: string,
    lessonId: string,
  ): Promise<boolean> => {
    return await persistLesson(sectionId, lessonId, {
      collapseOnSuccess: true,
      showCleanToast: true,
    });
  };

  const handleLessonFieldBlur = async (
    sectionId: string,
    lessonId: string,
  ) => {
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les || les.isPendingCreation) return;
    if (!isLessonDirty(les)) return;

    await persistLesson(sectionId, lessonId, {
      collapseOnSuccess: false,
    });
  };

  const handleLessonDiscreteChange = async (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ) => {
    handleUpdateLesson(sectionId, lessonId, updates);
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les || les.isPendingCreation) return;
    if (!isLessonDirty(les)) return;

    await persistLesson(sectionId, lessonId, {
      collapseOnSuccess: false,
    });
  };

  const saveAllDirtyLessons = async (
    explicitCourseId?: string | null,
  ): Promise<boolean> => {
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
  ) => {
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les) return;

    // 1. When the lesson is being COLLAPSED:
    if (les.isExpanded) {
      if (isLessonDirty(les)) {
        await handleSaveLesson(sectionId, lessonId);
        return;
      }
      // If clean, collapse immediately
      setSections((prev) => {
        const next = prev.map((s) => {
          if (s.id !== sectionId) return s;
          return {
            ...s,
            lessons: s.lessons.map((l) =>
              l.id === lessonId ? { ...l, isExpanded: false } : l,
            ),
          };
        });
        sectionsRef.current = next;
        return next;
      });
      return;
    }

    // 2. When the lesson is being EXPANDED:
    // Preserve current behavior exactly: do not save anything, expand immediately
    setSections((prev) => {
      const next = prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          lessons: s.lessons.map((l) =>
            l.id === lessonId ? { ...l, isExpanded: true } : l,
          ),
        };
      });
      sectionsRef.current = next;
      return next;
    });
  };

  const handleToggleSectionExpand = async (sectionId: string) => {
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    if (!sec) return;

    // 1. When the section is being EXPANDED:
    if (!sec.isExpanded) {
      setSections((prev) => {
        const next = prev.map((s) =>
          s.id === sectionId ? { ...s, isExpanded: true } : s,
        );
        sectionsRef.current = next;
        return next;
      });
      return;
    }

    // 2. When the section is being COLLAPSED:
    // Find dirty lessons in that section
    const dirtyLessons = sec.lessons.filter(
      (l) => isLessonDirty(l) && !l.isPendingCreation,
    );

    // No dirty lessons? Collapse immediately
    if (dirtyLessons.length === 0) {
      setSections((prev) => {
        const next = prev.map((s) =>
          s.id === sectionId ? { ...s, isExpanded: false } : s,
        );
        sectionsRef.current = next;
        return next;
      });
      return;
    }

    // Guard against re-entrancy if already collapsing or saving
    if (
      isCollapsingSectionRef.current ||
      isSavingAllDirtyLessonsRef.current
    ) {
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
        const next = prev.map((s) =>
          s.id === sectionId ? { ...s, isExpanded: false } : s,
        );
        sectionsRef.current = next;
        return next;
      });
    }
  };

  const handleAddLessonResource = (sectionId: string, lessonId: string) => {
    const newResId = `res-${Date.now()}`;
    const sampleFiles = [
      { name: "Lesson_Notes.pdf", type: "PDF" as const, size: "1.8 MB" },
      { name: "Source_Code.txt", type: "TXT" as const, size: "850 B" },
      { name: "Reference_Doc.pdf", type: "PDF" as const, size: "3.1 MB" },
    ];
    const chosen = sampleFiles[Math.floor(Math.random() * sampleFiles.length)]!;
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) => {
            if (l.id !== lessonId) return l;
            return {
              ...l,
              resources: [...l.resources, { id: newResId, ...chosen }],
            };
          }),
        };
      }),
    );
  };

  const handleRemoveLessonResource = (
    sectionId: string,
    lessonId: string,
    resourceId: string,
  ) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) => {
            if (l.id !== lessonId) return l;
            return {
              ...l,
              resources: l.resources.filter((r) => r.id !== resourceId),
            };
          }),
        };
      }),
    );
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
    dragInitialLessonStateRef.current = {
      sectionId,
      lessonIds: currentSec ? currentSec.lessons.map((l) => l.id) : [],
      previousLessons: currentSec ? structuredClone(currentSec.lessons) : [],
    };
    setDraggedLessonState({ sectionId, lessonIndex });
    setCustomDragImage(
      e,
      e.currentTarget as HTMLElement,
      lessonGhostHtml(lesson.title, lessonIndex, lesson.contentType),
    );
  };

  const handleLessonDragOver = (
    e: React.DragEvent,
    targetSectionId: string,
    targetLessonIndex: number,
  ) => {
    e.preventDefault();
    if (!draggedLessonState) return;
    if (
      draggedLessonState.sectionId === targetSectionId &&
      draggedLessonState.lessonIndex === targetLessonIndex
    ) {
      return;
    }

    setSections((prev) => {
      const copy = structuredClone(prev);
      const sourceSec = copy.find((s) => s.id === draggedLessonState.sectionId);
      const targetSec = copy.find((s) => s.id === targetSectionId);
      if (!sourceSec || !targetSec) return prev;

      const [movedLesson] = sourceSec.lessons.splice(
        draggedLessonState.lessonIndex,
        1,
      );
      if (movedLesson) {
        targetSec.lessons.splice(targetLessonIndex, 0, movedLesson);
      }
      return copy;
    });

    setDraggedLessonState({
      sectionId: targetSectionId,
      lessonIndex: targetLessonIndex,
    });
  };

  const handleLessonDragEnd = async () => {
    const initial = dragInitialLessonStateRef.current;
    setDraggedLessonState(null);
    setDragEnabledLessonId(null);
    dragInitialLessonStateRef.current = null;

    if (!initial) return;

    const currentSec = sectionsRef.current.find(
      (s) => s.id === initial.sectionId,
    );
    if (!currentSec) return;

    const currentLessonIds = currentSec.lessons.map((l) => l.id);
    const initialLessonIds = initial.lessonIds;

    const orderChanged =
      initialLessonIds.length === currentLessonIds.length &&
      initialLessonIds.some((id, idx) => id !== currentLessonIds[idx]);

    if (!orderChanged) return;

    if (
      currentCourseId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        initial.sectionId,
      )
    ) {
      const allValidUuids = currentLessonIds.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
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
  const totalLessons = sections.reduce(
    (acc, sec) => acc + sec.lessons.length,
    0,
  );

  // Approximate course duration based on curriculum lessons
  const computedDuration =
    totalLessons === 0
      ? "0h 0m"
      : totalLessons < 10
        ? `${Math.floor((totalLessons * 12) / 60)}h ${(totalLessons * 12) % 60}m`
        : `${Math.floor((totalLessons * 9) / 60)}h ${(totalLessons * 9) % 60}m`;

  // Student-facing Preview Object Adapter
  const previewCourse: Course = {
    id: currentCourseId || "preview-course",
    title: courseTitle.trim() || "Course Title",
    description:
      courseDescription.trim() || "This is a short description of your course.",
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
    thumbnail: thumbnail || "/assets/instructor-poster.jpg",
    lifecycleStatus: isPublished ? "published" : "draft",
  };

  const previewSections: CourseSection[] =
    sections.length > 0
      ? sections.map((sec, secIdx) => ({
          id: secIdx + 1,
          title: sec.title.trim() || "Title",
          progress: `0/${sec.lessons.length}`,
          lessons:
            sec.lessons.length > 0
              ? sec.lessons.map((les, lesIdx) => [
                  lesIdx + 1,
                  les.title.trim() || `Lesson ${lesIdx + 1}`,
                  "05:00",
                  "todo",
                ])
              : [
                  [
                    1,
                    `Introduction to ${sec.title.trim() || "Title"}`,
                    "05:00",
                    "todo",
                  ],
                ],
        }))
      : [];

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

  const ensureCourseDraftForPricing = async (
    explicitCourseId?: string | null,
  ): Promise<string> => {
    let targetId =
      explicitCourseId || currentCourseIdRef.current || currentCourseId;
    if (targetId) return targetId;
    if (inFlightBasicsPromiseRef.current) {
      await inFlightBasicsPromiseRef.current;
      targetId =
        explicitCourseId || currentCourseIdRef.current || currentCourseId;
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
    return await executeSerializedPricingMutation(
      "pricingDetails",
      version,
      previousSnapshot,
    );
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
      await executeSerializedPricingMutation(
        "pricingType",
        version,
        previousSnapshot,
      );
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
      await executeSerializedPricingMutation(
        "currency",
        version,
        previousSnapshot,
      );
    } catch {
      // Error handled in executeSerializedPricingMutation
    }
  };

  const currencySymbol = getCurrencySymbol(pricing.currency || "INR");

  const previewPricing: CourseOverviewPricingProps =
    pricing.pricingType === "free"
      ? { price: "Free" }
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
            parseFloat(pricing.originalPrice.replace(/,/g, "")) >
              parseFloat(pricing.sellingPrice.replace(/,/g, ""))
              ? `${Math.round(
                  ((parseFloat(pricing.originalPrice.replace(/,/g, "")) -
                    parseFloat(pricing.sellingPrice.replace(/,/g, ""))) /
                    parseFloat(pricing.originalPrice.replace(/,/g, ""))) *
                    100,
                )}% OFF`
              : undefined,
        };

  const localPreviewData = useMemo<CourseEditorDataResponse | null>(() => {
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
      thumbnailMediaId: editorData?.course?.thumbnailMediaId || null,
      trailerMediaId: editorData?.course?.trailerMediaId || null,
      sections,
      pricingDraft,
      accessRulesDraft,
      enableCertificate: extras.enableCertificate,
      manualIncludesDraft,
      editorData,
    });
  }, [
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
    editorData,
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
  const isBasicsValid = serverValidation?.sections?.basics?.valid ?? false;
  const isCurriculumValid =
    serverValidation?.sections?.curriculum?.valid ?? false;
  const isAccessRulesValid =
    serverValidation?.sections?.accessRules?.valid ?? false;
  const isPricingValid = serverValidation?.sections?.pricing?.valid ?? false;
  const isExtrasValid = serverValidation?.sections?.extras?.valid ?? false;

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
    controlKey:
      | "title"
      | "shortDescription"
      | "courseDescription"
      | "instructorAlias",
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
          difficulty:
            (updated.difficulty as BasicsFormState["difficulty"]) || "",
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
        instructorAlias:
          serverBasicsRef.current.instructorAlias || instructorAlias,
      };
    }

    // Join an existing in-flight creation rather than starting a new one.
    if (inFlightCourseCreationPromiseRef.current) {
      return await inFlightCourseCreationPromiseRef.current;
    }

    // Register the promise SYNCHRONOUSLY before the first await so any
    // concurrent caller that checks immediately after this line will find it.
    const promise = createCourseMutation.mutateAsync({ title, instructorAlias });
    inFlightCourseCreationPromiseRef.current = promise;
    try {
      const created = await promise;
      // Write the confirmed ID to the ref immediately so all awaiting callers
      // can use it as soon as the shared promise resolves.
      currentCourseIdRef.current = created.id;
      return created;
    } finally {
      // Clear regardless of success/failure so a failed attempt can be retried.
      inFlightCourseCreationPromiseRef.current = null;
    }
  };

  const persistBasicsField = async (
    fieldKey:
      | "title"
      | "shortDescription"
      | "courseDescription"
      | "instructorAlias",
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
              instructorAlias:
                created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
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
              instructorAlias:
                created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
            };
            markBasicsFieldSaved("title");
          }
          return created;
        } catch (err: unknown) {
          markBasicsFieldFailed("title");
          const errorMsg =
            err instanceof Error
              ? err.message
              : "Failed to create course. Please try again.";
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
        if (
          currentDraft.shortDescription.trim() ===
          baseline.shortDescription.trim()
        ) {
          return;
        }
      } else if (fieldKey === "courseDescription") {
        if (currentDraft.description.trim() === baseline.description.trim()) {
          return;
        }
      } else if (fieldKey === "instructorAlias") {
        if (
          currentDraft.instructorAlias.trim() ===
          baseline.instructorAlias.trim()
        ) {
          return;
        }
      }
    }

    const version = ++basicsVersionRef.current;
    markBasicsControlSaving(fieldKey, true);
    inFlightBasicsControlsRef.current[fieldKey] =
      (inFlightBasicsControlsRef.current[fieldKey] || 0) + 1;
    const previousSnapshot = { ...serverBasicsRef.current };

    return await executeSerializedBasicsMetaMutation(
      fieldKey,
      version,
      previousSnapshot,
    );
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
          res.showInstructorName !== undefined
            ? res.showInstructorName
            : nextValue;
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
          err instanceof Error
            ? err.message
            : "Failed to update instructor name visibility.";
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

    const isMetaDirty = !isBasicsMetaEqual(currentDraft, baseline);
    if (isMetaDirty) {
      if (!currentDraft.title.trim()) {
        setCourseTitle(baseline.title);
        setToastMessage("Course title cannot be empty.");
        return false;
      }
      const version = ++basicsVersionRef.current;
      markBasicsControlSaving("title", true);
      inFlightBasicsControlsRef.current.title =
        (inFlightBasicsControlsRef.current.title || 0) + 1;
      const previousSnapshot = { ...serverBasicsRef.current };
      try {
        await executeSerializedBasicsMetaMutation(
          "title",
          version,
          previousSnapshot,
        );
        return true;
      } catch {
        return false;
      }
    } else if (
      inFlightCourseCreationPromiseRef.current ||
      inFlightBasicsPromiseRef.current
    ) {
      try {
        // Await whichever in-flight operation is active (creation takes priority).
        await (inFlightCourseCreationPromiseRef.current ??
          inFlightBasicsPromiseRef.current);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  };

  const saveBasicsStep = async (explicitCourseId?: string | null) => {
    const targetCourseId = explicitCourseId || currentCourseId;
    if (
      targetCourseId &&
      isBasicsEqual(basicsDraftRef.current, serverBasicsRef.current)
    ) {
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
            instructorAlias:
              created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
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
            instructorAlias:
              created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
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
              shortDescription:
                basicsDraftRef.current.shortDescription.trim() || null,
              description: basicsDraftRef.current.description.trim() || null,
              categoryId: basicsDraftRef.current.categoryId || null,
              difficulty: basicsDraftRef.current.difficulty || null,
              instructorAlias:
                basicsDraftRef.current.instructorAlias.trim() || null,
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
            difficulty:
              (updated.difficulty as BasicsFormState["difficulty"]) || "",
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
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            s.id,
          ),
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
                prev.map((s) =>
                  s.id === sec.id ? { ...s, isEditingTitle: false } : s,
                ),
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
        const val = Math.max(
          1,
          accessRulesDraftRef.current.fixedDurationValue || 1,
        );
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
              accessRulesDraftRef.current.durationMode === "fixed"
                ? "fixed_duration"
                : "lifetime",
            durationDays:
              accessRulesDraftRef.current.durationMode === "fixed"
                ? durationDays
                : null,
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
    const isDirty = !isPricingEqual(
      pricingDraftRef.current,
      serverPricingRef.current,
    );
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
        setManualIncludesDraft(
          listRes.items.map((inc) => ({ id: inc.id, text: inc.text })),
        );
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
      isSavingAllDirtyLessonsRef.current
    ) {
      return;
    }
    if (destination === activeStep) {
      return;
    }

    if (activeStep === "basics") {
      const flushed = await flushBasicsPersistence();
      if (!currentCourseIdRef.current && !currentCourseId && !flushed) {
        setShowTitleTooltip(true);
        titleInputRef.current?.focus();
        setToastMessage("Add a course title to continue.");
        return;
      }
    }

    if (
      !currentCourseIdRef.current &&
      !isDownstreamUnlocked &&
      destination !== "basics"
    ) {
      setShowTitleTooltip(true);
      titleInputRef.current?.focus();
      setToastMessage("Add a course title to continue.");
      return;
    }

    if (activeStep === "access-rules") {
      await flushFixedDurationPersistence();
    }
    if (activeStep === "pricing") {
      await flushPricingPersistence();
    }

    if (!isStepDirty(activeStep)) {
      setActiveStep(destination);
      return;
    }

    if (activeStep === "curriculum") {
      setActionLoading("save");
      try {
        await saveCurriculumStep();
        setActiveStep(destination);
      } catch (err: unknown) {
        const stepLabel =
          WIZARD_STEPS.find((s) => s.id === activeStep)?.label || activeStep;
        setToastMessage(
          `Failed to save ${stepLabel}. Your changes are kept locally.`,
        );
      } finally {
        setActionLoading(null);
      }
      return;
    }

    setActionLoading("save");
    try {
      await saveCurrentStep();
    } catch (err: unknown) {
      const stepLabel =
        WIZARD_STEPS.find((s) => s.id === activeStep)?.label || activeStep;
      setToastMessage(
        `Failed to save ${stepLabel}. Your changes are kept locally.`,
      );
    } finally {
      setActionLoading(null);
      setActiveStep(destination);
    }
  };

  navigateToStepRef.current = navigateToStep;

  const currentStepIndex = WIZARD_STEP_IDS.indexOf(activeStep);
  const previousStepId =
    currentStepIndex > 0 ? WIZARD_STEP_IDS[currentStepIndex - 1] : null;
  const nextStepId =
    currentStepIndex < WIZARD_STEP_IDS.length - 1
      ? WIZARD_STEP_IDS[currentStepIndex + 1]
      : null;

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
      if (
        createdOrUpdated &&
        typeof createdOrUpdated === "object" &&
        "id" in createdOrUpdated
      ) {
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
    if (actionLoading || isValidating) return;
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
        (err as { message?: string })?.message ||
        "Failed to save changes or validate course.";
      setToastMessage(errorMsg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleFinalPublishCourse = async () => {
    if (actionLoading || isValidating) return;
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
      const publishedCourse =
        await publishCourseMutation.mutateAsync(targetCourseId);

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
    }
  };

  const handleConfirmUnpublishCourse = async () => {
    if (!currentCourseId || actionLoading) return;
    setActionLoading("unpublish");
    try {
      const draftCourse =
        await unpublishCourseMutation.mutateAsync(currentCourseId);
      setIsPublished(draftCourse.status === "published");
      setCourseVersion(draftCourse.version);
      setToastMessage("Course unpublished and returned to draft.");
      setIsUnpublishModalOpen(false);
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message || "Failed to unpublish course.";
      setToastMessage(errorMsg);
    } finally {
      setActionLoading(null);
    }
  };

  if (isInitialLoadingCourse) {
    return (
      <CourseWizardSkeleton
        activeStep={activeStep}
        isEditing={isEditing}
        onBack={handleBack}
      />
    );
  }

  if (isEditorError && !editorData && isEditing) {
    return (
      <div className="relative flex w-full flex-1 flex-col min-h-[calc(100dvh-130px)] p-0 text-[--text] box-border max-[768px]:pb-0">
        <header className="relative shrink-0 mb-4 max-[768px]:mb-2 max-[768px]:w-full max-[768px]:max-w-full max-[768px]:min-w-0 max-[768px]:box-border">
          <div className="flex items-start justify-between gap-4 mb-3 max-[768px]:flex-col max-[768px]:gap-3 max-[768px]:mb-2">
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                className="flex w-9 h-9 shrink-0 items-center justify-center border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg text-(--text-secondary) bg-[color-mix(in_srgb,var(--text)_4%,transparent)] cursor-pointer transition-[border-color,background-color,color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
                onClick={handleBack}
                aria-label="Go back to courses"
              >
                <ArrowLeft size={17} weight="bold" />
              </button>
              <div className="pt-0.5 min-w-0">
                <h1 className="m-0 text-(--text) text-[clamp(1.2rem,1.8vw,1.55rem)] font-bold tracking-[-0.015em] leading-[1.2]">
                  Edit Course
                </h1>
                <p className="m-0 mt-1 text-(--muted) text-[0.84rem] max-w-155 leading-[1.4]">
                  Unable to load course data.
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="relative flex flex-1 flex-col items-center justify-center w-full min-h-[calc(100dvh-230px)] rounded-[14px] border border-red-500/20 bg-(--surface) p-8 text-center shadow-(--card-shadow) my-auto">
          <div className="relative mb-5 flex h-18 w-18 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <WarningCircle size={38} weight="bold" />
          </div>
          <h2 className="m-0 text-[1.28rem] font-bold tracking-[-0.015em] text-(--text)">
            Unable to load course details
          </h2>
          <p className="m-0 mt-2 max-w-md text-[0.88rem] leading-relaxed text-(--muted)">
            {editorError?.message || "There was an error communicating with the server to fetch this course."}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 text-[0.82rem] font-semibold text-(--text) cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text)"
              onClick={handleBack}
            >
              Back to Courses
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg border-none bg-(--accent) px-4 text-[0.82rem] font-semibold text-(--on-accent,#ffffff) shadow-[0_2px_8px_var(--accent-shadow,rgba(0,0,0,0.2))] cursor-pointer transition-all hover:bg-(--accent-hover,var(--accent)) hover:brightness-110 active:scale-[0.98]"
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
      className="relative flex w-full flex-1 flex-col min-h-full p-0 text-[--text] box-border"
      data-course-wizard
    >
      {/* Wizard Header */}
      <header className="relative shrink-0 mb-2 max-[768px]:mb-1.5 max-[768px]:w-full max-[768px]:max-w-full max-[768px]:min-w-0 max-[768px]:box-border">
        <div className="flex items-start justify-between gap-4 mb-1 max-[768px]:flex-col max-[768px]:gap-2 max-[768px]:mb-1.5">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              className="flex w-9 h-9 shrink-0 items-center justify-center border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg text-(--text-secondary) bg-[color-mix(in_srgb,var(--text)_4%,transparent)] cursor-pointer transition-[border-color,background-color,color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
              onClick={handleBack}
              aria-label="Go back to courses"
            >
              <ArrowLeft size={17} weight="bold" />
            </button>
            <div className="pt-0.5 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="m-0 text-(--text) text-[clamp(1.2rem,1.8vw,1.55rem)] font-bold tracking-[-0.015em] leading-[1.2]">
                  {isEditing ? "Edit Course" : "Create New Course"}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.72rem] font-medium tracking-[0.02em] ${
                    isPublished
                      ? "is-published border border-green-500/35 text-green-400 bg-green-500/12"
                      : "border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--muted) bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                  }`}
                >
                  {isPublished ? "Published" : "Draft"}
                </span>
              </div>
              <p className="m-0 mt-0.5 text-(--muted) text-[0.82rem] max-w-155 leading-[1.35]">
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
          <div className="flex items-center gap-2.5 mb-3 border border-red-400/35 rounded-[10px] px-4 py-2 text-red-400 bg-red-500/12 backdrop-blur-md shadow-[0_4px_16px_rgba(239,68,68,0.15)] text-[0.84rem] font-semibold animate-[bannerSlideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
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
              disabled={
                actionLoading !== null ||
                (!isDownstreamUnlocked && step.id !== "basics")
              }
              className={`!border-b-transparent shrink-0 whitespace-nowrap disabled:!opacity-50 disabled:!cursor-not-allowed ${isActive ? "is-active" : ""}`}
              onClick={() => {
                void navigateToStep(step.id);
              }}
              onKeyDown={handleRovingTabKeyDown}
            >
              <Icon size={17} weight={isActive ? "fill" : "regular"} />
              <span className="inline-flex items-center gap-1.5">
                <span>{step.label}</span>
                {isDirty && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-(--accent) shrink-0"
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
      <SwipeableTabPanel
        tabs={WIZARD_STEP_IDS}
        activeTab={activeStep}
        onTabChange={(newStep) => {
          void navigateToStep(newStep);
        }}
        tabListRef={stepsNavRef}
        id="course-wizard-tab-panel"
        className="course-wizard-tab-content w-full min-h-0 flex-1 flex flex-col"
        stateAttribute="data-wizard-step"
        labelledBy={`course-wizard-tab-${activeStep}`}
        disabled={
          actionLoading !== null ||
          (!isDownstreamUnlocked && activeStep === "basics")
        }
        spaceBetween={32}
      >
        {(panelStep) =>
          panelStep === "basics" ? (
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)] gap-6 items-start max-[768px]:gap-4.5 w-full min-w-0">
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
                        Continue course creation by entering a course title
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
                      {createCourseMutation.isPending || isInitialCourseCreationPending ? (
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
                      className="w-full min-h-[68px] max-h-[140px] resize-y border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] pl-3.5 pr-[75px] py-2.5 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed font-[inherit]"
                    />
                    <span className="absolute right-3.5 bottom-2.5 text-(--muted) text-[0.76rem] pointer-events-none">
                      {shortDescription.length} / 150
                    </span>
                  </div>
                </div>

                <div
                  className="flex flex-col gap-2 mb-5"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      void persistBasicsField("courseDescription");
                    }
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
                <div className="flex flex-col gap-2 mb-4.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="instructor-alias"
                      className="text-(--text-secondary) text-[0.84rem] font-semibold"
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
                    className="w-full h-11 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] px-3.5 py-0 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <p className="m-0 text-(--muted) text-[0.78rem]">
                    Optional custom name shown to students instead of your account name.
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
                        status={getBasicsFieldDisplayStatus("showInstructorName")}
                        testId="basics-field-status-showInstructorName"
                      />
                    </div>
                    <p className="m-0 text-(--muted) text-[0.8rem]">
                      Control whether the instructor name is shown to students.
                    </p>
                  </div>
                  <SettingsToggle
                    checked={showInstructorName}
                    disabled={
                      !isDownstreamUnlocked ||
                      isBasicsControlSaving("showInstructorName")
                    }
                    onChange={() =>
                      void handleShowInstructorNameChange(!showInstructorName)
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
                    Add media that best represents your course.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Hidden Thumbnail File Input */}
                  <input
                    type="file"
                    ref={thumbnailInputRef}
                    disabled={!isDownstreamUnlocked || isBasicsSaving}
                    onChange={handleThumbnailFileSelect}
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
                  <div className="flex flex-col min-w-0">
                    <h3 className="m-0 mb-1 text-(--text-secondary) text-[0.86rem] font-semibold">
                      Thumbnail <span className="text-[#ff5252] ml-0.5">*</span>
                    </h3>
                    <p className="m-0 mb-3 text-(--muted) text-[0.78rem] min-h-[1.15rem]">
                      Upload a thumbnail for your course.
                    </p>
                    {thumbnail ? (
                      <div className="group relative flex flex-col items-center justify-center aspect-video w-full min-h-43.75 box-border border border-solid border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-xl p-0 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-center overflow-hidden">
                        <img
                          src={thumbnail}
                          alt="Course thumbnail preview"
                          className="w-full h-full object-cover block"
                        />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 p-3 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-[2px]">
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
                            className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={triggerThumbnailUpload}
                          >
                            <ImageIcon size={15} /> Change Image
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
                            className="inline-flex items-center border-none text-white bg-red-500 cursor-pointer transition-all duration-150 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handleRemoveThumbnail}
                            title="Remove Thumbnail"
                          >
                            <Trash size={15} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex flex-col items-center justify-center aspect-video w-full min-h-43.75 box-border border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-center overflow-hidden transition-[border-color,background-color] duration-180 ease-out">
                        <div className="mb-2 text-(--muted)">
                          <ImageIcon size={30} weight="light" />
                        </div>
                        <div className="flex items-center justify-center gap-2.5 flex-wrap">
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
                            className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={triggerThumbnailUpload}
                          >
                            <UploadSimple size={15} /> Upload
                          </button>
                        </div>
                        <p className="m-0 mt-2 text-(--muted) text-[0.74rem]">
                          Recommended: 1280x720px (16:9)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Video Trailer Upload */}
                  <div className="flex flex-col min-w-0">
                    <h3 className="m-0 mb-1 text-(--text-secondary) text-[0.86rem] font-semibold">
                      Video Trailer (Optional)
                    </h3>
                    <p className="m-0 mb-3 text-(--muted) text-[0.78rem] min-h-[1.15rem]">
                      Add a trailer video to your course.
                    </p>
                    {videoTrailer ? (
                      <div className="group relative flex flex-col items-center justify-center aspect-video w-full min-h-43.75 box-border border border-solid border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-xl p-0 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-center overflow-hidden">
                        <video
                          src={videoTrailer}
                          className="w-full h-full object-cover block"
                          controls
                        />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 p-3 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-[2px]">
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
                            className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
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
                            className="inline-flex items-center border-none text-white bg-red-500 cursor-pointer transition-all duration-150 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handleRemoveVideoTrailer}
                            title="Remove Video Trailer"
                          >
                            <Trash size={15} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex flex-col items-center justify-center aspect-video w-full min-h-43.75 box-border border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-center overflow-hidden transition-[border-color,background-color] duration-180 ease-out">
                        <div className="mb-2 text-(--muted)">
                          <PlayCircle size={30} weight="light" />
                        </div>
                        <div className="flex items-center justify-center gap-2.5 flex-wrap">
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
                            className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={triggerVideoTrailerUpload}
                          >
                            <UploadSimple size={15} /> Upload
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
                            className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text) bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => {
                              // Select from media action
                            }}
                          >
                            <PlayCircle size={15} /> Select from Media
                          </button>
                        </div>
                        <p className="m-0 mt-2 text-(--muted) text-[0.74rem]">
                          Recommended: 16:9 video
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Live Course Preview */}
            <div className="hidden lg:flex max-lg:hidden flex-col gap-5 sticky top-0 self-start">
              <section className="rounded-[14px] p-5 bg-(--surface) shadow-(--card-shadow)">
                <h2 className="m-0 text-(--text) text-[1.1rem] font-[650]">
                  Course Preview
                </h2>
                <p className="m-0 mt-1 mb-4 text-(--muted) text-[0.8rem]">
                  This is how your course will appear to students.
                </p>

                <div
                  className={`relative aspect-video border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-[10px] overflow-hidden bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] transition-[border-color,background-color] duration-180 ease-out ${
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
                    <div className="relative w-full h-full">
                      <img
                        src={thumbnail}
                        alt="Course Thumbnail"
                        className="w-full h-full object-cover block"
                      />
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-(--muted) text-[0.8rem]">
                      <div className="flex items-center justify-center text-(--muted) opacity-60">
                        <ImageIcon size={32} weight="light" />
                      </div>
                      <span className="text-(--muted) opacity-70">
                        Course thumbnail will appear here
                      </span>
                      <span className="inline-block mt-0.5 rounded-md px-2 py-0.5 text-[0.72rem] font-semibold text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-colors duration-150">
                        Click to upload
                      </span>
                    </div>
                  )}
                </div>

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
                    <span className="flex items-center gap-1.25">0h 0m</span>
                  </div>

                  <div className="mt-3.5 min-w-0 max-w-full overflow-hidden wrap-anywhere wrap-break-word">
                    <h4 className="m-0 mb-1.5 text-(--text-secondary) text-[0.84rem] font-[650]">
                      About this course
                    </h4>
                    {courseDescription.trim() ? (
                      <DiscussionMarkdown
                        content={createDiscussionDraft(courseDescription.trim())}
                        label="Course description preview"
                        className="[&>:first-child]:mt-0 max-w-none"
                      />
                    ) : (
                      <p className="m-0 text-(--muted) text-[0.82rem] leading-normal wrap-anywhere wrap-break-word">
                        This is a short description of your course. It will
                        appear here on the course card.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : panelStep === "curriculum" ? (
          <div className="flex flex-col gap-4 w-full flex-1 min-h-0">
            {/* Header row */}
            <div className="flex items-center justify-between mb-2 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3">
              <div className="">
                <h2 className="m-0 text-(--text) text-[1.25rem] font-bold tracking-[-0.015em]">
                  Course Curriculum
                </h2>
                <p className="m-0 mt-1 text-(--muted) text-[0.85rem]">
                  Organize your course into sections and lessons. You can
                  reorder them anytime.
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
                    className="flex items-center justify-between px-[18px] py-3.5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] select-none cursor-pointer max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[12px_14px]"
                    onClick={() => handleToggleSectionExpand(sec.id)}
                    title="Click to toggle section"
                  >
                    <div className="flex items-center gap-3 max-[768px]:flex-1 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:gap-2">
                      <span
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
                                handleSaveSectionTitle(sec.id, e.target.value)
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
                        <span className="ml-1 text-(--muted) text-[0.76rem] font-normal">
                          {sec.lessons.length}{" "}
                          {sec.lessons.length === 1 ? "Lesson" : "Lessons"}
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
                          sec.isExpanded ? "is-expanded [&>svg]:rotate-180" : ""
                        }`}
                        aria-label={
                          sec.isExpanded ? "Collapse section" : "Expand section"
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
                      <div className="flex flex-col gap-2.5">
                        {sec.lessons.map((les, lesIndex) => (
                          <div
                            key={les.id}
                            className={`border rounded-[10px] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] shadow-(--card-shadow) overflow-hidden transition-[border-color,box-shadow,opacity] duration-150 ${
                              draggedLessonState?.sectionId === sec.id &&
                              draggedLessonState?.lessonIndex === lesIndex
                                ? "opacity-35 border-dashed border-(--accent)"
                                : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                            draggable={
                              dragEnabledLessonId === les.id &&
                              !les.isPendingCreation &&
                              !reorderingLessonsSectionId &&
                              !reorderLessonsMutation.isPending
                            }
                            onDragStart={(e) =>
                              handleLessonDragStart(e, sec.id, lesIndex, les)
                            }
                            onDragOver={(e) =>
                              handleLessonDragOver(e, sec.id, lesIndex)
                            }
                            onDragEnd={handleLessonDragEnd}
                          >
                            {/* Lesson Header */}
                            <div
                              className="flex items-center justify-between px-4 py-3 select-none cursor-pointer max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[10px_12px]"
                              onClick={() =>
                                handleToggleLessonExpand(sec.id, les.id)
                              }
                              title="Click to toggle lesson editor"
                            >
                              <div className="flex items-center gap-3 max-[768px]:flex-1 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:gap-2">
                                <span
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
                                <span className="inline-flex min-w-[22px] h-[22px] items-center justify-center rounded text-(--muted) bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[0.72rem] font-medium">
                                  {lesIndex + 1}
                                </span>
                                <span className="text-(--text) text-[0.88rem] font-semibold max-[768px]:flex-1 max-[768px]:min-w-0 max-[768px]:break-words">
                                  {les.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 max-[768px]:w-full max-[768px]:justify-between max-[768px]:pt-2 max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                                {les.isPendingCreation ? (
                                  <span className="inline-flex items-center gap-1 text-(--accent) text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                                    <CircleNotch
                                      size={12}
                                      className="animate-spin text-(--accent)"
                                    />
                                    <span>Creating...</span>
                                  </span>
                                ) : deletingLessonId === les.id ? (
                                  <span className="inline-flex items-center gap-1 text-red-400 text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/28">
                                    <CircleNotch
                                      size={12}
                                      className="animate-spin text-red-400"
                                    />
                                    <span>Deleting...</span>
                                  </span>
                                ) : (
                                  <CurriculumItemStatusIndicator
                                    status={getCurriculumItemDisplayStatus(les.id)}
                                    testId={`curriculum-status-lesson-${les.id}`}
                                  />
                                )}
                                {les.isPublished === false && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[#f59e0b] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,#f59e0b_12%,transparent)] border border-[color-mix(in_srgb,#f59e0b_28%,transparent)]"
                                    title="Draft mode: This lesson is not published and is hidden from students."
                                  >
                                    <EyeSlash size={13} weight="bold" />{" "}
                                    Unpublished
                                  </span>
                                )}
                                {les.isPreview === true && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[#10b981] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,#10b981_12%,transparent)] border border-[color-mix(in_srgb,#10b981_28%,transparent)]"
                                    title="Free Preview: Anyone can view this lesson without enrolling."
                                  >
                                    Preview
                                  </span>
                                )}
                                {les.contentType === "video" ? (
                                  <span className="inline-flex items-center gap-1.25 text-(--accent-ink,var(--accent)) text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                                    <PlayCircle size={13} weight="fill" /> Video
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.25 text-(--accent-ink,var(--accent)) text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)]">
                                    <FileText size={13} weight="fill" />{" "}
                                    Document
                                  </span>
                                )}
                                <button
                                  type="button"
                                  disabled={
                                    les.isPendingCreation ||
                                    deletingLessonId === les.id
                                  }
                                  className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all duration-150 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
                                  className={`inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] transition-all duration-150 bg-transparent cursor-pointer p-0 [&>svg]:transition-transform [&>svg]:duration-200 ${
                                    les.isExpanded
                                      ? "is-expanded [&>svg]:rotate-180"
                                      : ""
                                  }`}
                                  aria-label={
                                    les.isExpanded
                                      ? "Collapse lesson editor"
                                      : "Expand lesson editor"
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleLessonExpand(sec.id, les.id);
                                  }}
                                >
                                  <CaretDown size={15} />
                                </button>
                              </div>
                            </div>

                            {/* Expanded Lesson Editor with CSS transition */}
                            <div
                              className={`grid transition-[grid-template-rows] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                les.isExpanded
                                  ? "is-open grid-rows-[1fr]"
                                  : "grid-rows-[0fr]"
                              }`}
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div
                                className={`min-h-0 overflow-hidden border-t border-transparent bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] transition-[padding,border-color] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                  les.isExpanded
                                    ? "px-5 pt-4 pb-5 border-t-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[768px]:p-[14px_12px_16px]"
                                    : "px-5 py-0 max-[768px]:p-0"
                                }`}
                              >
                                <div className="grid grid-cols-1 min-[1024px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 max-[768px]:gap-3.5">
                                  {/* Left column */}
                                  <div className="flex flex-col gap-4.5">
                                    {/* Lesson Title */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <label
                                        htmlFor={`les-title-${les.id}`}
                                        className="text-(--text-secondary) text-[0.84rem] font-semibold"
                                      >
                                        Lesson Title{""}
                                        <span className="text-[#ff5252] ml-0.5">
                                          *
                                        </span>
                                      </label>
                                      <div className="relative flex items-center">
                                        <input
                                          id={`les-title-${les.id}`}
                                          type="text"
                                          maxLength={120}
                                          value={les.title}
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
                                            void handleLessonFieldBlur(
                                              sec.id,
                                              les.id,
                                            );
                                          }}
                                          placeholder="e.g. Introduction to React Hooks"
                                          className="w-full h-11 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] pl-3.5 pr-[70px] py-0 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed"
                                        />
                                        <span className="absolute right-3.5 text-(--muted) text-[0.76rem] pointer-events-none">
                                          {les.title.length} / 120
                                        </span>
                                      </div>
                                    </div>

                                    {/* Lesson Description Rich Editor */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <label
                                        id={`les-desc-label-${les.id}`}
                                        className="text-(--text-secondary) text-[0.84rem] font-semibold"
                                      >
                                        Lesson Description
                                      </label>
                                      <div
                                        className={
                                          les.isPendingCreation
                                            ? "opacity-60 pointer-events-none"
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
                                          disabled={les.isPendingCreation}
                                          value={les.description}
                                          onChange={(val) =>
                                            handleUpdateLesson(sec.id, les.id, {
                                              description: val,
                                            })
                                          }
                                          placeholder="Add a detailed description of what students will learn in this lesson..."
                                          maxLength={1500}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right column */}
                                  <div className="flex flex-col gap-4.5">
                                    {/* Content Type Selector */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                                        Content Type{""}
                                        <span className="text-[#ff5252] ml-0.5">
                                          *
                                        </span>
                                      </label>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div
                                          className={`relative flex items-center gap-3 border rounded-[10px] px-3.5 py-3 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                            les.isPendingCreation
                                              ? "opacity-60 cursor-not-allowed"
                                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                          } ${
                                            les.contentType === "video"
                                              ? "is-selected border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                          }`}
                                          onClick={() => {
                                            if (les.isPendingCreation) return;
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
                                            className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${les.contentType === "video" ? "border-(--accent)" : "border-(--muted)"}`}
                                          >
                                            {les.contentType === "video" && (
                                              <div className="w-2 h-2 rounded-full bg-(--accent)" />
                                            )}
                                          </div>
                                          <div className="flex items-center justify-center text-(--accent) mt-px">
                                            <Video size={18} weight="fill" />
                                          </div>
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-(--text) text-[0.86rem] font-bold leading-[18px]">
                                              Video
                                            </span>
                                            <span className="text-(--muted) text-[0.75rem]">
                                              Upload or select a video
                                            </span>
                                          </div>
                                        </div>

                                        <div
                                          className={`relative flex items-center gap-3 border rounded-[10px] px-3.5 py-3 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                            les.isPendingCreation
                                              ? "opacity-60 cursor-not-allowed"
                                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                          } ${
                                            les.contentType === "document"
                                              ? "is-selected border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                          }`}
                                          onClick={() => {
                                            if (les.isPendingCreation) return;
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
                                            className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${les.contentType === "document" ? "border-(--accent)" : "border-(--muted)"}`}
                                          >
                                            {les.contentType === "document" && (
                                              <div className="w-2 h-2 rounded-full bg-(--accent)" />
                                            )}
                                          </div>
                                          <div className="flex items-center justify-center text-(--accent) mt-px">
                                            <FileText size={18} weight="fill" />
                                          </div>
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-(--text) text-[0.86rem] font-bold leading-[18px]">
                                              Document / PDF
                                            </span>
                                            <span className="text-(--muted) text-[0.75rem]">
                                              Upload PDF or document
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Content Source Controls (Video or Document) */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                                        {les.contentType === "video"
                                          ? "Video Source"
                                          : "Document / PDF Source"}
                                        {""}
                                        <span className="text-[#ff5252] ml-0.5">
                                          *
                                        </span>
                                      </label>
                                      <div className="flex items-center gap-2 max-[768px]:w-full max-[768px]:flex max-[768px]:gap-2">
                                        <button
                                          type="button"
                                          disabled={les.isPendingCreation}
                                          style={{
                                            fontSize: "0.80rem",
                                            fontWeight: 700,
                                            height: "34px",
                                            borderRadius: "8px",
                                            gap: "6px",
                                            paddingLeft: "16px",
                                            paddingRight: "16px",
                                          }}
                                          className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                        >
                                          <UploadSimple size={15} />
                                          Upload New
                                        </button>
                                        <button
                                          type="button"
                                          disabled={les.isPendingCreation}
                                          style={{
                                            fontSize: "0.80rem",
                                            fontWeight: 500,
                                            height: "34px",
                                            borderRadius: "8px",
                                            gap: "6px",
                                            paddingLeft: "14px",
                                            paddingRight: "14px",
                                          }}
                                          className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text) bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                        >
                                          {les.contentType === "video" ? (
                                            <PlayCircle
                                              size={15}
                                              className="text-(--text-secondary)"
                                            />
                                          ) : (
                                            <FileText
                                              size={15}
                                              className="text-(--text-secondary)"
                                            />
                                          )}
                                          Select from Media
                                        </button>
                                      </div>
                                    </div>

                                    {/* Lesson Publishing Status */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                                        Publishing Status
                                      </label>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div
                                          className={`relative flex items-center gap-3 border rounded-[10px] px-3.5 py-3 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                            les.isPendingCreation
                                              ? "opacity-60 cursor-not-allowed"
                                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                          } ${
                                            les.isPublished !== false
                                              ? "is-selected border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                          }`}
                                          onClick={() => {
                                            if (les.isPendingCreation) return;
                                            void handleLessonDiscreteChange(
                                              sec.id,
                                              les.id,
                                              {
                                                isPublished: true,
                                              },
                                            );
                                          }}
                                        >
                                          <div
                                            className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                                              les.isPublished !== false
                                                ? "border-(--accent)"
                                                : "border-(--muted)"
                                            }`}
                                          >
                                            {les.isPublished !== false && (
                                              <div className="w-2 h-2 rounded-full bg-(--accent)" />
                                            )}
                                          </div>
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-(--text) text-[0.86rem] font-bold leading-[18px]">
                                              Published
                                            </span>
                                            <span className="text-(--muted) text-[0.75rem]">
                                              Visible to enrolled students
                                            </span>
                                          </div>
                                        </div>

                                        <div
                                          className={`relative flex items-center gap-3 border rounded-[10px] px-3.5 py-3 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                            les.isPendingCreation
                                              ? "opacity-60 cursor-not-allowed"
                                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                          } ${
                                            les.isPublished === false
                                              ? "is-selected border-[#f59e0b] bg-[color-mix(in_srgb,#f59e0b_10%,var(--surface))]"
                                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                          }`}
                                          onClick={() => {
                                            if (les.isPendingCreation) return;
                                            void handleLessonDiscreteChange(
                                              sec.id,
                                              les.id,
                                              {
                                                isPublished: false,
                                              },
                                            );
                                          }}
                                        >
                                          <div
                                            className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                                              les.isPublished === false
                                                ? "border-[#f59e0b]"
                                                : "border-(--muted)"
                                            }`}
                                          >
                                            {les.isPublished === false && (
                                              <div className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                                            )}
                                          </div>
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-(--text) text-[0.86rem] font-bold leading-[18px]">
                                              Draft (Hidden)
                                            </span>
                                            <span className="text-(--muted) text-[0.75rem]">
                                              Hidden from students
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Free Preview Toggle */}
                                    <div
                                      className={`flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] mb-5 ${les.isPendingCreation ? "opacity-60 pointer-events-none" : ""}`}
                                    >
                                      <div className="pr-3">
                                        <strong className="block mb-0.5 text-(--text) text-[0.88rem] font-[650]">
                                          Free Preview
                                        </strong>
                                        <p className="m-0 text-(--muted) text-[0.78rem]">
                                          Allow prospective students to view
                                          this lesson before enrolling or
                                          purchasing.
                                        </p>
                                      </div>
                                      <SettingsToggle
                                        checked={les.isPreview === true}
                                        onChange={(checked) => {
                                          if (les.isPendingCreation) return;
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

                                    {/* Lesson Resources Table */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <div className="flex items-center justify-between mb-2 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-2.5">
                                        <label className="flex items-center gap-1.5 text-(--text-secondary) text-[0.84rem] font-semibold">
                                          Lesson Resources
                                        </label>
                                        <div className="flex items-center gap-2 max-[768px]:w-full max-[768px]:flex max-[768px]:gap-2">
                                          <button
                                            type="button"
                                            disabled={les.isPendingCreation}
                                            style={{
                                              fontSize: "0.80rem",
                                              fontWeight: 700,
                                              height: "34px",
                                              borderRadius: "8px",
                                              gap: "6px",
                                              paddingLeft: "16px",
                                              paddingRight: "16px",
                                            }}
                                            className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                            onClick={() =>
                                              handleAddLessonResource(
                                                sec.id,
                                                les.id,
                                              )
                                            }
                                          >
                                            <UploadSimple size={15} />
                                            Upload New
                                          </button>
                                          <button
                                            type="button"
                                            disabled={les.isPendingCreation}
                                            style={{
                                              fontSize: "0.80rem",
                                              fontWeight: 500,
                                              height: "34px",
                                              borderRadius: "8px",
                                              gap: "6px",
                                              paddingLeft: "14px",
                                              paddingRight: "14px",
                                            }}
                                            className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text) bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                            onClick={() =>
                                              handleAddLessonResource(
                                                sec.id,
                                                les.id,
                                              )
                                            }
                                          >
                                            <PlayCircle
                                              size={15}
                                              className="text-(--text-secondary)"
                                            />
                                            Select from Media
                                          </button>
                                        </div>
                                      </div>

                                      {les.resources.length > 0 ? (
                                        <div className="w-full flex flex-col gap-2">
                                          {/* Mobile view: Resource Card List (no side-scroll needed, delete icon always visible) */}
                                          <div className="flex flex-col gap-2 sm:hidden">
                                            {les.resources.map((res) => (
                                              <div
                                                key={res.id}
                                                className="flex items-center justify-between gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl px-3 py-2.5 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]"
                                              >
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                  <FileText
                                                    size={18}
                                                    weight="fill"
                                                    className="text-red-400 shrink-0"
                                                  />
                                                  <div className="flex flex-col min-w-0 flex-1">
                                                    <span className="text-(--text) text-[0.82rem] font-semibold truncate">
                                                      {res.name}
                                                    </span>
                                                    <span className="text-(--muted) text-[0.72rem] flex items-center gap-1.5 mt-0.5">
                                                      <span className="uppercase text-(--text-secondary) font-bold">
                                                        {res.type}
                                                      </span>
                                                      <span>•</span>
                                                      <span>{res.size}</span>
                                                    </span>
                                                  </div>
                                                </div>
                                                <button
                                                  type="button"
                                                  disabled={
                                                    les.isPendingCreation
                                                  }
                                                  className="inline-flex w-7 h-7 shrink-0 items-center justify-center rounded-lg text-(--muted) hover:text-red-400 hover:bg-red-500/10 transition-colors border-0 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                                  onClick={() =>
                                                    handleRemoveLessonResource(
                                                      sec.id,
                                                      les.id,
                                                      res.id,
                                                    )
                                                  }
                                                  aria-label="Remove resource"
                                                  title="Remove resource"
                                                >
                                                  <X size={15} weight="bold" />
                                                </button>
                                              </div>
                                            ))}
                                          </div>

                                          {/* Desktop / Tablet view: Structured Data Table */}
                                          <div className="hidden sm:block w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl overflow-hidden bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                                            <table className="w-full border-collapse text-left">
                                              <thead>
                                                <tr className="bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                                  <th className="px-4 py-2.5 text-(--muted) text-[0.74rem] font-bold tracking-wider uppercase">
                                                    File Name
                                                  </th>
                                                  <th className="px-4 py-2.5 text-(--muted) text-[0.74rem] font-bold tracking-wider uppercase">
                                                    Type
                                                  </th>
                                                  <th className="px-4 py-2.5 text-(--muted) text-[0.74rem] font-bold tracking-wider uppercase">
                                                    Size
                                                  </th>
                                                  <th className="px-4 py-2.5 text-(--muted) text-[0.74rem] font-bold tracking-wider uppercase text-right pr-4">
                                                    Actions
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {les.resources.map((res) => (
                                                  <tr
                                                    key={res.id}
                                                    className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] last:border-b-0 hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors"
                                                  >
                                                    <td className="px-4 py-3 text-(--text) text-[0.82rem] font-semibold">
                                                      <div className="flex items-center gap-2.5">
                                                        <FileText
                                                          size={16}
                                                          weight="fill"
                                                          className="text-red-400 shrink-0"
                                                        />
                                                        <span>{res.name}</span>
                                                      </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-(--text-secondary) text-[0.80rem] font-medium">
                                                      {res.type}
                                                    </td>
                                                    <td className="px-4 py-3 text-(--muted) text-[0.80rem]">
                                                      {res.size}
                                                    </td>
                                                    <td className="px-4 py-3 text-right pr-4">
                                                      <button
                                                        type="button"
                                                        disabled={
                                                          les.isPendingCreation
                                                        }
                                                        className="inline-flex w-7 h-7 items-center justify-center rounded-lg text-(--muted) hover:text-red-400 hover:bg-red-500/10 transition-colors border-0 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        onClick={() =>
                                                          handleRemoveLessonResource(
                                                            sec.id,
                                                            les.id,
                                                            res.id,
                                                          )
                                                        }
                                                        aria-label="Remove resource"
                                                        title="Remove resource"
                                                      >
                                                        <X
                                                          size={14}
                                                          weight="bold"
                                                        />
                                                      </button>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="m-0 mb-3 text-(--muted) text-[0.78rem] min-h-[1.15rem]">
                                          No resources added to this lesson yet.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Add Lesson Action */}
                      <div className="mt-3.5">
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
        ) : panelStep === "access-rules" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top Grid: 1. Who can access & 2. Access duration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Who can access this course? */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5 flex items-center justify-between">
                  <div>
                    <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                      1. Who can access this course?
                    </h3>
                    <p className="m-0 text-(--muted) text-[0.83rem]">
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
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                      isAccessRulesSaving ||
                      savingAccessControls.has("accessType")
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    } ${
                      accessRules.accessType === "everyone"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                    }`}
                    onClick={() => {
                      if (
                        !isAccessRulesSaving &&
                        !savingAccessControls.has("accessType")
                      ) {
                        handleAccessTypeChange("everyone");
                      }
                    }}
                  >
                    <div
                      className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        accessRules.accessType === "everyone"
                          ? "border-(--accent)"
                          : "border-(--muted)"
                      }`}
                    >
                      {accessRules.accessType === "everyone" && (
                        <div className="w-2 h-2 rounded-full bg-(--accent)" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Everyone
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Anyone with access to the platform can access this
                        course.
                      </p>
                    </div>
                  </label>

                  {/* Radio option: Restricted access (Coming soon - Disabled) */}
                  <div
                    className="relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 opacity-60 cursor-not-allowed select-none border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                    aria-disabled="true"
                  >
                    <div className="flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                    <div className="flex flex-1 flex-col gap-0.75 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="text-(--text) text-[0.9rem] font-[650] leading-[18px]">
                          Restricted access
                        </strong>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                          Coming soon
                        </span>
                      </div>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Only users who meet the selected requirements can access
                        this course.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Access duration */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5 flex items-center justify-between">
                  <div>
                    <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                      2. Access duration
                    </h3>
                    <p className="m-0 text-(--muted) text-[0.83rem]">
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
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                      isAccessRulesSaving ||
                      savingAccessControls.has("durationMode")
                        ? "opacity-60 cursor-not-allowed"
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
                      className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        accessRules.durationMode === "lifetime"
                          ? "border-(--accent)"
                          : "border-(--muted)"
                      }`}
                    >
                      {accessRules.durationMode === "lifetime" && (
                        <div className="w-2 h-2 rounded-full bg-(--accent)" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Lifetime access
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Learners can access this course forever.
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Fixed duration */}
                  <div
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                      isAccessRulesSaving ||
                      savingAccessControls.has("durationMode")
                        ? "opacity-60 cursor-not-allowed"
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
                      className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        accessRules.durationMode === "fixed"
                          ? "border-(--accent)"
                          : "border-(--muted)"
                      }`}
                    >
                      {accessRules.durationMode === "fixed" && (
                        <div className="w-2 h-2 rounded-full bg-(--accent)" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Fixed duration
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Set a duration for how long learners can access this
                        course.
                      </p>

                      {accessRules.durationMode === "fixed" && (
                        <div
                          className="flex items-center gap-2.5 mt-3 flex-wrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="number"
                            disabled={
                              isAccessRulesSaving ||
                              savingAccessControls.has("durationMode")
                            }
                            className="w-[80px] h-9 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-0 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.84rem] font-semibold outline-none transition-[border-color] duration-150 hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] focus:border-(--accent) box-border text-center disabled:opacity-60 disabled:cursor-not-allowed"
                            min={1}
                            value={accessRules.fixedDurationValue}
                            onChange={(e) =>
                              handleFixedDurationValueChange(
                                parseInt(e.target.value, 10),
                              )
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
            <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow) w-full">
              <div className="mb-4.5">
                <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                  3. Learner interactions
                </h3>
                <p className="m-0 text-(--muted) text-[0.83rem]">
                  Manage how learners can interact within this course.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {/* Toggle 1: Q&A */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5 min-w-0 pr-3">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                      <Question size={20} weight="bold" />
                    </div>
                    <div className="min-w-0">
                      <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                        Q&A
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem]">
                        Allow learners to ask questions about lessons.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <AccessRulesControlStatusIndicator
                      status={getAccessControlDisplayStatus("enableQA")}
                      testId="access-rules-status-enableQA"
                    />
                    <SettingsToggle
                      checked={accessRules.enableQA}
                      disabled={
                        isAccessRulesSaving ||
                        savingAccessControls.has("enableQA")
                      }
                      onChange={handleToggleQA}
                      label="Toggle Q&A"
                    />
                  </div>
                </div>

                {/* Toggle 2: Comments */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5 min-w-0 pr-3">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                      <ChatCircleText size={20} weight="fill" />
                    </div>
                    <div className="min-w-0">
                      <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                        Comments
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem]">
                        Allow learners to comment on course content.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <AccessRulesControlStatusIndicator
                      status={getAccessControlDisplayStatus("enableComments")}
                      testId="access-rules-status-enableComments"
                    />
                    <SettingsToggle
                      checked={accessRules.enableComments}
                      disabled={
                        isAccessRulesSaving ||
                        savingAccessControls.has("enableComments")
                      }
                      onChange={handleToggleComments}
                      label="Toggle Comments"
                    />
                  </div>
                </div>

                {/* Toggle 3: Downloads */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5 min-w-0 pr-3">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                      <DownloadSimple size={20} weight="bold" />
                    </div>
                    <div className="min-w-0">
                      <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                        Downloads
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem]">
                        Allow learners to download lesson resources for offline
                        access.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <AccessRulesControlStatusIndicator
                      status={getAccessControlDisplayStatus("enableDownloads")}
                      testId="access-rules-status-enableDownloads"
                    />
                    <SettingsToggle
                      checked={accessRules.enableDownloads}
                      disabled={
                        isAccessRulesSaving ||
                        savingAccessControls.has("enableDownloads")
                      }
                      onChange={handleToggleDownloads}
                      label="Toggle Downloads"
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Course pricing */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow) transition-opacity duration-200">
                <div className="flex items-center justify-between mb-4.5">
                  <div>
                    <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                      1. Course pricing
                    </h3>
                    <p className="m-0 text-(--muted) text-[0.83rem]">
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
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                      isSavingPricing || isPricingControlSaving("pricingType")
                        ? "opacity-60 cursor-not-allowed"
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
                      className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        pricing.pricingType === "free"
                          ? "border-(--accent)"
                          : "border-(--muted)"
                      }`}
                    >
                      {pricing.pricingType === "free" && (
                        <div className="w-2 h-2 rounded-full bg-(--accent)" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Free
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Anyone who can access the course can enroll for free.
                      </p>
                    </div>
                  </div>

                  {/* Radio Option: Paid */}
                  <div
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                      isSavingPricing || isPricingControlSaving("pricingType")
                        ? "opacity-60 cursor-not-allowed"
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
                      className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        pricing.pricingType === "paid"
                          ? "border-(--accent)"
                          : "border-(--muted)"
                      }`}
                    >
                      {pricing.pricingType === "paid" && (
                        <div className="w-2 h-2 rounded-full bg-(--accent)" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Paid
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Learners must purchase the course to get access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Price details */}
              <div
                className={`flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow) transition-opacity duration-200 ${
                  pricing.pricingType === "free"
                    ? "is-disabled opacity-55 pointer-events-none"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between mb-4.5">
                  <div>
                    <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                      2. Price details
                    </h3>
                    <p className="m-0 text-(--muted) text-[0.83rem]">
                      Set the pricing for your course.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.75">
                  {/* Currency Combobox Field */}
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between">
                      <label
                        id="currency-label"
                        className="text-(--text-secondary) text-[0.84rem] font-semibold"
                      >
                        Currency <span className="text-[#ff5252] ml-0.5">*</span>
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
                    <p className="m-0 mt-1 text-(--muted) text-[0.78rem]">
                      Choose the currency for course pricing.
                    </p>
                  </div>

                  {/* Selling Price Field */}
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="selling-price"
                        className="text-(--text-secondary) text-[0.84rem] font-semibold"
                      >
                        Selling price{" "}
                        <span className="text-[#ff5252] ml-0.5">*</span>
                      </label>
                      <PricingControlStatusIndicator
                        status={getPricingControlDisplayStatus("sellingPrice")}
                        testId="pricing-field-status-sellingPrice"
                      />
                    </div>
                    <div className="relative flex items-center w-full">
                      <span className="absolute left-3.5 text-(--muted) text-[0.9rem] font-semibold pointer-events-none">
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
                        onChange={(e) =>
                          handleSellingPriceChange(e.target.value)
                        }
                        onBlur={() => {
                          void flushPricingPersistence();
                        }}
                        placeholder="1999"
                        className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 pr-3.5 pl-8 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="m-0 mt-1 text-(--muted) text-[0.78rem]">
                      This is the price learners will pay.
                    </p>
                  </div>

                  {/* Original Price Field */}
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="original-price"
                        className="text-(--text-secondary) text-[0.84rem] font-semibold"
                      >
                        Original price
                      </label>
                      <PricingControlStatusIndicator
                        status={getPricingControlDisplayStatus("originalPrice")}
                        testId="pricing-field-status-originalPrice"
                      />
                    </div>
                    <div className="relative flex items-center w-full">
                      <span className="absolute left-3.5 text-(--muted) text-[0.9rem] font-semibold pointer-events-none">
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
                        onChange={(e) =>
                          handleOriginalPriceChange(e.target.value)
                        }
                        onBlur={() => {
                          void flushPricingPersistence();
                        }}
                        placeholder="2999"
                        className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 pr-3.5 pl-8 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="m-0 mt-1 text-(--muted) text-[0.78rem]">
                      Enter original price to show discount.
                    </p>
                  </div>

                  {/* Dynamic Discount Calculation Badge */}
                  {(() => {
                    const sell = parseFloat(
                      pricing.sellingPrice.replace(/,/g, ""),
                    );
                    const orig = parseFloat(
                      pricing.originalPrice.replace(/,/g, ""),
                    );
                    let discountPercent = 0;
                    let isValidDiscount = false;

                    if (
                      !isNaN(sell) &&
                      !isNaN(orig) &&
                      sell > 0 &&
                      orig > sell
                    ) {
                      discountPercent = Math.round(
                        ((orig - sell) / orig) * 100,
                      );
                      isValidDiscount = discountPercent > 0;
                    }

                    return (
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <div
                          className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap border rounded-lg px-2.5 py-1.5 text-[0.80rem] font-bold transition-[border-color,background-color,color] duration-150 ease-out ${
                            isValidDiscount && pricing.pricingType === "paid"
                              ? "is-active border-green-500/40 text-green-400 bg-green-500/12"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-(--muted) bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                          }`}
                        >
                          <Tag size={15} weight="bold" className="shrink-0" />
                          <span className="whitespace-nowrap leading-none">
                            {isValidDiscount && pricing.pricingType === "paid"
                              ? `${discountPercent}% OFF`
                              : "0% OFF"}
                          </span>
                        </div>
                        <span className="text-(--muted) text-[0.8rem] leading-tight">
                          Discount is calculated automatically.
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Bottom Card: Coupons Banner */}
            <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[14px] px-5.5 py-4 bg-(--surface) shadow-(--card-shadow) max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3.5">
              <div className="flex items-center gap-3.5">
                <div className="flex w-9.5 h-9.5 items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                  <Info size={20} weight="bold" />
                </div>
                <div>
                  <strong className="block mb-0.5 text-(--text) text-[0.92rem] font-[650]">
                    Coupons
                  </strong>
                  <p className="m-0 text-(--muted) text-[0.82rem]">
                    Create and manage coupon codes separately from the Coupons
                    section.
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
                className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] max-[768px]:w-full max-[768px]:justify-center"
                onClick={() => {
                  if (onNavigatePage) {
                    onNavigatePage("settings");
                  }
                }}
              >
                Go to Coupons <ArrowUpRight size={15} weight="bold" />
              </button>
            </div>
          </div>
        ) : panelStep === "extras" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Certificates & 2. This course includes */}
            <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Certificates */}
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    1. Certificates
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Configure how certificates will be issued for this course.
                  </p>
                </div>

                {/* Enable Certificate Toggle Row */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] mb-4.5">
                  <div className="flex flex-col min-w-0 pr-3">
                    <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                      Enable certificate
                    </strong>
                    <p className="m-0 text-(--muted) text-[0.8rem]">
                      Issue certificates to learners on course completion.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
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
                      ? "is-disabled opacity-50 pointer-events-none"
                      : ""
                  }`}
                >
                  {/* Template Selector */}
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Certificate template
                      </label>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-(--muted) text-[0.78rem]">
                      Choose from pre-designed certificate templates.
                    </p>
                    <div className="opacity-60 cursor-not-allowed pointer-events-none">
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
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Certificate issuance
                      </label>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-(--muted) text-[0.78rem]">
                      Choose when the certificate should be issued.
                    </p>

                    <div className="flex flex-col gap-2.5 opacity-60 cursor-not-allowed pointer-events-none select-none">
                      {/* Option 1: On course completion */}
                      <div
                        className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                          extras.issuanceType === "completion"
                            ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                        }`}
                      >
                        <div
                          className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                            extras.issuanceType === "completion"
                              ? "border-(--accent)"
                              : "border-(--muted)"
                          }`}
                        >
                          {extras.issuanceType === "completion" && (
                            <div className="w-2 h-2 rounded-full bg-(--accent)" />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-0.75">
                          <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                            On course completion
                          </strong>
                          <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                            Issue certificate when the learner completes all
                            lessons.
                          </p>
                        </div>
                      </div>

                      {/* Option 2: Minimum completion percentage */}
                      <div
                        className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                          extras.issuanceType === "percentage"
                            ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                        }`}
                      >
                        <div
                          className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                            extras.issuanceType === "percentage"
                              ? "border-(--accent)"
                              : "border-(--muted)"
                          }`}
                        >
                          {extras.issuanceType === "percentage" && (
                            <div className="w-2 h-2 rounded-full bg-(--accent)" />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-0.75">
                          <div className="flex items-center justify-between w-full">
                            <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                              Minimum completion percentage
                            </strong>
                            {extras.issuanceType === "percentage" && (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  disabled
                                  className="w-[76px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.86rem] font-semibold outline-none text-center cursor-not-allowed"
                                  min={1}
                                  max={100}
                                  value={extras.minCompletionPercentage}
                                  readOnly
                                />
                                <span className="text-(--text) text-[0.86rem] font-bold">
                                  %
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                            Issue certificate when learner reaches the selected
                            percentage.
                          </p>
                        </div>
                      </div>

                      {/* Option 3: Custom rule */}
                      <div
                        className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                          extras.issuanceType === "custom"
                            ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                        }`}
                      >
                        <div
                          className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                            extras.issuanceType === "custom"
                              ? "border-(--accent)"
                              : "border-(--muted)"
                          }`}
                        >
                          {extras.issuanceType === "custom" && (
                            <div className="w-2 h-2 rounded-full bg-(--accent)" />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-0.75">
                          <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                            Custom rule
                          </strong>
                          <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                            Define your own custom rule for certificate
                            issuance.
                          </p>

                          {extras.issuanceType === "custom" && (
                            <div className="mt-2 w-full">
                              <input
                                type="text"
                                disabled
                                readOnly
                                className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.84rem] outline-none cursor-not-allowed"
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
                  <div className="flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3.5 opacity-60 cursor-not-allowed">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <strong className="text-(--text) text-[0.88rem] font-[650]">
                          Delivery
                        </strong>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                          Coming soon
                        </span>
                      </div>
                      <p className="m-0 text-(--muted) text-[0.78rem]">
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
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    2. This course includes
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    These details are calculated from your curriculum.
                  </p>
                </div>

                {/* Derived Live Stats Summary Grid */}
                <div className="grid grid-cols-1 min-[1024px]:grid-cols-3 gap-3 mb-6 max-[768px]:gap-2.5">
                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-[12px_14px] max-[768px]:gap-3.5">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-indigo-500 bg-indigo-500/[0.14] max-[768px]:w-10 max-[768px]:h-10">
                      <BookOpen size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col">
                      <strong className="text-(--text) text-base font-[750] leading-[1.2] max-[768px]:text-[1.05rem]">
                        {totalSections}
                      </strong>
                      <span className="text-(--muted) text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                        Sections
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-[12px_14px] max-[768px]:gap-3.5">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-purple-500 bg-purple-500/[0.14] max-[768px]:w-10 max-[768px]:h-10">
                      <PlayCircle size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col">
                      <strong className="text-(--text) text-base font-[750] leading-[1.2] max-[768px]:text-[1.05rem]">
                        {totalLessons}
                      </strong>
                      <span className="text-(--muted) text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                        Lessons
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-[12px_14px] max-[768px]:gap-3.5">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-blue-500 bg-blue-500/[0.14] max-[768px]:w-10 max-[768px]:h-10">
                      <Clock size={20} weight="bold" />
                    </div>
                    <div className="flex flex-col">
                      <strong className="text-(--text) text-base font-[750] leading-[1.2] max-[768px]:text-[1.05rem]">
                        0m
                      </strong>
                      <span className="text-(--muted) text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                        Content length
                      </span>
                    </div>
                  </div>
                </div>

                {/* Divider between Stats & Inclusions */}
                <div className="border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] my-4.5" />

                {/* Additional Inclusions Section */}
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <h4 className="m-0 text-(--text) text-[0.95rem] font-bold">
                        Course inclusions
                      </h4>
                      {isReorderingIncludes ||
                      reorderIncludesMutation.isPending ? (
                        <span className="inline-flex items-center gap-1 text-(--accent) text-[0.72rem] font-bold px-2.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                          <CircleNotch
                            size={12}
                            className="animate-spin text-(--accent)"
                          />
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
                      className={`inline-flex items-center px-2.5 py-0.75 rounded-full text-[0.72rem] font-bold tracking-wide border ${
                        manualIncludesDraft.length >= 6
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                          : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted) border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      }`}
                    >
                      {manualIncludesDraft.length} / 6
                    </span>
                  </div>
                  <p className="m-0 text-(--muted) text-[0.82rem] leading-normal">
                    Perks and benefits your learners will receive upon enrolling (max 6 items). Click suggestions below or add custom inclusions.
                  </p>

                  {/* Active Inclusions List */}
                  <div className="flex flex-col gap-2.5">
                    {manualIncludesDraft.length === 0 ? (
                      <div className="border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-xl p-5 text-center text-(--muted) text-[0.82rem] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))]">
                        No inclusions added yet. Choose from the suggested perks below or add a custom benefit.
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
                          onDragStart={(e) =>
                            handleInclusionDragStart(e, index, item.text)
                          }
                          onDragOver={(e) => handleInclusionDragOver(e, index)}
                          onDragEnd={handleInclusionDragEnd}
                          className={`flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 px-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] transition-all ${
                            item.isPendingCreation ||
                            deletingIncludeIds.has(item.id) ||
                            savingIncludeIds.has(item.id)
                              ? "opacity-75 border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                              : isReorderingIncludes || isExtrasSaving
                                ? "opacity-60"
                                : "hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-xs"
                          }`}
                        >
                          {item.isPendingCreation ? (
                            <span
                              className="flex items-center justify-center p-1 rounded-md shrink-0 text-(--accent)"
                              title="Adding inclusion..."
                            >
                              <CircleNotch
                                size={18}
                                className="animate-spin text-(--accent)"
                              />
                            </span>
                          ) : (
                            <span
                              className={`flex items-center justify-center p-1 rounded-md shrink-0 transition-colors ${
                                isReorderingIncludes ||
                                reorderIncludesMutation.isPending ||
                                isExtrasSaving ||
                                deletingIncludeIds.has(item.id) ||
                                savingIncludeIds.has(item.id)
                                  ? "opacity-30 cursor-not-allowed pointer-events-none"
                                  : "text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] select-none cursor-grab active:cursor-grabbing"
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
                              onMouseLeave={() =>
                                setDragEnabledInclusionId(null)
                              }
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
                            className="flex-1 min-w-0 border-none text-(--text) bg-transparent text-[0.88rem] font-medium outline-none placeholder:text-(--muted) disabled:opacity-60 disabled:cursor-not-allowed"
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
                            <span className="text-(--muted) text-[0.74rem] font-medium shrink-0 select-none px-1">
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
                            className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all bg-transparent cursor-pointer p-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none shrink-0"
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
                              <CircleNotch
                                size={14}
                                className="animate-spin text-red-500"
                              />
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
                    <div className="flex flex-col gap-2 mt-1">
                      <span className="text-(--muted) text-[0.74rem] font-bold uppercase tracking-wider">
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
                              onClick={() =>
                                handleAddManualInclusion(suggestion)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.78rem] font-semibold border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] text-(--text-secondary) hover:text-(--text) hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
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
                    className={`inline-flex items-center justify-center gap-2 h-9 w-full border border-dashed rounded-xl text-[0.84rem] font-bold mt-1 transition-all ${
                      manualIncludesDraft.length >= 6 ||
                      isReorderingIncludes ||
                      isExtrasSaving
                        ? "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) opacity-50 cursor-not-allowed"
                        : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] hover:border-(--accent) cursor-pointer"
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
            <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Publish settings */}
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    1. Publish settings
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Choose when and how your course becomes visible.
                  </p>
                </div>

                {/* Informational Course Status Display */}
                <div className="flex flex-col gap-1.5 mb-4.5">
                  <label className="text-(--text) text-[0.86rem] font-[650]">
                    Course status
                  </label>
                  <div className="flex items-center mt-0.5">
                    <span
                      className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.8rem] font-bold uppercase tracking-[0.04em] ${
                        isPublished
                          ? "is-published border border-green-500/35 text-green-500 bg-green-500/12"
                          : "is-draft border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--muted) bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                      }`}
                    >
                      {isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-(--muted) text-[0.78rem] leading-[1.4]">
                    {isPublished
                      ? "Your course is currently published and visible to students according to your settings."
                      : "Your course is currently a draft and hasn't been published yet."}
                  </p>
                </div>
                {/* Course visibility select */}
                <div className="flex flex-col gap-1.5 mb-4.5">
                  <div className="flex items-center justify-between">
                    <label className="text-(--text) text-[0.86rem] font-[650]">
                      Course visibility
                    </label>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                      Coming soon
                    </span>
                  </div>
                  <div className="opacity-60 cursor-not-allowed pointer-events-none">
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
                <div className="flex flex-col gap-1.5 mb-4.5">
                  <div className="flex items-center justify-between">
                    <label className="text-(--text) text-[0.86rem] font-[650]">
                      Publish on
                    </label>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                      Coming soon
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 opacity-60 pointer-events-none cursor-not-allowed select-none">
                    {/* Option 1: Publish immediately */}
                    <div
                      className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-not-allowed select-none ${
                        publishSettings.scheduleOption === "now"
                          ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                      }`}
                    >
                      <div
                        className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                          publishSettings.scheduleOption === "now"
                            ? "border-(--accent)"
                            : "border-(--muted)"
                        }`}
                      >
                        {publishSettings.scheduleOption === "now" && (
                          <div className="w-2 h-2 rounded-full bg-(--accent)" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.75">
                        <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                          Publish immediately
                        </strong>
                        <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                          Make this course live immediately upon saving.
                        </p>
                      </div>
                    </div>

                    {/* Option 2: Schedule for later */}
                    <div
                      className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-not-allowed select-none ${
                        publishSettings.scheduleOption === "later"
                          ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                      }`}
                    >
                      <div
                        className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                          publishSettings.scheduleOption === "later"
                            ? "border-(--accent)"
                            : "border-(--muted)"
                        }`}
                      >
                        {publishSettings.scheduleOption === "later" && (
                          <div className="w-2 h-2 rounded-full bg-(--accent)" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.75">
                        <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                          Schedule for a future date
                        </strong>
                        <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                          Set a specific date and time when this course should
                          go live.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Pre-publish Checklist */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    2. Pre-publish Checklist
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Review all required items before publishing your course.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5 mb-5">
                  {/* Checklist Item: Basics */}
                  <div
                    className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    onClick={() => {
                      void navigateToStep("basics");
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={
                          isBasicsValid
                            ? "is-valid text-green-500"
                            : "is-invalid text-rose-400/50"
                        }
                      />
                      <strong className="text-(--text) text-[0.9rem] font-[650]">
                        Basics
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-(--muted) text-[0.82rem]">
                      <span>{isBasicsValid ? "Completed" : "Incomplete"}</span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Curriculum */}
                  <div
                    className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    onClick={() => {
                      void navigateToStep("curriculum");
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={
                          isCurriculumValid
                            ? "is-valid text-green-500"
                            : "is-invalid text-rose-400/50"
                        }
                      />
                      <strong className="text-(--text) text-[0.9rem] font-[650]">
                        Curriculum
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-(--muted) text-[0.82rem]">
                      <span>
                        {totalSections} Sections, {totalLessons} Lessons
                      </span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Access Rules */}
                  <div
                    className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    onClick={() => {
                      void navigateToStep("access-rules");
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={
                          isAccessRulesValid
                            ? "is-valid text-green-500"
                            : "is-invalid text-rose-400/50"
                        }
                      />
                      <strong className="text-(--text) text-[0.9rem] font-[650]">
                        Access Rules
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-(--muted) text-[0.82rem]">
                      <span>
                        {accessRules.accessType === "everyone"
                          ? "Everyone"
                          : "Restricted Access"}
                      </span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Pricing */}
                  <div
                    className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    onClick={() => {
                      void navigateToStep("pricing");
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={
                          isPricingValid
                            ? "is-valid text-green-500"
                            : "is-invalid text-rose-400/50"
                        }
                      />
                      <strong className="text-(--text) text-[0.9rem] font-[650]">
                        Pricing
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-(--muted) text-[0.82rem]">
                      <span>
                        {pricing.pricingType === "free"
                          ? "Free"
                          : `₹${pricing.sellingPrice}`}
                      </span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Extras */}
                  <div
                    className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    onClick={() => {
                      void navigateToStep("extras");
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={
                          isExtrasValid
                            ? "is-valid text-green-500"
                            : "is-invalid text-rose-400/50"
                        }
                      />
                      <strong className="text-(--text) text-[0.9rem] font-[650]">
                        Extras
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-(--muted) text-[0.82rem]">
                      <span>
                        {extras.enableCertificate
                          ? "Certificate Enabled"
                          : "Disabled"}
                      </span>
                      <CaretRight size={16} />
                    </div>
                  </div>
                </div>

                {/* Ready-to-publish State Box */}
                {isCourseReadyToPublish ? (
                  <div className="flex items-center gap-4 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl px-4.5 py-4 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                    <div className="flex w-10.5 h-10.5 shrink-0 items-center justify-center rounded-xl text-(--accent) bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]">
                      <BookOpen size={24} weight="fill" />
                    </div>
                    <div>
                      <strong className="block mb-0.75 text-(--text) text-[0.94rem] font-bold">
                        Your course is ready to be published!
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Once published, students can see and enroll in this
                        course according to your settings.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 border border-red-500/30 rounded-xl px-4.5 py-4 bg-red-500/8">
                    <div className="flex w-10.5 h-10.5 shrink-0 items-center justify-center rounded-xl text-red-500 bg-red-500/16">
                      <Info size={24} weight="bold" />
                    </div>
                    <div>
                      <strong className="block mb-0.75 text-(--text) text-[0.94rem] font-bold">
                        Course needs attention
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem]">
                        Please fix incomplete sections highlighted above before
                        publishing.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Card 3: What happens after publishing? */}
            <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
              <h3 className="m-0 mb-4.5 text-(--text) text-[1.05rem] font-bold">
                3. What happens after publishing?
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {/* Feature 1: Visible to students */}
                <div className="flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                  <div className="flex w-10 h-10 items-center justify-center rounded-[10px] text-indigo-500 bg-indigo-500/[0.14]">
                    <Eye size={22} weight="bold" />
                  </div>
                  <div>
                    <strong className="block mb-1 text-(--text) text-[0.9rem] font-[650]">
                      Visible to students
                    </strong>
                    <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                      Students will be able to discover your course on the
                      platform.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Enrollment starts */}
                <div className="flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                  <div className="flex w-10 h-10 items-center justify-center rounded-[10px] text-purple-500 bg-purple-500/[0.14]">
                    <UserPlus size={22} weight="bold" />
                  </div>
                  <div>
                    <strong className="block mb-1 text-(--text) text-[0.9rem] font-[650]">
                      Enrollment starts
                    </strong>
                    <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                      Students who meet the access rules can enroll in your
                      course.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Track performance */}
                <div className="flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                  <div className="flex w-10 h-10 items-center justify-center rounded-[10px] text-blue-500 bg-blue-500/[0.14]">
                    <PlayCircle size={22} weight="fill" />
                  </div>
                  <div>
                    <strong className="block mb-1 text-(--text) text-[0.9rem] font-[650]">
                      Track performance
                    </strong>
                    <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                      Monitor enrollments, progress, and engagement in
                      real-time.
                    </p>
                  </div>
                </div>

                {/* Feature 4: Earn with every sale */}
                <div className="flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                  <div className="flex w-10 h-10 items-center justify-center rounded-[10px] text-pink-500 bg-pink-500/[0.14]">
                    <ChartBar size={22} weight="bold" />
                  </div>
                  <div>
                    <strong className="block mb-1 text-(--text) text-[0.9rem] font-[650]">
                      Earn with every sale
                    </strong>
                    <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                      Get paid for every successful enrollment.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative z-10 grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)] gap-6 items-start max-[768px]:gap-4.5 w-full min-w-0">
            <section className="relative z-10 rounded-[14px] p-6 bg-(--surface) shadow-(--card-shadow) max-[768px]:p-4">
              <div className="mb-4.5">
                <h2 className="m-0 text-(--text) text-[1.18rem] font-[650] tracking-[-0.015em]">
                  {WIZARD_STEPS.find((s) => s.id === panelStep)?.label}
                </h2>
                <p className="m-0 mt-1 mb-5 text-(--muted) text-[0.82rem]">
                  This section will allow configuring course {panelStep}.
                </p>
              </div>
            </section>
          </div>
        )}
      </SwipeableTabPanel>

      {/* Sticky Bottom Action Bar (Desktop / Tablet) */}
      <div
        className="course-wizard-sticky-bottom-bar"
        data-testid="course-wizard-sticky-bottom-bar"
      >
        <div className="relative flex items-center justify-between gap-2.5 sm:gap-3 w-full max-w-[1400px] mx-auto">
          {/* Left: Preview Button */}
          <div className="flex items-center gap-2.5 shrink-0">
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
              className={`inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent transition-all duration-150 ${
                isAnyApiInProgress || isPreviewLoading
                  ? "!opacity-40 !cursor-not-allowed !pointer-events-none hover:!bg-transparent hover:!text-(--text-secondary)"
                  : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
              }`}
              onClick={handlePreviewAction}
              disabled={isAnyApiInProgress || isPreviewLoading}
            >
              {isPreviewLoading ? (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-(--accent)"
                  />
                  <span>Opening...</span>
                </>
              ) : (
                <>
                  <Eye size={15} />
                  <span>Preview</span>
                </>
              )}
            </button>
          </div>

          {/* Center: True horizontal center save status */}
          {activeStep === "basics" && basicsOverallStatus && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
              data-testid="basics-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
                {basicsOverallStatus === "saving" && (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-(--accent)"
                    />
                    <span className="text-(--text-secondary)">
                      Saving changes...
                    </span>
                  </>
                )}
                {basicsOverallStatus === "failed" && (
                  <>
                    <WarningCircle
                      size={14}
                      weight="fill"
                      className="text-rose-500 shrink-0"
                    />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {basicsOverallStatus === "saved" && (
                  <>
                    <CheckCircle
                      size={14}
                      weight="fill"
                      className="text-emerald-500 shrink-0"
                    />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Curriculum */}
          {activeStep === "curriculum" && curriculumOverallStatus && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
              data-testid="curriculum-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
                {curriculumOverallStatus === "saving" && (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-(--accent)"
                    />
                    <span className="text-(--text-secondary)">
                      Saving changes...
                    </span>
                  </>
                )}
                {curriculumOverallStatus === "failed" && (
                  <>
                    <WarningCircle
                      size={14}
                      weight="fill"
                      className="text-rose-500 shrink-0"
                    />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {curriculumOverallStatus === "saved" && (
                  <>
                    <CheckCircle
                      size={14}
                      weight="fill"
                      className="text-emerald-500 shrink-0"
                    />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Access Rules */}
          {activeStep === "access-rules" && accessRulesOverallStatus && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
              data-testid="access-rules-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
                {accessRulesOverallStatus === "saving" && (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-(--accent)"
                    />
                    <span className="text-(--text-secondary)">
                      Saving changes...
                    </span>
                  </>
                )}
                {accessRulesOverallStatus === "failed" && (
                  <>
                    <WarningCircle
                      size={14}
                      weight="fill"
                      className="text-rose-500 shrink-0"
                    />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {accessRulesOverallStatus === "saved" && (
                  <>
                    <CheckCircle
                      size={14}
                      weight="fill"
                      className="text-emerald-500 shrink-0"
                    />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Pricing */}
          {activeStep === "pricing" && pricingOverallStatus && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
              data-testid="pricing-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
                {pricingOverallStatus === "saving" && (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-(--accent)"
                    />
                    <span className="text-(--text-secondary)">
                      Saving changes...
                    </span>
                  </>
                )}
                {pricingOverallStatus === "failed" && (
                  <>
                    <WarningCircle
                      size={14}
                      weight="fill"
                      className="text-rose-500 shrink-0"
                    />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {pricingOverallStatus === "saved" && (
                  <>
                    <CheckCircle
                      size={14}
                      weight="fill"
                      className="text-emerald-500 shrink-0"
                    />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Extras */}
          {activeStep === "extras" && extrasOverallStatus && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
              data-testid="extras-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
                {extrasOverallStatus === "saving" && (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-(--accent)"
                    />
                    <span className="text-(--text-secondary)">
                      Saving changes...
                    </span>
                  </>
                )}
                {extrasOverallStatus === "failed" && (
                  <>
                    <WarningCircle
                      size={14}
                      weight="fill"
                      className="text-rose-500 shrink-0"
                    />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {extrasOverallStatus === "saved" && (
                  <>
                    <CheckCircle
                      size={14}
                      weight="fill"
                      className="text-emerald-500 shrink-0"
                    />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Center: True horizontal center save status for Publish */}
          {activeStep === "publish" && publishOverallStatus && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
              data-testid="publish-overall-save-status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
                {publishOverallStatus === "saving" && (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-(--accent)"
                    />
                    <span className="text-(--text-secondary)">
                      Saving changes...
                    </span>
                  </>
                )}
                {publishOverallStatus === "failed" && (
                  <>
                    <WarningCircle
                      size={14}
                      weight="fill"
                      className="text-rose-500 shrink-0"
                    />
                    <span className="text-rose-500">Save failed</span>
                  </>
                )}
                {publishOverallStatus === "saved" && (
                  <>
                    <CheckCircle
                      size={14}
                      weight="fill"
                      className="text-emerald-500 shrink-0"
                    />
                    <span className="text-emerald-500">All changes saved</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Right: Previous & Next / Validate / Publish Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap justify-end">
            {/* Previous Button */}
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
              className={`inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent transition-all duration-150 ${
                activeStep === "basics" || actionLoading !== null
                  ? "!opacity-40 !cursor-not-allowed !pointer-events-none hover:!bg-transparent hover:!text-(--text-secondary)"
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
                className="inline-flex items-center border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleValidateCourseAction}
                disabled={actionLoading !== null || isValidating}
              >
                {actionLoading === "validate" || isValidating ? (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-(--accent)"
                    />
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
                className={`inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out ${
                  actionLoading !== null ||
                  (!isDownstreamUnlocked && activeStep === "basics")
                    ? "!opacity-40 !cursor-not-allowed !shadow-none"
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
                  actionLoading !== null ||
                  (!isDownstreamUnlocked && activeStep === "basics")
                }
                aria-label="Next Step"
              >
                {actionLoading === "save" ? (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-white"
                    />
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
                    className="inline-flex items-center justify-center border border-red-500/30 text-red-400 bg-red-500/10 cursor-pointer transition-all duration-150 hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={actionLoading !== null}
                    onClick={() => setIsUnpublishModalOpen(true)}
                    title="Unpublish this course and return it to draft state"
                  >
                    {actionLoading === "unpublish" ? (
                      <>
                        <CircleNotch
                          size={14}
                          className="animate-spin text-red-400"
                        />
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
                  className={`inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out ${
                    !isCourseReadyToPublish
                      ? "!opacity-40 !cursor-not-allowed filter blur-[0.4px] pointer-events-none select-none !shadow-none"
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
                      <CircleNotch
                        size={15}
                        className="animate-spin text-white"
                      />
                      <span>
                        {isPublished ? "Updating..." : "Publishing..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <Lightning size={15} weight="bold" />
                      <span>{isPublished ? "Update Course" : "Publish"}</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Basics only, above mobile bar) */}
      {activeStep === "basics" && basicsOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="basics-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {basicsOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {basicsOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {basicsOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Curriculum only, above mobile bar) */}
      {activeStep === "curriculum" && curriculumOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="curriculum-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {curriculumOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {curriculumOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {curriculumOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Access Rules only, above mobile bar) */}
      {activeStep === "access-rules" && accessRulesOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="access-rules-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {accessRulesOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {accessRulesOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {accessRulesOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Pricing only, above mobile bar) */}
      {activeStep === "pricing" && pricingOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="pricing-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {pricingOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {pricingOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {pricingOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Extras only, above mobile bar) */}
      {activeStep === "extras" && extrasOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="extras-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {extrasOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {extrasOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {extrasOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Publish only, above mobile bar) */}
      {activeStep === "publish" && publishOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="publish-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {publishOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {publishOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {publishOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Action Bar */}
      <div
        className={`course-wizard-mobile-action-bar${
          bottomNavHidden ? " is-scroll-hidden" : ""
        }`}
      >
        {/* Preview Button */}
        <button
          type="button"
          style={{
            fontSize: "0.84rem",
            fontWeight: 500,
            height: "44px",
            borderRadius: "12px",
            gap: "6px",
          }}
          className={`flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent transition-all active:scale-[0.98] ${
            isAnyApiInProgress || isPreviewLoading
              ? "!opacity-40 !cursor-not-allowed !pointer-events-none hover:!bg-transparent hover:!text-(--text-secondary)"
              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
          }`}
          onClick={handlePreviewAction}
          disabled={isAnyApiInProgress || isPreviewLoading}
        >
          {isPreviewLoading ? (
            <>
              <CircleNotch
                size={14}
                className="animate-spin text-(--accent)"
              />
              <span>Opening...</span>
            </>
          ) : (
            <>
              <Eye size={14} />
              <span>Preview</span>
            </>
          )}
        </button>

        {/* Previous Button */}
        <button
          type="button"
          style={{
            fontSize: "0.84rem",
            fontWeight: 500,
            height: "44px",
            borderRadius: "12px",
            gap: "6px",
          }}
          className={`flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent transition-all active:scale-[0.98] ${
            activeStep === "basics" || actionLoading !== null
              ? "!opacity-40 !cursor-not-allowed !pointer-events-none hover:!bg-transparent hover:!text-(--text-secondary)"
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
            className="flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleValidateCourseAction}
            disabled={actionLoading !== null || isValidating}
          >
            {actionLoading === "validate" || isValidating ? (
              <>
                <CircleNotch
                  size={14}
                  className="animate-spin text-(--accent)"
                />
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
            className={`flex-1 inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all ${
              actionLoading !== null ||
              (!isDownstreamUnlocked && activeStep === "basics")
                ? "!opacity-40 !cursor-not-allowed !shadow-none"
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
            disabled={
              actionLoading !== null ||
              (!isDownstreamUnlocked && activeStep === "basics")
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
                className="flex-1 inline-flex items-center justify-center border border-red-500/35 text-red-400 bg-red-500/10 cursor-pointer transition-all hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={actionLoading !== null}
                onClick={() => setIsUnpublishModalOpen(true)}
              >
                {actionLoading === "unpublish" ? (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-red-400"
                    />
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

            <button
              type="button"
              style={{
                fontSize: "0.84rem",
                fontWeight: 600,
                height: "44px",
                borderRadius: "14px",
                gap: "6px",
              }}
              className={`flex-1 inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all ${
                !isCourseReadyToPublish
                  ? "!opacity-40 !cursor-not-allowed filter blur-[0.4px] pointer-events-none select-none !shadow-none"
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
                  <span>{isPublished ? "Updating..." : "Publishing..."}</span>
                </>
              ) : (
                <>
                  <Lightning size={15} weight="bold" />
                  <span>{isPublished ? "Update Course" : "Publish"}</span>
                </>
              )}
            </button>
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
        onClose={() =>
          setDeleteModalState((prev) => ({ ...prev, isOpen: false }))
        }
      />

      {/* Realistic Student-Facing Course Overview Full Preview Modal */}
      {isPreviewModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-1200 flex flex-col bg-black/80 backdrop-blur-xl animate-[deleteModalFadeIn_0.2s_ease-out] p-4 box-border max-[640px]:p-0"
            onClick={() => setIsPreviewModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Course Overview Preview"
          >
            <div
              className="relative flex flex-col w-full max-w-345 h-full max-h-[94vh] m-auto border border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-[20px] bg-[color-mix(in_srgb,var(--surface)_24%,var(--canvas))] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden animate-[deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] max-[640px]:max-h-screen max-[640px]:h-screen max-[640px]:rounded-none max-[640px]:border-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Bar */}
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) shrink-0 max-[640px]:px-3.5 max-[640px]:py-2.5">
                <div className="flex items-center flex-wrap gap-x-3 gap-y-2 min-w-0 flex-1 max-[640px]:gap-1.5">
                  <div className="inline-flex items-center gap-2 text-[0.92rem] font-bold text-(--text) tracking-[-0.01em] whitespace-nowrap overflow-hidden text-ellipsis max-[640px]:text-[0.85rem]">
                    <Eye size={18} weight="bold" />
                    <span>Student Course Overview Preview</span>
                  </div>
                  {hasUnsavedChanges ? (
                    <span className="inline-flex items-center gap-1.25 px-2.25 py-0.75 rounded-full border border-[color-mix(in_srgb,#f59e0b_35%,transparent)] bg-[color-mix(in_srgb,#f59e0b_15%,transparent)] text-[#d97706] dark:text-[#fbbf24] text-[0.7rem] font-[650] whitespace-nowrap shrink-0 max-[640px]:text-[0.66rem] max-[640px]:px-1.75 max-[640px]:py-0.5">
                      <Info size={12} weight="bold" />
                      Last saved version
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.25 px-2.25 py-0.75 rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_40%,transparent)] text-(--muted) text-[0.7rem] font-medium whitespace-nowrap shrink-0 max-[640px]:text-[0.66rem] max-[640px]:px-1.75 max-[640px]:py-0.5">
                      <CheckCircle size={12} weight="fill" className="text-(--accent)" />
                      Previewing saved version
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="inline-flex w-7 h-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--surface-strong)72%,transparent)] text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] transition-all duration-150 bg-transparent cursor-pointer p-0"
                  onClick={() => setIsPreviewModalOpen(false)}
                  aria-label="Close Preview"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Informational banner when unsaved changes exist in editor */}
              {hasUnsavedChanges && currentCourseId && (
                <div className="flex items-center gap-2 px-5 py-2 bg-[color-mix(in_srgb,#f59e0b_10%,var(--surface))] border-b border-[color-mix(in_srgb,#f59e0b_22%,transparent)] text-[#d97706] dark:text-[#fbbf24] text-[0.79rem] font-medium shrink-0 max-[640px]:px-3.5 max-[640px]:py-1.75">
                  <Info size={15} className="shrink-0 text-[#f59e0b]" weight="bold" />
                  <span className="leading-snug">
                    This preview reflects the last saved version on the server. Save your current changes in the editor to update the preview.
                  </span>
                </div>
              )}

              {/* Modal Body: Render authentic CourseOverviewPage */}
              <div className="flex-1 min-h-0 overflow-y-auto p-0 flex flex-col">
                {!currentCourseId ? (
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[420px] p-8 text-center text-(--muted) my-auto">
                    <BookOpen size={44} className="mb-3.5 opacity-60 text-(--accent)" />
                    <h3 className="text-[1.15rem] font-bold text-(--text) mb-1.5">
                      No Saved Course Data
                    </h3>
                    <p className="text-[0.88rem] max-w-[420px] mb-5 text-(--muted) leading-[1.45]">
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
                      className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out cursor-pointer hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
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
                  <div className="p-6 max-[640px]:p-3 w-full">
                    <CourseOverviewSkeleton
                      onNavigateCourses={() => setIsPreviewModalOpen(false)}
                    />
                  </div>
                ) : isPreviewError ? (
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[420px] p-12 text-center text-(--muted) my-auto">
                    <div className="w-10 h-10 rounded-full bg-[rgba(239,68,68,0.12)] text-[#ef4444] flex items-center justify-center mb-3">
                      <X size={20} />
                    </div>
                    <h3 className="text-[1.05rem] font-bold text-(--text) mb-1">
                      Failed to Load Preview
                    </h3>
                    <p className="text-[0.86rem] max-w-[400px] mb-4 text-(--muted)">
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
                      className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out cursor-pointer hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
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
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 [animation:deleteModalFadeIn_0.18s_ease-out]"
            onClick={handleCloseAddCategoryModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-category-modal-title"
          >
            <div
              className="relative w-full max-w-[460px] rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) p-6 shadow-[0_20px_48px_rgba(0,0,0,0.45)] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3
                    id="add-category-modal-title"
                    className="m-0 text-(--text) text-[1.1rem] font-bold tracking-tight"
                  >
                    Manage Categories
                  </h3>
                  <p className="m-0 mt-0.5 text-(--muted) text-[0.78rem]">
                    Create new categories or remove existing ones.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] transition-colors duration-150 bg-transparent cursor-pointer p-0 shrink-0"
                  onClick={handleCloseAddCategoryModal}
                  aria-label="Close modal"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Add New Category Form */}
              <form
                onSubmit={handleCreateCategory}
                className="flex flex-col gap-3 pb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
              >
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="new-category-name-input"
                    className="text-(--text-secondary) text-[0.82rem] font-semibold"
                  >
                    Add New Category{" "}
                    <span className="text-[#ff5252] ml-0.5">*</span>
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
                      className="flex-1 h-10 px-3 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-(--text) text-[0.88rem] focus:outline-none focus:border-(--accent) transition-colors placeholder:text-(--muted)"
                    />
                    <button
                      type="submit"
                      disabled={
                        !newCategoryName.trim() ||
                        createCategoryMutation.isPending
                      }
                      style={{
                        fontSize: "0.80rem",
                        fontWeight: 700,
                        height: "40px",
                        borderRadius: "9px",
                        gap: "6px",
                        paddingLeft: "16px",
                        paddingRight: "16px",
                      }}
                      className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
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
                    <p className="m-0 text-[0.78rem] text-[#ff5252] font-medium">
                      {addCategoryError}
                    </p>
                  )}
                </div>
              </form>

              {/* Existing Categories List */}
              <div className="pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-(--text-secondary) text-[0.80rem] font-semibold">
                    Existing Categories ({serverCategories.length})
                  </span>
                  {isLoadingCategories && (
                    <CircleNotch
                      size={13}
                      className="animate-spin text-(--muted)"
                    />
                  )}
                </div>

                <div className="max-h-[220px] overflow-y-auto flex flex-col gap-1.5 pr-1">
                  {serverCategories.length === 0 ? (
                    <div className="py-6 text-center text-(--muted) text-[0.82rem] italic">
                      No categories found. Add your first category above.
                    </div>
                  ) : (
                    serverCategories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-[8px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:border-[color-mix(in_srgb,var(--text)_16%,transparent)] transition-all duration-150"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Tag
                            size={15}
                            className="text-(--accent) shrink-0"
                            weight="duotone"
                          />
                          <span className="text-(--text) text-[0.86rem] font-medium truncate">
                            {cat.name}
                          </span>
                          <span className="text-(--muted) text-[0.72rem] px-1.5 py-0.5 rounded-[4px] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] shrink-0">
                            {cat.slug}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCategoryToDelete({ id: cat.id, name: cat.name })
                          }
                          disabled={deleteCategoryMutation.isPending}
                          title={`Delete category ${cat.name}`}
                          aria-label={`Delete category ${cat.name}`}
                          className="inline-flex w-7 h-7 items-center justify-center rounded-[6px] text-(--muted) hover:text-red-500 hover:bg-red-500/10 border-none bg-transparent cursor-pointer transition-colors duration-150 p-0 shrink-0"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end pt-4 mt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
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
                  className="inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
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
