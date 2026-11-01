import { BookOpenTextIcon as BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { ConfettiIcon as Confetti } from "@phosphor-icons/react/Confetti";
import { GiftIcon as Gift } from "@phosphor-icons/react/Gift";
import { GlobeHemisphereWestIcon as GlobeHemisphereWest } from "@phosphor-icons/react/GlobeHemisphereWest";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/NotePencil";
import { SignInIcon as SignIn } from "@phosphor-icons/react/SignIn";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { ComponentType } from "react";
import type { NavigateTo } from "../routing/navigation";
import { useCapabilities } from "../services/authorization/authorization.queries";
import type { CourseEnrollmentFilter } from "./catalogue";

type EmptyStateIcon = ComponentType<{
  size?: number;
  weight?: "duotone" | "regular";
  className?: string;
  "aria-hidden"?: boolean;
}>;

interface EmptyStateCopy {
  Icon: EmptyStateIcon;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void; Icon?: EmptyStateIcon };
  /** A quieter second way on, under the main action. */
  secondary?: { label: string; onClick: () => void };
}

/**
 * Enrolled and Not Enrolled are about the visitor's own courses, so a
 * visitor who is not logged in is asked to log in there instead of being
 * shown a list (or an empty one) that cannot be theirs.
 */
export function isLoginPromptFilter(
  filter: CourseEnrollmentFilter,
  role: "student" | "creator",
  signedOut: boolean,
) {
  return (
    signedOut &&
    role === "student" &&
    (filter === "enrolled" || filter === "not-enrolled")
  );
}

/**
 * What an empty course list says: one message for each tab, and one for a
 * search that matched nothing, each pointing somewhere useful.
 */
