import { BookOpenTextIcon as BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { BugIcon as Bug } from "@phosphor-icons/react/Bug";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { CreditCardIcon as CreditCard } from "@phosphor-icons/react/CreditCard";
import { DotsThreeCircleIcon as DotsThreeCircle } from "@phosphor-icons/react/DotsThreeCircle";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { LightbulbIcon as Lightbulb } from "@phosphor-icons/react/Lightbulb";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/LockKey";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { SealQuestionIcon as SealQuestion } from "@phosphor-icons/react/SealQuestion";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import type { Icon } from "@phosphor-icons/react";
import type {
  SupportTicketCategory,
  SupportTicketKind,
  SupportTicketStatus,
} from "@veolms/contracts";

export interface SupportCategoryInfo {
  label: string;
  /** A shorter name for chips and lists. */
  short: string;
  icon: Icon;
  color: string;
  placeholder: string;
}

export const SUPPORT_CATEGORIES: Record<
  SupportTicketCategory,
  SupportCategoryInfo
> = {
  video: {
    label: "Video or playback",
    short: "Video",
    icon: PlayCircle,
    color: "#60a5fa",
    placeholder:
      "Which lesson, and what happens? A time in the video helps us find it.",
  },
  access: {
    label: "Course access",
    short: "Access",
    icon: LockKey,
    color: "#fbbf24",
    placeholder: "Which course, and what do you see instead of the lessons?",
  },
  payment: {
    label: "Payment or billing",
    short: "Payment",
    icon: CreditCard,
    color: "#fb923c",
    placeholder:
      "What happened with the payment? Your order number or UPI reference helps.",
  },
  account: {
    label: "Login or account",
    short: "Account",
    icon: UserCircle,
    color: "#2dd4bf",
    placeholder: "What happens when you try to sign in or change your account?",
  },
  bug: {
    label: "Something's broken",
    short: "Bug",
    icon: Bug,
    color: "#f472b6",
    placeholder: "What happened? What did you expect to happen instead?",
  },
  other: {
    label: "Something else",
    short: "Other",
    icon: DotsThreeCircle,
    color: "#a7b0c5",
    placeholder: "Tell us what's wrong and we'll look into it.",
  },
  post: {
    label: "A post or comment",
    short: "Post",
    icon: ChatCircleDots,
    color: "#f87171",
    placeholder:
      "Why should the team look at this post? Spam, abuse, wrong information…",
  },
  idea: {
    label: "Idea or suggestion",
    short: "Idea",
    icon: Lightbulb,
    color: "#fbbf24",
    placeholder: "What would make ProCodrr better for you?",
  },
  like: {
    label: "Something I like",
    short: "Like",
    icon: Heart,
    color: "#f0729a",
    placeholder: "What do you enjoy? We'd love to do more of it.",
  },
  confusing: {
    label: "Confusing or hard to use",
    short: "Confusing",
    icon: SealQuestion,
    color: "#2dd4bf",
    placeholder: "What was confusing, and where?",
  },
  content: {
    label: "Course content",
    short: "Content",
    icon: BookOpenText,
    color: "#a9b4ff",
    placeholder: "Which lesson, and what could be clearer or added?",
  },
};

export const PROBLEM_CATEGORY_ORDER = [
  "video",
  "access",
  "payment",
  "account",
  "bug",
  "other",
  "post",
] as const satisfies readonly SupportTicketCategory[];

export const FEEDBACK_CATEGORY_ORDER = [
  "idea",
  "like",
  "confusing",
  "content",
] as const satisfies readonly SupportTicketCategory[];

export interface SupportStatusInfo {
  /** As the learner reads it. */
  label: string;
  /** As the team reads it. */
  staffLabel: string;
  dot: string;
  chip: string;
}

export const SUPPORT_STATUSES: Record<SupportTicketStatus, SupportStatusInfo> =
  {
    open: {
      label: "Open",
      staffLabel: "Open",
      dot: "bg-(--accent)",
      chip: "bg-(--accent)/14 text-(--accent)",
    },
    in_progress: {
      label: "In progress",
      staffLabel: "In progress",
      dot: "bg-amber-400",
      chip: "bg-amber-400/14 text-amber-600 [:root[data-theme=dark]_&]:text-amber-300",
    },
    waiting: {
      label: "Waiting on you",
      staffLabel: "Waiting on student",
      dot: "bg-teal-400",
      chip: "bg-teal-400/14 text-teal-700 [:root[data-theme=dark]_&]:text-teal-300",
    },
    resolved: {
      label: "Resolved",
      staffLabel: "Resolved",
      dot: "bg-emerald-400",
      chip: "bg-emerald-400/14 text-emerald-700 [:root[data-theme=dark]_&]:text-emerald-300",
    },
    new: {
      label: "Sent",
      staffLabel: "New",
      dot: "bg-(--accent)",
      chip: "bg-(--accent)/14 text-(--accent)",
    },
    reviewed: {
      label: "Read by the team",
      staffLabel: "Reviewed",
      dot: "bg-slate-400",
      chip: "bg-slate-400/16 text-(--text-secondary)",
    },
    planned: {
      label: "Planned",
      staffLabel: "Planned",
      dot: "bg-emerald-400",
      chip: "bg-emerald-400/14 text-emerald-700 [:root[data-theme=dark]_&]:text-emerald-300",
    },
  };

export const PROBLEM_STATUS_ORDER = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
] as const satisfies readonly SupportTicketStatus[];

