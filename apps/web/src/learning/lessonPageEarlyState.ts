import {
  COURSE_ACCESS_SESSION_KEY_PREFIX,
  LESSON_DISCUSSION_COUNTS_SESSION_KEY_PREFIX,
} from "../store/accountBrowserState";
import { LESSON_EARLY_STATE_GLOBAL } from "../store/lessonEarlyState";
import { LEARNING_PROGRESS_STORAGE_PREFIX } from "./learningProgressStorage";

/**
 * Set on <html> by the head's script below, naming what it drew the page
 * from: "progress", "access", "counts", in that order, those it found.
 */
export const LESSON_EARLY_STATE_ATTRIBUTE = "data-lesson-early-state";

/** The same rule as the lesson card's: this much watched is finished. */
const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;
/** How old a copy in session storage may be (see accountSessionCopies). */
const KEPT_MS = 7 * 24 * 60 * 60 * 1000;

interface LessonEarlyStateKeys {
  identityHint: string;
  progressPrefix: string;
  accessPrefix: string;
  countsPrefix: string;
  attribute: string;
  completeThreshold: number;
  keptMs: number;
  /** Where what was read is left for the app (store/lessonEarlyState.ts). */
  global: string;
}

/**
 * Runs in the document's head, before a lesson page is drawn. It is
 * embedded as text, so it reads nothing from outside itself but `keys`.
 *
 * A lesson page is built for nobody in particular: every lesson open, none
 * finished, the course at 0%, "Discussions" with no count. The browser has
 * the signed-in learner's own answers from the last time: their progress in
 * the course (localStorage, `learningProgressStorage.ts`), the course's
 * access answer and the lesson's discussion counts (this tab's session
 * storage, `services/accountSessionCopies.ts`). This script writes those
 * into the page as the browser reads it, before anything is drawn: the tick
 * and "41% complete" on each lesson card, each section's "4/13" and its
 * line of progress, the course's progress under its title, which lessons
 * are locked, and the discussions count.
 *
 * It changes only text and attributes of elements the markup has for every
 * state (the lesson card, Curriculum.tsx and ThreadSurface.tsx say which),
 * never the elements themselves. When the page's scripts run, the first
 * render reads the very same copies (`readAccountCopy`,
 * `useLearningProgress`, `useRememberedAccount`) and comes to the same
 * text and attributes, so React takes the page over as it stands and
 * nothing on it moves; whatever has changed on the server since is brought
 * in afterwards, as usual. The two must be kept in step: a text that
 * differs makes React throw the page away and draw it again. So what is
 * read here is left for the app as it was read (`keys.global`, see
 * store/lessonEarlyState.ts): another tab playing the course writes the
 * progress copy every few seconds, and the first render, a second or more
 * later, read a newer copy than the page had been drawn from.
 *
 * Nothing here opens a lesson: what plays is still decided by the server.
 * A guest (no account remembered in this tab) is left the page as built,
 * and so is a card whose copies say nothing.
 */
