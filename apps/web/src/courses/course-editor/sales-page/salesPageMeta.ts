import type {
  CoursePageSection,
  CoursePageSectionKind,
} from "@veolms/contracts";
import { ChalkboardTeacherIcon as ChalkboardTeacher } from "@phosphor-icons/react/ChalkboardTeacher";
import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { CheckSquareIcon as CheckSquare } from "@phosphor-icons/react/CheckSquare";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { TextAlignLeftIcon as TextAlignLeft } from "@phosphor-icons/react/TextAlignLeft";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { WrenchIcon as Wrench } from "@phosphor-icons/react/Wrench";
import type { Icon } from "@phosphor-icons/react";

/** How each section is named and explained in the Sales page step. */
export const SALES_SECTION_META: Record<
  CoursePageSectionKind,
  { title: string; hint: string; Icon: Icon }
> = {
  outcomes: {
    title: "What you'll learn",
    hint: "The skills and results a student gets. Short points work best.",
    Icon: CheckSquare,
  },
  audience: {
    title: "Who it's for",
    hint: "Help the right people say yes, and the wrong ones say no.",
    Icon: UsersThree,
  },
  curriculum: {
    title: "Curriculum",
    hint: "Your sections and lessons, from the Curriculum step. Always shown.",
    Icon: ListBullets,
  },
  requirements: {
    title: "Before you start",
    hint: "What students need: tools, skills or time.",
    Icon: Wrench,
  },
  instructor: {
    title: "Your instructor",
    hint: "Your photo, name and bio, from your profile. Add a headline here.",
    Icon: ChalkboardTeacher,
  },
  testimonials: {
    title: "What students say",
    hint: "Real words from real students build trust faster than anything.",
    Icon: ChatsCircle,
  },
  about: {
    title: "About this course",
    hint: "The description from the Basics step. Always shown.",
    Icon: TextAlignLeft,
  },
  faq: {
    title: "FAQ",
    hint: "Answer the questions people ask before they buy.",
    Icon: Question,
  },
  guarantee: {
    title: "Guarantee",
    hint: "Your promise, for example a refund window. It links to your refund policy.",
    Icon: ShieldCheck,
  },
};

/** One line under a section's name: what's in it, or why it isn't shown. */
export function sectionSummary(section: CoursePageSection): string {
  const count = (lines: readonly string[]) =>
    lines.filter((line) => line.trim()).length;
  switch (section.kind) {
    case "curriculum":
    case "about":
      return "Always shown";
    case "outcomes":
    case "requirements": {
      const n = count(section.content.items);
      return n ? `${n} point${n === 1 ? "" : "s"}` : "Empty: not shown yet";
    }
    case "audience": {
      const n =
        count(section.content.forYou) + count(section.content.notForYou);
      return n ? `${n} point${n === 1 ? "" : "s"}` : "Empty: not shown yet";
    }
    case "instructor":
      return section.content.headline.trim() || "From your profile";
    case "testimonials": {
      const n = section.content.items.filter(
        (item) => item.name.trim() && item.quote.trim(),
      ).length;
      if (!n) return "Empty: not shown yet";
      return section.content.confirmedGenuine
        ? `${n} testimonial${n === 1 ? "" : "s"}`
        : "Not shown until you confirm they're real";
    }
    case "faq": {
      const n = section.content.items.filter(
        (item) => item.question.trim() && item.answer.trim(),
      ).length;
      return n ? `${n} question${n === 1 ? "" : "s"}` : "Empty: not shown yet";
    }
    case "guarantee":
      return section.content.title.trim() || section.content.text.trim()
        ? section.content.title.trim() || "Written"
        : "Empty: not shown yet";
  }
}

let idCounter = 0;
/** Ids for list items: unique within one section. */
export function newItemId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `i${Date.now().toString(36)}${idCounter.toString(36)}`;
}
