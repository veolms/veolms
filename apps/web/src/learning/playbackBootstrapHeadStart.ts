import {
  LEARNER_VIEW_HEADER,
  LEARNER_VIEW_HEADER_VALUE,
} from "@veolms/contracts/learner-view";
import { PLAYBACK_BOOTSTRAP_SESSION_KEY_PREFIX } from "../store/accountBrowserState";
import {
  LEARNING_COURSE_SLUG_META_NAME,
  LEARNING_LESSON_NUMBER_META_NAME,
} from "./learningHlsBootstrap";

/**
 * The lesson's playback answer (the video's manifest, inline, and the token
 * its segments are fetched with), asked for from the document's head.
 *
 * The page's own code asked for it only once its modules had arrived and
 * run; on a lesson page that is the whole learning bundle, and on
 * production the request left 1.5 to 2.3 s after the page did. Nothing in
 * the request needs that code: the address names the course and the lesson,
 * the cookie says who is asking, and the Student view is a flag the browser
 * keeps. So a script in the head sends it as the browser reads the page, and
 * `getVideoPlaybackBootstrap` takes that request over instead of sending its
 * own (`takeHeadStartedPlaybackBootstrap`).
 *
 * The answer is also kept in the tab (`keepPlaybackBootstrap`), and a reload
 * while its token is still good for a while is answered from that copy
 * without asking at all. Kept per account (the identity this tab remembers,
 * or "guest") and per view; forgotten with the session
 * (`isAccountSessionStorageKey`).
 */

/** A token with less than this left is not used again: it is asked for. */
const KEPT_TOKEN_MARGIN_SECONDS = 120;
/** How long an answer without a token (an open lesson) is kept. */
const KEPT_WITHOUT_TOKEN_MS = 10 * 60 * 1000;
/** Where the head leaves its request for the page's code. */
const HEAD_START_GLOBAL = "__VEO_PLAYBACK_BOOTSTRAP_HEAD__";

export interface HeadStartedBootstrapAnswer {
  status: number;
  payload: unknown;
  /** Answered from the copy this tab kept, not by the server just now. */
  kept: boolean;
}

interface HeadStartedBootstrap {
  courseSlug: string;
  lessonNumber: number;
  learnerView: boolean;
  promise: Promise<HeadStartedBootstrapAnswer | null>;
  taken?: boolean;
}

const keptKey = (
  viewer: string,
  learnerView: boolean,
  courseSlug: string,
  lessonNumber: number,
) =>
  `${PLAYBACK_BOOTSTRAP_SESSION_KEY_PREFIX}${viewer}:${learnerView ? "learner" : "own"}:${courseSlug}:${lessonNumber}`;

/** Whether a kept answer may still be used, by its token's expiry. */
function keptAnswerUsable(
  data: { segmentTokenExpiresAt?: unknown } | null,
  savedAt: number,
): boolean {
  if (!data) return false;
  const expiresAt = data.segmentTokenExpiresAt;
  if (typeof expiresAt === "number") {
    return expiresAt - Date.now() / 1000 > KEPT_TOKEN_MARGIN_SECONDS;
  }
  const age = Date.now() - savedAt;
  return age >= 0 && age < KEPT_WITHOUT_TOKEN_MS;
}

/**
 * The answer the head asked for (or took from the tab's copy), for this
 * lesson as the page now asks for it. Taken once.
 */
export function takeHeadStartedPlaybackBootstrap(request: {
  courseSlug: string;
  lessonNumber: number;
  learnerView: boolean;
}): Promise<HeadStartedBootstrapAnswer | null> | null {
  if (typeof window === "undefined") return null;
  const started = (window as unknown as Record<string, unknown>)[
    HEAD_START_GLOBAL
  ] as HeadStartedBootstrap | undefined;
  if (
    !started ||
    started.taken ||
    started.courseSlug !== request.courseSlug ||
    started.lessonNumber !== request.lessonNumber ||
    started.learnerView !== request.learnerView
  ) {
    return null;
  }
  started.taken = true;
  return started.promise;
}

/** At most this many answers are kept; the oldest go first. */
const KEPT_ANSWERS_MAX = 12;

/** Drops kept answers that can no longer be used, then the oldest. */
function pruneKeptAnswers() {
  const kept: { key: string; savedAt: number }[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (!key?.startsWith(PLAYBACK_BOOTSTRAP_SESSION_KEY_PREFIX)) continue;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null") as {
        data?: { segmentTokenExpiresAt?: unknown };
        savedAt?: unknown;
      } | null;
      if (
        saved &&
        typeof saved.savedAt === "number" &&
        keptAnswerUsable(saved.data ?? null, saved.savedAt)
      ) {
        kept.push({ key, savedAt: saved.savedAt });
        continue;
      }
    } catch {
      // Unreadable: dropped below.
    }
    kept.push({ key, savedAt: -1 });
  }
  kept.sort((a, b) => b.savedAt - a.savedAt);
  kept.forEach(({ key, savedAt }, index) => {
    if (savedAt < 0 || index >= KEPT_ANSWERS_MAX)
      sessionStorage.removeItem(key);
  });
}

