import { Bell } from "@phosphor-icons/react/Bell";
import { BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChartBar } from "@phosphor-icons/react/ChartBar";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { GearSix } from "@phosphor-icons/react/GearSix";
import { PlusCircle } from "@phosphor-icons/react/PlusCircle";
import { SignOut } from "@phosphor-icons/react/SignOut";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { Star } from "@phosphor-icons/react/Star";
import { Tote } from "@phosphor-icons/react/Tote";
import { Users } from "@phosphor-icons/react/Users";
import type { ComponentType } from "react";
import type { CourseRole } from "./catalogue";

type PlaceholderIcon = ComponentType<{ size?: number; weight?: "duotone" }>;

interface PlaceholderContent {
  title: string;
  description: string;
  message: string;
  icon: PlaceholderIcon;
}

const placeholderContent: Record<string, PlaceholderContent > = {
  "Create Course": {
    title: "Create Course",
    description: "Create and publish a new course for your academy.",
    message: "Course creation is not implemented yet.",
    icon: PlusCircle,
  },
  "Course Overview": {
    title: "Course Overview",
    description: "Course information and curriculum will appear here.",
    message: "The course overview is yet to be designed.",
    icon: BookOpen,
  },
  Students: {
    title: "Students",
    description: "Review learners, access, and progress across your academy.",
    message: "Student management is not implemented yet.",
    icon: Users,
  },
  Reviews: {
    title: "Reviews",
    description: "Keep an eye on learner feedback and course sentiment.",
    message: "Reviews are not implemented yet.",
    icon: Star,
  },
  Discussions: {
    title: "Discussions",
    description: "Bring course conversations, questions, and replies together.",
    message: "Discussions are not implemented yet.",
    icon: ChatCircleDots,
  },
  Analytics: {
    title: "Analytics",
    description:
      "Understand learning activity, engagement, and academy performance.",
    message: "Analytics are not implemented yet.",
    icon: ChartBar,
  },
  Orders: {
    title: "Orders",
    description: "Review purchases, refunds, and commerce activity.",
    message: "Order management is not implemented yet.",
    icon: Tote,
  },
  Messages: {
    title: "Messages",
    description: "Manage direct communication with your learners.",
    message: "Messages are not implemented yet.",
    icon: EnvelopeSimple,
  },
  "Order History": {
    title: "Order History",
    description: "Review your academy purchases and payment activity.",
    message: "Order history is not implemented yet.",
    icon: Tote,
  },
  Notifications: {
    title: "Notifications",
    description: "See important updates about your learning journey.",
    message: "Notifications are not implemented yet.",
    icon: Bell,
  },
  Settings: {
    title: "Settings",
    description: "Manage your profile, preferences, and academy workspace.",
    message: "Settings are not implemented yet.",
    icon: GearSix,
  },
  Logout: {
    title: "Sign out",
    description:
      "Your sign-out flow will live here when account sessions are connected.",
    message: "Sign out is not implemented yet.",
    icon: SignOut,
  },
};

export interface PlaceholderPageProps {
  section?: string;
  role: CourseRole;
}

export function PlaceholderPage({
  section = "This page",
  role,
}: PlaceholderPageProps) {
  const content = placeholderContent[section] || {
    title: section,
    description: "This workspace is ready for the next VeoLMS feature.",
    message: `${section} is not implemented yet.`,
    icon: Sparkle,
  };
  const Icon = content.icon;

  return (
    <div
      className={`courses-placeholder-page${section === "Logout" ? " courses-placeholder-page--logout" : ""}`}
      aria-labelledby="placeholder-page-title"
    >
      <header className="courses-placeholder-heading">
        <div>
          <p className="courses-placeholder-eyebrow">
            {role === "creator" ? "Creator workspace" : "Student workspace"}
          </p>
          <h1 id="placeholder-page-title">{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <span className="courses-placeholder-heading-icon" aria-hidden="true">
          <Icon size={26} weight="duotone" />
        </span>
      </header>

      <section
        className="courses-placeholder-empty"
        aria-label={`${content.title} placeholder`}
      >
        <span className="courses-placeholder-empty-icon" aria-hidden="true">
          <Icon size={34} weight="duotone" />
        </span>
        <h2>Nothing here yet</h2>
        <p>
          {content.message} This placeholder keeps the navigation path ready
          while the feature is being built.
        </p>
      </section>
    </div>
  );
}
