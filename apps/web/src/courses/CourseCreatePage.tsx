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
  Export,
  Eye,
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
  Tag,
  TextB,
  TextItalic,
  Trash,
  UploadSimple,
  UserPlus,
  Video,
  X,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { ThemedSelect } from "../ThemedSelect";
import { SettingsToggle } from "../settings/SettingsControls";
import type { NavigateTo } from "../routing/navigation";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import {
  getNumberShortcutIndex,
  isEditingShortcutTarget,
} from "../keyboardShortcuts";

import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import { useCategories, useCreateCategory } from "../services/courses";
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

  // Basics Form state
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
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

  const [category, setCategory] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addCategoryError, setAddCategoryError] = useState("");

  const { data: serverCategories = [] } = useCategories();
  const createCategoryMutation = useCreateCategory();

  const DEFAULT_CATEGORY_OPTIONS = useMemo(
    () =>
      [
        ["", "Select a category"],
        ["Development", "Development"],
        ["Design", "Design"],
        ["Database", "Database"],
        ["Cloud", "Cloud"],
      ] as const,
    [],
  );

  const categoryOptions = useMemo(() => {
    const existing: Array<readonly [string, string]> = [...DEFAULT_CATEGORY_OPTIONS];
    const seen = new Set(existing.map(([val]) => val.toLowerCase()));

    for (const cat of serverCategories) {
      if (cat.name && !seen.has(cat.name.toLowerCase())) {
        seen.add(cat.name.toLowerCase());
        existing.push([cat.name, cat.name] as const);
      }
    }

    for (const custom of customCategories) {
      if (custom && !seen.has(custom.toLowerCase())) {
        seen.add(custom.toLowerCase());
        existing.push([custom, custom] as const);
      }
    }

    return existing;
  }, [DEFAULT_CATEGORY_OPTIONS, serverCategories, customCategories]);

  const handleOpenAddCategoryModal = () => {
    setNewCategoryName("");
    setAddCategoryError("");
    setIsAddCategoryModalOpen(true);
  };

  const handleCloseAddCategoryModal = () => {
    if (createCategoryMutation.isPending) return;
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

    const isDuplicate = categoryOptions.some(
      ([val]) => val.toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      setAddCategoryError("This category already exists.");
      return;
    }

    try {
      await createCategoryMutation.mutateAsync({ name: trimmed });
    } catch {
      // Fallback for offline/mock environments
    }

    setCustomCategories((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed],
    );
    setCategory(trimmed);
    setIsAddCategoryModalOpen(false);
    setNewCategoryName("");
    setAddCategoryError("");
  };

  const difficultyOptions = [
    ["", "Select difficulty level"],
    ["Beginner", "Beginner"],
    ["Intermediate", "Intermediate"],
    ["Advanced", "Advanced"],
  ] as const;

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
    type: "PDF" | "TXT" | "DOC";
    size: string;
  }

  interface CurriculumLessonItem {
    id: string;
    title: string;
    description: string;
    contentType: "video" | "document";
    isExpanded: boolean;
    resources: LessonResourceItem[];
  }

  interface CurriculumSectionItem {
    id: string;
    title: string;
    isExpanded: boolean;
    isEditingTitle?: boolean;
    lessons: CurriculumLessonItem[];
  }

  // Access Rules interfaces
  type AccessType = "everyone" | "restricted";
  type AccessDurationMode = "lifetime" | "fixed" | "custom";
  type DurationUnit = "Days" | "Weeks" | "Months" | "Years";

  interface AccessRequirement {
    id: string;
    courseId: string;
  }

  interface AccessRulesState {
    accessType: AccessType;
    requirements: AccessRequirement[];
    durationMode: AccessDurationMode;
    fixedDurationValue: number;
    fixedDurationUnit: DurationUnit;
    customStartDate: string;
    customEndDate: string;
    enableQA: boolean;
    enableComments: boolean;
  }

  // Available prerequisite courses for dropdown
  const PREREQUISITE_COURSE_OPTIONS = [
    { value: "node-fundamentals", label: "Node.js Fundamentals" },
    { value: "js-basics", label: "JavaScript Basics & ES6+" },
    { value: "react-core", label: "React Core Architecture" },
    { value: "css-mastery", label: "Modern CSS & Responsive Web Design" },
  ];

  // Curriculum Step state
  const [sections, setSections] = useState<CurriculumSectionItem[]>([
    {
      id: "section-1",
      title: "Introduction to the Course",
      isExpanded: true,
      lessons: [],
    },
  ]);

  // Pricing interfaces
  type PricingType = "free" | "paid";

  interface PricingState {
    pricingType: PricingType;
    sellingPrice: string;
    originalPrice: string;
  }

  // Access Rules Step state
  const [accessRules, setAccessRules] = useState<AccessRulesState>({
    accessType: "restricted",
    requirements: [{ id: "req-1", courseId: "node-fundamentals" }],
    durationMode: "lifetime",
    fixedDurationValue: 30,
    fixedDurationUnit: "Days",
    customStartDate: "2026-08-12",
    customEndDate: "2026-09-12",
    enableQA: true,
    enableComments: true,
  });

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

  // Pricing Step state
  const [pricing, setPricing] = useState<PricingState>({
    pricingType: "paid",
    sellingPrice: "1999",
    originalPrice: "2999",
  });

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

  // Footer Action Loading States
  const [actionLoading, setActionLoading] = useState<
    "preview" | "draft" | "save" | "publish" | null
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

  // Extras Step state
  const [extras, setExtras] = useState<ExtrasState>({
    inclusions: [
      { id: "inc-1", text: "Full lifetime access" },
      { id: "inc-2", text: "Downloadable resources" },
      { id: "inc-3", text: "Access on all devices" },
    ],
    enableCertificate: true,
    certificateTemplate: "purple-certificate",
    issuanceType: "percentage",
    minCompletionPercentage: 95,
    customRuleText: "Complete all quizzes with > 80% score",
    autoEmailCertificate: true,
  });

  // Pre-populate fields when editing an existing course
  useEffect(() => {
    if (!targetCourse) {
      setIsPublished(false);
      return;
    }

    setIsPublished(true);
    setCourseTitle(targetCourse.title);
    setCourseDescription(targetCourse.description);
    setThumbnail(targetCourse.thumbnail);
    setCategory(targetCourse.category);
    setDifficultyLevel(targetCourse.level);
    setPricing({
      pricingType: "paid",
      sellingPrice: "1999",
      originalPrice: "2999",
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
            resources: [],
          })),
        })),
      );
    } else {
      const sectionCount = Math.max(1, targetCourse.sections || 1);
      const generatedSections: CurriculumSectionItem[] = Array.from(
        { length: sectionCount },
        (_, i) => ({
          id: `section-${i + 1}`,
          title: getSectionTitle(targetCourse, i),
          isExpanded: i === 0,
          lessons: [
            {
              id: `lesson-${i + 1}-1`,
              title: `${getSectionTitle(targetCourse, i)} - Overview`,
              description: "",
              contentType: "video" as const,
              isExpanded: false,
              resources: [],
            },
          ],
        }),
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
  }, [targetCourse]);

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

  // Pricing Handlers
  const handlePricingTypeChange = (type: PricingType) => {
    setPricing((prev) => ({ ...prev, pricingType: type }));
  };

  const handleSellingPriceChange = (val: string) => {
    setPricing((prev) => ({ ...prev, sellingPrice: val }));
  };

  const handleOriginalPriceChange = (val: string) => {
    setPricing((prev) => ({ ...prev, originalPrice: val }));
  };

  // Access Rules State Handlers
  const handleAccessTypeChange = (type: AccessType) => {
    setAccessRules((prev) => ({ ...prev, accessType: type }));
  };

  const handleAddRequirement = () => {
    setAccessRules((prev) => ({
      ...prev,
      requirements: [
        ...prev.requirements,
        {
          id: `req-${Date.now()}`,
          courseId:
            PREREQUISITE_COURSE_OPTIONS[0]?.value || "node-fundamentals",
        },
      ],
    }));
  };

  const handleRemoveRequirement = (id: string) => {
    setAccessRules((prev) => ({
      ...prev,
      requirements: prev.requirements.filter((r) => r.id !== id),
    }));
  };

  const handleRequirementCourseChange = (id: string, courseId: string) => {
    setAccessRules((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r) =>
        r.id === id ? { ...r, courseId } : r,
      ),
    }));
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

  const handleCustomStartDateChange = (date: string) => {
    setAccessRules((prev) => ({ ...prev, customStartDate: date }));
  };

  const handleCustomEndDateChange = (date: string) => {
    setAccessRules((prev) => ({ ...prev, customEndDate: date }));
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
  const handleAddSection = () => {
    const newId = `section-${Date.now()}`;
    setSections((prev) => [
      ...prev,
      {
        id: newId,
        title: `Section ${prev.length + 1}`,
        isExpanded: true,
        isEditingTitle: true,
        lessons: [],
      },
    ]);
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

  const handleSaveSectionTitle = (sectionId: string, newTitle: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, title: newTitle.trim() || s.title, isEditingTitle: false }
          : s,
      ),
    );
  };

  const handleDeleteSection = (sectionId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    setDeleteModalState({
      isOpen: true,
      title: `Delete"${sec.title}"?`,
      message: `Are you sure you want to delete"${sec.title}" and its ${sec.lessons.length} lessons? This action cannot be undone.`,
      onConfirm: () => {
        setSections((prev) => prev.filter((s) => s.id !== sectionId));
      },
    });
  };

  // Section Drag and Drop handlers
  const handleSectionDragStart = (
    e: React.DragEvent,
    index: number,
    section: CurriculumSectionItem,
  ) => {
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

  const handleSectionDragEnd = () => {
    setDraggedSectionIndex(null);
    setDragEnabledSectionId(null);
  };

  // Lesson actions
  const handleAddLesson = (sectionId: string) => {
    const newLessonId = `lesson-${Date.now()}`;
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: [
            ...sec.lessons.map((l) => ({ ...l, isExpanded: false })),
            {
              id: newLessonId,
              title: `New Lesson ${sec.lessons.length + 1}`,
              description: "",
              contentType: "video" as const,
              isExpanded: true,
              resources: [],
            },
          ],
        };
      }),
    );
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
      title: `Delete"${les.title}"?`,
      message: `Are you sure you want to delete lesson"${les.title}"? This action cannot be undone.`,
      onConfirm: () => {
        setSections((prev) =>
          prev.map((s) => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              lessons: s.lessons.filter((l) => l.id !== lessonId),
            };
          }),
        );
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

  const handleSaveLesson = (sectionId: string, lessonId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) =>
            l.id === lessonId ? { ...l, isExpanded: false } : l,
          ),
        };
      }),
    );
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

  const handleLessonDragEnd = () => {
    setDraggedLessonState(null);
    setDragEnabledLessonId(null);
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
    id: "preview-course",
    title: courseTitle.trim() || "Course Title",
    description:
      courseDescription.trim() || "This is a short description of your course.",
    level: (difficultyLevel || "Beginner") as CourseLevel,
    category: (category || "Development") as CourseCategory,
    sections: Math.max(1, totalSections),
    lectures: Math.max(1, totalLessons),
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
          title: sec.title.trim() || `Section ${secIdx + 1}`,
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
                    `Introduction to ${sec.title.trim() || `Section ${secIdx + 1}`}`,
                    "05:00",
                    "todo",
                  ],
                ],
        }))
      : [
          {
            id: 1,
            title: "Introduction",
            progress: "0/1",
            lessons: [[1, "Course Overview", "05:00", "todo"]],
          },
        ];

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

  const previewPricing: CourseOverviewPricingProps =
    pricing.pricingType === "free"
      ? { price: "Free" }
      : {
          price: pricing.sellingPrice.trim()
            ? `₹${pricing.sellingPrice.trim()}`
            : "₹1,999",
          originalPrice: pricing.originalPrice.trim()
            ? `₹${pricing.originalPrice.trim()}`
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

  // Derived Checklist Validation
  const isBasicsValid =
    courseTitle.trim().length > 0 && courseDescription.trim().length > 0;
  const isCurriculumValid = totalSections > 0;
  const isAccessRulesValid =
    accessRules.accessType === "everyone" ||
    accessRules.requirements.length > 0;
  const isPricingValid =
    pricing.pricingType === "free" ||
    parseFloat(pricing.sellingPrice.replace(/,/g, "")) > 0;
  const isExtrasValid = true;

  const isCourseReadyToPublish =
    isBasicsValid &&
    isCurriculumValid &&
    isAccessRulesValid &&
    isPricingValid &&
    isExtrasValid;

  const handlePreviewAction = () => {
    if (actionLoading) return;
    setActionLoading("preview");
    setTimeout(() => {
      setActionLoading(null);
      setIsPreviewModalOpen(true);
    }, 450);
  };

  const handleSaveDraftAction = () => {
    if (actionLoading) return;
    setActionLoading("draft");
    setTimeout(() => {
      setActionLoading(null);
      setToastMessage("Draft saved successfully!");
    }, 700);
  };

  const handleSaveChangesAction = () => {
    if (actionLoading) return;
    setActionLoading("save");
    setTimeout(() => {
      setActionLoading(null);
      setToastMessage("All changes saved successfully!");
    }, 650);
  };

  const handleFinalPublishCourse = () => {
    if (actionLoading) return;
    if (!isCourseReadyToPublish) {
      if (!isBasicsValid)
        setPublishValidationError(
          "Please fill out required Basic Information fields (Title and Description).",
        );
      else if (!isCurriculumValid)
        setPublishValidationError(
          "Please add at least one Section to the Curriculum.",
        );
      else if (!isAccessRulesValid)
        setPublishValidationError(
          "Please configure at least one prerequisite requirement or select Everyone.",
        );
      else if (!isPricingValid)
        setPublishValidationError(
          "Please set a valid Selling Price for paid course.",
        );
      return;
    }

    setPublishValidationError(null);
    setActionLoading("publish");
    setTimeout(() => {
      setActionLoading(null);
      setIsPublished(true);
      setToastMessage(
        isPublished
          ? "Course updated and published successfully!"
          : "Course published successfully!",
      );
    }, 850);
  };

  return (
    <div className="relative flex w-full flex-col p-0 text-[var(--text)] box-border max-[768px]:pb-0">
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
            {/* Preview Button (Ghost) */}
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
              className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text-secondary)] bg-transparent cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-[var(--text)] disabled:opacity-60"
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

            {/* Save Draft Button (Draft / Subtle Solid) */}
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
              className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-60"
              onClick={handleSaveDraftAction}
              disabled={actionLoading !== null}
            >
              {actionLoading === "draft" ? (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-[var(--accent)]"
                  />
                  <span>Saving Draft...</span>
                </>
              ) : (
                <>
                  <FloppyDisk size={15} />
                  <span>Save Draft</span>
                </>
              )}
            </button>

            {/* Save Changes / Publish Course Button (Primary Accent CTA) */}
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
              className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60"
              disabled={actionLoading !== null}
              onClick={
                activeStep === "publish"
                  ? handleFinalPublishCourse
                  : handleSaveChangesAction
              }
            >
              {actionLoading === "publish" ? (
                <>
                  <CircleNotch size={15} className="animate-spin text-white" />
                  <span>{isPublished ? "Updating..." : "Publishing..."}</span>
                </>
              ) : actionLoading === "save" ? (
                <>
                  <CircleNotch size={15} className="animate-spin text-white" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  {activeStep === "publish" ? (
                    isPublished ? (
                      <span>Update Course</span>
                    ) : (
                      <span>Publish Course</span>
                    )
                  ) : (
                    <span>Save Changes</span>
                  )}
                </>
              )}
            </button>
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
                className={`!border-b-transparent shrink-0 whitespace-nowrap ${isActive ? "is-active" : ""}`}
                onClick={() => {
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
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Step Content Region */}
      <div
        className={`w-full pb-12 will-change-[transform,opacity] max-[768px]:pb-[110px] slide-from-${slideDirection}`}
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
                      maxLength={60}
                      placeholder="e.g. Complete Backend with Node.js"
                      value={courseTitle}
                      onChange={(e) => setCourseTitle(e.target.value.slice(0, 60))}
                      className="w-full h-11 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] pl-3.5 pr-[70px] py-0 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
                    />
                    <span className="absolute right-3.5 text-[var(--muted)] text-[0.76rem] pointer-events-none">
                      {courseTitle.length} / 60
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
                    value={courseDescription}
                    onChange={setCourseDescription}
                    placeholder="Describe what your course is about, what students will learn, and who this course is for..."
                    maxLength={1500}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
                  <div className="flex flex-col gap-2 mb-0">
                    <label
                      id="category-label"
                      className="text-[var(--text-secondary)] text-[0.84rem] font-semibold"
                    >
                      Category <span className="text-[#ff5252] ml-0.5">*</span>
                    </label>
                    <ThemedSelect
                      value={category}
                      onValueChange={setCategory}
                      options={categoryOptions}
                      ariaLabel="Select category"
                      triggerClassName="!w-full !h-11 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-[10px] !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.88rem]"
                      action={{
                        label: "+ Add category",
                        onSelect: handleOpenAddCategoryModal,
                      }}
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
                      value={difficultyLevel}
                      onValueChange={setDifficultyLevel}
                      options={difficultyOptions}
                      ariaLabel="Select difficulty level"
                      triggerClassName="!w-full !h-11 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-[10px] !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.88rem]"
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
                    onChange={handleThumbnailFileSelect}
                    accept="image/*"
                    style={{ display: "none" }}
                  />

                  {/* Hidden Video Trailer File Input */}
                  <input
                    type="file"
                    ref={videoTrailerInputRef}
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
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 700,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "16px",
                              paddingRight: "16px",
                            }}
                            className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:brightness-110"
                            onClick={triggerThumbnailUpload}
                          >
                            <ImageIcon size={15} /> Change Image
                          </button>
                          <button
                            type="button"
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 500,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "14px",
                              paddingRight: "14px",
                            }}
                            className="inline-flex items-center border-none text-white bg-red-500 cursor-pointer transition-all duration-150 hover:bg-red-600"
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
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 700,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "16px",
                              paddingRight: "16px",
                            }}
                            className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)]"
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
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 700,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "16px",
                              paddingRight: "16px",
                            }}
                            className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:brightness-110"
                            onClick={triggerVideoTrailerUpload}
                          >
                            <PlayCircle size={15} /> Change Video
                          </button>
                          <button
                            type="button"
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 500,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "14px",
                              paddingRight: "14px",
                            }}
                            className="inline-flex items-center border-none text-white bg-red-500 cursor-pointer transition-all duration-150 hover:bg-red-600"
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
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 700,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "16px",
                              paddingRight: "16px",
                            }}
                            className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)]"
                            onClick={triggerVideoTrailerUpload}
                          >
                            <UploadSimple size={15} /> Upload
                          </button>
                          <button
                            type="button"
                            style={{
                              fontSize: "0.80rem",
                              fontWeight: 500,
                              height: "34px",
                              borderRadius: "8px",
                              gap: "6px",
                              paddingLeft: "14px",
                              paddingRight: "14px",
                            }}
                            className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
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
          <div className="flex flex-col gap-4 w-full">
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
                  className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] max-[768px]:whitespace-nowrap max-[768px]:self-start"
                  onClick={handleAddSection}
                >
                  <Plus size={15} weight="bold" /> Add Section
                </button>
              </div>
            </div>

            {/* Sections list */}
            {sections.map((sec, secIndex) => (
              <div
                key={sec.id}
                className={`border rounded-[14px] bg-[var(--surface)] shadow-[var(--card-shadow)] overflow-hidden transition-[border-color,box-shadow,opacity] duration-150 ${
                  draggedSectionIndex === secIndex
                    ? "opacity-35 border-dashed border-[var(--accent)]"
                    : "border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                }`}
                draggable={dragEnabledSectionId === sec.id}
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
                      className="flex items-center justify-center text-[var(--muted)] cursor-grab opacity-60 transition-opacity duration-150 hover:opacity-100"
                      title="Drag to reorder section"
                      onMouseEnter={() => setDragEnabledSectionId(sec.id)}
                      onMouseLeave={() => {
                        if (draggedSectionIndex === null)
                          setDragEnabledSectionId(null);
                      }}
                      onMouseDown={() => setDragEnabledSectionId(sec.id)}
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
                        <input
                          type="text"
                          className="border border-[var(--accent)] rounded-md px-2 py-0.75 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none"
                          defaultValue={sec.title}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) =>
                            handleSaveSectionTitle(sec.id, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveSectionTitle(
                                sec.id,
                                (e.target as HTMLInputElement).value,
                              );
                            }
                          }}
                        />
                      ) : (
                        <span
                          className="text-[var(--text)] text-[0.92rem] font-semibold max-[768px]:break-words max-[768px]:min-w-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditSectionTitle(sec.id);
                          }}
                          title="Click to edit section title"
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
                    <button
                      type="button"
                      className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] transition-[color,background-color,border-color] duration-150 bg-transparent cursor-pointer p-0"
                      aria-label="Edit section title"
                      title="Edit section title"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEditSectionTitle(sec.id);
                      }}
                    >
                      <PencilSimple size={15} />
                    </button>
                    <button
                      type="button"
                      className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all duration-150 bg-transparent cursor-pointer p-0"
                      aria-label="Delete section"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSection(sec.id);
                      }}
                    >
                      <Trash size={15} />
                    </button>
                    <button
                      type="button"
                      className={`inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] hover:border-[color-mix(in_srgb,var(--surface-strong)90%,transparent)] transition-all duration-150 bg-transparent cursor-pointer p-0 [&>svg]:transition-transform [&>svg]:duration-200 ${
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
                          draggable={dragEnabledLessonId === les.id}
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
                                className="flex items-center justify-center text-[var(--muted)] cursor-grab opacity-60 transition-opacity duration-150 hover:opacity-100"
                                title="Drag to reorder lesson"
                                onMouseEnter={() =>
                                  setDragEnabledLessonId(les.id)
                                }
                                onMouseLeave={() => {
                                  if (!draggedLessonState)
                                    setDragEnabledLessonId(null);
                                }}
                                onMouseDown={() =>
                                  setDragEnabledLessonId(les.id)
                                }
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
                              {les.contentType === "video" ? (
                                <span className="inline-flex items-center gap-1.25 text-[var(--accent-ink,var(--accent))] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                                  <PlayCircle size={13} weight="fill" /> Video
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.25 text-[var(--accent-ink,var(--accent))] text-[0.74rem] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)]">
                                  <FileText size={13} weight="fill" /> Document
                                </span>
                              )}
                              <button
                                type="button"
                                className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all duration-150 bg-transparent cursor-pointer p-0"
                                aria-label="Delete lesson"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLesson(sec.id, les.id);
                                }}
                              >
                                <Trash size={15} />
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
                                        onChange={(e) =>
                                          handleUpdateLesson(sec.id, les.id, {
                                            title: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. Introduction to React Hooks"
                                        className="w-full h-11 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] pl-3.5 pr-[70px] py-0 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
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
                                        className={`relative flex items-center gap-3 border rounded-[10px] px-3.5 py-3 text-left cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] ${
                                          les.contentType === "video"
                                            ? "is-selected border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                        }`}
                                        onClick={() =>
                                          handleUpdateLesson(sec.id, les.id, {
                                            contentType: "video",
                                          })
                                        }
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
                                        className={`relative flex items-center gap-3 border rounded-[10px] px-3.5 py-3 text-left cursor-pointer transition-[border-color,background-color] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] ${
                                          les.contentType === "document"
                                            ? "is-selected border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]"
                                        }`}
                                        onClick={() =>
                                          handleUpdateLesson(sec.id, les.id, {
                                            contentType: "document",
                                          })
                                        }
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
                                        style={{
                                          fontSize: "0.80rem",
                                          fontWeight: 700,
                                          height: "34px",
                                          borderRadius: "8px",
                                          gap: "6px",
                                          paddingLeft: "16px",
                                          paddingRight: "16px",
                                        }}
                                        className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
                                      >
                                        <UploadSimple size={15} />
                                        Upload New
                                      </button>
                                      <button
                                        type="button"
                                        style={{
                                          fontSize: "0.80rem",
                                          fontWeight: 500,
                                          height: "34px",
                                          borderRadius: "8px",
                                          gap: "6px",
                                          paddingLeft: "14px",
                                          paddingRight: "14px",
                                        }}
                                        className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
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

                                  {/* Lesson Resources Table */}
                                  <div className="flex flex-col gap-2 mb-5">
                                    <div className="flex items-center justify-between mb-2 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-2.5">
                                      <label className="flex items-center gap-1.5 text-[var(--text-secondary)] text-[0.84rem] font-semibold">
                                        Lesson Resources
                                      </label>
                                      <div className="flex items-center gap-2 max-[768px]:w-full max-[768px]:flex max-[768px]:gap-2">
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
                                          className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
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
                                          style={{
                                            fontSize: "0.80rem",
                                            fontWeight: 500,
                                            height: "34px",
                                            borderRadius: "8px",
                                            gap: "6px",
                                            paddingLeft: "14px",
                                            paddingRight: "14px",
                                          }}
                                          className="inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap"
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
                                                className="inline-flex w-7 h-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors border-0 bg-transparent cursor-pointer p-0"
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
                                                      className="inline-flex w-7 h-7 items-center justify-center rounded-lg text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors border-0 bg-transparent cursor-pointer p-0"
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
                                      style={{
                                        fontSize: "0.80rem",
                                        fontWeight: 700,
                                        height: "34px",
                                        borderRadius: "8px",
                                        gap: "6px",
                                        paddingLeft: "16px",
                                        paddingRight: "16px",
                                      }}
                                      className="inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-60"
                                      onClick={() =>
                                        handleSaveLesson(sec.id, les.id)
                                      }
                                    >
                                      <FloppyDisk size={15} /> Save Lesson
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
                        className="inline-flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--text)] text-[0.82rem] font-medium border-0 bg-transparent cursor-pointer p-0 transition-colors"
                        onClick={() => handleAddLesson(sec.id)}
                      >
                        <Plus size={16} /> Add Lesson
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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

                  {/* Radio option: Restricted access */}
                  <label
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                      accessRules.accessType === "restricted"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    }`}
                    onClick={() => handleAccessTypeChange("restricted")}
                  >
                    <div
                      className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        accessRules.accessType === "restricted"
                          ? "border-[var(--accent)]"
                          : "border-[var(--muted)]"
                      }`}
                    >
                      {accessRules.accessType === "restricted" && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                        Restricted access
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                        Only users who meet the selected requirements can access
                        this course.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Conditional Requirements Box */}
                {accessRules.accessType === "restricted" && (
                  <div className="flex flex-col gap-3 mt-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] p-3.5 bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                    <div className="flex flex-col gap-0.5">
                      <label className="block mb-0.5 text-[var(--text)] text-[0.84rem] font-bold">
                        Access requirement
                      </label>
                      <p className="m-0 text-[var(--muted)] text-[0.78rem]">
                        Users must have access to:
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      {accessRules.requirements.map((req) => (
                        <div key={req.id} className="flex items-center gap-2">
                          <ThemedSelect
                            value={req.courseId}
                            onValueChange={(val) =>
                              handleRequirementCourseChange(req.id, val)
                            }
                            options={PREREQUISITE_COURSE_OPTIONS.map((c) => [
                              c.value,
                              c.label,
                            ])}
                            ariaLabel="Select prerequisite course requirement"
                            triggerClassName="!w-full !h-10 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all flex-1 min-w-0"
                          />
                          {accessRules.requirements.length > 1 && (
                            <button
                              type="button"
                              className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all duration-150 bg-transparent cursor-pointer p-0"
                              aria-label="Remove requirement"
                              title="Remove requirement"
                              onClick={() => handleRemoveRequirement(req.id)}
                            >
                              <Trash size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="inline-flex self-start items-center gap-1.5 text-[var(--muted)] hover:text-[var(--text)] text-[0.82rem] font-medium border-0 bg-transparent cursor-pointer p-0 mt-1 transition-colors"
                      onClick={handleAddRequirement}
                    >
                      <Plus size={15} /> Add another requirement
                    </button>
                  </div>
                )}
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
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                      accessRules.durationMode === "lifetime"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    }`}
                    onClick={() => handleDurationModeChange("lifetime")}
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
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                      accessRules.durationMode === "fixed"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    }`}
                    onClick={() => handleDurationModeChange("fixed")}
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
                            className="w-[80px] h-9 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-0 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.84rem] font-semibold outline-none transition-[border-color] duration-150 hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] focus:border-[var(--accent)] box-border text-center"
                            min={1}
                            value={accessRules.fixedDurationValue}
                            onChange={(e) =>
                              handleFixedDurationValueChange(
                                parseInt(e.target.value, 10),
                              )
                            }
                          />
                          <ThemedSelect
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
                            triggerClassName="!w-[130px] !h-9 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all flex items-center justify-between"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Option 3: Custom expiration */}
                  <div
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                      accessRules.durationMode === "custom"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    }`}
                    onClick={() => handleDurationModeChange("custom")}
                  >
                    <div
                      className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                        accessRules.durationMode === "custom"
                          ? "border-[var(--accent)]"
                          : "border-[var(--muted)]"
                      }`}
                    >
                      {accessRules.durationMode === "custom" && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-[var(--text)] text-[0.9rem] font-[650] leading-[18px]">
                        Custom expiration
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.8rem] leading-[1.4]">
                        Set a specific start and end date for access.
                      </p>

                      {accessRules.durationMode === "custom" && (
                        <div
                          className="flex items-center gap-3.5 mt-3 max-[768px]:flex-col max-[768px]:items-stretch"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-col gap-1">
                            <label className="text-[var(--muted)] text-[0.76rem] font-semibold">
                              Start date
                            </label>
                            <input
                              type="date"
                              className="border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] font-inherit text-[0.84rem] font-medium outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
                              value={accessRules.customStartDate}
                              onChange={(e) =>
                                handleCustomStartDateChange(e.target.value)
                              }
                            />
                          </div>

                          <div className="flex items-center justify-center mt-4.5 text-[var(--muted)] max-[768px]:mt-0 max-[768px]:rotate-90">
                            <ArrowRight size={18} />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[var(--muted)] text-[0.76rem] font-semibold">
                              End date
                            </label>
                            <input
                              type="date"
                              className="border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] font-inherit text-[0.84rem] font-medium outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
                              value={accessRules.customEndDate}
                              onChange={(e) =>
                                handleCustomEndDateChange(e.target.value)
                              }
                            />
                          </div>
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
                    onChange={handleToggleComments}
                    label="Toggle Comments"
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
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                      pricing.pricingType === "free"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    }`}
                    onClick={() => handlePricingTypeChange("free")}
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
                    className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                      pricing.pricingType === "paid"
                        ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                    }`}
                    onClick={() => handlePricingTypeChange("paid")}
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
                        ₹
                      </span>
                      <input
                        id="selling-price"
                        type="text"
                        disabled={pricing.pricingType === "free"}
                        value={pricing.sellingPrice}
                        onChange={(e) =>
                          handleSellingPriceChange(e.target.value)
                        }
                        placeholder="1,999"
                        className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 pr-3.5 pl-8 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-[var(--accent)] disabled:opacity-60"
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
                        ₹
                      </span>
                      <input
                        id="original-price"
                        type="text"
                        disabled={pricing.pricingType === "free"}
                        value={pricing.originalPrice}
                        onChange={(e) =>
                          handleOriginalPriceChange(e.target.value)
                        }
                        placeholder="2,999"
                        className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 pr-3.5 pl-8 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-[var(--accent)] disabled:opacity-60"
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
                    <label className="text-[var(--text-secondary)] text-[0.84rem] font-semibold">
                      Certificate template
                    </label>
                    <p className="m-0 mt-0.5 mb-2 text-[var(--muted)] text-[0.78rem]">
                      Choose from pre-designed certificate templates.
                    </p>
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
                      triggerClassName="!w-full !h-10 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all"
                    />
                  </div>

                  {/* Certificate Issuance Options */}
                  <div className="flex flex-col gap-2 mb-5">
                    <label className="text-[var(--text-secondary)] text-[0.84rem] font-semibold">
                      Certificate issuance
                    </label>
                    <p className="m-0 mt-0.5 mb-2 text-[var(--muted)] text-[0.78rem]">
                      Choose when the certificate should be issued.
                    </p>

                    <div className="flex flex-col gap-2.5">
                      {/* Option 1: On course completion */}
                      <div
                        className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                          extras.issuanceType === "completion"
                            ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                        }`}
                        onClick={() => handleIssuanceTypeChange("completion")}
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
                        className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                          extras.issuanceType === "percentage"
                            ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                        }`}
                        onClick={() => handleIssuanceTypeChange("percentage")}
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
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="number"
                                  className="w-[76px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.86rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
                                  min={1}
                                  max={100}
                                  value={extras.minCompletionPercentage}
                                  onChange={(e) =>
                                    handleMinPercentageChange(
                                      parseInt(e.target.value, 10),
                                    )
                                  }
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
                        className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                          extras.issuanceType === "custom"
                            ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                        }`}
                        onClick={() => handleIssuanceTypeChange("custom")}
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
                            <div
                              className="mt-2 w-full"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.84rem] outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
                                value={extras.customRuleText}
                                onChange={(e) =>
                                  handleCustomRuleTextChange(e.target.value)
                                }
                                placeholder="e.g. Complete all quizzes with > 80% score"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Toggle Row */}
                  <div className="flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3.5">
                    <div>
                      <strong className="block mb-0.5 text-[var(--text)] text-[0.88rem] font-[650]">
                        Delivery
                      </strong>
                      <p className="m-0 text-[var(--muted)] text-[0.78rem]">
                        Automatically email the certificate to learners.
                      </p>
                    </div>
                    <SettingsToggle
                      checked={extras.autoEmailCertificate}
                      onChange={handleToggleAutoEmailCertificate}
                      label="Toggle certificate delivery"
                    />
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
                        9h 24m
                      </strong>
                      <span className="text-[var(--muted)] text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                        Content length
                      </span>
                    </div>
                  </div>
                </div>

                {/* Additional Inclusions Section */}
                <div className="flex flex-col gap-3">
                  <div className="mb-2">
                    <h4 className="m-0 mb-0.5 text-[var(--text)] text-[0.9rem] font-bold">
                      Additional inclusions
                    </h4>
                    <p className="m-0 text-[var(--muted)] text-[0.78rem]">
                      Add any additional benefits your learners will get with
                      this course.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {extras.inclusions.map((item, incIndex) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2.5 border rounded-[10px] px-3 py-2 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] transition-[border-color,opacity] duration-150 ${
                          draggedInclusionIndex === incIndex
                            ? "opacity-35 border-dashed border-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                        }`}
                        draggable={dragEnabledInclusionId === item.id}
                        onDragStart={(e) =>
                          handleInclusionDragStart(e, incIndex, item.text)
                        }
                        onDragOver={(e) => handleInclusionDragOver(e, incIndex)}
                        onDragEnd={handleInclusionDragEnd}
                      >
                        <span
                          className="flex items-center justify-center text-[var(--muted)] cursor-grab opacity-60 transition-opacity duration-150 hover:opacity-100 select-none"
                          title="Drag to reorder inclusion"
                          onMouseEnter={() =>
                            setDragEnabledInclusionId(item.id)
                          }
                          onMouseLeave={() => {
                            if (draggedInclusionIndex === null)
                              setDragEnabledInclusionId(null);
                          }}
                          onMouseDown={() => setDragEnabledInclusionId(item.id)}
                          onMouseUp={() => {
                            if (draggedInclusionIndex === null)
                              setDragEnabledInclusionId(null);
                          }}
                        >
                          <DotsSixVertical size={18} />
                        </span>
                        <input
                          type="text"
                          className="flex-1 border-none text-[var(--text)] bg-transparent text-[0.86rem] font-medium outline-none"
                          value={item.text}
                          onChange={(e) =>
                            handleUpdateInclusionText(item.id, e.target.value)
                          }
                          placeholder="e.g. Downloadable resources"
                        />
                        <button
                          type="button"
                          className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-[var(--muted)] hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all duration-150 bg-transparent cursor-pointer p-0"
                          aria-label="Remove inclusion"
                          title="Remove inclusion"
                          onClick={() => handleDeleteInclusion(item.id)}
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.5 h-[34px] w-full border border-dashed border-[color-mix(in_srgb,var(--text)_18%,transparent)] rounded-lg text-[var(--muted)] bg-transparent text-[0.82rem] font-medium cursor-pointer transition-colors duration-150 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] hover:text-[var(--accent-ink,var(--accent))] mt-1"
                    onClick={handleAddInclusion}
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
                  <label className="text-[var(--text)] text-[0.86rem] font-[650]">
                    Course visibility
                  </label>
                  <ThemedSelect
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
                    ariaLabel="Select course visibility"
                    triggerClassName="!w-full !h-10 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-[var(--text)] !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all"
                  />
                </div>

                {/* Publish on radio options */}
                <div className="flex flex-col gap-1.5 mb-4.5">
                  <label className="text-[var(--text)] text-[0.86rem] font-[650]">
                    Publish on
                  </label>

                  <div className="flex flex-col gap-2.5">
                    {/* Option 1: Publish immediately */}
                    <div
                      className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                        publishSettings.scheduleOption === "now"
                          ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                      }`}
                      onClick={() =>
                        setPublishSettings((prev) => ({
                          ...prev,
                          scheduleOption: "now",
                        }))
                      }
                    >
                      <div
                        className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
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
                      className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-pointer transition-[border-color,background-color] duration-150 ease-out select-none ${
                        publishSettings.scheduleOption === "later"
                          ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
                      }`}
                      onClick={() =>
                        setPublishSettings((prev) => ({
                          ...prev,
                          scheduleOption: "later",
                        }))
                      }
                    >
                      <div
                        className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
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

                        {publishSettings.scheduleOption === "later" && (
                          <div
                            className="flex items-center gap-2.5 mt-2.5 max-[640px]:flex-col max-[640px]:items-stretch"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="relative flex items-center flex-1">
                              <Calendar
                                size={16}
                                className="absolute left-2.5 text-[var(--muted)] pointer-events-none"
                              />
                              <input
                                type="date"
                                className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg py-1.75 pr-3 pl-8 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] font-inherit text-[0.84rem] font-medium outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
                                value={publishSettings.scheduleDate}
                                onChange={(e) =>
                                  setPublishSettings((prev) => ({
                                    ...prev,
                                    scheduleDate: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="relative flex items-center flex-1">
                              <Clock
                                size={16}
                                className="absolute left-2.5 text-[var(--muted)] pointer-events-none"
                              />
                              <input
                                type="time"
                                className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg py-1.75 pr-3 pl-8 text-[var(--text)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] font-inherit text-[0.84rem] font-medium outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
                                value={publishSettings.scheduleTime}
                                onChange={(e) =>
                                  setPublishSettings((prev) => ({
                                    ...prev,
                                    scheduleTime: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                        )}
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
          className="flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text-secondary)] bg-transparent cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-[var(--text)] active:scale-[0.98] disabled:opacity-60"
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

        {/* Save Draft Button */}
        <button
          type="button"
          style={{
            fontSize: "0.84rem",
            fontWeight: 500,
            height: "44px",
            borderRadius: "12px",
            gap: "6px",
          }}
          className="flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] active:scale-[0.98] disabled:opacity-60"
          onClick={handleSaveDraftAction}
          disabled={actionLoading !== null}
        >
          {actionLoading === "draft" ? (
            <>
              <CircleNotch
                size={14}
                className="animate-spin text-[var(--accent)]"
              />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <FloppyDisk size={14} />
              <span>Save Draft</span>
            </>
          )}
        </button>

        {/* Save Changes / Publish Course Button */}
        <button
          type="button"
          style={{
            fontSize: "0.84rem",
            fontWeight: 600,
            height: "44px",
            borderRadius: "14px",
            gap: "6px",
          }}
          className="flex-1 inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all hover:bg-[var(--accent-hover,var(--accent))] active:scale-[0.98] disabled:opacity-60"
          disabled={actionLoading !== null}
          onClick={
            activeStep === "publish"
              ? handleFinalPublishCourse
              : handleSaveChangesAction
          }
        >
          {actionLoading === "publish" ? (
            <>
              <CircleNotch
                size={14}
                className="animate-spin text-[var(--on-accent,#fff)]"
              />
              <span>{isPublished ? "Updating..." : "Publishing..."}</span>
            </>
          ) : actionLoading === "save" ? (
            <>
              <CircleNotch
                size={14}
                className="animate-spin text-[var(--on-accent,#fff)]"
              />
              <span>Saving...</span>
            </>
          ) : (
            <>
              {activeStep === "publish" ? (
                isPublished ? (
                  <span>Update Course</span>
                ) : (
                  <span>Publish Course</span>
                )
              ) : (
                <span>Save Changes</span>
              )}
            </>
          )}
        </button>
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

      {/* Add New Category Modal */}
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
              className="relative w-full max-w-[420px] rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[var(--surface)] p-6 shadow-[0_20px_48px_rgba(0,0,0,0.45)] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3
                  id="add-category-modal-title"
                  className="m-0 text-[var(--text)] text-[1.1rem] font-bold tracking-tight"
                >
                  Add New Category
                </h3>
                <button
                  type="button"
                  className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] transition-colors duration-150 bg-transparent cursor-pointer p-0"
                  onClick={handleCloseAddCategoryModal}
                  aria-label="Close modal"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleCreateCategory} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="new-category-name-input"
                    className="text-[var(--text-secondary)] text-[0.82rem] font-semibold"
                  >
                    Category Name <span className="text-[#ff5252] ml-0.5">*</span>
                  </label>
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
                    className="w-full h-10 px-3 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[var(--text)] text-[0.88rem] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--muted)]"
                  />
                  {addCategoryError && (
                    <p className="m-0 text-[0.78rem] text-[#ff5252] font-medium">
                      {addCategoryError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseAddCategoryModal}
                    disabled={createCategoryMutation.isPending}
                    style={{
                      fontSize: "0.80rem",
                      fontWeight: 700,
                      height: "34px",
                      borderRadius: "8px",
                      gap: "6px",
                      paddingLeft: "14px",
                      paddingRight: "14px",
                    }}
                    className="inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text-secondary)] bg-transparent cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-[var(--text)] disabled:opacity-60"
                  >
                    <span>Cancel</span>
                  </button>
                  <button
                    type="submit"
                    disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                    style={{
                      fontSize: "0.80rem",
                      fontWeight: 700,
                      height: "34px",
                      borderRadius: "8px",
                      gap: "6px",
                      paddingLeft: "18px",
                      paddingRight: "18px",
                    }}
                    className="inline-flex items-center justify-center border-none text-[var(--on-accent,#ffffff)] bg-[var(--accent)] cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-[var(--accent-hover,var(--accent))] hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {createCategoryMutation.isPending ? (
                      <>
                        <CircleNotch size={14} className="animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <Plus size={14} weight="bold" />
                        <span>Create</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