/** Keeps a lesson's answer for a reload of this tab (see above). */
export function keepPlaybackBootstrap(
  viewer: string,
  request: { courseSlug: string; lessonNumber: number; learnerView: boolean },
  data: unknown,
) {
  try {
    pruneKeptAnswers();
    sessionStorage.setItem(
      keptKey(
        viewer,
        request.learnerView,
        request.courseSlug,
        request.lessonNumber,
      ),
      JSON.stringify({ data, savedAt: Date.now() }),
    );
  } catch {
    // Not kept: a reload asks again.
  }
}

/** The answer kept in this tab, while it may still be used. */
export function readKeptPlaybackBootstrap(
  viewer: string,
  request: { courseSlug: string; lessonNumber: number; learnerView: boolean },
): unknown {
  try {
    const kept = JSON.parse(
      sessionStorage.getItem(
        keptKey(
          viewer,
          request.learnerView,
          request.courseSlug,
          request.lessonNumber,
        ),
      ) || "null",
    ) as { data?: { segmentTokenExpiresAt?: unknown }; savedAt?: unknown };
    return kept &&
      typeof kept.savedAt === "number" &&
      keptAnswerUsable(kept.data ?? null, kept.savedAt)
      ? kept.data
      : null;
  } catch {
    return null;
  }
}

function startFromHead(config: {
  apiBase: string;
  prefix: string;
  global: string;
  marginSeconds: number;
  keptWithoutTokenMs: number;
  courseMeta: string;
  lessonMeta: string;
  learnerViewKey: string;
  learnerViewHeader: string;
  learnerViewValue: string;
  identityKey: string;
}) {
  try {
    const meta = (name: string) =>
      document
        .querySelector('meta[name="' + name + '"]')
        ?.getAttribute("content")
        ?.trim() || "";
    let courseSlug = meta(config.courseMeta);
    let lessonNumber = Number(meta(config.lessonMeta));
    if (!courseSlug || !(lessonNumber >= 1)) {
      const match = /^\/learn\/([^/]+)\/(?:lesson-|lecture-)?(\d+)\/?$/i.exec(
        location.pathname,
      );
      if (!match) return;
      courseSlug = decodeURIComponent(match[1] ?? "");
      lessonNumber = Number(match[2]);
    }
    if (!courseSlug || !(lessonNumber >= 1)) return;
    const root = document.documentElement;
    let learnerView = false;
    try {
      learnerView = localStorage.getItem(config.learnerViewKey) === "1";
    } catch {
      // Asked as the account's own view.
    }
    let viewer = "guest";
    if (root.getAttribute("data-session-hint") === "signed-in") {
      const hint = JSON.parse(
        sessionStorage.getItem(config.identityKey) || "null",
      );
      viewer = hint && typeof hint.userId === "string" ? hint.userId : "";
    }
    let kept = null;
    if (viewer) {
      const saved = JSON.parse(
        sessionStorage.getItem(
          config.prefix +
            viewer +
            ":" +
            (learnerView ? "learner" : "own") +
            ":" +
            courseSlug +
            ":" +
            lessonNumber,
        ) || "null",
      );
      const data = saved && saved.data;
      if (data && typeof saved.savedAt === "number") {
        const expiresAt = data.segmentTokenExpiresAt;
        const usable =
          typeof expiresAt === "number"
            ? expiresAt - Date.now() / 1000 > config.marginSeconds
            : Date.now() - saved.savedAt < config.keptWithoutTokenMs;
        if (usable) kept = data;
      }
    }
    const promise = kept
      ? Promise.resolve({ status: 200, payload: { data: kept }, kept: true })
      : fetch(
          config.apiBase.replace(/\/+$/, "") +
            "/courses/" +
            encodeURIComponent(courseSlug) +
            "/lessons/" +
            lessonNumber +
            "/playback-bootstrap?inlineManifest=1&storyboard=1&resume=1&subtitles=1",
          {
            credentials: "include",
            headers: learnerView
              ? {
                  Accept: "application/json",
                  [config.learnerViewHeader]: config.learnerViewValue,
                }
              : { Accept: "application/json" },
          },
        ).then(
          (response) =>
            response
              .json()
              .catch(() => null)
              .then((payload) => ({
                status: response.status,
                payload,
                kept: false,
              })),
          () => null,
        );
    (window as unknown as Record<string, unknown>)[config.global] = {
      courseSlug,
      lessonNumber,
      learnerView,
      promise,
    };
    try {
      performance.mark(
        kept ? "veo:playback-bootstrap-kept" : "veo:playback-bootstrap-head",
      );
    } catch {
      // Marks are diagnostics.
    }
  } catch {
    // The page's code asks for it, as before.
  }
}

/** Runs from the document's head (see root.tsx), before the lesson's code. */
export const getPlaybackBootstrapHeadStartScript = (apiBase: string) =>
  `(${startFromHead.toString()})(${JSON.stringify({
    apiBase,
    prefix: PLAYBACK_BOOTSTRAP_SESSION_KEY_PREFIX,
    global: HEAD_START_GLOBAL,
    marginSeconds: KEPT_TOKEN_MARGIN_SECONDS,
    keptWithoutTokenMs: KEPT_WITHOUT_TOKEN_MS,
    courseMeta: LEARNING_COURSE_SLUG_META_NAME,
    lessonMeta: LEARNING_LESSON_NUMBER_META_NAME,
    learnerViewKey: "veolms-learner-view",
    learnerViewHeader: LEARNER_VIEW_HEADER,
    learnerViewValue: LEARNER_VIEW_HEADER_VALUE,
    identityKey: "veolms-auth-identity",
  })});`;
