import { useLayoutEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useParams } from "react-router";
import {
  ArrowLeft,
  BookOpen,
  CaretDown,
  CheckCircle,
  Circle,
  CircleNotch,
  Clock,
  FileText,
  Globe,
  Heart,
  Play,
  PlayCircle,
  ShoppingBag,
  Stack,
  Tag,
  Ticket,
  User,
} from "@phosphor-icons/react";
import type {
  Category,
  CourseEditorDataResponse,
  CourseOverviewResponse,
} from "@veolms/contracts";
import { courses } from "./catalogue";
import type { Course, CourseLevel, CourseCategory, CourseLifecycleStatus } from "./catalogue";
import { sections } from "../learning/courseContent";
import type { CourseSection } from "../learning/courseContent";
import { getCourseTitle, getCourseThumbnail } from "../learning/courseMetadata";
import type { NavigateTo } from "../routing/navigation";
import { useAuthStore } from "../store/auth.store";
import { useCourseOverview } from "../services/courses";
import { RenderMarkdown } from "./RichTextEditor";

// ─── Helpers for Currency, Sale Window, Language, and Price Sizing ────────────

export type PriceSizeVariant = "normal" | "medium" | "large" | "xlarge";

export function getPriceSizeVariant(priceStr: string): PriceSizeVariant {
  if (!priceStr || priceStr.toLowerCase() === "free") return "normal";
  const digitsOnly = priceStr.replace(/\D/g, "");
  const digitCount = digitsOnly.length;
  if (digitCount >= 8) return "xlarge";
  if (digitCount >= 6) return "large";
  if (digitCount === 5) return "medium";
  return "normal";
}

export const priceTextClasses: Record<PriceSizeVariant, string> = {
  normal: "text-[2.15rem] max-[640px]:text-[1.95rem] tracking-[-0.03em]",
  medium: "text-[1.95rem] max-[640px]:text-[1.75rem] tracking-[-0.025em]",
  large: "text-[1.75rem] max-[640px]:text-[1.55rem] tracking-[-0.02em]",
  xlarge: "text-[1.55rem] max-[640px]:text-[1.4rem] tracking-[-0.015em]",
};

export function getCurrencySymbol(currency: string = "INR"): string {
  switch (currency.toUpperCase()) {
    case "INR":
      return "₹";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "CAD":
      return "CA$";
    case "AUD":
      return "A$";
    case "JPY":
      return "¥";
    default:
      return `${currency.toUpperCase()} `;
  }
}

export function formatPriceWithCurrency(
  amount: number,
  currency: string = "INR",
): string {
  const sym = getCurrencySymbol(currency);
  return `${sym}${amount.toLocaleString()}`;
}

export function isCourseSaleActive(
  salePrice: number | null | undefined,
  regularPrice: number,
  saleStartsAt?: string | null,
  saleEndsAt?: string | null,
): boolean {
  if (salePrice == null || salePrice <= 0 || salePrice >= regularPrice) {
    return false;
  }
  const now = new Date().getTime();
  if (saleStartsAt) {
    const starts = new Date(saleStartsAt).getTime();
    if (!isNaN(starts) && starts > now) {
      return false;
    }
  }
  if (saleEndsAt) {
    const ends = new Date(saleEndsAt).getTime();
    if (!isNaN(ends) && ends < now) {
      return false;
    }
  }
  return true;
}

export function getLanguageLabel(code?: string | null): string | undefined {
  if (!code || !code.trim()) return undefined;
  const trimmed = code.trim();
  const map: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    hi: "Hindi",
    zh: "Chinese",
    ja: "Japanese",
    ar: "Arabic",
    pt: "Portuguese",
    ru: "Russian",
    it: "Italian",
  };
  return (
    map[trimmed.toLowerCase()] ||
    (trimmed.length <= 3
      ? trimmed.toUpperCase()
      : trimmed.charAt(0).toUpperCase() + trimmed.slice(1))
  );
}

// ─── per-course curriculum adapter ──────────────────────────────────────────

function buildFallbackSections(course: Course): CourseSection[] {
  return Array.from({ length: course.sections }, (_, i) => ({
    id: i + 1,
    title: getSectionTitle(course, i),
    progress: "0/0",
    lessons: [],
  }));
}

export function getSectionTitle(course: Course, index: number): string {
  const generic = [
    "Introduction",
    "Getting Started",
    "Core Concepts",
    "Practical Application",
    "Advanced Topics",
    "Real-World Projects",
    "Best Practices",
    "Testing & Debugging",
    "Deployment",
    "Performance Optimization",
    "Security Considerations",
    "Scaling & Architecture",
  ];
  const words = course.title.split(/\s+/).filter((w) => w.length > 3);
  const topic = words[0] ?? course.category;
  const domainSections: Record<string, string[]> = {
    Development: [
      "Introduction",
      `${topic} Fundamentals`,
      "Environment Setup",
      "Core APIs",
      "Building REST APIs",
      "Database Integration",
      "Authentication & Security",
      "Testing Strategies",
      "Error Handling",
      "Deployment & CI/CD",
      "Performance Tuning",
      "Capstone Project",
    ],
    Design: [
      "Introduction",
      "Design Thinking",
      "Research & Discovery",
      "Wireframing",
      "Visual Hierarchy",
      "Typography & Color",
      "Prototyping",
      "Usability Testing",
      "Handoff Workflow",
      "Portfolio Projects",
    ],
    Database: [
      "Introduction",
      "Data Modeling",
      "Query Language",
      "Indexing & Performance",
      "Transactions",
      "Schema Design",
      "Replication",
      "Backup & Recovery",
      "Security",
      "Real-World Projects",
    ],
    Cloud: [
      "Introduction",
      "Core Services",
      "Compute & Networking",
      "Storage Solutions",
      "Identity & Access",
      "Monitoring & Logging",
      "Serverless",
      "Cost Optimization",
      "Security",
      "Certification Prep",
    ],
  };
  const domain = domainSections[course.category] ?? generic;
  return domain[index] ?? generic[index] ?? `Section ${index + 1}`;
}

