import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router";
import { createPortal } from "react-dom";
import { RichTextEditor, RenderMarkdown } from "./RichTextEditor";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Calendar,
  CaretDown,
  CaretRight,
  CaretUp,
  Certificate,
  ChartBar,
  ChatCircleText,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  DotsSixVertical,
  DotsThreeVertical,
  DownloadSimple,
  Export,
  Eye,
  EyeSlash,
  FileText,
  FloppyDisk,
  Globe,
  Image as ImageIcon,
  Info,
  Lightning,
  ListBullets,
  ListNumbers,
  LockKey,
  Paperclip,
  PencilSimple,
  PlayCircle,
  Plus,
  Question,
  Quotes,
  Smiley,
  Sparkle,
  Stack,
  Star,
  Tag,
  TextB,
  TextItalic,
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

import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import {
  useCategories,
  useCourseEditor,
  useCourseValidation,
  useCreateCategory,
  useCreateCourse,
  useCreateLesson,
  useCreateSection,
  useDeleteCategory,
  useDeleteLesson,
  useDeleteSection,
  useReorderLessons,
  useReorderSections,
  useUpdateCourseBasics,
  useUpdateLesson,
  useUpdateSection,
  useUpsertAccessRules,
  useUpsertPricing,
  useUpsertSettings,
  usePublishCourse,
  useUnpublishCourse,
} from "../services/courses";
import { CourseOverviewPage, getSectionTitle } from "./CourseOverviewPage";
import type {
  CourseInclude,
  CourseOverviewPricingProps,
} from "./CourseOverviewPage";
import { courses } from "./catalogue";
import type { Course, CourseLevel, CourseCategory } from "./catalogue";
import { sections as initialCourseSections } from "../learning/courseContent";
import type { CourseSection, Lesson } from "../learning/courseContent";

export type CourseWizardStepId =
  "basics" | "curriculum" | "access-rules" | "pricing" | "extras" | "publish";

type WizardStepIcon = ComponentType<{
  size?: number;
  weight?: "bold" | "duotone" | "fill" | "regular";
}>;

interface WizardStepDefinition {
  id: CourseWizardStepId;
  label: string;
  Icon: WizardStepIcon;
  tone: "blue" | "cyan" | "gold" | "green" | "orange" | "rose" | "violet";
}

const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  { id: "basics", label: "Basics", Icon: BookOpen, tone: "blue" },
  { id: "curriculum", label: "Curriculum", Icon: ListBullets, tone: "violet" },
  { id: "access-rules", label: "Access Rules", Icon: LockKey, tone: "gold" },
  { id: "pricing", label: "Pricing", Icon: Tag, tone: "green" },
  { id: "extras", label: "Extras", Icon: Sparkle, tone: "orange" },
  { id: "publish", label: "Publish", Icon: Lightning, tone: "rose" },
];

// Basics State Model & Normalization
export interface BasicsFormState {
  title: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "";
  language: string;
}

export const initialBasicsState: BasicsFormState = {
  title: "",
  shortDescription: "",
  description: "",
  categoryId: "",
  difficulty: "",
  language: "en",
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
});

