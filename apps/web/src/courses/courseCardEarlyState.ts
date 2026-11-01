import {
  COURSE_ACCESS_SESSION_KEY_PREFIX,
  ENROLLED_COURSES_SESSION_KEY_PREFIX,
  WISHLIST_SESSION_KEY_PREFIX,
} from "../store/accountBrowserState";

/**
 * Set on <html> before the first paint when this tab holds a copy of the
 * signed-in learner's enrolled courses (see
 * `services/accountSessionCopies.ts`).
 */
export const COURSE_CARDS_EARLY_ATTRIBUTE = "data-course-cards-early";

interface EarlyStateKeys {
  identityHint: string;
  enrolledPrefix: string;
  wishlistPrefix: string;
  accessPrefix: string;
  attribute: string;
  styleId: string;
}

/**
 * Runs in the document head, before the prerendered page is drawn. It is
 * embedded as text, so it reads nothing from outside itself but `keys`.
 *
 * The page is the same for everyone, so whatever depends on the viewer is
 * in it in each form it can take, and a style picks one:
 *
 * - nobody signed in: the price, the preview and the empty heart, by
 *   classes keyed on `data-session-hint` (set just before this runs);
 * - signed in, with this tab's copies (`accountSessionCopies.ts`): <html>
 *   gets the attribute and the forms a guest would see stay shown, and this
 *   style turns each course the learner holds (`data-course-card-id`) to its
 *   progress, with its figure and its button's words, and fills the heart
 *   of each course on their wishlist. On a course page the course's own
 *   access answer, when this tab has it, adds the lessons done;
 * - signed in without copies (a new tab): the placeholders stay until the
 *   page knows;
 * - in a creator's own view, nothing: their pages are not the learner's.
 */
function applyEarlyCourseState(keys: EarlyStateKeys) {
  try {
    const read = (key: string) => {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      return saved && saved.value;
    };
    const hint = JSON.parse(
      sessionStorage.getItem(keys.identityHint) || "null",
    );
    const userId = hint && hint.userId;
    if (!userId) return;
    if (
      localStorage.getItem("veolms-role-" + userId) === "creator" &&
      localStorage.getItem("veolms-learner-view") !== "1"
    ) {
      return;
    }
    const enrolled = read(keys.enrolledPrefix + userId);
    const enrolledCourses: unknown[] | null =
      enrolled && Array.isArray(enrolled.courses) ? enrolled.courses : null;
    // A course page: its own access answer, if this tab has it, is the
    // latest word on this course, and enough to draw it without the list.
    const page = /^\/courses\/([^/]+)\/overview\/?$/.exec(location.pathname);
    const access =
      page && page[1]
        ? read(keys.accessPrefix + userId + ":" + decodeURIComponent(page[1]))
        : null;
    // Without the list, nothing is known of any other course: leave them
    // to their placeholders.
    if (!enrolledCourses && !access) return;

    const root = ":root[" + keys.attribute + "][" + keys.attribute + "] ";
    const validId = (id: unknown): id is string =>
      typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
    const card = (id: string) => '[data-course-card-id="' + id + '"]';
    const show = (id: string, part: string, display: string) =>
      root + card(id) + " " + part + "{display:" + display + "!important}";
    const percentText = (value: number) =>
      value >= 100 ? "100%" : value.toFixed(2) + "%";
    let rules = "";

    // What a held course shows: its progress figure and bar, and "Start",
    // "Continue" or "Review" on its button.
    const held = (
      id: string,
      progress: number,
      started: boolean,
      lessons: string | null,
    ) => {
      const percent = Math.min(
        100,
        Math.max(0, Math.round(progress * 100) / 100),
      );
      const label =
        percent >= 100
          ? "review"
          : started || percent > 0
            ? "continue"
            : "start";
      rules +=
        card(id) +
        "{--course-card-early-progress:" +
        percent +
        "%;" +
        '--course-card-early-progress-text:"' +
        percentText(percent) +
        '"' +
        (lessons ? ';--course-early-lessons:"' + lessons + '"' : "") +
        (percent >= 100
          ? ";--course-early-fill:linear-gradient(to right in oklab,var(--color-emerald-500),var(--color-emerald-400))"
          : "") +
        "}" +
        show(id, "[data-course-card-early=offer]", "none") +
        show(id, "[data-course-card-early=held]", "block") +
        show(id, "[data-course-card-early-label]", "none") +
        show(id, "[data-course-card-early-label=" + label + "]", "contents") +
        show(
          id,
          "[data-course-early-complete]",
          percent >= 100 ? "inline" : "none",
        ) +
        show(id, "[data-course-early-lessons]", lessons ? "contents" : "none") +
        (started || percent > 0
          ? root +
            card(id) +
            " [data-course-card-early=held] [data-course-card-progress-fill]{min-width:0.375rem}" +
            root +
            card(id) +
            " [data-course-card-early=held] [data-course-early-overview-fill]{min-width:0.625rem}"
          : "");
    };
    // A course the learner does not hold: its guest parts keep their own
    // display (the band, a pill, a heart: each its own), only the held
    // band is put away.
    const offered = (id: string) =>
      show(id, "[data-course-card-early=held]", "none");

    for (const course of (enrolledCourses ?? []) as {
      courseId?: unknown;
      progress?: unknown;
      lastAccessedAt?: unknown;
    }[]) {
      if (!course || !validId(course.courseId)) continue;
      held(
        course.courseId,
        Number(course.progress) || 0,
        (Number(course.progress) || 0) > 0 || Boolean(course.lastAccessedAt),
        null,
      );
    }

    const wishlist = read(keys.wishlistPrefix + userId);
    if (wishlist && Array.isArray(wishlist.items)) {
      for (const item of wishlist.items) {
        if (!item || !validId(item.courseId)) continue;
        rules +=
          show(item.courseId, "[data-course-early-heart=empty]", "none") +
          show(item.courseId, "[data-course-early-heart=filled]", "flex");
      }
    }

    // The course page's own answer comes last, so its rules win.
    if (access && validId(access.courseId)) {
      if (access.enrolled && access.progress) {
        const resume = access.resume;
        const lessons =
          resume && typeof resume.totalLessons === "number"
            ? resume.completedLessons +
              " of " +
              resume.totalLessons +
              " lesson" +
              (resume.totalLessons === 1 ? "" : "s")
            : null;
        held(
          access.courseId,
          Number(access.progress.percent) || 0,
          Boolean(access.progress.started) ||
            (resume && resume.completedLessons > 0),
          lessons,
        );
      } else if (!access.enrolled) {
        rules += offered(access.courseId);
      }
    }

    const style = document.createElement("style");
    style.id = keys.styleId;
    style.textContent = rules;
    document.head.appendChild(style);
    document.documentElement.setAttribute(keys.attribute, "");
  } catch {
    // Without the copies the page shows its placeholders, as before.
  }
}

export const getCourseCardsEarlyStateBootstrapScript = () =>
  `(${applyEarlyCourseState.toString()})(${JSON.stringify({
    identityHint: "veolms-auth-identity",
    enrolledPrefix: ENROLLED_COURSES_SESSION_KEY_PREFIX,
    wishlistPrefix: WISHLIST_SESSION_KEY_PREFIX,
    accessPrefix: COURSE_ACCESS_SESSION_KEY_PREFIX,
    attribute: COURSE_CARDS_EARLY_ATTRIBUTE,
    styleId: "course-cards-early-state",
  } satisfies EarlyStateKeys)});`;