export function CourseCatalogueEmptyState({
  enrollmentFilter,
  search,
  role,
  signedOut,
  hasCourses,
  onResetCatalogue,
  onEnrollmentFilterChange,
  onNavigatePage,
}: {
  enrollmentFilter: CourseEnrollmentFilter;
  search: string;
  role: "student" | "creator";
  signedOut: boolean;
  /** Whether the academy has any course at all for this list. */
  hasCourses: boolean;
  onResetCatalogue: () => void;
  onEnrollmentFilterChange: (filter: CourseEnrollmentFilter) => void;
  onNavigatePage: NavigateTo;
}) {
  const canCreateCourse = useCapabilities({
    enabled: role === "creator",
  }).can("course.create");
  const createCourse = canCreateCourse
    ? {
        label: "Create a course",
        onClick: () => onNavigatePage("Create Course"),
      }
    : undefined;
  const copy = getEmptyStateCopy();
  const { Icon } = copy;

  return (
    <div className="mt-6 grid min-h-90 place-items-center content-center px-6 text-center">
      <Icon
        size={34}
        // The sign-in arrow's duotone fill is a box behind the arrow that
        // reads as a stray square; it is drawn as an outline only.
        weight={Icon === SignIn ? "regular" : "duotone"}
        className="text-(--accent)"
        aria-hidden
      />
      <h2 className="mt-3 text-base font-semibold text-(--text)">
        {copy.title}
      </h2>
      <p className="mt-1.5 max-w-sm text-[0.82rem] leading-6 text-(--muted)">
        {copy.body}
      </p>
      {copy.action ? (
        <button
          type="button"
          className={`mt-4 inline-flex items-center justify-center gap-2 rounded-(--control-radius-action) bg-(--accent) font-semibold text-(--on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
            copy.secondary
              ? "mt-5 min-h-11 min-w-40 px-6 text-sm shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_55%,transparent)]"
              : "min-h-10 px-4 text-[0.8rem]"
          }`}
          data-control-radius-action
          onClick={copy.action.onClick}
        >
          {copy.action.Icon ? (
            <copy.action.Icon size={18} weight="regular" aria-hidden />
          ) : null}
          {copy.action.label}
        </button>
      ) : null}
      {copy.secondary ? (
        <p className="mt-3 text-[0.8rem] text-(--muted)">
          New here?{" "}
          <button
            type="button"
            className="font-semibold text-(--accent-ink,var(--accent)) underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            onClick={copy.secondary.onClick}
          >
            {copy.secondary.label}
          </button>
        </p>
      ) : null}
    </div>
  );

  function getEmptyStateCopy(): EmptyStateCopy {
    const browseAll = {
      label: "Browse all courses",
      onClick: onResetCatalogue,
    };
    const query = search.trim();

    if (isLoginPromptFilter(enrollmentFilter, role, signedOut)) {
      const logIn = {
        label: "Log in",
        Icon: SignIn,
        onClick: () => onNavigatePage("/login"),
      };
      const register = {
        label: "Create an account",
        onClick: () => onNavigatePage("/register"),
      };
      return enrollmentFilter === "enrolled"
        ? {
            Icon: BookOpenText,
            title: "Log in to see your courses",
            body: "The courses you've joined, and how far you've got in each, are kept with your account. Log in to pick up right where you left off.",
            action: logIn,
            secondary: register,
          }
        : {
            Icon: SignIn,
            title: "Log in to find your next course",
            body: "Once you're logged in, this tab shows the courses you haven't joined yet, so you can see what's left to explore.",
            action: logIn,
            secondary: register,
          };
    }

    if (query) {
      return {
        Icon: MagnifyingGlass,
        title: `Nothing matches “${query}”`,
        body: "Check the spelling, or try a shorter or more general word.",
        action: { label: "Clear search", onClick: onResetCatalogue },
      };
    }

    if (role === "creator") {
      if (enrollmentFilter === "published") {
        return {
          Icon: GlobeHemisphereWest,
          title: "Nothing published yet",
          body: "Once you publish a course, learners can find it and enroll. It will be listed here.",
          action: hasCourses
            ? {
                label: "See drafts",
                onClick: () => onEnrollmentFilterChange("draft"),
              }
            : undefined,
        };
      }
      if (enrollmentFilter === "draft") {
        return {
          Icon: NotePencil,
          title: "No drafts in progress",
          body: "Courses you are still working on stay here until you publish them.",
          action: createCourse,
        };
      }
      if (enrollmentFilter === "bin") {
        return {
          Icon: Trash,
          title: "The bin is empty",
          body: "Deleted courses wait here, so you can bring one back if you change your mind.",
        };
      }
      return {
        Icon: BookOpenText,
        title: "Your first course starts here",
        body: "You haven't created any courses yet. Create one and it will appear here.",
        action: createCourse,
      };
    }

    if (enrollmentFilter === "enrolled") {
      return {
        Icon: BookOpenText,
        title: "You haven't joined a course yet",
        body: "Find one you like and enroll. It will be here, ready to pick up where you left off.",
        action: hasCourses ? browseAll : undefined,
      };
    }
    if (enrollmentFilter === "not-enrolled") {
      return {
        Icon: Confetti,
        title: "You're in every course",
        body: "There is nothing new to join right now. New courses will show up here as soon as they're out.",
        action: {
          label: "Go to my courses",
          onClick: () => onEnrollmentFilterChange("enrolled"),
        },
      };
    }
    if (enrollmentFilter === "free") {
      return {
        Icon: Gift,
        title: "No free courses right now",
        body: "Free courses will appear here when they are added. Until then, have a look at the rest.",
        action: hasCourses ? browseAll : undefined,
      };
    }
    if (enrollmentFilter === "wishlist") {
      return {
        Icon: Heart,
        title: "Your wishlist is empty",
        body: "Tap the heart on any course to save it for later. It will wait for you here.",
        action: hasCourses ? browseAll : undefined,
      };
    }
    return {
      Icon: BookOpenText,
      title: "Courses are on their way",
      body: "There are no courses to show yet. Check back soon.",
    };
  }
}
