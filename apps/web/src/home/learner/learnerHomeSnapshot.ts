import { useEffect, type RefObject } from "react";
import {
  ENROLLED_COURSES_SESSION_KEY_PREFIX,
  LEARNER_HOME_SNAPSHOT_SESSION_KEY_PREFIX,
} from "../../store/accountBrowserState";
import { FILL_CLOCK_FUNCTION } from "./heroClockFill";

/**
 * The learner's home, put back as it was on a reload.
 *
 * The page is built ahead of time for everyone, so all it can hold for a
 * signed-in learner is placeholders (see `LearnerHomeShell`): the greeting,
 * the quote, the course to carry on with, the goals on the laptop and the
 * course cards all came in a moment later, each in its own time. The tab
 * already had every one of them a moment ago.
 *
 * So the home, as it was last drawn, is kept in the tab's session storage
 * when the tab is left or hidden (`useLearnerHomeSnapshot`), and a script
 * in the document's head puts it in the page as the browser reads it, in
 * place of the placeholders, before anything is drawn. The page's own home
 * takes its place as soon as the app has started, drawn from the copies of
 * the same answers the tab kept (see services/accountSessionCopies.ts), so
 * it is the same picture: nothing on the screen changes, and whatever has
 * changed since is brought in afterwards as usual.
 *
 * What it shows is corrected where it has to be: the clock and the
 * greeting are the time now; the laptop's screen, the lamp's switch and the
 * quote's author are placed by measuring the picture, so where the hero is
 * no longer the size it was they are left out until the page measures them
 * again.
 *
 * It is not used when it is not this account's (the identity this tab
 * remembers), when the learner's courses are no longer kept (a purchase or
 * an enrolment clears them: the home may lead with another course now), or
 * when the account's home is another (see store/homeHint.ts). It is
 * forgotten with the session (`isAccountSessionStorageKey`).
 *
 * Nothing in the page's markup is replaced: it goes into an element of its
 * own that React leaves alone while hydrating (its contents are set
 * with `dangerouslySetInnerHTML`, which React does not compare).
 */

/** On <html> while the put-back home, or the page's own after it, is shown. */
export const LEARNER_HOME_RESTORED_ATTRIBUTE = "data-learner-home-restored";
/** The element the kept home goes into. */
export const LEARNER_HOME_SNAPSHOT_SLOT_ATTRIBUTE =
  "data-learner-home-snapshot";
/**
 * On elements placed by measuring the hero's picture (see above). Written
 * out in the components, as `data-hero-measured=""`.
 */
export const HERO_MEASURED_ATTRIBUTE = "data-hero-measured";

/** A kept home larger than this is not kept: it would crowd out the rest. */
const MAX_SNAPSHOT_LENGTH = 1_500_000;

interface LearnerHomeSnapshot {
  userId: string;
  html: string;
  /** The hero's size when it was kept, in CSS pixels. */
  width: number;
  height: number;
  savedAt: number;
}

const heroOf = (page: Element) =>
  page.querySelector("[data-learner-home-hero]")?.closest("section") ?? null;

function saveLearnerHomeSnapshot(page: HTMLElement, userId: string) {
  // Something on it is still on its way: the last one kept is closer.
  if (page.querySelector('[aria-busy="true"]')) return;
  const hero = heroOf(page);
  if (!hero) return;
  const { width, height } = hero.getBoundingClientRect();
  const copy = page.cloneNode(true) as HTMLElement;
  // What only lasts while the learner is doing something with it.
  copy
    .querySelectorAll('script, [role="menu"], [role="dialog"], form')
    .forEach((element) => element.remove());
  copy
    .querySelectorAll("[data-pressed]")
    .forEach((element) => element.removeAttribute("data-pressed"));
  const html = copy.outerHTML;
  if (html.length > MAX_SNAPSHOT_LENGTH) return;
  try {
    sessionStorage.setItem(
      LEARNER_HOME_SNAPSHOT_SESSION_KEY_PREFIX + userId,
      JSON.stringify({
        userId,
        html,
        width,
        height,
        savedAt: Date.now(),
      } satisfies LearnerHomeSnapshot),
    );
  } catch {
    // Not kept: the next load shows the placeholders.
  }
}

/**
 * Keeps the home (`pageRef`) for the next load of this tab whenever the tab
 * is left or hidden, once everything on it has arrived (`ready`).
 */
export function useLearnerHomeSnapshot(
  pageRef: RefObject<HTMLElement | null>,
  userId: string | null,
  ready: boolean,
) {
  useEffect(() => {
    if (!userId || !ready) return undefined;
    const save = () => {
      if (pageRef.current) saveLearnerHomeSnapshot(pageRef.current, userId);
    };
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [pageRef, ready, userId]);
}

/**
 * The page's own home has taken over from the one put back: once it has
 * been drawn, its transitions and entrances are let run again (they are
 * held while it takes over, so that nothing fades in that was already
 * there).
 */
export function useLearnerHomeHandOver() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute(LEARNER_HOME_RESTORED_ATTRIBUTE)) return undefined;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() =>
        root.removeAttribute(LEARNER_HOME_RESTORED_ATTRIBUTE),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, []);
}