function applyLessonPageEarlyState(keys: LessonEarlyStateKeys) {
  try {
    const match = /^\/learn\/([^/]+)/.exec(location.pathname);
    if (!match || !match[1]) return;
    const hint = JSON.parse(
      sessionStorage.getItem(keys.identityHint) || "null",
    );
    const userId: unknown = hint && hint.userId;
    if (typeof userId !== "string" || !userId) return;
    let courseSlug: string;
    try {
      courseSlug = decodeURIComponent(match[1]);
    } catch {
      return;
    }
    const now = Date.now();
    const clamp = (value: number) => Math.max(0, Math.min(100, value));
    const record: {
      userId: string;
      courseSlug: string;
      progress: string | null;
      copies: Record<string, { value: unknown; savedAt: number } | null>;
    } = { userId, courseSlug, progress: null, copies: {} };
    (window as unknown as Record<string, unknown>)[keys.global] = record;
    const readCopy = (key: string): unknown => {
      record.copies[key] = null;
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (!saved || typeof saved !== "object") return undefined;
      const age = now - saved.savedAt;
      if (typeof saved.savedAt !== "number" || age < 0 || age > keys.keptMs) {
        return undefined;
      }
      record.copies[key] = { value: saved.value, savedAt: saved.savedAt };
      return saved.value;
    };
    const setFlag = (element: Element, name: string, on: boolean) => {
      // As React writes a `true` it is given.
      if (on) element.setAttribute(name, "true");
      else element.removeAttribute(name);
    };
    // Written only when it differs: a text node put in anew is a change
    // the observer below is told of, and would be filled again, without end.
    const setText = (element: Element, text: string) => {
      if (element.textContent !== text) element.textContent = text;
    };

    // The learner's progress, by lesson number: the highest figure held for
    // each (`getLearningProgressMap`, after `normalizeState`). Held at all
    // (the key exists, empty or not) is what says it is known.
    const progressKey =
      keys.progressPrefix +
      ":" +
      encodeURIComponent(userId) +
      ":" +
      encodeURIComponent(courseSlug);
    const progressRaw = localStorage.getItem(progressKey);
    record.progress = progressRaw;
    const progressHeld = progressRaw !== null;
    const progress: Record<number, number> = {};
    if (progressHeld) {
      const parsed = JSON.parse(progressRaw || "null");
      if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
        const byKey = new Map<
          string,
          { lessonNumber: number; percent: number }
        >();
        for (const item of parsed.items as Record<string, unknown>[]) {
          if (!item || typeof item !== "object") continue;
          const lessonNumber = item.lessonNumber;
          const lessonId = item.lessonId;
          if (
            (!lessonId || typeof lessonId !== "string") &&
            (!Number.isInteger(lessonNumber) || (lessonNumber as number) < 1)
          ) {
            continue;
          }
          if (
            !Number.isInteger(lessonNumber) ||
            (lessonNumber as number) < 1 ||
            typeof item.progressPercent !== "number" ||
            !Number.isFinite(item.progressPercent) ||
            typeof item.clientUpdatedAt !== "string"
          ) {
            continue;
          }
          byKey.set(
            typeof lessonId === "string" && lessonId
              ? lessonId
              : "number:" + lessonNumber,
            {
              lessonNumber: lessonNumber as number,
              percent: clamp(Math.round(item.progressPercent)),
            },
          );
        }
        // The last 500 only, as the store keeps them.
        for (const { lessonNumber, percent } of [...byKey.values()].slice(
          -500,
        )) {
          progress[lessonNumber] = Math.max(
            progress[lessonNumber] ?? 0,
            percent,
          );
        }
      }
    }
    const percentOf = (lessonNumber: number) => {
      const stored = progress[lessonNumber];
      return typeof stored === "number" ? clamp(stored) : 0;
    };

    // The course's access answer: whether every lesson opens to this
    // learner (`useLessonAccess`).
    const access = readCopy(keys.accessPrefix + userId + ":" + courseSlug) as
      Record<string, unknown> | undefined;
    const accessKnown = Boolean(
      access &&
      typeof access.courseId === "string" &&
      typeof access.enrolled === "boolean",
    );
    const opensEveryLesson = accessKnown && access!.access === "full";
    const firstLessonOpen = accessKnown && access!.firstLessonOpen === true;
    let firstLessonNumber = Infinity;

    const applied: string[] = [];
    if (progressHeld) applied.push("progress");
    if (accessKnown) applied.push("access");

    const filled = new WeakSet<Element>();
    const fillCard = (card: Element) => {
      const lessonNumber = Number(card.getAttribute("data-lesson-number"));
      if (!Number.isInteger(lessonNumber) || lessonNumber < 1) return;
      filled.add(card);
      if (accessKnown) {
        const locked =
          !opensEveryLesson &&
          !card.hasAttribute("data-preview") &&
          !(firstLessonOpen && lessonNumber === firstLessonNumber);
        setFlag(card, "data-locked", locked);
      }
      if (!progressHeld) return;
      const percent = percentOf(lessonNumber);
      const completed = percent >= keys.completeThreshold;
      const watched = completed ? 100 : percent;
      setFlag(card, "data-completed", completed);
      setFlag(card, "data-in-progress", !completed && watched > 0);
      const watchedText = card.querySelector("[data-lesson-watched]");
      if (watchedText) setText(watchedText, Math.round(watched) + "% complete");
    };

    const rangeOf = (section: Element): [number, number] | null => {
      const range = /^(\d+)-(\d+)$/.exec(
        section.getAttribute("data-lesson-range") || "",
      );
      return range ? [Number(range[1]), Number(range[2])] : null;
    };
    const fillSection = (section: Element) => {
      if (!progressHeld) return;
      const range = rangeOf(section);
      if (!range) return;
      const count = range[1] - range[0] + 1;
      let completedCount = 0;
      for (let number = range[0]; number <= range[1]; number += 1) {
        if (percentOf(number) >= keys.completeThreshold) completedCount += 1;
      }
      const complete = count > 0 && completedCount === count;
      setFlag(section, "data-section-complete", complete);
      const heading = section.querySelector(
        ":scope > .learning-curriculum__section-toggle",
      );
      if (!heading) return;
      heading
        .querySelectorAll("[data-curriculum-section-count]")
        .forEach((count_) => setText(count_, completedCount + "/" + count));
      const spoken = heading.querySelector("[data-curriculum-section-spoken]");
      if (spoken) {
        setText(spoken, completedCount + " of " + count + " lessons completed");
      }
      const bar = heading.querySelector<HTMLElement>(
        "[data-curriculum-progress-bar]",
      );
      if (bar) {
        const open = section.getAttribute("data-expanded") === "true";
        if (open || (completedCount > 0 && !complete)) {
          bar.removeAttribute("hidden");
        } else {
          bar.setAttribute("hidden", "");
        }
        const fill = bar.firstElementChild as HTMLElement | null;
        if (fill) {
          fill.style.width =
            clamp(count > 0 ? (completedCount / count) * 100 : 0) + "%";
        }
      }
    };

    const fillCourse = (row: Element) => {
      if (!progressHeld) return;
      const total = Number(row.getAttribute("data-lesson-count"));
      const track = row.querySelector<HTMLElement>("[role=progressbar]");
      const text = row.querySelector("[data-curriculum-course-progress-text]");
      if (!Number.isInteger(total) || !track || !text) return;
      filled.add(row);
      let sum = 0;
      let started = false;
      for (let number = 1; number <= total; number += 1) {
        sum += percentOf(number);
        if (typeof progress[number] === "number") started = true;
      }
      // `roundCourseProgress` and `formatCourseProgress`.
      const raw = total > 0 ? sum / total : 0;
      const percent = Number.isFinite(raw)
        ? Math.min(100, Math.max(0, Math.round(raw * 100) / 100))
        : 0;
      row.removeAttribute("data-progress-pending");
      track.removeAttribute("aria-busy");
      track.setAttribute(
        "aria-label",
        "Course progress: " + percent + " percent",
      );
      track.setAttribute("aria-valuenow", String(percent));
      const fill = track.firstElementChild as HTMLElement | null;
      if (fill) {
        fill.style.width = percent + "%";
        fill.style.minWidth = started ? "0.375rem" : "";
      }
      setText(text, percent >= 100 ? "100%" : percent.toFixed(2) + "%");
    };

    let countsApplied = false;
    const fillCount = (slot: Element) => {
      const [courseId, lessonId, field, ...rest] = (
        slot.getAttribute("data-discussion-count") || ""
      ).split(":");
      const number = slot.firstElementChild;
      if (!courseId || !lessonId || !field || rest.length > 0 || !number) {
        return;
      }
      filled.add(slot);
      const counts = readCopy(
        keys.countsPrefix + userId + ":" + courseId + ":" + lessonId,
      ) as Record<string, unknown> | undefined;
      if (!counts || typeof counts.total !== "number") return;
      const value = counts[field];
      if (typeof value !== "number") return;
      setText(number, String(value));
      slot.removeAttribute("data-count-pending");
      if (!countsApplied) {
        countsApplied = true;
        applied.push("counts");
        root.setAttribute(keys.attribute, applied.join(" "));
      }
    };

    const root = document.documentElement;
    if (applied.length === 0) {
      // Only the count can still be drawn; the cards stay as built.
      if (!root.hasAttribute(keys.attribute)) {
        const observeCount = () => {
          const slot = document.querySelector("[data-discussion-count]");
          if (slot && !filled.has(slot)) fillCount(slot);
          return slot && filled.has(slot);
        };
        if (!observeCount()) {
          const observer = new MutationObserver(() => {
            if (observeCount()) observer.disconnect();
          });
          observer.observe(root, { childList: true, subtree: true });
          document.addEventListener("DOMContentLoaded", () => {
            observeCount();
            observer.disconnect();
          });
        }
      }
      return;
    }
    root.setAttribute(keys.attribute, applied.join(" "));

    const fillAll = () => {
      const sections = document.querySelectorAll(
        ".learning-curriculum .learning-curriculum__section[data-lesson-range]",
      );
      // The course's first lesson: the lowest number any section starts at.
      sections.forEach((section) => {
        const range = rangeOf(section);
        if (range && range[0] < firstLessonNumber) firstLessonNumber = range[0];
      });
      if (firstLessonNumber === Infinity) firstLessonNumber = 1;
      // A section's heading is read in parts; it is filled again on each
      // pass until the document is complete (cheap: a few dozen).
      sections.forEach(fillSection);
      document
        .querySelectorAll(".learning-curriculum [data-curriculum-lesson-card]")
        .forEach((card) => {
          if (!filled.has(card)) fillCard(card);
        });
      const course = document.querySelector(
        ".learning-curriculum [data-curriculum-course-progress]",
      );
      if (course && !filled.has(course)) fillCourse(course);
      const count = document.querySelector("[data-discussion-count]");
      if (count && !filled.has(count)) fillCount(count);
    };

    // As the page is read: a MutationObserver's callback runs after each
    // part the parser adds and before that part is drawn. It stops when
    // the document is complete; what the app adds after is its own.
    fillAll();
    const observer = new MutationObserver(fillAll);
    observer.observe(root, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => {
      observer.disconnect();
      fillAll();
    });
  } catch {
    // The page shows the learner's state once its scripts run, as before.
  }
}

/** Runs from the document's head (see root.tsx), before curriculumEarlyScroll. */
export const getLessonPageEarlyStateScript = () =>
  `(${applyLessonPageEarlyState.toString()})(${JSON.stringify({
    identityHint: "veolms-auth-identity",
    progressPrefix: LEARNING_PROGRESS_STORAGE_PREFIX,
    accessPrefix: COURSE_ACCESS_SESSION_KEY_PREFIX,
    countsPrefix: LESSON_DISCUSSION_COUNTS_SESSION_KEY_PREFIX,
    attribute: LESSON_EARLY_STATE_ATTRIBUTE,
    completeThreshold: LESSON_PROGRESS_COMPLETE_THRESHOLD,
    keptMs: KEPT_MS,
    global: LESSON_EARLY_STATE_GLOBAL,
  } satisfies LessonEarlyStateKeys)});`;