function getCourseSections(courseSlug: string | undefined): CourseSection[] {
  if (courseSlug === "ui-ux-design-mastery") return sections;
  const course = courseSlug ? courses.find((c) => c.id === courseSlug) : undefined;
  if (!course) return [];
  return buildFallbackSections(course);
}

// ─── static per-overview pricing / includes data ────────────────────────────

const DEFAULT_PRICE = "₹1,999";
const DEFAULT_ORIGINAL_PRICE = "₹2,999";
const DEFAULT_DISCOUNT = "33% OFF";

export interface CourseInclude {
  icon: typeof BookOpen;
  label: string;
}

export interface CourseOverviewPricingProps {
  price?: string;
  originalPrice?: string;
  discount?: string;
}

function buildIncludes(course: Course): CourseInclude[] {
  return [
    { icon: Stack, label: `${course.sections} Sections` },
    { icon: BookOpen, label: `${course.lectures} Lectures` },
    { icon: Clock, label: `${course.duration} On-demand content` },
  ];
}

// ─── sub-components ──────────────────────────────────────────────────────────

interface CurriculumSectionProps {
  section: CourseSection;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}

function CurriculumSectionItem({
  section,
  index,
  isOpen,
  onToggle,
}: CurriculumSectionProps) {
  const panelId = `cov-section-panel-${section.id}`;
  const buttonId = `cov-section-toggle-${section.id}`;
  const lessonCount = section.lessons.length;
  const hasDurations = section.lessons.some((l) => Boolean(l[2]));
  const durationLabel = hasDurations
    ? (() => {
        const minutes = 20 + index * 7 + (index % 4) * 5;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      })()
    : "";

  return (
    <div
      className={`rounded-xl border bg-(--surface) shadow-(--card-shadow) overflow-hidden transition-[border-color,box-shadow] duration-150 ${
        isOpen
          ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
      }`}
      role="listitem"
    >
      <button
        id={buttonId}
        type="button"
        className="flex w-full min-h-13 items-center gap-3.5 border-0 px-4.5 py-3 text-(--text) bg-transparent text-[0.92rem] font-semibold text-left cursor-pointer transition-colors duration-140 hover:bg-(--hover) max-[640px]:p-[10px_14px] max-[640px]:text-[0.88rem]"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span
          className="inline-flex w-6.5 h-6.5 shrink-0 items-center justify-center rounded-md bg-(--accent) text-(--on-accent,#ffffff) text-[0.82rem] font-bold"
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <span className="flex-1 min-w-0 text-(--text)">
          {section.title}
        </span>
        <span className="shrink-0 text-(--muted) text-[0.82rem] font-normal mr-1">
          {lessonCount} Lesson{lessonCount === 1 ? "" : "s"}
          {durationLabel ? ` • ${durationLabel}` : ""}
        </span>
        <span
          className={`shrink-0 text-(--muted) inline-flex items-center justify-center transition-transform duration-200 ease-out motion-reduce:transition-none ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <CaretDown size={16} weight="bold" />
        </span>
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={!isOpen}
        className={`grid motion-reduce:transition-none ${
          isOpen
            ? "grid-rows-[1fr] opacity-100 visible transition-[grid-template-rows,opacity,visibility] duration-300 ease-in-out"
            : "grid-rows-[0fr] opacity-0 invisible transition-[grid-template-rows,opacity,visibility] duration-250 ease-[cubic-bezier(0,1,0,1)]"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <div className="px-3.5 pt-1 pb-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_95%,var(--text))]">
            {section.lessons.length > 0 ? (
              section.lessons.map(([number, title, duration, status]) => {
                const isDoc =
                  title.toLowerCase().includes("discord") ||
                  title.toLowerCase().includes("app") ||
                  title.toLowerCase().includes("community") ||
                  title.toLowerCase().includes("download") ||
                  title.toLowerCase().endsWith(".pdf") ||
                  title.toLowerCase().endsWith(".doc") ||
                  title.toLowerCase().endsWith(".docx");
                return (
                  <div
                    className="group/lesson flex items-center gap-3 min-h-9.5 px-3 py-1.5 rounded-md text-(--text-secondary) text-[0.85rem] cursor-pointer transition-colors duration-140 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
                    key={number}
                  >
                    <span
                      className="inline-flex w-5 shrink-0 items-center justify-center text-(--muted) transition-colors duration-140 group-hover/lesson:text-(--accent)"
                      aria-hidden="true"
                    >
                      {isDoc ? (
                        <FileText size={16} weight="regular" />
                      ) : (
                        <PlayCircle size={16} weight="regular" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.85rem] text-(--text-secondary)">
                      {title}
                    </span>
                    {duration ? (
                      <span className="text-(--muted) text-[0.78rem] shrink-0 w-11.25 text-right">
                        {duration}
                      </span>
                    ) : null}
                    {status === "done" ? (
                      <span
                        className="inline-flex items-center justify-center shrink-0"
                        aria-hidden="true"
                      >
                        <CheckCircle
                          size={16}
                          weight="fill"
                          className="text-[#10b981]"
                        />
                      </span>
                    ) : status === "todo" ? (
                      <span
                        className="inline-flex items-center justify-center shrink-0"
                        aria-hidden="true"
                      >
                        <Circle size={16} className="text-(--muted)" />
                      </span>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="px-3.5 py-3 text-(--muted) text-[0.82rem] italic">
                No lessons added yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Header & Hero Section ──────────────────────────────────────────────────

interface CourseHeroSectionProps {
  course: Course;
  title: string;
  thumbnail: string;
  wishlisted: boolean;
  instructorName?: string;
  shortDescription?: string;
  categoryName?: string;
  language?: string;
  pricing?: CourseOverviewPricingProps;
  inclusions?: string[];
  onNavigateCourses?: () => void;
  onToggleWishlist?: (event: MouseEvent<HTMLButtonElement>) => void;
  onNavigatePage?: NavigateTo;
  isReadOnlyPreview?: boolean;
}

function CourseHeroSection({
  course,
  title,
  thumbnail,
  wishlisted,
  instructorName,
  shortDescription,
  categoryName,
  language,
  pricing,
  inclusions,
  onNavigateCourses,
  onToggleWishlist,
  onNavigatePage,
  isReadOnlyPreview = false,
}: CourseHeroSectionProps) {
  const price = pricing?.price ?? DEFAULT_PRICE;
  const originalPrice = pricing?.originalPrice ?? (pricing?.price ? undefined : DEFAULT_ORIGINAL_PRICE);
  const discount = pricing?.discount ?? (pricing?.price ? undefined : DEFAULT_DISCOUNT);
  const perksList = inclusions ?? [
    "Full lifetime access",
    "Access on mobile & desktop",
    "Certificate of completion",
  ];
  const priceSizeVariant = getPriceSizeVariant(price);

  const handlePreviewClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isReadOnlyPreview) return;
    if (onNavigatePage) {
      onNavigatePage(`/learn/${encodeURIComponent(course.id)}`);
    }
  };

  return (
    <div className="grid grid-cols-1 min-[1200px]:grid-cols-2 gap-8 items-start relative max-[1200px]:flex max-[1200px]:flex-col max-[1200px]:gap-5.5 max-[640px]:gap-4.5">
      {/* Left Column: Title, Metadata, Pricing Section */}
      <div className="flex flex-col min-w-0 w-full gap-4 max-[1200px]:contents">
        {/* Upper Navigation & Category / Level Badges */}
        <div className="flex items-center gap-2.5 flex-wrap max-[1200px]:order-0 max-[1200px]:w-full">
          {onNavigateCourses && (
            <button
              type="button"
              className="inline-flex items-center justify-center w-9.5 h-9.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--surface)_90%,#000)] text-(--text) cursor-pointer p-0 shadow-[0_2px_8px_rgba(0,0,0,0.14)] transition-[border-color,background-color,color] duration-160 ease-out hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-(--hover) hover:text-(--text)"
              aria-label="Back to courses"
              onClick={onNavigateCourses}
              title="Back to courses"
            >
              <ArrowLeft size={18} weight="bold" />
            </button>
          )}

          {course.level ? (
            <span
              className="inline-flex items-center border border-(--accent-border,color-mix(in_srgb,var(--accent)_35%,transparent)) rounded-full px-3.25 py-1.25 text-(--accent-ink,var(--accent)) bg-(--accent-soft,color-mix(in_srgb,var(--accent)_15%,transparent)) text-[0.74rem] font-[750] tracking-[0.06em] leading-none"
              aria-label={`Level: ${course.level}`}
            >
              {course.level.toUpperCase()}
            </span>
          ) : null}
        </div>

        {/* Lower Content Group: Title, Meta row, Pricing Card */}
        <div className="flex flex-col min-w-0 w-full gap-3.5 max-[1200px]:contents">
          {/* Title & Metadata Group */}
          <div className="flex flex-col min-w-0 shrink-0 max-[1200px]:order-1 max-[1200px]:w-full gap-2.5">
            {/* 1. Title */}
            <h1 className="m-0 text-(--text) text-[2.15rem] font-extrabold leading-[1.16] tracking-[-0.025em] max-[900px]:text-[1.85rem] max-[640px]:text-[1.65rem]">
              {title}
            </h1>

            {/* 2. Metadata row immediately below title */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-(--text-secondary) text-[0.88rem] max-[900px]:gap-x-3 max-[900px]:gap-y-1.5 max-[640px]:text-[0.86rem] max-[640px]:gap-x-2.5 max-[640px]:gap-y-1.25">
              {instructorName && (
                <>
                  <span className="inline-flex items-center gap-1.5 text-(--text) font-[650]">
                    <User size={17} weight="bold" aria-hidden="true" />
                    <span>{instructorName}</span>
                  </span>
                  <span
                    className="text-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[0.8rem]"
                    aria-hidden="true"
                  >
                    •
                  </span>
                </>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Stack size={17} aria-hidden="true" />
                <span>{course.sections} Section{course.sections === 1 ? "" : "s"}</span>
              </span>
              <span
                className="text-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[0.8rem]"
                aria-hidden="true"
              >
                •
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen size={17} aria-hidden="true" />
                <span>{course.lectures} Lesson{course.lectures === 1 ? "" : "s"}</span>
              </span>
              {/* Language metadata is temporarily hidden per requirements (retained for future use) */}
              {categoryName ? (
                <>
                  <span
                    className="text-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[0.8rem]"
                    aria-hidden="true"
                  >
                    •
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Tag size={17} aria-hidden="true" />
                    <span>{categoryName}</span>
                  </span>
                </>
              ) : null}
              <span
                className="text-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[0.8rem]"
                aria-hidden="true"
              >
                •
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={17} aria-hidden="true" />
                <span>{course.duration || "0h0m"}</span>
              </span>
            </div>
          </div>

          {/* Full-width Rich Pricing Section in Left Column */}
          <div
            className={`flex flex-col min-h-0 rounded-[14px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] shadow-(--card-shadow) w-full box-border max-[1200px]:order-3 max-[1200px]:w-full max-[1200px]:mt-0 max-[640px]:p-[16px_14px] max-[640px]:gap-3 p-[18px_20px] gap-3.5`}
            aria-label="Course pricing and enrollment"
          >
            {/* Top Row: Prominent Price + Original Price + Discount (Left) and Favourite Button (Top Right) */}
            <div className="flex items-start justify-between gap-3 w-full">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 min-w-0 flex-1">
                <span
                  className={`text-(--text) font-[850] leading-none whitespace-nowrap ${priceTextClasses[priceSizeVariant]}`}
                >
                  {price}
                </span>
                {originalPrice && (
                  <span className="text-(--muted) text-[1.05rem] font-medium line-through whitespace-nowrap">
                    {originalPrice}
                  </span>
                )}
                {discount && (
                  <span className="inline-flex items-center rounded-md px-2 py-0.75 bg-(--accent-soft,color-mix(in_srgb,var(--accent)_18%,transparent)) text-(--accent-ink,var(--accent)) text-[0.75rem] font-[750] leading-none whitespace-nowrap">
                    {discount}
                  </span>
                )}
              </div>

              <button
                type="button"
                className={`inline-flex items-center justify-center w-9.5 h-9.5 shrink-0 rounded-full border border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] text-(--muted) cursor-pointer transition-[border-color,color,background-color,transform] duration-160 ease-out hover:border-[color-mix(in_srgb,var(--text)_32%,transparent)] hover:text-(--text) hover:bg-(--hover) hover:scale-[1.06] ${
                  wishlisted
                    ? "border-[#ec4899]! text-[#ec4899]! bg-[rgba(236,72,153,0.14)]!"
                    : ""
                }`}
                aria-label={
                  wishlisted ? "Remove from wishlist" : "Add to wishlist"
                }
                aria-pressed={wishlisted}
                disabled={isReadOnlyPreview}
                onClick={onToggleWishlist}
                title={
                  wishlisted ? "Remove from wishlist" : "Add to wishlist"
                }
              >
                <Heart
                  size={20}
                  weight={wishlisted ? "fill" : "regular"}
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* Middle Row: Actions (Apply Coupon + Buy Now / Continue Learning) */}
            <div className="flex flex-wrap items-center gap-2.5 w-full min-w-0 max-[640px]:gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 min-h-10 border border-dashed border-[color-mix(in_srgb,var(--text)_25%,transparent)] rounded-[9px] px-3.5 sm:px-4 py-2 text-(--text) bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] text-[0.86rem] font-[750] cursor-pointer whitespace-nowrap min-w-0 transition-[border-color,color,background-color,transform] duration-160 ease-out hover:border-(--accent) hover:text-(--accent) hover:bg-(--accent-soft,color-mix(in_srgb,var(--accent)_12%,transparent)) hover:-translate-y-px shrink-0 max-[480px]:flex-1 max-[480px]:min-w-30 max-[640px]:px-3 max-[640px]:text-[0.84rem] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isReadOnlyPreview}
              >
                <Ticket
                  size="1.15em"
                  weight="bold"
                  className="shrink-0"
                  aria-hidden="true"
                />
                <span className="font-[750] truncate">
                  Apply coupon
                </span>
              </button>

              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 flex-1 min-h-10.5 min-w-35 px-4 sm:px-5 py-2.5 border-0 rounded-[9px] text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_4px_14px_var(--accent-shadow,color-mix(in_srgb,var(--accent)_28%,transparent))] text-[0.94rem] font-[800] tracking-[-0.01em] cursor-pointer whitespace-nowrap min-w-0 transition-[background-color,transform,box-shadow] duration-160 ease-out hover:bg-(--accent-hover,color-mix(in_srgb,var(--accent)_85%,var(--text))) hover:-translate-y-px hover:shadow-[0_6px_18px_var(--accent-shadow,color-mix(in_srgb,var(--accent)_38%,transparent))] max-[640px]:text-[0.88rem] disabled:opacity-75 disabled:cursor-default"
                disabled={isReadOnlyPreview}
                onClick={() => {
                  if (!isReadOnlyPreview && onNavigatePage) {
                    onNavigatePage(`/learn/${encodeURIComponent(course.id)}`);
                  }
                }}
              >
                {course.enrolled ? (
                  <Play
                    size="1.15em"
                    weight="fill"
                    className="shrink-0"
                    aria-hidden="true"
                  />
                ) : price.toLowerCase() === "free" ? (
                  <BookOpen
                    size="1.15em"
                    weight="bold"
                    className="shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <ShoppingBag
                    size="1.15em"
                    weight="bold"
                    className="shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="font-[800] truncate">
                  {price.toLowerCase() === "free"
                    ? "Enroll for Free"
                    : course.enrolled
                      ? "Continue Learning"
                      : "Buy Now"}
                </span>
              </button>
            </div>

            {/* Bottom Row: Additional Inclusions / Value Perks */}
            {perksList.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted) text-[0.82rem] max-[640px]:text-[0.78rem] max-[640px]:gap-x-3 max-[640px]:gap-y-2">
                {perksList.map((perk, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap"
                  >
                    <CheckCircle
                      size={15}
                      weight="fill"
                      className="text-emerald-500 dark:text-emerald-400 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{perk}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: 16:9 Course Trailer */}
      <div className="flex items-end justify-center w-full min-w-0 min-[1200px]:h-full max-[1200px]:order-2 max-[1200px]:w-full max-[640px]:-mx-3.5 max-[640px]:w-[calc(100%+28px)] max-[640px]:max-w-none">
        <div
          className="group w-full aspect-video overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_60%,#000)] shadow-(--card-shadow) relative flex items-center justify-center rounded-[14px] max-[640px]:rounded-none max-[640px]:border-x-0"
          aria-label="Course preview player"
        >
          <img
            src={thumbnail}
            alt={`Preview thumbnail for ${title}`}
            className="w-full h-full object-cover opacity-90 transition-[transform,opacity] duration-300 motion-reduce:transition-none group-hover:scale-[1.015] group-hover:opacity-[0.98]"
          />
          <div className="absolute inset-0 bg-linear-to-b from-black/8 to-black/45 pointer-events-none" />

          {/* Center Play Button */}
          <button
            type="button"
            className="group/play absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-0 bg-transparent cursor-pointer p-0 z-2"
            aria-label={`Play preview for ${title}`}
            onClick={handlePreviewClick}
            disabled={isReadOnlyPreview}
          >
            <span
              className="inline-flex w-13.5 h-13.5 items-center justify-center rounded-full bg-black/55 backdrop-blur-md border-[1.5px] border-white/25 text-white shadow-[0_4px_18px_rgba(0,0,0,0.35)] transition-[transform,background-color,border-color] duration-180 ease-out motion-reduce:transition-none group-hover/play:scale-[1.08] group-hover/play:bg-black/75 group-hover/play:border-white/50 max-[640px]:w-12.5 max-[640px]:h-12.5"
              aria-hidden="true"
            >
              <Play size={22} weight="fill" />
            </span>
          </button>

          {/* Bottom Left Pill Button */}
          <button
            type="button"
            className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 bg-black/65 backdrop-blur-[10px] border border-white/18 text-white text-[0.78rem] font-semibold px-3.25 py-1.5 rounded-full cursor-pointer z-2 transition-[background-color,border-color,transform] duration-160 ease-out hover:bg-black/85 hover:border-white/40 hover:-translate-y-px"
            onClick={handlePreviewClick}
            disabled={isReadOnlyPreview}
            aria-label="View trailer"
          >
            <PlayCircle size={15} weight="bold" />
            <span>Preview this course</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── about this course card ──────────────────────────────────────────────────

interface CourseAboutCardProps {
  description?: string;
  aboutLead?: string;
  aboutBody?: string;
  aboutExtra?: string;
  showMore: boolean;
  onToggleShowMore: () => void;
  isReadOnlyPreview?: boolean;
}

function CourseAboutCard({
  description,
  aboutLead,
  aboutBody,
  aboutExtra,
  showMore,
  onToggleShowMore,
  isReadOnlyPreview = false,
}: CourseAboutCardProps) {
  return (
    <section
      className="p-[18px_22px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) shadow-(--card-shadow) max-[640px]:p-[18px_16px]"
      aria-labelledby="cov-about-heading"
    >
      <h2
        id="cov-about-heading"
        className="m-0 mb-3 text-(--text) text-[1.24rem] font-bold tracking-[-0.015em]"
      >
        About this course
      </h2>

      <div className="flex flex-col gap-3">
        {description ? (
          <div className="cov-prose text-[0.88rem] leading-[1.65]">
            <RenderMarkdown content={description} />
          </div>
        ) : (
          <>
            {aboutLead && (
              <p className="m-0 text-(--text-secondary) text-[0.87rem] leading-[1.6]">
                {aboutLead}
              </p>
            )}
            {aboutBody && (
              <p className="m-0 text-(--text-secondary) text-[0.87rem] leading-[1.6]">
                {aboutBody}
              </p>
            )}
            {showMore && aboutExtra && (
              <p className="m-0 text-(--text-secondary) text-[0.87rem] leading-[1.6]">
                {aboutExtra}
              </p>
            )}
          </>
        )}
      </div>

      {!description && !isReadOnlyPreview && (
        <button
          type="button"
          className="inline-flex items-center gap-1 mt-2.5 border-0 bg-transparent text-(--accent) text-[0.82rem] font-semibold p-0 cursor-pointer transition-opacity duration-140 hover:opacity-85"
          aria-expanded={showMore}
          onClick={onToggleShowMore}
        >
          <span>{showMore ? "Show less" : "Show more"}</span>
          <CaretDown
            size={14}
            className={`transition-transform duration-200 ${showMore ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </section>
  );
}

// ─── course curriculum card ──────────────────────────────────────────────────

interface CourseCurriculumCardProps {
  course: Course;
  courseSections: CourseSection[];
  openSections: Set<number>;
  onToggleSection: (index: number) => void;
}

function CourseCurriculumCard({
  course,
  courseSections,
  openSections,
  onToggleSection,
}: CourseCurriculumCardProps) {
  return (
    <section
      className="p-[18px_22px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) shadow-(--card-shadow) max-[640px]:p-[18px_16px]"
      aria-labelledby="cov-curriculum-heading"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2
            id="cov-curriculum-heading"
            className="m-0 mb-2.5 text-(--text) text-[1.1rem] font-bold tracking-[-0.015em]"
          >
            Course curriculum
          </h2>
          <p className="m-0 mt-0.5 text-(--muted) text-[0.82rem]">
            {course.sections} Section{course.sections === 1 ? "" : "s"} &bull;{" "}
            {course.lectures} Lesson{course.lectures === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {courseSections.length === 0 ? (
        <div className="p-8 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) text-(--muted) text-center text-[0.88rem] italic">
          No sections added yet
        </div>
      ) : (
        <div className="flex flex-col gap-1.5" role="list">
          {courseSections.map((section, index) => (
            <CurriculumSectionItem
              key={section.id}
              section={section}
              index={index}
              isOpen={openSections.has(index)}
              onToggle={() => onToggleSection(index)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export interface CourseOverviewPageProps {
  courseSlug?: string | undefined;
  onNavigateCourses?: () => void;
  onNavigatePage?: NavigateTo;
  // API Preview Data
  previewData?: CourseEditorDataResponse;
  categories?: Category[];
  // Custom overview data override for backwards compatibility or tests
  customCourse?: Course;
  customInstructor?: string;
  customDescription?: string;
  customShortDescription?: string;
  customCategoryName?: string;
  customLanguage?: string;
  customSections?: CourseSection[];
  customIncludes?: CourseInclude[];
  customInclusions?: string[];
  customPricing?: CourseOverviewPricingProps;
  isReadOnlyPreview?: boolean;
}

export interface AdaptedOverviewData {
  course: Course;
  description: string;
  shortDescription: string | undefined;
  categoryName: string | undefined;
  language: string | undefined;
  sections: CourseSection[];
  inclusions: string[];
  pricing: CourseOverviewPricingProps;
  instructorName: string | undefined;
}

export function adaptCourseOverviewResponse(
  overview: CourseOverviewResponse,
  defaultInstructorName: string,
): AdaptedOverviewData {
  const c = overview.course;
  const totalSections = overview.stats?.totalSections ?? overview.sections.length;
  const totalLessons =
    overview.stats?.totalLessons ??
    overview.sections.reduce((acc, sec) => acc + (sec.lessons?.length ?? 0), 0);

  const difficultyStr = c.difficulty
    ? c.difficulty.charAt(0).toUpperCase() + c.difficulty.slice(1)
    : "";

  const resolvedCategoryName = overview.category?.name;
  const resolvedLanguage = getLanguageLabel(overview.settings?.language);

  const showInstructor = overview.settings?.showInstructorName !== false;
  const resolvedInstructorName = showInstructor
    ? (c.instructorAlias?.trim() || overview.creator?.displayName || defaultInstructorName)
    : undefined;

  const resolvedDuration = overview.settings?.estimatedDuration
    ? `${overview.settings.estimatedDuration}h`
    : overview.stats?.totalDurationSeconds
      ? `${Math.round(overview.stats.totalDurationSeconds / 3600)}h`
      : "0h0m";

  const resolvedThumbnail = c.thumbnailMediaId
    ? `/api/v1/media/${c.thumbnailMediaId}`
    : c.slug
      ? getCourseThumbnail(c.slug)
      : "/assets/instructor-poster.jpg";

  const adaptedCourse: Course = {
    id: c.id,
    slug: c.slug,
    title: c.title || "Untitled Course",
    description: c.description || c.shortDescription || "",
    level: (difficultyStr || "Beginner") as CourseLevel,
    category: (resolvedCategoryName || "Development") as CourseCategory,
    sections: totalSections,
    lectures: totalLessons,
    progress: null,
    enrolled: false,
    duration: resolvedDuration,
    students: 0,
    thumbnail: resolvedThumbnail,
    lifecycleStatus: (c.status === "published" ? "published" : "draft") as CourseLifecycleStatus,
  };

  const adaptedSections: CourseSection[] = (overview.sections || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((sec, secIdx) => ({
      id: secIdx + 1,
      title: sec.title || `Section ${secIdx + 1}`,
      progress: `0/${sec.lessons?.length ?? 0}`,
      lessons: (sec.lessons || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((les, lesIdx) => [
          lesIdx + 1,
          les.title || `Lesson ${lesIdx + 1}`,
          "",
          "todo" as const,
        ]),
    }));

  const finalPerks: string[] = Array.isArray(overview.includes)
    ? overview.includes
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((inc) => inc.text.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  let pricingProps: CourseOverviewPricingProps;
  const pr = overview.pricing;
  if (!pr || pr.pricingType === "free") {
    pricingProps = { price: "Free" };
  } else {
    const activeSale = isCourseSaleActive(
      pr.salePrice,
      pr.price,
    );

    if (activeSale && pr.salePrice != null) {
      const discountPct = Math.round(
        ((pr.price - pr.salePrice) / pr.price) * 100,
      );
      pricingProps = {
        price: formatPriceWithCurrency(pr.salePrice, pr.currency),
        originalPrice: formatPriceWithCurrency(pr.price, pr.currency),
        discount: `${discountPct}% OFF`,
      };
    } else {
      pricingProps = {
        price: formatPriceWithCurrency(pr.price, pr.currency),
      };
    }
  }

  return {
    course: adaptedCourse,
    description: c.description || "",
    shortDescription: c.shortDescription?.trim() || undefined,
    categoryName: resolvedCategoryName,
    language: resolvedLanguage,
    sections: adaptedSections,
    inclusions: finalPerks,
    pricing: pricingProps,
    instructorName: resolvedInstructorName,
  };
}

export function adaptPreviewDataToOverview(
  previewData: CourseEditorDataResponse,
  serverCategories: Category[],
  defaultInstructorName: string,
): AdaptedOverviewData {
  const c = previewData.course;
  const totalSections = previewData.sections.length;
  const totalLessons = previewData.sections.reduce(
    (acc, sec) => acc + (sec.lessons?.length ?? 0),
    0,
  );

  const difficultyStr = c.difficulty
    ? c.difficulty.charAt(0).toUpperCase() + c.difficulty.slice(1)
    : "";

  const resolvedCategoryName = c.categoryId
    ? serverCategories.find((cat) => cat.id === c.categoryId)?.name
    : undefined;

  const resolvedLanguage = getLanguageLabel(previewData.settings?.language);

  const showInstructor = previewData.settings?.showInstructorName !== false;
  const resolvedInstructorName = showInstructor
    ? (c.instructorAlias?.trim() || defaultInstructorName)
    : undefined;

  const adaptedCourse: Course = {
    id: c.id,
    title: c.title || "Untitled Course",
    description: c.description || "",
    level: (difficultyStr || "Beginner") as CourseLevel,
    category: (resolvedCategoryName || "") as CourseCategory,
    sections: totalSections,
    lectures: totalLessons,
    progress: null,
    enrolled: false,
    duration: previewData.settings?.estimatedDuration
      ? `${previewData.settings.estimatedDuration}h`
      : "0h0m",
    students: 0,
    thumbnail: c.thumbnailMediaId
      ? `/api/v1/media/${c.thumbnailMediaId}`
      : "/assets/instructor-poster.jpg",
    lifecycleStatus: (c.status === "published" ? "published" : "draft") as CourseLifecycleStatus,
  };

  const adaptedSections: CourseSection[] = (previewData.sections || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((sec, secIdx) => ({
      id: secIdx + 1,
      title: sec.title || `Section ${secIdx + 1}`,
      progress: `0/${sec.lessons?.length ?? 0}`,
      lessons: (sec.lessons || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((les, lesIdx) => [
          lesIdx + 1,
          les.title || `Lesson ${lesIdx + 1}`,
          "", // No fake duration
          "todo" as const,
        ]),
    }));

  const finalPerks: string[] = Array.isArray(previewData.includes)
    ? previewData.includes
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((inc) => inc.text.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  let pricingProps: CourseOverviewPricingProps;
  const pr = previewData.pricing;
  if (!pr || pr.pricingType === "free") {
    pricingProps = { price: "Free" };
  } else {
    const activeSale = isCourseSaleActive(
      pr.salePrice,
      pr.price,
    );

    if (activeSale && pr.salePrice != null) {
      const discountPct = Math.round(
        ((pr.price - pr.salePrice) / pr.price) * 100,
      );
      pricingProps = {
        price: formatPriceWithCurrency(pr.salePrice, pr.currency),
        originalPrice: formatPriceWithCurrency(pr.price, pr.currency),
        discount: `${discountPct}% OFF`,
      };
    } else {
      pricingProps = {
        price: formatPriceWithCurrency(pr.price, pr.currency),
      };
    }
  }

  return {
    course: adaptedCourse,
    description: c.description || "",
    shortDescription: c.shortDescription?.trim() || undefined,
    categoryName: resolvedCategoryName,
    language: resolvedLanguage,
    sections: adaptedSections,
    inclusions: finalPerks,
    pricing: pricingProps,
    instructorName: resolvedInstructorName,
  };
}

export function CourseOverviewSkeleton({
  onNavigateCourses,
}: {
  onNavigateCourses?: () => void;
}) {
  return (
    <div
      className="w-full max-w-275 mx-auto flex flex-col gap-6 max-[900px]:gap-4.5 max-[640px]:gap-4 box-border text-(--text) animate-pulse"
      data-testid="course-overview-skeleton"
    >
      <div className="grid grid-cols-1 min-[1200px]:grid-cols-2 gap-8 items-start relative max-[1200px]:flex max-[1200px]:flex-col max-[1200px]:gap-5.5 max-[640px]:gap-4.5 w-full">
        {/* Left Column Skeleton */}
        <div className="flex flex-col min-w-0 w-full gap-4 max-[1200px]:contents">
          {/* Top badges & Back button */}
          <div className="flex items-center gap-2.5 flex-wrap max-[1200px]:order-0 max-[1200px]:w-full">
            {onNavigateCourses && (
              <div className="w-9.5 h-9.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
            )}
            <div className="h-6.5 w-24 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
            <div className="h-6.5 w-20 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
          </div>

          <div className="flex flex-col min-w-0 w-full gap-3.5 max-[1200px]:contents">
            {/* Title & Metadata row skeleton */}
            <div className="flex flex-col min-w-0 shrink-0 max-[1200px]:order-1 max-[1200px]:w-full gap-2.5">
              <div className="flex flex-col gap-2">
                <div className="h-9 w-11/12 rounded-lg bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                <div className="h-9 w-3/5 rounded-lg bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
              </div>

              <div className="flex items-center gap-3 py-1">
                <div className="h-5 w-28 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                <div className="h-5 w-24 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                <div className="h-5 w-20 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
              </div>
            </div>

            {/* Pricing Box skeleton */}
            <div className="flex flex-col min-h-0 rounded-[14px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] shadow-(--card-shadow) w-full box-border max-[1200px]:order-3 max-[1200px]:w-full max-[1200px]:mt-0 max-[640px]:p-[16px_14px] max-[640px]:gap-3 p-[18px_20px] gap-3.5">
              <div className="flex items-baseline gap-3 mb-2">
                <div className="h-9 w-32 rounded-lg bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                <div className="h-6 w-20 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
              </div>
              <div className="h-11 w-full rounded-xl bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] mb-2" />
              <div className="flex flex-col gap-2.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <div className="h-4 w-48 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                <div className="h-4 w-52 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: 16:9 Course Trailer Video Placeholder */}
        <div className="flex items-end justify-center w-full min-w-0 min-[1200px]:h-full max-[1200px]:order-2 max-[1200px]:w-full max-[640px]:-mx-3.5 max-[640px]:w-[calc(100%+28px)] max-[640px]:max-w-none">
          <div
            className="w-full aspect-video overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_60%,#000)] shadow-(--card-shadow) relative flex items-center justify-center rounded-[14px] max-[640px]:rounded-none max-[640px]:border-x-0"
          >
            <div className="w-13.5 h-13.5 rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center">
              <div className="w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--text)_18%,transparent)]" />
            </div>
          </div>
        </div>
      </div>

      {/* Lower section: Description & Curriculum skeletons */}
      <div className="mt-6 max-[640px]:mt-2 flex flex-col gap-6 max-[640px]:gap-4 w-full">
        <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) p-6 max-[640px]:p-4 shadow-(--card-shadow) flex flex-col gap-3">
          <div className="h-7 w-48 rounded-lg bg-[color-mix(in_srgb,var(--text)_12%,transparent)] mb-1" />
          <div className="h-4 w-full rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
          <div className="h-4 w-5/6 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
          <div className="h-4 w-4/6 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
        </div>

        <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) p-6 max-[640px]:p-4 shadow-(--card-shadow) flex flex-col gap-4">
          <div className="h-7 w-56 rounded-lg bg-[color-mix(in_srgb,var(--text)_12%,transparent)] mb-1" />
          <div className="h-14 w-full rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]" />
        </div>
      </div>
    </div>
  );
}

export function CourseOverviewPage(props: CourseOverviewPageProps) {
  const { courseSlug: routeCourseSlug } = useParams();
  const courseSlug = props.courseSlug ?? routeCourseSlug;
  const serverCategories = props.categories ?? [];
  const authUser = useAuthStore((s) => s.user);
  const defaultInstructorName =
    authUser?.displayName || authUser?.username || "Instructor";

  const { data: apiOverview, isLoading: isOverviewLoading } = useCourseOverview(
    courseSlug,
    {
      enabled: !props.previewData && !props.customCourse && Boolean(courseSlug),
    },
  );

  // If previewData is provided, adapt it cleanly from persisted server state
  const adaptedFromPreview = props.previewData
    ? adaptPreviewDataToOverview(props.previewData, serverCategories, defaultInstructorName)
    : null;

  const adaptedFromOverview = apiOverview
    ? adaptCourseOverviewResponse(apiOverview, defaultInstructorName)
    : null;

  const activeAdapted = adaptedFromPreview ?? adaptedFromOverview;

  const course =
    activeAdapted?.course ??
    props.customCourse ??
    (courseSlug
      ? courses.find(
          (candidate) =>
            candidate.id === courseSlug || candidate.slug === courseSlug,
        )
      : undefined);

  if (isOverviewLoading && !course && !props.previewData && !props.customCourse) {
    return <CourseOverviewSkeleton onNavigateCourses={props.onNavigateCourses} />;
  }

  if (!course) {
    return (
      <div className="w-full max-w-275 mx-auto box-border text-(--text)">
        <div className="courses-empty">
          <BookOpen size={34} />
          <h2>Course not found</h2>
          <p>
            The course you are looking for does not exist or may have been
            removed.
          </p>
          {props.onNavigateCourses ? (
            <button type="button" onClick={props.onNavigateCourses}>
              Explore courses
            </button>
          ) : props.onNavigatePage ? (
            <button
              type="button"
              onClick={() => props.onNavigatePage?.("/courses")}
            >
              Explore courses
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <CourseOverviewContent
      {...props}
      key={course.id}
      course={course}
      courseSlug={courseSlug}
      defaultInstructorName={defaultInstructorName}
      adaptedFromPreview={activeAdapted}
    />
  );
}

type CourseOverviewContentProps = CourseOverviewPageProps & {
  course: Course;
  courseSlug: string | undefined;
  defaultInstructorName: string;
  adaptedFromPreview: AdaptedOverviewData | null;
};

function CourseOverviewContent({
  course,
  courseSlug,
  defaultInstructorName,
  adaptedFromPreview,
  onNavigateCourses,
  onNavigatePage,
  customCourse,
  customInstructor,
  customDescription,
  customShortDescription,
  customCategoryName,
  customLanguage,
  customSections,
  customIncludes,
  customInclusions,
  customPricing,
  isReadOnlyPreview = false,
}: CourseOverviewContentProps) {
  const locationHash =
    typeof window === "undefined" ? "" : window.location.hash;

  useLayoutEffect(() => {
    if (!locationHash) return undefined;

    let targetId: string;
    try {
      targetId = decodeURIComponent(locationHash.slice(1));
    } catch {
      return undefined;
    }
    if (!targetId) return undefined;

    const revealTarget = () => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    };
    revealTarget();
    const frame = window.requestAnimationFrame(revealTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [courseSlug, locationHash]);

  const title = adaptedFromPreview?.course.title ?? customCourse?.title ?? course.title;
  const thumbnail = adaptedFromPreview?.course.thumbnail ?? customCourse?.thumbnail ?? course.thumbnail;
  const shortDescription =
    adaptedFromPreview?.shortDescription ??
    customShortDescription ??
    undefined;
  const categoryName =
    adaptedFromPreview !== null
      ? adaptedFromPreview?.categoryName
      : customCategoryName ??
        (!isReadOnlyPreview && course.category ? course.category : undefined);
  const instructorName =
    adaptedFromPreview !== null
      ? adaptedFromPreview?.instructorName
      : customInstructor !== undefined
        ? customInstructor
        : defaultInstructorName;
  const language =
    adaptedFromPreview?.language ??
    customLanguage ??
    undefined;
  const courseSections =
    adaptedFromPreview?.sections ?? customSections ?? getCourseSections(course.id);
  const activeDescription = adaptedFromPreview?.description ?? customDescription;
  const activePricing = adaptedFromPreview?.pricing ?? customPricing;

  const inclusions: string[] | undefined = adaptedFromPreview
    ? adaptedFromPreview.inclusions
    : customInclusions !== undefined
      ? Array.from(
          new Set(customInclusions.map((s) => s.trim()).filter(Boolean)),
        )
      : customIncludes !== undefined
        ? Array.from(
            new Set(
              customIncludes
                .map((inc) => inc.label.trim())
                .filter(
                  (label) =>
                    !/^\d+\s+(sections|lectures)/i.test(label) &&
                    !/on-demand content/i.test(label),
                ),
            ),
          )
        : undefined;

  const [openSections, setOpenSections] = useState<Set<number>>(
    () => new Set([0]),
  );
  const [showMore, setShowMore] = useState(false);
  const [wishlisted, setWishlisted] = useState(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("veolms-wishlist") || "[]",
      );
      return Array.isArray(saved) && saved.includes(course.id);
    } catch {
      return false;
    }
  });

  const toggleSection = (index: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleWishlist = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isReadOnlyPreview) return;
    setWishlisted((prev) => {
      const next = !prev;
      try {
        const saved: unknown = JSON.parse(
          localStorage.getItem("veolms-wishlist") || "[]",
        );
        const list = Array.isArray(saved) ? (saved as string[]) : [];
        const updated = next
          ? [...list, course.id]
          : list.filter((id) => id !== course.id);
        localStorage.setItem("veolms-wishlist", JSON.stringify(updated));
      } catch {
        // best effort
      }
      return next;
    });
  };

  const categoryTopic =
    course.category && course.category.trim()
      ? course.category.toLowerCase()
      : "software";
  const aboutLead = `This course is designed to take you from the basics of ${course.title} to building complex, scalable ${categoryTopic} applications.`;
  const aboutBody = `${course.description} You'll learn core concepts, work with databases, authentication, APIs, and deploy real-world projects. Whether you're a beginner or looking to level up your ${categoryTopic} skills, this course provides practical knowledge and hands-on experience to help you build professional-grade applications.`;
  const aboutExtra = `By the end of this course, you will have built complete production-ready projects, learned testing and deployment workflows, and acquired the professional skill set needed for industry roles.`;

  return (
    <div
      data-course-overview
      className={`w-full max-w-275 mx-auto flex flex-col gap-6 box-border text-(--text) ${
        isReadOnlyPreview
          ? "p-[36px_24px_48px] max-[900px]:p-[24px_16px_48px] max-[900px]:gap-4.5 max-[640px]:p-[16px_14px_40px] max-[640px]:gap-4"
          : "max-[900px]:gap-4.5 max-[640px]:gap-4"
      }`}
    >
      {/* 1. Two-Column Hero Section with Info & Pricing on Left, Trailer on Right */}
      <CourseHeroSection
        course={course}
        title={title}
        thumbnail={thumbnail}
        wishlisted={wishlisted}
        instructorName={instructorName}
        shortDescription={shortDescription}
        categoryName={categoryName}
        language={language}
        pricing={activePricing}
        inclusions={inclusions}
        onNavigateCourses={onNavigateCourses}
        onToggleWishlist={toggleWishlist}
        onNavigatePage={onNavigatePage}
        isReadOnlyPreview={isReadOnlyPreview}
      />

      {/* 2. About This Course */}
      <CourseAboutCard
        description={activeDescription}
        aboutLead={aboutLead}
        aboutBody={aboutBody}
        aboutExtra={aboutExtra}
        showMore={showMore}
        onToggleShowMore={() => setShowMore((v) => !v)}
        isReadOnlyPreview={isReadOnlyPreview}
      />

      {/* 3. Course Curriculum */}
      <CourseCurriculumCard
        course={course}
        courseSections={courseSections}
        openSections={openSections}
        onToggleSection={toggleSection}
      />
    </div>
  );
}