function restoreLearnerHome(
  keys: {
    identityHint: string;
    snapshotPrefix: string;
    enrolledPrefix: string;
    restored: string;
    slot: string;
    measured: string;
  },
  fillClock: (time: Element) => void,
) {
  try {
    const root = document.documentElement;
    const path = location.pathname.replace(/\/+$/, "");
    if (path !== "" && path !== "/home") return;
    if (root.getAttribute("data-session-hint") !== "signed-in") return;
    if (root.hasAttribute("data-home-hint")) return;
    const hint = JSON.parse(
      sessionStorage.getItem(keys.identityHint) || "null",
    );
    if (!hint || typeof hint.userId !== "string") return;
    // The same words as homeGreeting.ts.
    const hour = new Date().getHours();
    const greeting =
      hour < 12
        ? "Good morning"
        : hour < 16
          ? "Good afternoon"
          : "Good evening";

    // The placeholders' greeting says it outright (see LearnerHomeShell).
    const firstName =
      typeof hint.displayName === "string"
        ? hint.displayName.trim().split(/\s+/)[0] || ""
        : "";
    if (firstName) {
      const text = (value: string) =>
        '"' +
        value
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/[\r\n]+/g, " ") +
        '"';
      root.style.setProperty("--learner-home-greeting", text(greeting + ", "));
      root.style.setProperty("--learner-home-name", text(firstName + "."));
      root.setAttribute("data-learner-home-greeting", "");
    }

    const snapshot = JSON.parse(
      sessionStorage.getItem(keys.snapshotPrefix + hint.userId) || "null",
    );
    if (
      !snapshot ||
      snapshot.userId !== hint.userId ||
      typeof snapshot.html !== "string" ||
      !sessionStorage.getItem(keys.enrolledPrefix + hint.userId)
    ) {
      return;
    }

    const style = document.createElement("style");
    style.textContent =
      ":root[" +
      keys.restored +
      "] .learner-home-page *{transition:none!important}" +
      ":root[" +
      keys.restored +
      "] [data-learner-home-shell]{display:none!important}";
    document.head.appendChild(style);

    let done = false;
    let waiting = false;
    const put = (): boolean => {
      if (done) return true;
      const slot = document.querySelector("[" + keys.slot + "]");
      if (!slot) return false;
      // The kept home uses the app's whole stylesheet, which a built page
      // loads after its first paint. Until it is in, the placeholders stay.
      const loading: HTMLLinkElement[] = [];
      document
        .querySelectorAll<HTMLLinkElement>("link[data-deferred-style]")
        .forEach((link) => {
          if (!link.sheet) loading.push(link);
        });
      if (loading.length) {
        if (!waiting) {
          waiting = true;
          loading.forEach((link) => link.addEventListener("load", put));
        }
        return true;
      }
      done = true;
      slot.innerHTML = snapshot.html;
      const time = slot.querySelector("[data-learner-home-hero] time");
      if (time) fillClock(time);
      const title = slot.querySelector("#learner-home-hero-title");
      const words = title && title.firstChild;
      if (words && words.nodeType === 3) {
        (words as Text).data = (words as Text).data.replace(
          /^Good (morning|afternoon|evening)/,
          greeting,
        );
      }
      root.setAttribute(keys.restored, "");
      const hero = slot
        .querySelector("[data-learner-home-hero]")
        ?.closest("section");
      const size = hero && hero.getBoundingClientRect();
      if (
        !size ||
        Math.abs(size.width - snapshot.width) > 0.5 ||
        Math.abs(size.height - snapshot.height) > 0.5
      ) {
        slot
          .querySelectorAll("[" + keys.measured + "]")
          .forEach((element) => element.remove());
        slot
          .querySelectorAll<HTMLElement>("figcaption")
          .forEach((caption) => caption.style.removeProperty("padding-right"));
      }
      return true;
    };
    if (put()) return;
    const observer = new MutationObserver(() => {
      if (put()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => {
      observer.disconnect();
      put();
    });
  } catch {
    // The placeholders stay, as before.
  }
}

/** Runs from the document's head (see root.tsx). */
export const getLearnerHomeSnapshotBootstrapScript = () =>
  `(${restoreLearnerHome.toString()})(${JSON.stringify({
    identityHint: "veolms-auth-identity",
    snapshotPrefix: LEARNER_HOME_SNAPSHOT_SESSION_KEY_PREFIX,
    enrolledPrefix: ENROLLED_COURSES_SESSION_KEY_PREFIX,
    restored: LEARNER_HOME_RESTORED_ATTRIBUTE,
    slot: LEARNER_HOME_SNAPSHOT_SLOT_ATTRIBUTE,
    measured: HERO_MEASURED_ATTRIBUTE,
  })},${FILL_CLOCK_FUNCTION});`;