export const isBasicsEqual = (
  a: BasicsFormState,
  b: BasicsFormState,
): boolean => {
  return (
    a.title === b.title &&
    a.shortDescription === b.shortDescription &&
    a.description === b.description &&
    a.categoryId === b.categoryId &&
    a.difficulty === b.difficulty &&
    a.language === b.language
  );
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
export type AccessDurationMode = "lifetime" | "fixed";
export type DurationUnit = "Days" | "Weeks" | "Months" | "Years";

export interface AccessRulesFormState {
  accessType: AccessType;
  durationMode: AccessDurationMode;
  fixedDurationValue: number;
  fixedDurationUnit: DurationUnit;
  enableQA: boolean;
  enableComments: boolean;
  enableReviews: boolean;
  enableDownloads: boolean;
}

export const initialAccessRulesState: AccessRulesFormState = {
  accessType: "everyone",
  durationMode: "lifetime",
  fixedDurationValue: 30,
  fixedDurationUnit: "Days",
  enableQA: true,
  enableComments: true,
  enableReviews: true,
  enableDownloads: false,
};

export const normalizeAccessRulesState = (
  raw?: Partial<AccessRulesFormState> | null,
): AccessRulesFormState => ({
  accessType: (raw?.accessType || "everyone") as AccessType,
  durationMode: (raw?.durationMode || "lifetime") as AccessDurationMode,
  fixedDurationValue:
    typeof raw?.fixedDurationValue === "number" ? raw.fixedDurationValue : 30,
  fixedDurationUnit: (raw?.fixedDurationUnit || "Days") as DurationUnit,
  enableQA: raw?.enableQA !== undefined ? Boolean(raw.enableQA) : true,
  enableComments:
    raw?.enableComments !== undefined ? Boolean(raw.enableComments) : true,
  enableReviews:
    raw?.enableReviews !== undefined ? Boolean(raw.enableReviews) : true,
  enableDownloads:
    raw?.enableDownloads !== undefined ? Boolean(raw.enableDownloads) : false,
});

export const isAccessRulesEqual = (
  a: AccessRulesFormState,
  b: AccessRulesFormState,
): boolean => {
  const normA = normalizeAccessRulesState(a);
  const normB = normalizeAccessRulesState(b);
  return (
    normA.accessType === normB.accessType &&
    normA.durationMode === normB.durationMode &&
    normA.fixedDurationValue === normB.fixedDurationValue &&
    normA.fixedDurationUnit === normB.fixedDurationUnit &&
    normA.enableQA === normB.enableQA &&
    normA.enableComments === normB.enableComments &&
    normA.enableReviews === normB.enableReviews &&
    normA.enableDownloads === normB.enableDownloads
  );
};

// Pricing State Model & Normalization
export type PricingType = "free" | "paid";

export interface PricingFormState {
  pricingType: PricingType;
  sellingPrice: string;
  originalPrice: string;
  saleStartsAt: string;
  saleEndsAt: string;
  currency: string;
}

export type PricingState = PricingFormState;

export const initialPricingState: PricingFormState = {
  pricingType: "paid",
  sellingPrice: "",
  originalPrice: "",
  saleStartsAt: "",
  saleEndsAt: "",
  currency: "USD",
};

export const normalizePricingState = (
  raw?: Partial<PricingFormState> | null,
): PricingFormState => ({
  pricingType: raw?.pricingType === "free" ? "free" : "paid",
  sellingPrice: raw?.sellingPrice ? String(raw.sellingPrice).trim() : "",
  originalPrice: raw?.originalPrice ? String(raw.originalPrice).trim() : "",
  saleStartsAt: raw?.saleStartsAt ? String(raw.saleStartsAt).trim() : "",
  saleEndsAt: raw?.saleEndsAt ? String(raw.saleEndsAt).trim() : "",
  currency: raw?.currency ? String(raw.currency).trim() : "USD",
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
    normA.originalPrice === normB.originalPrice &&
    normA.saleStartsAt === normB.saleStartsAt &&
    normA.saleEndsAt === normB.saleEndsAt
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
  if (!currencyCode) return "$";
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

  // Date validations
  const hasStart = Boolean(pricing.saleStartsAt && pricing.saleStartsAt.trim());
  const hasEnd = Boolean(pricing.saleEndsAt && pricing.saleEndsAt.trim());

  if (hasStart && !hasEnd) {
    return {
      isValid: false,
      error:
        "Please provide both sale start and end dates, or leave both empty.",
    };
  }
  if (!hasStart && hasEnd) {
    return {
      isValid: false,
      error:
        "Please provide both sale start and end dates, or leave both empty.",
    };
  }

  if (hasStart && hasEnd) {
    const startDate = new Date(pricing.saleStartsAt);
    const endDate = new Date(pricing.saleEndsAt);
    const now = new Date();
    // 60-second leeway buffer for user input latency
    const bufferTime = now.getTime() - 60000;

    if (isNaN(startDate.getTime())) {
      return {
        isValid: false,
        error: "Please enter a valid sale start date and time.",
      };
    }
    if (isNaN(endDate.getTime())) {
      return {
        isValid: false,
        error: "Please enter a valid sale end date and time.",
      };
    }
    if (startDate.getTime() < bufferTime) {
      return {
        isValid: false,
        error: "Sale start date cannot be in the past.",
      };
    }
    if (endDate.getTime() < bufferTime) {
      return {
        isValid: false,
        error: "Sale end date cannot be in the past.",
      };
    }
    if (endDate.getTime() <= startDate.getTime()) {
      return {
        isValid: false,
        error: "Sale end date must be later than sale start date.",
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

  const targetCourse = useMemo(() => {
    if (!activeEditId) return null;
    return courses.find((c) => c.id === activeEditId) ?? null;
  }, [activeEditId]);

  const [activeStep, setActiveStep] = useState<CourseWizardStepId>("basics");
  const [slideDirection, setSlideDirection] = useState<"right" | "left">(
    "right",
  );

  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });
  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const stepsNavRef = useRef<HTMLElement | null>(null);
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
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
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
      const currentIdx = WIZARD_STEPS.findIndex((s) => s.id === activeStep);
      if (index > currentIdx) setSlideDirection("right");
      else if (index < currentIdx) setSlideDirection("left");
      setActiveStep(destination.id);
    };

    document.addEventListener("keydown", navigateWizardTab);
    return () => document.removeEventListener("keydown", navigateWizardTab);
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

  const setCourseTitle = (title: string) =>
    setBasicsDraft((prev) => ({ ...prev, title }));
  const setShortDescription = (shortDescription: string) =>
    setBasicsDraft((prev) => ({ ...prev, shortDescription }));
  const setCourseDescription = (description: string) =>
    setBasicsDraft((prev) => ({ ...prev, description }));
  const setCategoryId = (categoryId: string) =>
    setBasicsDraft((prev) => ({ ...prev, categoryId }));
  const setDifficultyLevel = (
    difficulty: "beginner" | "intermediate" | "advanced" | "",
  ) => setBasicsDraft((prev) => ({ ...prev, difficulty }));
  const setLanguage = (language: string) =>
    setBasicsDraft((prev) => ({ ...prev, language }));

  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);

  const [videoTrailer, setVideoTrailer] = useState<string | null>(null);
  const [videoTrailerName, setVideoTrailerName] = useState<string>("");
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
      setVideoTrailerName(file.name);
    }
  };

  const triggerVideoTrailerUpload = () => {
    videoTrailerInputRef.current?.click();
  };

  const handleRemoveVideoTrailer = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVideoTrailer(null);
    setVideoTrailerName("");
    if (videoTrailerInputRef.current) {
      videoTrailerInputRef.current.value = "";
    }
  };

  const [currentCourseId, setCurrentCourseId] = useState<string | null>(
    activeEditId,
  );
  const [courseVersion, setCourseVersion] = useState<number>(1);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addCategoryError, setAddCategoryError] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const { data: serverCategories = [], isLoading: isLoadingCategories } =
    useCategories();
  const { data: editorData } = useCourseEditor(currentCourseId);
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

  // Page-specific in-flight save states
  const [isSavingBasics, setIsSavingBasics] = useState(false);
  const [isSavingAccessRules, setIsSavingAccessRules] = useState(false);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isSavingExtras, setIsSavingExtras] = useState(false);

  const isBasicsSaving =
    isSavingBasics ||
    updateBasicsMutation.isPending ||
    (createCourseMutation.isPending && activeStep === "basics");
  const isAccessRulesSaving =
    isSavingAccessRules || upsertAccessRulesMutation.isPending;
  const isPricingSaving = isSavingPricing || upsertPricingMutation.isPending;
  const isExtrasSaving = isSavingExtras || upsertSettingsMutation.isPending;

  const categoryOptions = useMemo(() => {
    const options: Array<readonly [string, string]> = [
      ["", "Select a category"] as const,
    ];
    for (const cat of serverCategories) {
      if (cat.id && cat.name) {
        options.push([cat.id, cat.name] as const);
      }
    }
    return options;
  }, [serverCategories]);

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

  const difficultyOptions = [
    ["", "Select difficulty level"],
    ["beginner", "Beginner"],
    ["intermediate", "Intermediate"],
    ["advanced", "Advanced"],
  ] as const;

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

  // Access Rules Step server-confirmed and draft states
  const [accessRulesExists, setAccessRulesExists] = useState(false);
  const [serverAccessRules, setServerAccessRules] =
    useState<AccessRulesFormState>(initialAccessRulesState);
  const [accessRulesDraft, setAccessRulesDraft] =
    useState<AccessRulesFormState>(initialAccessRulesState);
  const isAccessRulesDirty = useMemo(
    () => !isAccessRulesEqual(accessRulesDraft, serverAccessRules),
    [accessRulesDraft, serverAccessRules],
  );
  const isAccessRulesDirtyRef = useRef(isAccessRulesDirty);
  isAccessRulesDirtyRef.current = isAccessRulesDirty;

  const needsAccessRulesSave = !accessRulesExists || isAccessRulesDirty;
  const accessRules = accessRulesDraft;
  const setAccessRules = setAccessRulesDraft;

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
  const [pricingDraft, setPricingDraft] =
    useState<PricingFormState>(initialPricingState);
  const isPricingDirty = useMemo(
    () => !isPricingEqual(pricingDraft, serverPricing),
    [pricingDraft, serverPricing],
  );
  const pricing = pricingDraft;
  const setPricing = setPricingDraft;
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
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [isUnpublishModalOpen, setIsUnpublishModalOpen] =
    useState<boolean>(false);

  // Footer Action Loading States
  const [actionLoading, setActionLoading] = useState<
    "preview" | "draft" | "save" | "publish" | "unpublish" | "validate" | null
  >(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

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

  // Extras Step server-confirmed and draft states
  const [serverExtras, setServerExtras] =
    useState<ExtrasFormState>(initialExtrasState);
  const [extras, setExtras] = useState<ExtrasState>({
    inclusions: [
      { id: "inc-1", text: "Full lifetime access" },
      { id: "inc-2", text: "Downloadable resources" },
      { id: "inc-3", text: "Access on all devices" },
    ],
    enableCertificate: false,
    certificateTemplate: "purple-certificate",
    issuanceType: "percentage",
    minCompletionPercentage: 95,
    customRuleText: "Complete all quizzes with > 80% score",
    autoEmailCertificate: true,
  });
  const isExtrasDirty = useMemo(
    () =>
      !isExtrasEqual(
        { enableCertificate: extras.enableCertificate },
        serverExtras,
      ),
    [extras.enableCertificate, serverExtras],
  );

  const isStepDirty = (stepId: CourseWizardStepId): boolean => {
    if (stepId === "basics") return isBasicsDirty;
    if (stepId === "curriculum") return isCurriculumDirty;
    if (stepId === "access-rules") return needsAccessRulesSave;
    if (stepId === "pricing") return isPricingDirty;
    if (stepId === "extras") return isExtrasDirty;
    return false;
  };

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
      });
      setServerBasics(confirmedBasics);
      if (!isBasicsDirtyRef.current) {
        setBasicsDraft(confirmedBasics);
      }
      setIsPublished(c.status === "published");
      setCourseVersion(c.version || 1);

      const hasAccessRules = Boolean(
        editorData.accessRules && editorData.accessRules.id,
      );
      setAccessRulesExists(hasAccessRules);

      if (hasAccessRules) {
        const ar = editorData.accessRules!;
        const s = editorData.settings;
        const isFixed = ar.durationType === "fixed_duration";
        let fixedVal = 30;
        let fixedUnit: DurationUnit = "Days";

        if (isFixed && ar.durationDays && ar.durationDays > 0) {
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
            accessType: "everyone",
            durationMode: isFixed ? "fixed" : "lifetime",
            fixedDurationValue: fixedVal,
            fixedDurationUnit: fixedUnit,
            enableQA: s?.allowQa !== undefined ? s.allowQa : true,
            enableComments:
              s?.allowComments !== undefined ? s.allowComments : true,
            enableReviews:
              s?.allowReviews !== undefined ? s.allowReviews : true,
            enableDownloads:
              s?.allowDownloads !== undefined ? s.allowDownloads : false,
          });

        setServerAccessRules(confirmedAccessRules);
        if (!isAccessRulesDirtyRef.current) {
          setAccessRulesDraft(confirmedAccessRules);
        }
      } else {
        setServerAccessRules(initialAccessRulesState);
        if (!isAccessRulesDirtyRef.current) {
          setAccessRulesDraft(initialAccessRulesState);
        }
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
          saleStartsAt: formatIsoToDatetimeLocal(p.saleStartsAt),
          saleEndsAt: formatIsoToDatetimeLocal(p.saleEndsAt),
          currency: p.currency || "USD",
        });
        setServerPricing(confirmedPricing);
        setPricingDraft(confirmedPricing);
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
    } else if (targetCourse) {
      setIsPublished(true);
      setCourseTitle(targetCourse.title);
      setCourseDescription(targetCourse.description);
      setThumbnail(targetCourse.thumbnail);
      const matchedCat = serverCategories.find(
        (sc) => sc.name.toLowerCase() === targetCourse.category.toLowerCase(),
      );
      if (matchedCat) {
        setCategoryId(matchedCat.id);
      }
      const lvl = targetCourse.level.toLowerCase();
      if (lvl === "beginner" || lvl === "intermediate" || lvl === "advanced") {
        setDifficultyLevel(lvl);
      }
      setPricing({
        pricingType: "paid",
        sellingPrice: "",
        originalPrice: "",
        saleStartsAt: "",
        saleEndsAt: "",
        currency: "USD",
      });

      if (targetCourse.id === "ui-ux-design-mastery") {
        setSections(
          initialCourseSections.map((s, sIdx) => ({
            id: `section-${s.id}`,
            title: s.title,
            isExpanded: sIdx === 0,
            lessons: s.lessons.map(([num, title]) => ({
              id: `lesson-${s.id}-${num}`,
              title,
              description: "",
              contentType: "video" as const,
              isExpanded: false,
              isPublished: true,
              isPreview: false,
              initialState: {
                title,
                description: "",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
              resources: [],
            })),
          })),
        );
      } else {
        const sectionCount = Math.max(1, targetCourse.sections || 1);
        const generatedSections: CurriculumSectionItem[] = Array.from(
          { length: sectionCount },
          (_, i) => {
            const overviewTitle = `${getSectionTitle(targetCourse, i)} - Overview`;
            return {
              id: `section-${i + 1}`,
              title: getSectionTitle(targetCourse, i),
              isExpanded: i === 0,
              lessons: [
                {
                  id: `lesson-${i + 1}-1`,
                  title: overviewTitle,
                  description: "",
                  contentType: "video" as const,
                  isExpanded: false,
                  isPublished: true,
                  isPreview: false,
                  initialState: {
                    title: overviewTitle,
                    description: "",
                    contentType: "video",
                    isPublished: true,
                    isPreview: false,
                  },
                  resources: [],
                },
              ],
            };
          },
        );
        setSections(generatedSections);
      }

      setExtras((prev) => ({
        ...prev,
        inclusions: [
          { id: "inc-1", text: "Full lifetime access" },
          { id: "inc-2", text: "Downloadable resources" },
          {
            id: "inc-3",
            text: `${targetCourse.sections} Sections & ${targetCourse.lectures} Lectures`,
          },
          { id: "inc-4", text: "Certificate of completion" },
        ],
      }));
    } else {
      setIsPublished(false);
    }
  }, [editorData, targetCourse, serverCategories]);

  // Extras Inclusions Handlers
  const [draggedInclusionIndex, setDraggedInclusionIndex] = useState<
    number | null
  >(null);
  const [dragEnabledInclusionId, setDragEnabledInclusionId] = useState<
    string | null
  >(null);

  const handleAddInclusion = () => {
    setExtras((prev) => ({
      ...prev,
      inclusions: [
        ...prev.inclusions,
        {
          id: `inc-${Date.now()}`,
          text: `New Inclusion ${prev.inclusions.length + 1}`,
        },
      ],
    }));
  };

  const handleUpdateInclusionText = (id: string, text: string) => {
    setExtras((prev) => ({
      ...prev,
      inclusions: prev.inclusions.map((item) =>
        item.id === id ? { ...item, text } : item,
      ),
    }));
  };

  const handleDeleteInclusion = (id: string) => {
    setExtras((prev) => ({
      ...prev,
      inclusions: prev.inclusions.filter((item) => item.id !== id),
    }));
  };

  const handleInclusionDragStart = (
    e: React.DragEvent,
    index: number,
    text: string,
  ) => {
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
    setExtras((prev) => {
      const copy = [...prev.inclusions];
      const [moved] = copy.splice(draggedInclusionIndex, 1);
      if (moved) {
        copy.splice(index, 0, moved);
      }
      return { ...prev, inclusions: copy };
    });
    setDraggedInclusionIndex(index);
  };

  const handleInclusionDragEnd = () => {
    setDraggedInclusionIndex(null);
    setDragEnabledInclusionId(null);
  };

  // Certificate Handlers
  const handleToggleCertificate = () => {
    setExtras((prev) => ({
      ...prev,
      enableCertificate: !prev.enableCertificate,
    }));
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

  // Access Rules State Handlers
  const handleAccessTypeChange = (type: AccessType) => {
    if (type === "restricted") return; // Restricted is disabled/coming soon
    setAccessRules((prev) => ({ ...prev, accessType: type }));
  };

  const handleDurationModeChange = (mode: AccessDurationMode) => {
    setAccessRules((prev) => ({ ...prev, durationMode: mode }));
  };

  const handleFixedDurationValueChange = (val: number) => {
    setAccessRules((prev) => ({
      ...prev,
      fixedDurationValue: Math.max(1, val || 1),
    }));
  };

  const handleFixedDurationUnitChange = (unit: DurationUnit) => {
    setAccessRules((prev) => ({ ...prev, fixedDurationUnit: unit }));
  };

  const handleToggleQA = () => {
    setAccessRules((prev) => ({ ...prev, enableQA: !prev.enableQA }));
  };

  const handleToggleComments = () => {
    setAccessRules((prev) => ({
      ...prev,
      enableComments: !prev.enableComments,
    }));
  };

  const handleToggleReviews = () => {
    setAccessRules((prev) => ({
      ...prev,
      enableReviews: !prev.enableReviews,
    }));
  };

  const handleToggleDownloads = () => {
    setAccessRules((prev) => ({
      ...prev,
      enableDownloads: !prev.enableDownloads,
    }));
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

    // If no course draft exists yet, create it on the server first
    if (!targetCourseId) {
      const fallbackTitle = courseTitle.trim() || "Untitled Course";
      try {
        const createdCourse = await createCourseMutation.mutateAsync({
          title: fallbackTitle,
        });
        targetCourseId = createdCourse.id;
        setCurrentCourseId(createdCourse.id);
        setCourseVersion(createdCourse.version);
        if (!courseTitle.trim()) {
          setCourseTitle(fallbackTitle);
        }
      } catch (err: unknown) {
        // Rollback temporary section
        setSections((prev) => prev.filter((s) => s.id !== tempSectionId));
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to create course draft.";
        setToastMessage(errorMsg);
        setIsCreatingSection(false);
        return;
      }
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
      setToastMessage(
        `Section "${createdSection.title}" created successfully.`,
      );
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

  const handleToggleSectionExpand = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, isExpanded: !s.isExpanded } : s,
      ),
    );
  };

  const handleStartEditSectionTitle = (sectionId: string) => {
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
        setToastMessage(`Section updated to "${trimmedTitle}".`);
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
          setToastMessage("Sections reordered successfully.");
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

    // If no course draft exists yet, create it on the server first
    if (!targetCourseId) {
      const fallbackTitle = courseTitle.trim() || "Untitled Course";
      try {
        const createdCourse = await createCourseMutation.mutateAsync({
          title: fallbackTitle,
        });
        targetCourseId = createdCourse.id;
        setCurrentCourseId(createdCourse.id);
        setCourseVersion(createdCourse.version);
        if (!courseTitle.trim()) {
          setCourseTitle(fallbackTitle);
        }
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
          "Failed to create course draft.";
        setToastMessage(errorMsg);
        setCreatingLessonSectionId(null);
        return;
      }
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
      setToastMessage(`Lesson "${newLessonTitle}" created successfully.`);
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

  const handleToggleLessonExpand = (sectionId: string, lessonId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) =>
            l.id === lessonId ? { ...l, isExpanded: !l.isExpanded } : l,
          ),
        };
      }),
    );
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
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) =>
            l.id === lessonId ? { ...l, ...updates } : l,
          ),
        };
      }),
    );
  };

  const handleSaveLesson = async (sectionId: string, lessonId: string) => {
    if (savingLessonId || updateLessonMutation.isPending) return;

    const sec = sections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les || les.isPendingCreation) return;

    if (!isLessonDirty(les)) {
      setToastMessage("No changes to save.");
      return;
    }

    const trimmedTitle = les.title.trim();
    if (!trimmedTitle) {
      setToastMessage("Lesson title cannot be empty.");
      return;
    }

    const isPublishedVal =
      les.isPublished !== undefined ? les.isPublished : true;
    const isPreviewVal = les.isPreview !== undefined ? les.isPreview : false;

    if (
      currentCourseId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        lessonId,
      )
    ) {
      setSavingLessonId(lessonId);
      try {
        await updateLessonMutation.mutateAsync({
          courseId: currentCourseId,
          lessonId,
          payload: {
            title: trimmedTitle,
            description: les.description || "",
            contentType: les.contentType,
            isPublished: isPublishedVal,
            isPreview: isPreviewVal,
          },
        });

        setSections((prev) =>
          prev.map((s) => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              lessons: s.lessons.map((l) =>
                l.id === lessonId
                  ? {
                      ...l,
                      title: trimmedTitle,
                      isPublished: isPublishedVal,
                      isPreview: isPreviewVal,
                      isExpanded: false,
                      initialState: {
                        title: trimmedTitle,
                        description: les.description || "",
                        contentType: les.contentType,
                        isPublished: isPublishedVal,
                        isPreview: isPreviewVal,
                      },
                    }
                  : l,
              ),
            };
          }),
        );
        setToastMessage(`Lesson "${trimmedTitle}" updated successfully.`);
      } catch (err: unknown) {
        const errorMsg =
          (err as { message?: string })?.message || "Failed to update lesson.";
        setToastMessage(errorMsg);
      } finally {
        setSavingLessonId(null);
      }
    } else {
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          return {
            ...s,
            lessons: s.lessons.map((l) =>
              l.id === lessonId
                ? {
                    ...l,
                    title: trimmedTitle,
                    isPublished: isPublishedVal,
                    isPreview: isPreviewVal,
                    isExpanded: false,
                    initialState: {
                      title: trimmedTitle,
                      description: les.description || "",
                      contentType: les.contentType,
                      isPublished: isPublishedVal,
                      isPreview: isPreviewVal,
                    },
                  }
                : l,
            ),
          };
        }),
      );
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

  const rawInclusions = extras.inclusions
    .map((inc) => inc.text.trim())
    .filter((text) => text.length > 0);

  // If certificate toggle is enabled in Card 1, include"Certificate of completion"
  const nonCertInclusions = rawInclusions.filter(
    (text) => !/certificate of completion/i.test(text),
  );

  const previewInclusions: string[] = [
    ...(extras.enableCertificate ? ["Certificate of completion"] : []),
    ...nonCertInclusions,
  ];

  const previewIncludes: CourseInclude[] = [
    ...(extras.enableCertificate
      ? [{ icon: Certificate, label: "Certificate of completion" }]
      : []),
    ...nonCertInclusions.map((text) => ({
      icon: CheckCircle,
      label: text,
    })),
  ];

  const handlePricingTypeChange = (type: PricingType) => {
    setPricing((prev) => ({ ...prev, pricingType: type }));
    if (pricingValidationError) setPricingValidationError(null);
  };

  const handleSellingPriceChange = (val: string) => {
    setPricing((prev) => ({ ...prev, sellingPrice: val }));
    if (pricingValidationError) setPricingValidationError(null);
  };

  const handleOriginalPriceChange = (val: string) => {
    setPricing((prev) => ({ ...prev, originalPrice: val }));
    if (pricingValidationError) setPricingValidationError(null);
  };

  const handleSaleStartsAtChange = (val: string) => {
    setPricing((prev) => ({ ...prev, saleStartsAt: val }));
    if (pricingValidationError) setPricingValidationError(null);
  };

  const handleSaleEndsAtChange = (val: string) => {
    setPricing((prev) => ({ ...prev, saleEndsAt: val }));
    if (pricingValidationError) setPricingValidationError(null);
  };

  const handleCurrencyChange = (val: string) => {
    setPricing((prev) => ({ ...prev, currency: val }));
    if (pricingValidationError) setPricingValidationError(null);
  };

  const currencySymbol = getCurrencySymbol(pricing.currency || "USD");

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

  // Publish Checklist Validation based strictly on server validation response
  const isBasicsValid = serverValidation?.sections?.basics?.valid ?? false;
  const isCurriculumValid =
    serverValidation?.sections?.curriculum?.valid ?? false;
  const isAccessRulesValid =
    serverValidation?.sections?.accessRules?.valid ?? false;
  const isPricingValid = serverValidation?.sections?.pricing?.valid ?? false;
  const isExtrasValid = serverValidation?.sections?.extras?.valid ?? false;

  const isCourseReadyToPublish = serverValidation?.canPublish ?? false;

  const handlePreviewAction = () => {
    if (actionLoading) return;
    setActionLoading("preview");
    setTimeout(() => {
      setActionLoading(null);
      setIsPreviewModalOpen(true);
    }, 450);
  };

  const saveBasicsStep = async (explicitCourseId?: string | null) => {
    if (!basicsDraft.title.trim()) {
      throw new Error("Please enter a course title.");
    }
    setIsSavingBasics(true);
    try {
      const targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        // Create initial course on server
        const created = await createCourseMutation.mutateAsync({
          title: basicsDraft.title.trim(),
        });
        setCurrentCourseId(created.id);
        setCourseVersion(created.version);

        let confirmedTitle = created.title;
        let confirmedShortDesc = created.shortDescription || "";
        let confirmedDesc = created.description || "";
        let confirmedCat = created.categoryId || "";
        let confirmedDiff: BasicsFormState["difficulty"] =
          (created.difficulty as BasicsFormState["difficulty"]) || "";
        let confirmedLang = "en";

        // If shortDescription, description, category, or difficulty are filled, update basics immediately
        if (
          basicsDraft.shortDescription.trim() ||
          basicsDraft.description.trim() ||
          basicsDraft.categoryId ||
          basicsDraft.difficulty
        ) {
          const updated = await updateBasicsMutation.mutateAsync({
            id: created.id,
            payload: {
              title: created.title,
              shortDescription: basicsDraft.shortDescription.trim() || null,
              description: basicsDraft.description.trim() || null,
              categoryId: basicsDraft.categoryId || null,
              difficulty: basicsDraft.difficulty || null,
              version: created.version,
            },
          });
          setCourseVersion(updated.version);
          confirmedTitle = updated.title;
          confirmedShortDesc = updated.shortDescription || "";
          confirmedDesc = updated.description || "";
          confirmedCat = updated.categoryId || "";
          confirmedDiff =
            (updated.difficulty as BasicsFormState["difficulty"]) || "";
        }

        if (basicsDraft.language) {
          const settingsRes = await upsertSettingsMutation.mutateAsync({
            courseId: created.id,
            payload: {
              language: basicsDraft.language,
            },
          });
          confirmedLang = settingsRes.language || basicsDraft.language;
        }

        const newBaseline: BasicsFormState = {
          title: confirmedTitle,
          shortDescription: confirmedShortDesc,
          description: confirmedDesc,
          categoryId: confirmedCat,
          difficulty: confirmedDiff,
          language: confirmedLang,
        };
        setServerBasics(newBaseline);
        setBasicsDraft(newBaseline);
        return created;
      } else {
        // Update basics on server
        const updated = await updateBasicsMutation.mutateAsync({
          id: targetCourseId,
          payload: {
            title: basicsDraft.title.trim(),
            shortDescription: basicsDraft.shortDescription.trim() || null,
            description: basicsDraft.description.trim() || null,
            categoryId: basicsDraft.categoryId || null,
            difficulty: basicsDraft.difficulty || null,
            version: courseVersion,
          },
        });
        setCourseVersion(updated.version);

        let confirmedLang = language;
        if (basicsDraft.language) {
          const settingsRes = await upsertSettingsMutation.mutateAsync({
            courseId: targetCourseId,
            payload: {
              language: basicsDraft.language,
            },
          });
          confirmedLang = settingsRes.language || basicsDraft.language;
        }

        const newBaseline: BasicsFormState = {
          title: updated.title,
          shortDescription: updated.shortDescription || "",
          description: updated.description || "",
          categoryId: updated.categoryId || "",
          difficulty:
            (updated.difficulty as BasicsFormState["difficulty"]) || "",
          language: confirmedLang,
        };
        setServerBasics(newBaseline);
        setBasicsDraft(newBaseline);
        return updated;
      }
    } finally {
      setIsSavingBasics(false);
    }
  };

  const saveCurriculumStep = async (explicitCourseId?: string | null) => {
    let targetCourseId = explicitCourseId || currentCourseId;
    if (!targetCourseId) {
      const created = await createCourseMutation.mutateAsync({
        title: courseTitle.trim() || "Untitled Course",
      });
      targetCourseId = created.id;
      setCurrentCourseId(created.id);
      setCourseVersion(created.version);
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
          }
        }),
      );
    }

    // 2. Save all dirty lessons across all sections
    const dirtyLessons: Array<{
      sectionId: string;
      lesson: CurriculumLessonItem;
    }> = [];
    for (const sec of sections) {
      for (const les of sec.lessons) {
        if (isLessonDirty(les) && !les.isPendingCreation) {
          dirtyLessons.push({ sectionId: sec.id, lesson: les });
        }
      }
    }

    if (dirtyLessons.length > 0) {
      await Promise.all(
        dirtyLessons.map(async ({ sectionId, lesson }) => {
          const trimmedTitle = lesson.title.trim() || "Untitled Lesson";
          const isPub = lesson.isPublished !== false;
          const isPrev = lesson.isPreview === true;

          if (
            targetCourseId &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              lesson.id,
            )
          ) {
            await updateLessonMutation.mutateAsync({
              courseId: targetCourseId,
              lessonId: lesson.id,
              payload: {
                title: trimmedTitle,
                description: lesson.description || "",
                contentType: lesson.contentType,
                isPublished: isPub,
                isPreview: isPrev,
              },
            });

            setSections((prev) =>
              prev.map((s) => {
                if (s.id !== sectionId) return s;
                return {
                  ...s,
                  lessons: s.lessons.map((l) =>
                    l.id === lesson.id
                      ? {
                          ...l,
                          title: trimmedTitle,
                          isPublished: isPub,
                          isPreview: isPrev,
                          initialState: {
                            title: trimmedTitle,
                            description: lesson.description || "",
                            contentType: lesson.contentType,
                            isPublished: isPub,
                            isPreview: isPrev,
                          },
                        }
                      : l,
                  ),
                };
              }),
            );
          }
        }),
      );
    }

    return { savedLessonsCount: dirtyLessons.length };
  };

  const saveAccessRulesStep = async (explicitCourseId?: string | null) => {
    setIsSavingAccessRules(true);
    try {
      let targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        const created = await createCourseMutation.mutateAsync({
          title: courseTitle.trim() || "Untitled Course",
        });
        targetCourseId = created.id;
        setCurrentCourseId(created.id);
        setCourseVersion(created.version);
      }

      let durationDays: number | null = null;
      if (accessRulesDraft.durationMode === "fixed") {
        const val = Math.max(1, accessRulesDraft.fixedDurationValue || 1);
        const unitMultiplier =
          accessRulesDraft.fixedDurationUnit === "Years"
            ? 365
            : accessRulesDraft.fixedDurationUnit === "Months"
              ? 30
              : accessRulesDraft.fixedDurationUnit === "Weeks"
                ? 7
                : 1;
        durationDays = val * unitMultiplier;
      }

      const [accessRuleRes, settingsRes] = await Promise.all([
        upsertAccessRulesMutation.mutateAsync({
          courseId: targetCourseId,
          payload: {
            accessType: "everyone",
            durationType:
              accessRulesDraft.durationMode === "fixed"
                ? "fixed_duration"
                : "lifetime",
            durationDays:
              accessRulesDraft.durationMode === "fixed" ? durationDays : null,
          },
        }),
        upsertSettingsMutation.mutateAsync({
          courseId: targetCourseId,
          payload: {
            language: language || undefined,
            allowQa: accessRulesDraft.enableQA,
            allowComments: accessRulesDraft.enableComments,
            allowReviews: accessRulesDraft.enableReviews,
            allowDownloads: accessRulesDraft.enableDownloads,
          },
        }),
      ]);

      const isFixed = accessRuleRes.durationType === "fixed_duration";
      const newBaseline: AccessRulesFormState = normalizeAccessRulesState({
        accessType: "everyone",
        durationMode: isFixed ? "fixed" : "lifetime",
        fixedDurationValue: accessRulesDraft.fixedDurationValue,
        fixedDurationUnit: accessRulesDraft.fixedDurationUnit,
        enableQA: settingsRes.allowQa,
        enableComments: settingsRes.allowComments,
        enableReviews: settingsRes.allowReviews,
        enableDownloads: settingsRes.allowDownloads,
      });

      setAccessRulesExists(true);
      setServerAccessRules(newBaseline);
      setAccessRulesDraft(newBaseline);
      return { accessRule: accessRuleRes, settings: settingsRes };
    } finally {
      setIsSavingAccessRules(false);
    }
  };

  const savePricingStep = async (explicitCourseId?: string | null) => {
    const validation = validatePricing(pricingDraft);
    if (!validation.isValid) {
      setPricingValidationError(validation.error);
      setToastMessage(validation.error || "Please fix pricing errors.");
      throw new Error(validation.error || "Validation failed");
    }
    setPricingValidationError(null);

    setIsSavingPricing(true);
    try {
      let targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        const created = await createCourseMutation.mutateAsync({
          title: courseTitle.trim() || "Untitled Course",
        });
        targetCourseId = created.id;
        setCurrentCourseId(created.id);
        setCourseVersion(created.version);
      }

      let res: any;
      if (pricingDraft.pricingType === "free") {
        res = await upsertPricingMutation.mutateAsync({
          courseId: targetCourseId,
          payload: {
            pricingType: "free",
            price: 0,
            salePrice: null,
            saleStartsAt: null,
            saleEndsAt: null,
            currency: pricingDraft.currency || "USD",
          },
        });
      } else {
        const rawSell = pricingDraft.sellingPrice.replace(/,/g, "").trim();
        const rawOrig = pricingDraft.originalPrice.replace(/,/g, "").trim();
        const sellNum = Math.round(parseFloat(rawSell));
        const origNum = rawOrig ? Math.round(parseFloat(rawOrig)) : null;

        const price = origNum && origNum > 0 ? origNum : sellNum;
        const salePrice = origNum && origNum > 0 ? sellNum : null;
        const saleStartsAt = formatDatetimeLocalToIso(
          pricingDraft.saleStartsAt,
        );
        const saleEndsAt = formatDatetimeLocalToIso(pricingDraft.saleEndsAt);

        res = await upsertPricingMutation.mutateAsync({
          courseId: targetCourseId,
          payload: {
            pricingType: "paid",
            price,
            salePrice,
            saleStartsAt,
            saleEndsAt,
            currency: pricingDraft.currency || "USD",
          },
        });
      }

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
        saleStartsAt: formatIsoToDatetimeLocal(res.saleStartsAt),
        saleEndsAt: formatIsoToDatetimeLocal(res.saleEndsAt),
        currency: res.currency || "USD",
      });

      setServerPricing(newBaseline);
      setPricingDraft(newBaseline);
      return res;
    } finally {
      setIsSavingPricing(false);
    }
  };

  const saveExtrasStep = async (explicitCourseId?: string | null) => {
    setIsSavingExtras(true);
    try {
      let targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        const created = await createCourseMutation.mutateAsync({
          title: courseTitle.trim() || "Untitled Course",
        });
        targetCourseId = created.id;
        setCurrentCourseId(created.id);
        setCourseVersion(created.version);
      }

      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          certificateEnabled: extras.enableCertificate,
        },
      });

      const newBaseline: ExtrasFormState = normalizeExtrasState({
        enableCertificate: res.certificateEnabled ?? false,
      });

      setServerExtras(newBaseline);
      setExtras((prev) => ({
        ...prev,
        enableCertificate: newBaseline.enableCertificate,
      }));
      return res;
    } finally {
      setIsSavingExtras(false);
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
    }
  };

  const handleSaveChangesAction = async () => {
    if (actionLoading) return;
    if (activeStep === "basics") {
      if (!isBasicsDirty) return;
      if (!courseTitle.trim()) {
        setToastMessage("Please enter a course title.");
        return;
      }
    } else if (activeStep === "curriculum") {
      if (!isCurriculumDirty) return;
    } else if (activeStep === "access-rules") {
      if (!needsAccessRulesSave) return;
    } else if (activeStep === "pricing") {
      if (!isPricingDirty) return;
    } else if (activeStep === "extras") {
      if (!isExtrasDirty) return;
    }

    setActionLoading("save");
    try {
      await saveCurrentStep();
      setToastMessage("Changes saved successfully!");
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message || "Failed to save changes.";
      setToastMessage(errorMsg);
    } finally {
      setActionLoading(null);
    }
  };

  const publishCourseMutation = usePublishCourse();
  const unpublishCourseMutation = useUnpublishCourse();

  const reconcileDirtyState = async (explicitCourseId?: string | null) => {
    let targetCourseId = explicitCourseId || currentCourseId;

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

  const getContextualActionLabel = (step: CourseWizardStepId) => {
    switch (step) {
      case "basics":
        return "Save Basics";
      case "curriculum":
        return "Save Curriculum";
      case "access-rules":
        return "Save Access Rules";
      case "pricing":
        return "Save Pricing";
      case "extras":
        return "Save Extras";
      case "publish":
        return "Validate";
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
          "Please resolve incomplete sections before publishing.";
        setPublishValidationError(errorMsg);
        setToastMessage(errorMsg);
        return;
      }

      // 3. Call backend POST /api/v1/courses/:id/publish
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

  return (
    <div className="relative flex w-full flex-1 flex-col p-0 text-[var(--text)] box-border max-[768px]:pb-0">
      {/* Wizard Header */}
      <header className="relative shrink-0 mb-5 max-[768px]:mb-2 max-[768px]:w-full max-[768px]:max-w-full max-[768px]:min-w-0 max-[768px]:box-border">
        <div className="flex items-start justify-between gap-4 mb-[18px] max-[768px]:flex-col max-[768px]:gap-3 max-[768px]:mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              className="flex w-[36px] h-[36px] shrink-0 items-center justify-center border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg text-[var(--text-secondary)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] cursor-pointer transition-[border-color,background-color,color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]"
              onClick={handleBack}
              aria-label="Go back to courses"
            >
              <ArrowLeft size={17} weight="bold" />
            </button>
            <div className="pt-0.5 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="m-0 text-[var(--text)] text-[clamp(1.2rem,1.8vw,1.55rem)] font-bold tracking-[-0.015em] leading-[1.2]">
                  {isPublished ? "Edit Course" : "Create New Course"}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.72rem] font-medium tracking-[0.02em] ${
                    isPublished
                      ? "is-published border border-green-500/35 text-green-400 bg-green-500/[0.12]"
                      : "border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--muted)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                  }`}
                >
                  {isPublished ? "Published" : "Draft"}
                </span>
              </div>
              <p className="m-0 mt-1 text-[var(--muted)] text-[0.84rem] max-w-[620px] leading-[1.4]">
                {activeStep === "curriculum"
                  ? "Build your course structure by adding sections and lessons."
                  : activeStep === "access-rules"
                    ? "Control who can access this course and how long their access lasts."
                    : activeStep === "pricing"
                      ? "Set how learners will purchase this course."
                      : activeStep === "extras"
                        ? "Add extra information and settings to enhance your course."
                        : activeStep === "publish"
                          ? "Review your course and publish it when you're ready."
                          : "Add the essential details of your course. You can always edit these later."}
              </p>
            </div>
          </div>

          {/* Top Actions in Header (Desktop / Tablet) */}
          <div className="flex items-center gap-2.5 shrink-0 pt-0.5 max-[768px]:hidden">
            {/* Preview Button (Ghost / Secondary) */}
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
              className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text-secondary)] bg-transparent cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-[var(--text)] disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handlePreviewAction}
              disabled={actionLoading !== null}
            >
              {actionLoading === "preview" ? (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-[var(--accent)]"
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

            {/* Contextual Action Button (Save Basics / Save Curriculum / ... / Validate) */}
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
                className="inline-flex items-center border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleValidateCourseAction}
                disabled={actionLoading !== null || isValidating}
              >
                {actionLoading === "validate" || isValidating ? (
                  <>
                    <CircleNotch
                      size={14}
                      className="animate-spin text-[var(--accent)]"
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
                className={`inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out ${
                  actionLoading !== null ||
                  (activeStep === "basics" && !isBasicsDirty) ||
                  (activeStep === "curriculum" && !isCurriculumDirty) ||
                  (activeStep === "access-rules" && !needsAccessRulesSave) ||
                  (activeStep === "pricing" && !isPricingDirty) ||
                  (activeStep === "extras" && !isExtrasDirty)
                    ? "!opacity-40 !cursor-not-allowed !shadow-none"
                    : "cursor-pointer hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
                }`}
                onClick={handleSaveChangesAction}
                disabled={
                  actionLoading !== null ||
                  (activeStep === "basics" && !isBasicsDirty) ||
                  (activeStep === "curriculum" && !isCurriculumDirty) ||
                  (activeStep === "access-rules" && !needsAccessRulesSave) ||
                  (activeStep === "pricing" && !isPricingDirty) ||
                  (activeStep === "extras" && !isExtrasDirty)
                }
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
                    <FloppyDisk size={15} weight="bold" />
                    <span>{getContextualActionLabel(activeStep)}</span>
                  </>
                )}
              </button>
            )}

            {/* Publish CTA only when on publish step */}
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
                  className={`inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out ${
                    !isCourseReadyToPublish
                      ? "!opacity-40 !cursor-not-allowed filter blur-[0.4px] pointer-events-none select-none !shadow-none"
                      : "cursor-pointer hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
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

        {/* Publish validation error toast if any */}
        {publishValidationError && activeStep === "publish" && (
          <div className="flex items-center gap-2.5 mb-3 border border-red-400/35 rounded-[10px] px-4 py-2 text-red-400 bg-red-500/[0.12] backdrop-blur-[12px] shadow-[0_4px_16px_rgba(239,68,68,0.15)] text-[0.84rem] font-semibold animate-[bannerSlideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <Info size={16} weight="bold" />
            <span>{publishValidationError}</span>
          </div>
        )}

        {/* Wizard Steps Navigation */}
        <nav
          ref={stepsNavRef}
          className="course-wizard-steps-nav settings-tabs page-tabs relative !mt-0 !bg-transparent !pt-0 border-b border-[color-mix(in_srgb,var(--surface-strong)72%,transparent)] max-[768px]:w-full max-[768px]:box-border [&::after]:!hidden"
          aria-label="Course creation steps"
          role="tablist"
          onMouseDown={handleNavMouseDown}
          onMouseLeave={handleNavMouseLeave}
          onMouseUp={handleNavMouseUp}
          onMouseMove={handleNavMouseMove}
        >
          {/* Standard page-tabs indicator — driven by --page-tab-indicator-* CSS vars */}
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
                disabled={
                  actionLoading !== null ||
                  isBasicsSaving ||
                  isAccessRulesSaving ||
                  isPricingSaving ||
                  isExtrasSaving
                }
                className={`!border-b-transparent shrink-0 whitespace-nowrap disabled:!opacity-50 disabled:!cursor-not-allowed ${isActive ? "is-active" : ""}`}
                onClick={() => {
                  if (
                    actionLoading !== null ||
                    isBasicsSaving ||
                    isAccessRulesSaving ||
                    isPricingSaving ||
                    isExtrasSaving
                  ) {
                    return;
                  }
                  const currentIdx = WIZARD_STEPS.findIndex(
                    (s) => s.id === activeStep,
                  );
                  if (idx > currentIdx) setSlideDirection("right");
                  else if (idx < currentIdx) setSlideDirection("left");
                  setActiveStep(step.id);
                }}
                onKeyDown={handleRovingTabKeyDown}
              >
                <Icon size={17} weight={isActive ? "fill" : "regular"} />
                <span className="inline-flex items-center gap-1.5">
                  <span>{step.label}</span>
                  {isDirty && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0"
                      title="Unsaved changes"
                      aria-label="Unsaved changes"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Step Content Region */}
      <div
        className={`w-full flex-1 flex flex-col min-h-0 pb-12 will-change-[transform,opacity] max-[768px]:pb-[110px] slide-from-${slideDirection}`}
        key={activeStep}
      >
        {activeStep === "basics" ? (
          <div className="relative z-10 grid grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)] gap-6 items-start max-[1024px]:grid-cols-[minmax(0,1fr)] max-[768px]:grid-cols-[minmax(0,1fr)] max-[768px]:gap-[18px]">
            {/* Left Column: Form Sections */}
            <div className="flex flex-col gap-5">
              {/* Basic Information Section */}
              <section className="relative z-10 rounded-[14px] p-6 bg-[var(--surface)] shadow-[var(--card-shadow)] max-[768px]:p-4">
                <div className="mb-4.5">
                  <h2 className="m-0 text-[var(--text)] text-[1.18rem] font-[650] tracking-[-0.015em]">
                    Basic Information
                  </h2>
                  <p className="m-0 mt-1 mb-5 text-[var(--muted)] text-[0.82rem]">
                    Add the essential details of your course.
                  </p>
                </div>

                <div className="flex flex-col gap-2 mb-5">
                  <label
                    htmlFor="course-title"
                    className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                  >
                    Course Title{" "}
                    <span className="text-[#ff5252] ml-0.5">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="course-title"
                      type="text"
                      maxLength={120}
                      placeholder="e.g. Complete Backend with Node.js"
                      disabled={isBasicsSaving}
                      value={courseTitle}
                      onChange={(e) =>
                        setCourseTitle(e.target.value.slice(0, 120))
                      }
                      className="w-full h-11 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] pl-3.5 pr-[75px] py-0 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <span className="absolute right-3.5 text-[var(--muted)] text-[0.76rem] pointer-events-none">
                      {courseTitle.length} / 120
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 mb-5">
                  <label
                    htmlFor="course-short-description"
                    className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                  >
                    Short Description
                  </label>
                  <div className="relative flex items-center">
                    <textarea
                      id="course-short-description"
                      rows={2}
                      maxLength={150}
                      placeholder="A concise summary of your course (shown in course cards and search)..."
                      disabled={isBasicsSaving}
                      value={shortDescription}
                      onChange={(e) =>
                        setShortDescription(e.target.value.slice(0, 150))
                      }
                      className="w-full min-h-[68px] max-h-[140px] resize-y border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] pl-3.5 pr-[75px] py-2.5 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed font-sans"
                    />
                    <span className="absolute right-3.5 bottom-2.5 text-[var(--muted)] text-[0.76rem] pointer-events-none">
                      {shortDescription.length} / 150
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 mb-5">
                  <label
                    htmlFor="course-description"
                    className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                  >
                    Course Description{" "}
                    <span className="text-[#ff5252] ml-0.5">*</span>
                  </label>
                  <RichTextEditor
                    id="course-description"
                    disabled={isBasicsSaving}
                    value={courseDescription}
                    onChange={setCourseDescription}
                    placeholder="Describe what your course is about, what students will learn, and who this course is for..."
                    maxLength={1500}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-2 max-[640px]:grid-cols-1">
                  <div className="flex flex-col gap-2 mb-0">
                    <label
                      id="category-label"
                      className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                    >
                      Category <span className="text-[#ff5252] ml-0.5">*</span>
                    </label>
                    <ThemedSelect
                      disabled={isBasicsSaving}
                      value={categoryId}
                      onValueChange={setCategoryId}
                      options={categoryOptions}
                      ariaLabel="Select category"
                      triggerClassName="!w-full !h-11 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-[10px] !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.88rem] disabled:!opacity-60 disabled:!cursor-not-allowed"
                      action={
                        isBasicsSaving
                          ? undefined
                          : {
                              label: "Add / Manage categories",
                              onSelect: handleOpenAddCategoryModal,
                            }
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-2 mb-0">
                    <label
                      id="difficulty-label"
                      className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                    >
                      Difficulty Level{" "}
                      <span className="text-[#ff5252] ml-0.5">*</span>
                    </label>
                    <ThemedSelect
                      disabled={isBasicsSaving}
                      value={difficultyLevel}
                      onValueChange={(val) => setDifficultyLevel(val as any)}
                      options={difficultyOptions}
                      ariaLabel="Select difficulty level"
                      triggerClassName="!w-full !h-11 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-[10px] !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.88rem] disabled:!opacity-60 disabled:!cursor-not-allowed"
                    />
                  </div>

                  <div className="flex flex-col gap-2 mb-0 max-[900px]:col-span-2 max-[640px]:col-span-1">
                    <label
                      id="language-label"
                      className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                    >
                      Course Language
                    </label>
                    <ThemedSelect
                      disabled={isBasicsSaving}
                      value={language}
                      onValueChange={setLanguage}
                      options={languageOptions}
                      ariaLabel="Select course language"
                      searchable
                      searchPlaceholder="Search languages..."
                      triggerClassName="!w-full !h-11 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-[10px] !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.88rem] disabled:!opacity-60 disabled:!cursor-not-allowed"
                    />
                  </div>
                </div>
              </section>

              {/* Course Media Section */}
              <section className="relative z-10 rounded-[14px] p-6 bg-[var(--surface)] shadow-[var(--card-shadow)] max-[768px]:p-4">
                <div className="mb-4.5">
                  <h2 className="m-0 text-[var(--text)] text-[1.18rem] font-[650] tracking-[-0.015em]">
                    Course Media
                  </h2>
                  <p className="m-0 mt-1 mb-5 text-[var(--muted)] text-[0.82rem]">
                    Add media that best represents your course.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
                  {/* Hidden Thumbnail File Input */}
                  <input
                    type="file"
                    ref={thumbnailInputRef}
                    disabled={isBasicsSaving}
                    onChange={handleThumbnailFileSelect}
                    accept="image/*"
                    style={{ display: "none" }}
                  />

                  {/* Hidden Video Trailer File Input */}
                  <input
                    type="file"
                    ref={videoTrailerInputRef}
                    disabled={isBasicsSaving}
                    onChange={handleVideoTrailerFileSelect}
                    accept="video/*"
                    style={{ display: "none" }}
                  />

                  {/* Thumbnail Upload */}
                  <div className="flex flex-col min-w-0">
                    <h3 className="m-0 mb-1 text-[var(--text-secondary)] text-[0.86rem] font-semibold">
                      Thumbnail <span className="text-[#ff5252] ml-0.5">*</span>
                    </h3>
                    <p className="m-0 mb-3 text-[var(--muted)] text-[0.78rem] min-h-[1.15rem]">
                      Upload a thumbnail for your course.
                    </p>
                    {thumbnail ? (
                      <div className="group relative flex flex-col items-center justify-center aspect-video w-full min-h-[175px] box-border border border-solid border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-xl p-0 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-center overflow-hidden">
                        <img
                          src={thumbnail}
                          alt="Course thumbnail preview"
                          className="w-full h-full object-cover block"
                        />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 p-3 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-[2px]">
                          <button
                            type="button"
                            disabled={isBasicsSaving}
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 700,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "16px",
                              paddingRight: "16px",
                            }}
                            className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={triggerThumbnailUpload}
                          >
                            <ImageIcon size={15} /> Change Image
                          </button>
                          <button
                            type="button"
                            disabled={isBasicsSaving}
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
                      <div className="relative flex flex-col items-center justify-center aspect-video w-full min-h-[175px] box-border border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-center overflow-hidden transition-[border-color,background-color] duration-180 ease-out">
                        <div className="mb-2 text-[var(--muted)]">
                          <ImageIcon size={30} weight="light" />
                        </div>
                        <div className="flex items-center justify-center gap-2.5 flex-wrap">
                          <button
                            type="button"
                            disabled={isBasicsSaving}
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 700,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "16px",
                              paddingRight: "16px",
                            }}
                            className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={triggerThumbnailUpload}
                          >
                            <UploadSimple size={15} /> Upload
                          </button>
                        </div>
                        <p className="m-0 mt-2 text-[var(--muted)] text-[0.74rem]">
                          Recommended: 1280x720px (16:9)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Video Trailer Upload */}
                  <div className="flex flex-col min-w-0">
                    <h3 className="m-0 mb-1 text-[var(--text-secondary)] text-[0.86rem] font-semibold">
                      Video Trailer (Optional)
                    </h3>
                    <p className="m-0 mb-3 text-[var(--muted)] text-[0.78rem] min-h-[1.15rem]">
                      Add a trailer video to showcase your course.
                    </p>
                    {videoTrailer ? (
                      <div className="group relative flex flex-col items-center justify-center aspect-video w-full min-h-[175px] box-border border border-solid border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-xl p-0 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-center overflow-hidden">
                        <video
                          src={videoTrailer}
                          className="w-full h-full object-cover block"
                          controls
                        />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 p-3 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-[2px]">
                          <button
                            type="button"
                            disabled={isBasicsSaving}
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 700,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "16px",
                              paddingRight: "16px",
                            }}
                            className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={triggerVideoTrailerUpload}
                          >
                            <PlayCircle size={15} /> Change Video
                          </button>
                          <button
                            type="button"
                            disabled={isBasicsSaving}
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
                      <div className="relative flex flex-col items-center justify-center aspect-video w-full min-h-[175px] box-border border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-center overflow-hidden transition-[border-color,background-color] duration-180 ease-out">
                        <div className="mb-2 text-[var(--muted)]">
                          <PlayCircle size={30} weight="light" />
                        </div>
                        <div className="flex items-center justify-center gap-2.5 flex-wrap">
                          <button
                            type="button"
                            disabled={isBasicsSaving}
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 700,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "16px",
                              paddingRight: "16px",
                            }}
                            className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={triggerVideoTrailerUpload}
                          >
                            <UploadSimple size={15} /> Upload
                          </button>
                          <button
                            type="button"
                            disabled={isBasicsSaving}
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 500,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "14px",
                              paddingRight: "14px",
                            }}
                            className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => {
                              // Select from media action
                            }}
                          >
                            <PlayCircle size={15} /> Select from Media
                          </button>
                        </div>
                        <p className="m-0 mt-2 text-[var(--muted)] text-[0.74rem]">
                          Recommended: 16:9 video
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Live Course Preview */}
            <div className="">
              <section className="rounded-[14px] p-5 bg-[var(--surface)] shadow-[var(--card-shadow)]">
                <h2 className="m-0 text-[var(--text)] text-[1.1rem] font-[650]">
                  Course Preview
                </h2>
                <p className="m-0 mt-1 mb-4 text-[var(--muted)] text-[0.8rem]">
                  This is how your course will appear to students.
                </p>

                <div
                  className={`relative aspect-video border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-[10px] overflow-hidden bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] transition-[border-color,background-color] duration-180 ease-out ${
                    !thumbnail
                      ? "is-clickable cursor-pointer hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]"
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
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--muted)] text-[0.8rem]">
                      <div className="flex items-center justify-center text-[var(--muted)] opacity-60">
                        <ImageIcon size={32} weight="light" />
                      </div>
                      <span className="text-[var(--muted)] opacity-70">
                        Course thumbnail will appear here
                      </span>
                      <span className="inline-block mt-0.5 rounded-md px-2 py-0.5 text-[0.72rem] font-semibold text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-colors duration-150">
                        Click to upload
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <h3 className="m-0 mb-2 text-[var(--text)] text-[1.15rem] font-bold leading-[1.3]">
                    {courseTitle.trim() ? courseTitle : "Course Title"}
                  </h3>

                  {difficultyLevel && (
                    <div className="inline-block mb-3">
                      <span className="rounded-md px-2.5 py-0.75 text-[var(--accent-ink,var(--accent))] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[0.74rem] font-semibold">
                        {difficultyLevel}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-3.5 text-[var(--muted)] text-[0.8rem]">
                    <span className="flex items-center gap-1.25">
                      <BookOpen size={15} /> {totalSections} Sections
                    </span>
                    <span className="flex items-center gap-1.25">
                      <BookOpen size={15} /> {totalLessons} Lessons
                    </span>
                    <span className="flex items-center gap-1.25">0h 0m</span>
                  </div>

                  <div className="mt-3.5 min-w-0 max-w-full overflow-hidden [overflow-wrap:anywhere] break-words">
                    <h4 className="m-0 mb-1.5 text-[var(--text-secondary)] text-[0.84rem] font-[650]">
                      About this course
                    </h4>
                    {courseDescription.trim() ? (
                      <RenderMarkdown content={courseDescription} />
                    ) : (
                      <p className="m-0 text-[var(--muted)] text-[0.82rem] leading-normal [overflow-wrap:anywhere] break-words">
                        This is a short description of your course. It will
                        appear here on the course card.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : activeStep === "curriculum" ? (
          <div className="flex flex-col gap-4 w-full flex-1 min-h-0">
            {/* Header row */}
            <div className="flex items-center justify-between mb-2 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3">
              <div className="">
                <h2 className="m-0 text-[var(--text)] text-[1.25rem] font-bold tracking-[-0.015em]">
                  Course Curriculum
                </h2>
                <p className="m-0 mt-1 text-[var(--muted)] text-[0.85rem]">
                  Organize your course into sections and lessons. You can
                  reorder them anytime.
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                {(isReorderingSections ||
                  reorderSectionsMutation.isPending) && (
                  <span className="inline-flex items-center gap-1 text-[var(--accent)] text-[0.74rem] font-bold px-2.5 py-1 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                    <CircleNotch
                      size={13}
                      className="animate-spin text-[var(--accent)]"
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
                  className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:whitespace-nowrap max-[768px]:self-start"
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
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] mb-3.5">
                  <BookOpen size={24} weight="bold" />
                </div>
                <h3 className="m-0 text-[var(--text)] text-[1.05rem] font-bold">
                  No sections added yet
                </h3>
                <p className="m-0 mt-1.5 max-w-[320px] text-[var(--muted)] text-[0.84rem]">
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
                  className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed"
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
                  className={`border rounded-[14px] bg-[var(--surface)] shadow-[var(--card-shadow)] overflow-hidden transition-[border-color,box-shadow,opacity] duration-150 ${
                    deletingSectionId === sec.id
                      ? "opacity-45 pointer-events-none border-red-500/30"
                      : draggedSectionIndex === secIndex
                        ? "opacity-35 border-dashed border-[var(--accent)]"
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
                        className={`flex items-center justify-center text-[var(--muted)] transition-opacity duration-150 ${
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
                        <span className="text-[var(--text)] text-[0.92rem] font-bold max-[768px]:whitespace-nowrap max-[768px]:shrink-0">
                          Section {secIndex + 1}
                        </span>
                        {sec.isEditingTitle ? (
                          <div
                            className="flex items-center gap-2 max-[768px]:w-full"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              className="border border-[var(--accent)] rounded-md px-2 py-0.75 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none disabled:opacity-60 disabled:cursor-not-allowed"
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
                            className={`text-[var(--text)] text-[0.92rem] font-semibold max-[768px]:break-words max-[768px]:min-w-0 ${
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
                        <span className="ml-1 text-[var(--muted)] text-[0.76rem] font-normal">
                          {sec.lessons.length}{" "}
                          {sec.lessons.length === 1 ? "Lesson" : "Lessons"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 max-[768px]:w-full max-[768px]:justify-between max-[768px]:pt-2 max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                      {sec.isPendingCreation ? (
                        <span className="inline-flex items-center gap-1 text-[var(--accent)] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                          <CircleNotch
                            size={12}
                            className="animate-spin text-[var(--accent)]"
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
                        <span className="inline-flex items-center gap-1 text-[var(--accent)] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                          <CircleNotch
                            size={12}
                            className="animate-spin text-[var(--accent)]"
                          />
                          <span>Saving order...</span>
                        </span>
                      ) : updatingSectionId === sec.id ? (
                        <span className="inline-flex items-center gap-1 text-[var(--accent)] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                          <CircleNotch
                            size={12}
                            className="animate-spin text-[var(--accent)]"
                          />
                          <span>Saving...</span>
                        </span>
                      ) : null}
                      <button
                        type="button"
                        disabled={
                          sec.isPendingCreation ||
                          updatingSectionId === sec.id ||
                          deletingSectionId === sec.id
                        }
                        className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] transition-[color,background-color,border-color] duration-150 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
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
                            className="animate-spin text-[var(--accent)]"
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
                        className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all duration-150 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
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
                        className={`inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] transition-all duration-150 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none [&>svg]:transition-transform [&>svg]:duration-200 ${
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
                            className={`border rounded-[10px] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] shadow-[var(--card-shadow)] overflow-hidden transition-[border-color,box-shadow,opacity] duration-150 ${
                              draggedLessonState?.sectionId === sec.id &&
                              draggedLessonState?.lessonIndex === lesIndex
                                ? "opacity-35 border-dashed border-[var(--accent)]"
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
                                  className={`flex items-center justify-center text-[var(--muted)] transition-opacity duration-150 ${
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
                                <span className="inline-flex min-w-[22px] h-[22px] items-center justify-center rounded text-[var(--muted)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[0.72rem] font-medium">
                                  {lesIndex + 1}
                                </span>
                                <span className="text-[var(--text)] text-[0.88rem] font-semibold max-[768px]:flex-1 max-[768px]:min-w-0 max-[768px]:break-words">
                                  {les.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 max-[768px]:w-full max-[768px]:justify-between max-[768px]:pt-2 max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                                {les.isPendingCreation ? (
                                  <span className="inline-flex items-center gap-1 text-[var(--accent)] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                                    <CircleNotch
                                      size={12}
                                      className="animate-spin text-[var(--accent)]"
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
                                ) : savingLessonId === les.id ? (
                                  <span className="inline-flex items-center gap-1 text-[var(--accent)] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                                    <CircleNotch
                                      size={12}
                                      className="animate-spin text-[var(--accent)]"
                                    />
                                    <span>Saving...</span>
                                  </span>
                                ) : null}
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
                                  <span className="inline-flex items-center gap-1.25 text-[var(--accent-ink,var(--accent))] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                                    <PlayCircle size={13} weight="fill" /> Video
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.25 text-[var(--accent-ink,var(--accent))] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)]">
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
                                  className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all duration-150 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
                                  className={`inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] transition-all duration-150 bg-transparent cursor-pointer p-0 [&>svg]:transition-transform [&>svg]:duration-200 ${
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
                                <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 max-[1024px]:grid-cols-1 max-[768px]:gap-3.5">
                                  {/* Left column */}
                                  <div className="flex flex-col gap-4.5">
                                    {/* Lesson Title */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <label
                                        htmlFor={`les-title-${les.id}`}
                                        className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
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
                                          placeholder="e.g. Introduction to React Hooks"
                                          className="w-full h-11 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] pl-3.5 pr-[70px] py-0 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed"
                                        />
                                        <span className="absolute right-3.5 text-[var(--muted)] text-[0.76rem] pointer-events-none">
                                          {les.title.length} / 120
                                        </span>
                                      </div>
                                    </div>

                                    {/* Lesson Description Rich Editor */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <label
                                        id={`les-desc-label-${les.id}`}
                                        className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                                      >
                                        Lesson Description
                                      </label>
                                      <div
                                        className={
                                          les.isPendingCreation
                                            ? "opacity-60 pointer-events-none"
                                            : ""
                                        }
                                      >
                                        <RichTextEditor
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
                                      <label className="text-[var(--text-secondary)] text-[0.84rem] font-semibold">
                                        Content Type{""}
                                        <span className="text-[#ff5252] ml-0.5">
                                          *
                                        </span>
                                      </label>
                                      <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
                                        <div
                                          className={`relative flex items-center gap-3 border rounded-[10px] px-3.5 py-3 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                            les.isPendingCreation
                                              ? "opacity-60 cursor-not-allowed"
                                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                          } ${
                                            les.contentType === "video"
                                              ? "is-selected border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                          }`}
                                          onClick={() => {
                                            if (les.isPendingCreation) return;
                                            handleUpdateLesson(sec.id, les.id, {
                                              contentType: "video",
                                            });
                                          }}
                                        >
                                          <div
                                            className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${les.contentType === "video" ? "border-[var(--accent)]" : "border-[var(--muted)]"}`}
                                          >
                                            {les.contentType === "video" && (
                                              <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                                            )}
                                          </div>
                                          <div className="flex items-center justify-center text-[var(--accent)] mt-px">
                                            <Video size={18} weight="fill" />
                                          </div>
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-[var(--text)] text-[0.86rem] font-bold leading-[18px]">
                                              Video
                                            </span>
                                            <span className="text-[var(--muted)] text-[0.75rem]">
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
                                              ? "is-selected border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                          }`}
                                          onClick={() => {
                                            if (les.isPendingCreation) return;
                                            handleUpdateLesson(sec.id, les.id, {
                                              contentType: "document",
                                            });
                                          }}
                                        >
                                          <div
                                            className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${les.contentType === "document" ? "border-[var(--accent)]" : "border-[var(--muted)]"}`}
                                          >
                                            {les.contentType === "document" && (
                                              <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                                            )}
                                          </div>
                                          <div className="flex items-center justify-center text-[var(--accent)] mt-px">
                                            <FileText size={18} weight="fill" />
                                          </div>
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-[var(--text)] text-[0.86rem] font-bold leading-[18px]">
                                              Document / PDF
                                            </span>
                                            <span className="text-[var(--muted)] text-[0.75rem]">
                                              Upload PDF or document
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Content Source Controls (Video or Document) */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <label className="text-[var(--text-secondary)] text-[0.84rem] font-semibold">
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
                                          className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
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
                                          className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                        >
                                          {les.contentType === "video" ? (
                                            <PlayCircle
                                              size={15}
                                              className="text-[var(--text-secondary)]"
                                            />
                                          ) : (
                                            <FileText
                                              size={15}
                                              className="text-[var(--text-secondary)]"
                                            />
                                          )}
                                          Select from Media
                                        </button>
                                      </div>
                                    </div>

                                    {/* Lesson Publishing Status */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <label className="text-[var(--text-secondary)] text-[0.84rem] font-semibold">
                                        Publishing Status
                                      </label>
                                      <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
                                        <div
                                          className={`relative flex items-center gap-3 border rounded-[10px] px-3.5 py-3 text-left transition-[border-color,background-color] duration-150 ease-out ${
                                            les.isPendingCreation
                                              ? "opacity-60 cursor-not-allowed"
                                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                          } ${
                                            les.isPublished !== false
                                              ? "is-selected border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                          }`}
                                          onClick={() => {
                                            if (les.isPendingCreation) return;
                                            handleUpdateLesson(sec.id, les.id, {
                                              isPublished: true,
                                            });
                                          }}
                                        >
                                          <div
                                            className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                                              les.isPublished !== false
                                                ? "border-[var(--accent)]"
                                                : "border-[var(--muted)]"
                                            }`}
                                          >
                                            {les.isPublished !== false && (
                                              <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                                            )}
                                          </div>
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-[var(--text)] text-[0.86rem] font-bold leading-[18px]">
                                              Published
                                            </span>
                                            <span className="text-[var(--muted)] text-[0.75rem]">
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
                                            handleUpdateLesson(sec.id, les.id, {
                                              isPublished: false,
                                            });
                                          }}
                                        >
                                          <div
                                            className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                                              les.isPublished === false
                                                ? "border-[#f59e0b]"
                                                : "border-[var(--muted)]"
                                            }`}
                                          >
                                            {les.isPublished === false && (
                                              <div className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                                            )}
                                          </div>
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-[var(--text)] text-[0.86rem] font-bold leading-[18px]">
                                              Draft (Hidden)
                                            </span>
                                            <span className="text-[var(--muted)] text-[0.75rem]">
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
                                        <strong className="block mb-0.5 text-[var(--text)] text-[0.88rem] font-[650]">
                                          Free Preview
                                        </strong>
                                        <p className="m-0 text-[var(--muted)] text-[0.78rem]">
                                          Allow prospective students to view
                                          this lesson before enrolling or
                                          purchasing.
                                        </p>
                                      </div>
                                      <SettingsToggle
                                        checked={les.isPreview === true}
                                        onChange={(checked) => {
                                          if (les.isPendingCreation) return;
                                          handleUpdateLesson(sec.id, les.id, {
                                            isPreview: checked,
                                          });
                                        }}
                                        label="Toggle Free Preview"
                                      />
                                    </div>

                                    {/* Lesson Resources Table */}
                                    <div className="flex flex-col gap-2 mb-5">
                                      <div className="flex items-center justify-between mb-2 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-2.5">
                                        <label className="flex items-center gap-1.5 text-[var(--text-secondary)] text-[0.84rem] font-semibold">
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
                                            className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
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
                                            className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-60 disabled:cursor-not-allowed max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                            onClick={() =>
                                              handleAddLessonResource(
                                                sec.id,
                                                les.id,
                                              )
                                            }
                                          >
                                            <PlayCircle
                                              size={15}
                                              className="text-[var(--text-secondary)]"
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
                                                    <span className="text-[var(--text)] text-[0.82rem] font-semibold truncate">
                                                      {res.name}
                                                    </span>
                                                    <span className="text-[var(--muted)] text-[0.72rem] flex items-center gap-1.5 mt-0.5">
                                                      <span className="uppercase text-[var(--text-secondary)] font-bold">
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
                                                  className="inline-flex w-7 h-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors border-0 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
                                                  <th className="px-4 py-2.5 text-[var(--muted)] text-[0.74rem] font-bold tracking-wider uppercase">
                                                    File Name
                                                  </th>
                                                  <th className="px-4 py-2.5 text-[var(--muted)] text-[0.74rem] font-bold tracking-wider uppercase">
                                                    Type
                                                  </th>
                                                  <th className="px-4 py-2.5 text-[var(--muted)] text-[0.74rem] font-bold tracking-wider uppercase">
                                                    Size
                                                  </th>
                                                  <th className="px-4 py-2.5 text-[var(--muted)] text-[0.74rem] font-bold tracking-wider uppercase text-right pr-4">
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
                                                    <td className="px-4 py-3 text-[var(--text)] text-[0.82rem] font-semibold">
                                                      <div className="flex items-center gap-2.5">
                                                        <FileText
                                                          size={16}
                                                          weight="fill"
                                                          className="text-red-400 shrink-0"
                                                        />
                                                        <span>{res.name}</span>
                                                      </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-[var(--text-secondary)] text-[0.80rem] font-medium">
                                                      {res.type}
                                                    </td>
                                                    <td className="px-4 py-3 text-[var(--muted)] text-[0.80rem]">
                                                      {res.size}
                                                    </td>
                                                    <td className="px-4 py-3 text-right pr-4">
                                                      <button
                                                        type="button"
                                                        disabled={
                                                          les.isPendingCreation
                                                        }
                                                        className="inline-flex w-7 h-7 items-center justify-center rounded-lg text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors border-0 bg-transparent cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
                                        <p className="m-0 mb-3 text-[var(--muted)] text-[0.78rem] min-h-[1.15rem]">
                                          No resources added to this lesson yet.
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex justify-end mt-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                                      <button
                                        type="button"
                                        disabled={
                                          les.isPendingCreation ||
                                          !isLessonDirty(les) ||
                                          savingLessonId === les.id ||
                                          updateLessonMutation.isPending
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
                                        className={`inline-flex items-center justify-center border transition-all duration-150 ${
                                          !isLessonDirty(les) ||
                                          les.isPendingCreation ||
                                          savingLessonId === les.id
                                            ? "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] bg-transparent opacity-40 cursor-not-allowed pointer-events-none"
                                            : "border-[var(--accent)] text-[var(--on-accent,#ffffff)] bg-[var(--accent)] hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_12px_var(--accent-shadow)] cursor-pointer"
                                        }`}
                                        onClick={() =>
                                          handleSaveLesson(sec.id, les.id)
                                        }
                                        title={
                                          les.isPendingCreation
                                            ? "Creating lesson..."
                                            : !isLessonDirty(les)
                                              ? "No changes to save"
                                              : "Save changes"
                                        }
                                      >
                                        {les.isPendingCreation ? (
                                          <>
                                            <CircleNotch
                                              size={14}
                                              className="animate-spin text-[var(--accent)]"
                                            />
                                            <span>Creating lesson...</span>
                                          </>
                                        ) : savingLessonId === les.id ? (
                                          <>
                                            <CircleNotch
                                              size={14}
                                              className="animate-spin text-[var(--accent)]"
                                            />
                                            <span>Saving...</span>
                                          </>
                                        ) : (
                                          <>
                                            <FloppyDisk size={15} /> Save Lesson
                                          </>
                                        )}
                                      </button>
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
                          className="inline-flex items-center gap-1.5 text-[var(--muted)] enabled:hover:text-[var(--text)] text-[0.82rem] font-medium border-0 bg-transparent p-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none enabled:cursor-pointer"
                          onClick={() => handleAddLesson(sec.id)}
                        >
                          {creatingLessonSectionId === sec.id ? (
                            <>
                              <CircleNotch
                                size={14}
                                className="animate-spin text-[var(--accent)]"
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
        ) : activeStep === "access-rules" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top Grid: 1. Who can access & 2. Access duration */}
            <div className="grid grid-cols-2 gap-5 max-[768px]:grid-cols-1 max-[768px]:gap-3.5">
              {/* Card 1: Who can access this course? */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)]">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                    1. Who can access this course?
                  </h3>
                  <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                    Choose who is allowed to access this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Radio option: Everyone */}
                  <label
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                      accessRules.accessType === "everyone"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    }`}
                    onClick={() => handleAccessTypeChange("everyone")}
                  >
                    <div
                      className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        accessRules.accessType === "everyone"
                          ? "border-[var(--accent)]"
                          : "border-[var(--muted)]"
                      }`}
                    >
                      {accessRules.accessType === "everyone" && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                        Everyone
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
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
                    <div className="flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--muted)]" />
                    <div className="flex flex-1 flex-col gap-0.75 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                          Restricted access
                        </strong>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                          Coming soon
                        </span>
                      </div>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                        Only users who meet the selected requirements can access
                        this course.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Access duration */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)]">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                    2. Access duration
                  </h3>
                  <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                    Set how long learners can access this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Option 1: Lifetime access */}
                  <div
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                      isAccessRulesSaving
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    } ${
                      accessRules.durationMode === "lifetime"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                    }`}
                    onClick={() =>
                      !isAccessRulesSaving &&
                      handleDurationModeChange("lifetime")
                    }
                  >
                    <div
                      className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        accessRules.durationMode === "lifetime"
                          ? "border-[var(--accent)]"
                          : "border-[var(--muted)]"
                      }`}
                    >
                      {accessRules.durationMode === "lifetime" && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                        Lifetime access
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                        Learners can access this course forever.
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Fixed duration */}
                  <div
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                      isAccessRulesSaving
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    } ${
                      accessRules.durationMode === "fixed"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                    }`}
                    onClick={() =>
                      !isAccessRulesSaving && handleDurationModeChange("fixed")
                    }
                  >
                    <div
                      className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        accessRules.durationMode === "fixed"
                          ? "border-[var(--accent)]"
                          : "border-[var(--muted)]"
                      }`}
                    >
                      {accessRules.durationMode === "fixed" && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                        Fixed duration
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                        Set a duration for how long learners can access this
                        course.
                      </p>

                      {accessRules.durationMode === "fixed" && (
                        <div
                          className="flex items-center gap-2.5 mt-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="number"
                            disabled={isAccessRulesSaving}
                            className="w-[80px] h-9 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-0 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.84rem] font-semibold outline-none transition-[border-color] duration-150 hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] focus:border-[var(--accent)] box-border text-center disabled:opacity-60 disabled:cursor-not-allowed"
                            min={1}
                            value={accessRules.fixedDurationValue}
                            onChange={(e) =>
                              handleFixedDurationValueChange(
                                parseInt(e.target.value, 10),
                              )
                            }
                          />
                          <ThemedSelect
                            disabled={isAccessRulesSaving}
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
                            triggerClassName="!w-[130px] !h-9 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all flex items-center justify-between disabled:!opacity-60 disabled:!cursor-not-allowed"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Card: 3. Learner interactions */}
            <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)] w-full">
              <div className="mb-4.5">
                <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                  3. Learner interactions
                </h3>
                <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                  Manage how learners can interact within this course.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {/* Toggle 1: Q&A */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
                      <Question size={20} weight="bold" />
                    </div>
                    <div>
                      <strong className="block mb-0.5 text-[var(--text)] text-[0.9rem] font-[650]">
                        Q&A
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem]">
                        Allow learners to ask questions about lessons.
                      </p>
                    </div>
                  </div>
                  <SettingsToggle
                    checked={accessRules.enableQA}
                    disabled={isAccessRulesSaving}
                    onChange={handleToggleQA}
                    label="Toggle Q&A"
                  />
                </div>

                {/* Toggle 2: Comments */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
                      <ChatCircleText size={20} weight="fill" />
                    </div>
                    <div>
                      <strong className="block mb-0.5 text-[var(--text)] text-[0.9rem] font-[650]">
                        Comments
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem]">
                        Allow learners to comment on course content.
                      </p>
                    </div>
                  </div>
                  <SettingsToggle
                    checked={accessRules.enableComments}
                    disabled={isAccessRulesSaving}
                    onChange={handleToggleComments}
                    label="Toggle Comments"
                  />
                </div>

                {/* Toggle 3: Reviews */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
                      <Star size={20} weight="fill" />
                    </div>
                    <div>
                      <strong className="block mb-0.5 text-[var(--text)] text-[0.9rem] font-[650]">
                        Reviews
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem]">
                        Allow learners to leave star ratings and reviews.
                      </p>
                    </div>
                  </div>
                  <SettingsToggle
                    checked={accessRules.enableReviews}
                    disabled={isAccessRulesSaving}
                    onChange={handleToggleReviews}
                    label="Toggle Reviews"
                  />
                </div>

                {/* Toggle 4: Downloads */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
                      <DownloadSimple size={20} weight="bold" />
                    </div>
                    <div>
                      <strong className="block mb-0.5 text-[var(--text)] text-[0.9rem] font-[650]">
                        Downloads
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem]">
                        Allow learners to download lesson resources for offline
                        access.
                      </p>
                    </div>
                  </div>
                  <SettingsToggle
                    checked={accessRules.enableDownloads}
                    disabled={isAccessRulesSaving}
                    onChange={handleToggleDownloads}
                    label="Toggle Downloads"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "pricing" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Course pricing & 2. Price details */}
            <div className="grid grid-cols-2 gap-5 max-[768px]:grid-cols-1 max-[768px]:gap-3.5">
              {/* Card 1: Course pricing */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)] transition-opacity duration-200">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                    1. Course pricing
                  </h3>
                  <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                    Choose how you want to sell this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Radio Option: Free */}
                  <div
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                      isPricingSaving
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    } ${
                      pricing.pricingType === "free"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                    }`}
                    onClick={() =>
                      !isPricingSaving && handlePricingTypeChange("free")
                    }
                  >
                    <div
                      className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        pricing.pricingType === "free"
                          ? "border-[var(--accent)]"
                          : "border-[var(--muted)]"
                      }`}
                    >
                      {pricing.pricingType === "free" && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                        Free
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                        Anyone who can access the course can enroll for free.
                      </p>
                    </div>
                  </div>

                  {/* Radio Option: Paid */}
                  <div
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                      isPricingSaving
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    } ${
                      pricing.pricingType === "paid"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                    }`}
                    onClick={() =>
                      !isPricingSaving && handlePricingTypeChange("paid")
                    }
                  >
                    <div
                      className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        pricing.pricingType === "paid"
                          ? "border-[var(--accent)]"
                          : "border-[var(--muted)]"
                      }`}
                    >
                      {pricing.pricingType === "paid" && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                        Paid
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                        Learners must purchase the course to get access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Price details */}
              <div
                className={`flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)] transition-opacity duration-200 ${
                  pricing.pricingType === "free"
                    ? "is-disabled opacity-55 pointer-events-none"
                    : ""
                }`}
              >
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                    2. Price details
                  </h3>
                  <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                    Set the pricing for your course.
                  </p>
                </div>

                <div className="flex flex-col gap-1.75">
                  {/* Currency Combobox Field */}
                  <div className="flex flex-col gap-2 mb-5">
                    <label
                      id="currency-label"
                      className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                    >
                      Currency <span className="text-[#ff5252] ml-0.5">*</span>
                    </label>
                    <ThemedSelect
                      value={pricing.currency || "USD"}
                      onValueChange={handleCurrencyChange}
                      options={currencyOptions}
                      disabled={
                        pricing.pricingType === "free" || isPricingSaving
                      }
                      ariaLabel="Select currency"
                      searchable
                      searchPlaceholder="Search currencies by name or code..."
                      triggerClassName="!w-full !h-11 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-[10px] !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.88rem] !font-medium disabled:!opacity-60 disabled:!cursor-not-allowed"
                    />
                    <p className="m-0 mt-1 text-[var(--muted)] text-[0.78rem]">
                      Choose the currency for course pricing.
                    </p>
                  </div>

                  {/* Selling Price Field */}
                  <div className="flex flex-col gap-2 mb-5">
                    <label
                      htmlFor="selling-price"
                      className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                    >
                      Selling price{" "}
                      <span className="text-[#ff5252] ml-0.5">*</span>
                    </label>
                    <div className="relative flex items-center w-full">
                      <span className="absolute left-3.5 text-[var(--muted)] text-[0.9rem] font-semibold pointer-events-none">
                        {getCurrencySymbol(pricing.currency || "USD")}
                      </span>
                      <input
                        id="selling-price"
                        type="text"
                        disabled={
                          pricing.pricingType === "free" || isPricingSaving
                        }
                        value={pricing.sellingPrice}
                        onChange={(e) =>
                          handleSellingPriceChange(e.target.value)
                        }
                        placeholder="1,999"
                        className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 pr-3.5 pl-8 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="m-0 mt-1 text-[var(--muted)] text-[0.78rem]">
                      This is the price learners will pay.
                    </p>
                  </div>

                  {/* Original Price Field */}
                  <div className="flex flex-col gap-2 mb-5">
                    <label
                      htmlFor="original-price"
                      className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                    >
                      Original price
                    </label>
                    <div className="relative flex items-center w-full">
                      <span className="absolute left-3.5 text-[var(--muted)] text-[0.9rem] font-semibold pointer-events-none">
                        {getCurrencySymbol(pricing.currency || "USD")}
                      </span>
                      <input
                        id="original-price"
                        type="text"
                        disabled={
                          pricing.pricingType === "free" || isPricingSaving
                        }
                        value={pricing.originalPrice}
                        onChange={(e) =>
                          handleOriginalPriceChange(e.target.value)
                        }
                        placeholder="2,999"
                        className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 pr-3.5 pl-8 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="m-0 mt-1 text-[var(--muted)] text-[0.78rem]">
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
                              ? "is-active border-green-500/40 text-green-400 bg-green-500/[0.12]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--muted)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                          }`}
                        >
                          <Tag size={15} weight="bold" className="shrink-0" />
                          <span className="whitespace-nowrap leading-none">
                            {isValidDiscount && pricing.pricingType === "paid"
                              ? `${discountPercent}% OFF`
                              : "0% OFF"}
                          </span>
                        </div>
                        <span className="text-[var(--muted)] text-[0.8rem] leading-tight">
                          Discount is calculated automatically.
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Card 3: Sale schedule (Optional) */}
            <div
              className={`flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)] transition-opacity duration-200 ${
                pricing.pricingType === "free"
                  ? "is-disabled opacity-55 pointer-events-none"
                  : ""
              }`}
            >
              <div className="mb-4.5 flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                    3. Sale schedule (Optional)
                  </h3>
                  <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                    Set an optional start and end date/time for promotional
                    pricing countdowns.
                  </p>
                </div>
              </div>

              {pricingValidationError && (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[0.84rem] font-semibold text-red-400">
                  <WarningCircle size={18} weight="bold" className="shrink-0" />
                  <span>{pricingValidationError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-5 max-[768px]:grid-cols-1 max-[768px]:gap-3.5">
                {/* Sale Start Date */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="sale-starts-at"
                    className="text-[var(--text-secondary)] text-[0.84rem] font-semibold flex items-center gap-1.5"
                  >
                    <Calendar size={15} className="text-[var(--accent)]" />
                    Sale Start Date & Time
                  </label>
                  <div className="relative flex items-center w-full">
                    <input
                      id="sale-starts-at"
                      type="datetime-local"
                      disabled={
                        pricing.pricingType === "free" || isPricingSaving
                      }
                      value={pricing.saleStartsAt}
                      onChange={(e) => handleSaleStartsAtChange(e.target.value)}
                      className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 px-3.5 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] font-medium outline-none transition-[border-color] duration-150 focus:border-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed [color-scheme:dark_light]"
                    />
                  </div>
                  <p className="m-0 mt-0.5 text-[var(--muted)] text-[0.78rem]">
                    When the promotion begins.
                  </p>
                </div>

                {/* Sale End Date */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="sale-ends-at"
                    className="text-[var(--text-secondary)] text-[0.84rem] font-semibold flex items-center gap-1.5"
                  >
                    <Clock size={15} className="text-[var(--accent)]" />
                    Sale End Date & Time
                  </label>
                  <div className="relative flex items-center w-full">
                    <input
                      id="sale-ends-at"
                      type="datetime-local"
                      disabled={
                        pricing.pricingType === "free" || isPricingSaving
                      }
                      value={pricing.saleEndsAt}
                      onChange={(e) => handleSaleEndsAtChange(e.target.value)}
                      className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 px-3.5 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] font-medium outline-none transition-[border-color] duration-150 focus:border-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed [color-scheme:dark_light]"
                    />
                  </div>
                  <p className="m-0 mt-0.5 text-[var(--muted)] text-[0.78rem]">
                    When the promotional discount ends.
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Card: Coupons Banner */}
            <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[14px] px-5.5 py-4 bg-[var(--surface)] shadow-[var(--card-shadow)] max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3.5">
              <div className="flex items-center gap-3.5">
                <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                  <Info size={20} weight="bold" />
                </div>
                <div>
                  <strong className="block mb-0.5 text-[var(--text)] text-[0.92rem] font-[650]">
                    Coupons
                  </strong>
                  <p className="m-0 text-[var(--muted)] text-[0.82rem]">
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
                className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] max-[768px]:w-full max-[768px]:justify-center"
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
        ) : activeStep === "extras" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Certificates & 2. This course includes */}
            <div className="grid grid-cols-2 items-start gap-5 max-[768px]:grid-cols-1 max-[768px]:gap-3.5">
              {/* Card 1: Certificates */}
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)]">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                    1. Certificates
                  </h3>
                  <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                    Configure how certificates will be issued for this course.
                  </p>
                </div>

                {/* Enable Certificate Toggle Row */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] mb-4.5">
                  <div>
                    <strong className="block mb-0.5 text-[var(--text)] text-[0.9rem] font-[650]">
                      Enable certificate
                    </strong>
                    <p className="m-0 text-[var(--muted)] text-[0.8rem]">
                      Issue certificates to learners on course completion.
                    </p>
                  </div>
                  <SettingsToggle
                    checked={extras.enableCertificate}
                    disabled={isExtrasSaving}
                    onChange={handleToggleCertificate}
                    label="Toggle certificate"
                  />
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
                      <label className="text-[var(--text-secondary)] text-[0.84rem] font-semibold">
                        Certificate template
                      </label>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-[var(--muted)] text-[0.78rem]">
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
                        triggerClassName="!w-full !h-10 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all"
                      />
                    </div>
                  </div>

                  {/* Certificate Issuance Options */}
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[var(--text-secondary)] text-[0.84rem] font-semibold">
                        Certificate issuance
                      </label>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-[var(--muted)] text-[0.78rem]">
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
                          className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                            extras.issuanceType === "completion"
                              ? "border-[var(--accent)]"
                              : "border-[var(--muted)]"
                          }`}
                        >
                          {extras.issuanceType === "completion" && (
                            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-0.75">
                          <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                            On course completion
                          </strong>
                          <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
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
                          className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                            extras.issuanceType === "percentage"
                              ? "border-[var(--accent)]"
                              : "border-[var(--muted)]"
                          }`}
                        >
                          {extras.issuanceType === "percentage" && (
                            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-0.75">
                          <div className="flex items-center justify-between w-full">
                            <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                              Minimum completion percentage
                            </strong>
                            {extras.issuanceType === "percentage" && (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  disabled
                                  className="w-[76px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.86rem] font-semibold outline-none text-center cursor-not-allowed"
                                  min={1}
                                  max={100}
                                  value={extras.minCompletionPercentage}
                                  readOnly
                                />
                                <span className="text-[var(--text)] text-[0.86rem] font-bold">
                                  %
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
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
                          className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                            extras.issuanceType === "custom"
                              ? "border-[var(--accent)]"
                              : "border-[var(--muted)]"
                          }`}
                        >
                          {extras.issuanceType === "custom" && (
                            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-0.75">
                          <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                            Custom rule
                          </strong>
                          <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                            Define your own custom rule for certificate
                            issuance.
                          </p>

                          {extras.issuanceType === "custom" && (
                            <div className="mt-2 w-full">
                              <input
                                type="text"
                                disabled
                                readOnly
                                className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.84rem] outline-none cursor-not-allowed"
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
                        <strong className="text-[var(--text)] text-[0.88rem] font-[650]">
                          Delivery
                        </strong>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                          Coming soon
                        </span>
                      </div>
                      <p className="m-0 text-[var(--muted)] text-[0.78rem]">
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
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)]">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                    2. This course includes
                  </h3>
                  <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                    These details are calculated from your curriculum.
                  </p>
                </div>

                {/* Derived Live Stats Summary Grid */}
                <div className="grid grid-cols-3 gap-3 mb-6 max-[1024px]:grid-cols-1 max-[768px]:grid-cols-1 max-[768px]:gap-2.5">
                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-[12px_14px] max-[768px]:gap-3.5">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-indigo-500 bg-indigo-500/[0.14] max-[768px]:w-10 max-[768px]:h-10">
                      <BookOpen size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col">
                      <strong className="text-[var(--text)] text-base font-[750] leading-[1.2] max-[768px]:text-[1.05rem]">
                        {totalSections}
                      </strong>
                      <span className="text-[var(--muted)] text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                        Sections
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-[12px_14px] max-[768px]:gap-3.5">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-purple-500 bg-purple-500/[0.14] max-[768px]:w-10 max-[768px]:h-10">
                      <PlayCircle size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col">
                      <strong className="text-[var(--text)] text-base font-[750] leading-[1.2] max-[768px]:text-[1.05rem]">
                        {totalLessons}
                      </strong>
                      <span className="text-[var(--muted)] text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                        Lessons
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-[12px_14px] max-[768px]:gap-3.5">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-blue-500 bg-blue-500/[0.14] max-[768px]:w-10 max-[768px]:h-10">
                      <Clock size={20} weight="bold" />
                    </div>
                    <div className="flex flex-col">
                      <strong className="text-[var(--text)] text-base font-[750] leading-[1.2] max-[768px]:text-[1.05rem]">
                        0m
                      </strong>
                      <span className="text-[var(--muted)] text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                        Content length
                      </span>
                    </div>
                  </div>
                </div>

                {/* Additional Inclusions Section */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="m-0 text-[var(--text)] text-[0.9rem] font-bold">
                      Additional inclusions
                    </h4>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                      Coming soon
                    </span>
                  </div>
                  <p className="m-0 mb-1 text-[var(--muted)] text-[0.78rem]">
                    Add any additional benefits your learners will get with this
                    course.
                  </p>

                  <div className="flex flex-col gap-2 opacity-75">
                    {extras.inclusions.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-3 py-2 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] cursor-not-allowed select-none"
                      >
                        <span
                          className="flex items-center justify-center text-[var(--muted)] opacity-40 select-none cursor-not-allowed"
                          title="Reordering is coming soon"
                        >
                          <DotsSixVertical size={18} />
                        </span>
                        <input
                          type="text"
                          readOnly
                          disabled
                          className="flex-1 border-none text-[var(--text)] bg-transparent text-[0.86rem] font-medium outline-none cursor-not-allowed"
                          value={item.text}
                          placeholder="e.g. Downloadable resources"
                        />
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] opacity-40 bg-transparent cursor-not-allowed p-0 pointer-events-none"
                          aria-label="Remove inclusion (Coming soon)"
                          title="Remove inclusion (Coming soon)"
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center gap-1.5 h-[34px] w-full border border-dashed border-[color-mix(in_srgb,var(--text)_18%,transparent)] rounded-lg text-[var(--muted)] bg-transparent text-[0.82rem] font-medium opacity-50 cursor-not-allowed pointer-events-none mt-1"
                    title="Adding inclusions is coming soon"
                  >
                    <Plus size={15} /> Add inclusion
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "publish" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Publish settings & 2. Final checklist */}
            <div className="grid grid-cols-2 items-start gap-5 max-[768px]:grid-cols-1 max-[768px]:gap-3.5">
              {/* Card 1: Publish settings */}
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)]">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                    1. Publish settings
                  </h3>
                  <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                    Choose when and how your course becomes visible.
                  </p>
                </div>

                {/* Informational Course Status Display */}
                <div className="flex flex-col gap-1.5 mb-4.5">
                  <label className="text-[var(--text)] text-[0.86rem] font-[650]">
                    Course status
                  </label>
                  <div className="flex items-center mt-0.5">
                    <span
                      className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.8rem] font-bold uppercase tracking-[0.04em] ${
                        isPublished
                          ? "is-published border border-green-500/35 text-green-500 bg-green-500/[0.12]"
                          : "is-draft border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--muted)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                      }`}
                    >
                      {isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-[var(--muted)] text-[0.78rem] leading-[1.4]">
                    {isPublished
                      ? "Your course is currently published and visible to students according to your settings."
                      : "Your course is currently a draft and hasn't been published yet."}
                  </p>
                </div>
                {/* Course visibility select */}
                <div className="flex flex-col gap-1.5 mb-4.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[var(--text)] text-[0.86rem] font-[650]">
                      Course visibility
                    </label>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
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
                      triggerClassName="!w-full !h-10 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-[var(--muted)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold !cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Publish on radio options */}
                <div className="flex flex-col gap-1.5 mb-4.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[var(--text)] text-[0.86rem] font-[650]">
                      Publish on
                    </label>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
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
                            ? "border-[var(--accent)]"
                            : "border-[var(--muted)]"
                        }`}
                      >
                        {publishSettings.scheduleOption === "now" && (
                          <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.75">
                        <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                          Publish immediately
                        </strong>
                        <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
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
                            ? "border-[var(--accent)]"
                            : "border-[var(--muted)]"
                        }`}
                      >
                        {publishSettings.scheduleOption === "later" && (
                          <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.75">
                        <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                          Schedule for a future date
                        </strong>
                        <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                          Set a specific date and time when this course should
                          go live.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Pre-publish Checklist */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)]">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold">
                    2. Pre-publish Checklist
                  </h3>
                  <p className="m-0 text-[var(--muted)] text-[0.83rem]">
                    Review all required items before publishing your course.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5 mb-5">
                  {/* Checklist Item: Basics */}
                  <div
                    className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    onClick={() => setActiveStep("basics")}
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
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650]">
                        Basics
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--muted)] text-[0.82rem]">
                      <span>{isBasicsValid ? "Completed" : "Incomplete"}</span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Curriculum */}
                  <div
                    className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    onClick={() => setActiveStep("curriculum")}
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
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650]">
                        Curriculum
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--muted)] text-[0.82rem]">
                      <span>
                        {totalSections} Sections, {totalLessons} Lessons
                      </span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Access Rules */}
                  <div
                    className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    onClick={() => setActiveStep("access-rules")}
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
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650]">
                        Access Rules
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--muted)] text-[0.82rem]">
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
                    onClick={() => setActiveStep("pricing")}
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
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650]">
                        Pricing
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--muted)] text-[0.82rem]">
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
                    onClick={() => setActiveStep("extras")}
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
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650]">
                        Extras
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--muted)] text-[0.82rem]">
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
                    <div className="flex w-[42px] h-[42px] shrink-0 items-center justify-center rounded-xl text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]">
                      <BookOpen size={24} weight="fill" />
                    </div>
                    <div>
                      <strong className="block mb-0.75 text-[var(--text)] text-[0.94rem] font-bold">
                        Your course is ready to be published!
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                        Once published, students can see and enroll in this
                        course according to your settings.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 border border-red-500/30 rounded-xl px-4.5 py-4 bg-red-500/[0.08]">
                    <div className="flex w-[42px] h-[42px] shrink-0 items-center justify-center rounded-xl text-red-500 bg-red-500/16">
                      <Info size={24} weight="bold" />
                    </div>
                    <div>
                      <strong className="block mb-0.75 text-[var(--text)] text-[0.94rem] font-bold">
                        Course needs attention
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem]">
                        Please fix incomplete sections highlighted above before
                        publishing.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Card 3: What happens after publishing? */}
            <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-[var(--surface)] shadow-[var(--card-shadow)]">
              <h3 className="m-0 mb-4.5 text-[var(--text)] text-[1.05rem] font-bold">
                3. What happens after publishing?
              </h3>

              <div className="grid grid-cols-4 gap-4 max-[1024px]:grid-cols-2 max-[640px]:grid-cols-1">
                {/* Feature 1: Visible to students */}
                <div className="flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                  <div className="flex w-10 h-10 items-center justify-center rounded-[10px] text-indigo-500 bg-indigo-500/[0.14]">
                    <Eye size={22} weight="bold" />
                  </div>
                  <div>
                    <strong className="block mb-1 text-[var(--text)] text-[0.9rem] font-[650]">
                      Visible to students
                    </strong>
                    <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
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
                    <strong className="block mb-1 text-[var(--text)] text-[0.9rem] font-[650]">
                      Enrollment starts
                    </strong>
                    <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
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
                    <strong className="block mb-1 text-[var(--text)] text-[0.9rem] font-[650]">
                      Track performance
                    </strong>
                    <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
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
                    <strong className="block mb-1 text-[var(--text)] text-[0.9rem] font-[650]">
                      Earn with every sale
                    </strong>
                    <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                      Get paid for every successful enrollment.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative z-10 grid grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)] gap-6 items-start max-[1024px]:grid-cols-[minmax(0,1fr)] max-[768px]:grid-cols-[minmax(0,1fr)] max-[768px]:gap-[18px]">
            <section className="relative z-10 rounded-[14px] p-6 bg-[var(--surface)] shadow-[var(--card-shadow)] max-[768px]:p-4">
              <div className="mb-4.5">
                <h2 className="m-0 text-[var(--text)] text-[1.18rem] font-[650] tracking-[-0.015em]">
                  {WIZARD_STEPS.find((s) => s.id === activeStep)?.label}
                </h2>
                <p className="m-0 mt-1 mb-5 text-[var(--muted)] text-[0.82rem]">
                  This section will allow configuring course {activeStep}.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>

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
          className="flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text-secondary)] bg-transparent cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-[var(--text)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={handlePreviewAction}
          disabled={actionLoading !== null}
        >
          {actionLoading === "preview" ? (
            <>
              <CircleNotch
                size={14}
                className="animate-spin text-[var(--accent)]"
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

        {/* Contextual Action Button (Save Basics / Save Curriculum / ... / Validate) */}
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
            className="flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleValidateCourseAction}
            disabled={actionLoading !== null || isValidating}
          >
            {actionLoading === "validate" || isValidating ? (
              <>
                <CircleNotch
                  size={14}
                  className="animate-spin text-[var(--accent)]"
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
            className={`flex-1 inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] shadow-[0_3px_10px_var(--accent-shadow)] transition-all ${
              actionLoading !== null ||
              (activeStep === "basics" && !isBasicsDirty) ||
              (activeStep === "curriculum" && !isCurriculumDirty) ||
              (activeStep === "access-rules" && !needsAccessRulesSave) ||
              (activeStep === "pricing" && !isPricingDirty) ||
              (activeStep === "extras" && !isExtrasDirty)
                ? "!opacity-40 !cursor-not-allowed !shadow-none"
                : "cursor-pointer hover:bg-[var(--accent-hover,var(--accent))] active:scale-[0.98]"
            }`}
            onClick={handleSaveChangesAction}
            disabled={
              actionLoading !== null ||
              (activeStep === "basics" && !isBasicsDirty) ||
              (activeStep === "curriculum" && !isCurriculumDirty) ||
              (activeStep === "access-rules" && !needsAccessRulesSave) ||
              (activeStep === "pricing" && !isPricingDirty) ||
              (activeStep === "extras" && !isExtrasDirty)
            }
          >
            {actionLoading === "save" ? (
              <>
                <CircleNotch size={14} className="animate-spin text-white" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <FloppyDisk size={14} weight="bold" />
                <span>{getContextualActionLabel(activeStep)}</span>
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
              className={`flex-1 inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] shadow-[0_3px_10px_var(--accent-shadow)] transition-all ${
                !isCourseReadyToPublish
                  ? "!opacity-40 !cursor-not-allowed filter blur-[0.4px] pointer-events-none select-none !shadow-none"
                  : "cursor-pointer hover:bg-[var(--accent-hover,var(--accent))] active:scale-[0.98]"
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
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] rounded-xl px-4.5 py-3 text-[var(--text)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(0,0,0,0.35)] text-[0.86rem] font-semibold animate-[toastPopIn_0.3s_cubic-bezier(0.16,1,0.3,1)]"
          role="status"
          aria-live="polite"
        >
          <CheckCircle
            size={18}
            weight="fill"
            className="text-[var(--accent)]"
          />
          <span>{toastMessage}</span>
        </div>
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
            className="fixed inset-0 z-[1200] flex flex-col bg-black/80 backdrop-blur-xl [animation:deleteModalFadeIn_0.2s_ease-out] p-4 box-border max-[640px]:p-0"
            onClick={() => setIsPreviewModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Course Overview Preview"
          >
            <div
              className="relative flex flex-col w-full max-w-[1380px] h-full max-h-[94vh] m-auto border border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-[20px] bg-[color-mix(in_srgb,var(--surface)_24%,var(--canvas))] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] max-[640px]:max-h-screen max-[640px]:h-screen max-[640px]:rounded-none max-[640px]:border-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Bar */}
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[var(--surface)] shrink-0 max-[640px]:px-3.5 max-[640px]:py-2.5">
                <div className="flex items-center flex-wrap gap-x-3 gap-y-2 min-w-0 flex-1 max-[640px]:gap-1.5">
                  <div className="inline-flex items-center gap-2 text-[0.92rem] font-bold text-[var(--text)] tracking-[-0.01em] whitespace-nowrap overflow-hidden text-ellipsis max-[640px]:text-[0.85rem]">
                    <Eye size={18} weight="bold" />
                    <span>Student Course Overview Preview</span>
                  </div>
                  <span className="inline-flex items-center gap-1.25 px-2.25 py-0.75 rounded-full border border-[var(--accent-border,color-mix(in_srgb,var(--accent)_35%,transparent))] bg-[var(--accent-soft,color-mix(in_srgb,var(--accent)_15%,transparent))] text-[var(--accent-ink,var(--accent))] text-[0.7rem] font-[650] whitespace-nowrap shrink-0 max-[640px]:text-[0.66rem] max-[640px]:px-1.75 max-[640px]:py-0.5">
                    Live Preview (Read-Only)
                  </span>
                </div>
                <button
                  type="button"
                  className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)72%,transparent)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] transition-all duration-150 bg-transparent cursor-pointer p-0"
                  onClick={() => setIsPreviewModalOpen(false)}
                  aria-label="Close Preview"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Modal Body: Render authentic CourseOverviewPage */}
              <div className="flex-1 min-h-0 overflow-y-auto p-0">
                <CourseOverviewPage
                  customCourse={previewCourse}
                  customDescription={courseDescription}
                  customSections={previewSections}
                  customInclusions={previewInclusions}
                  customPricing={previewPricing}
                  isReadOnlyPreview={true}
                  onNavigateCourses={() => setIsPreviewModalOpen(false)}
                />
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
              className="relative w-full max-w-[460px] rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[var(--surface)] p-6 shadow-[0_20px_48px_rgba(0,0,0,0.45)] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3
                    id="add-category-modal-title"
                    className="m-0 text-[var(--text)] text-[1.1rem] font-bold tracking-tight"
                  >
                    Manage Categories
                  </h3>
                  <p className="m-0 mt-0.5 text-[var(--muted)] text-[0.78rem]">
                    Create new categories or remove existing ones.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] transition-colors duration-150 bg-transparent cursor-pointer p-0 shrink-0"
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
                    className="text-[var(--text-secondary)] text-[0.82rem] font-semibold"
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
                      className="flex-1 h-10 px-3 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[var(--text)] text-[0.88rem] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--muted)]"
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
                      className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
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
                  <span className="text-[var(--text-secondary)] text-[0.80rem] font-semibold">
                    Existing Categories ({serverCategories.length})
                  </span>
                  {isLoadingCategories && (
                    <CircleNotch
                      size={13}
                      className="animate-spin text-[var(--muted)]"
                    />
                  )}
                </div>

                <div className="max-h-[220px] overflow-y-auto flex flex-col gap-1.5 pr-1">
                  {serverCategories.length === 0 ? (
                    <div className="py-6 text-center text-[var(--muted)] text-[0.82rem] italic">
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
                            className="text-[var(--accent)] shrink-0"
                            weight="duotone"
                          />
                          <span className="text-[var(--text)] text-[0.86rem] font-medium truncate">
                            {cat.name}
                          </span>
                          <span className="text-[var(--muted)] text-[0.72rem] px-1.5 py-0.5 rounded-[4px] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] shrink-0">
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
                          className="inline-flex w-7 h-7 items-center justify-center rounded-[6px] text-[var(--muted)] hover:text-red-500 hover:bg-red-500/10 border-none bg-transparent cursor-pointer transition-colors duration-150 p-0 shrink-0"
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
                  className="inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text-secondary)] bg-transparent cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-[var(--text)]"
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