export const FEEDBACK_STATUS_ORDER = [
  "new",
  "reviewed",
  "planned",
] as const satisfies readonly SupportTicketStatus[];

export const SUPPORT_RATINGS = [
  { value: 1, label: "Terrible", color: "#f87171" },
  { value: 2, label: "Bad", color: "#fb923c" },
  { value: 3, label: "Okay", color: "#fbbf24" },
  { value: 4, label: "Good", color: "#a3e635" },
  { value: 5, label: "Love it", color: "#4ade80" },
] as const;

const MOUTHS: Record<number, string> = {
  1: "M8 17c1.2-1.7 2.5-2.4 4-2.4s2.8.7 4 2.4",
  2: "M8.6 16.4c1-.6 2.1-.9 3.4-.9s2.4.3 3.4.9",
  3: "M8.6 15.5h6.8",
  4: "M8.6 14.4c1 1.1 2.1 1.6 3.4 1.6s2.4-.5 3.4-1.6",
  5: "M7.6 13.4c1.2 2 2.7 3 4.4 3s3.2-1 4.4-3z",
};

/** A face for a 1-5 rating, drawn in the current text colour. */
export function RatingFace({
  rating,
  size = 28,
  className = "",
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8.6 10h.01M15.4 10h.01" strokeWidth={2.6} />
      <path d={MOUTHS[rating] ?? MOUTHS[3]} />
    </svg>
  );
}

export function supportKindLabel(kind: SupportTicketKind): string {
  return kind === "problem" ? "Problem report" : "Feedback";
}

/** The round, tinted icon of a category. */
export function CategoryBadge({
  category,
  size = "md",
}: {
  category: SupportTicketCategory;
  size?: "sm" | "md" | "lg";
}) {
  const info = SUPPORT_CATEGORIES[category];
  const CategoryIcon = info.icon;
  const box =
    size === "lg"
      ? "size-12 rounded-2xl"
      : size === "sm"
        ? "size-8 rounded-lg"
        : "size-10 rounded-xl";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${box}`}
      style={{
        color: info.color,
        backgroundColor: `color-mix(in srgb, ${info.color} 15%, transparent)`,
      }}
      aria-hidden="true"
    >
      <CategoryIcon
        size={size === "lg" ? 24 : size === "sm" ? 17 : 20}
        weight="duotone"
      />
    </span>
  );
}

export function StatusChip({
  status,
  staff = false,
}: {
  status: SupportTicketStatus;
  staff?: boolean;
}) {
  const info = SUPPORT_STATUSES[status];
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ${info.chip}`}
    >
      <span
        className={`size-1.5 rounded-full ${info.dot}`}
        aria-hidden="true"
      />
      {staff ? info.staffLabel : info.label}
    </span>
  );
}
