import { CalendarCheckIcon as CalendarCheck } from "@phosphor-icons/react/CalendarCheck";
import { CertificateIcon as Certificate } from "@phosphor-icons/react/Certificate";
import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DevicesIcon as Devices } from "@phosphor-icons/react/Devices";
import { MonitorPlayIcon as MonitorPlay } from "@phosphor-icons/react/MonitorPlay";
import type { Icon } from "@phosphor-icons/react";

/** One line of "This course includes" in the price card. */
export interface CoursePurchasePerk {
  title: string;
  /** A quieter line under the title. */
  detail?: string;
  icon: Icon;
  /**
   * The icon's colour; its square is a soft tint of the same. From the
   * sidebar's palette (`shell/navigation.ts`); Discussions keeps its green.
   */
  tone: string;
}

/** The green box under the list, for a course that is paid for. */
export interface CoursePurchaseGuarantee {
  title: string;
  detail: string;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * What the price card says comes with a course, under the button: the
 * terms every course has (the user's list, 2026-10-16), the course's own
 * figures, then whatever the course's editor added under "includes",
 * without repeating a line. Kept to a handful so the card still fits a
 * laptop's height in the column beside the curriculum, where it sticks.
 */
export function getCoursePurchasePerks({
  duration,
  lessons,
  sections,
  courseIncludes = [],
}: {
  duration?: string;
  lessons: number;
  sections: number;
  courseIncludes?: readonly string[];
}): CoursePurchasePerk[] {
  const contents = [
    lessons > 0 ? plural(lessons, "lesson") : null,
    sections > 0 ? `in ${plural(sections, "section")}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const standard: CoursePurchasePerk[] = [
    {
      title: "3 years of access",
      detail: "Watch every lesson as often as you like",
      icon: CalendarCheck,
      tone: "#5da9ff",
    },
    {
      title: duration ? `${duration} of on-demand video` : "On-demand video",
      detail: contents ? `${contents}, at your pace` : "Learn at your own pace",
      icon: MonitorPlay,
      tone: "#f472b6",
    },
    {
      title: "Certificate of completion",
      detail: "Yours once you finish the course",
      icon: Certificate,
      tone: "#fbbf24",
    },
    {
      title: "Doubt support in Discussions",
      detail: "Ask under any lesson and get answers",
      icon: ChatsCircle,
      tone: "#4ade80",
    },
    {
      title: "Smooth player on any device",
      detail: "Phone, tablet or laptop, no distractions",
      icon: Devices,
      tone: "#a16cff",
    },
  ];
  const seen = new Set(standard.map(({ title }) => title.toLowerCase()));
  const own = courseIncludes
    .map((title) => title.trim())
    .filter((title) => {
      const key = title.toLowerCase();
      if (!title || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((title) => ({ title, icon: CheckCircle, tone: "#2dd4bf" }));
  return [...standard, ...own];
}

export const coursePurchaseGuarantee: CoursePurchaseGuarantee = {
  title: "30-day money-back guarantee",
  detail: "Not the right fit? Get a full refund within 30 days.",
};

/** Said under the button of a course that is paid for. */
export const coursePurchaseCheckoutNote =
  "Secure checkout · UPI, cards, net banking";
