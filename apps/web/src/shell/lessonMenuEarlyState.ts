import { LEARNING_RETURN_LOCATION_STORAGE_KEY } from "../learning/learningReturnLocation";

/**
 * The menu item a lesson page highlights, shown before the page's scripts
 * have run.
 *
 * While a lesson fills the screen the menu keeps the item of the page the
 * player was opened from (`learningOriginSection` in academy-layout.tsx),
 * which the app keeps in local storage (learningReturnLocation.ts), or none
 * when it names no item in the menu. The page is built without it, so a
 * reload showed the built page's item, or the one the history entry's
 * origin lights (routing/navigationOriginEarlyState.ts), until the app had
 * started and moved it. This runs in the document's head after that script
 * and does what the app will do, once the menu has been parsed. The app
 * sets every item itself once it runs (SidebarNavigation), to the same.
 *
 * It is embedded as text, so it reads nothing from outside itself but its
 * arguments.
 */
function applyLessonMenuSection(storageKey: string) {
  try {
    if (!/^\/learn\//.test(location.pathname)) return;
    let section: string | null = null;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (stored && typeof stored.section === "string") {
        section = stored.section;
      }
    } catch {
      // Nothing kept: no item, as the app has it.
    }
    const apply = () => {
      // The menu's last element: every item before it has been parsed.
      if (!document.querySelector("[data-nav-end-space]")) return false;
      document
        .querySelectorAll("#courses-sidebar-nav-scrollport > button")
        .forEach((item) =>
          item.classList.toggle(
            "is-active",
            section !== null && item.getAttribute("aria-label") === section,
          ),
        );
      return true;
    };
    if (apply()) return;
    const observer = new MutationObserver(() => {
      if (apply()) observer.disconnect();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    document.addEventListener("DOMContentLoaded", () => {
      observer.disconnect();
      apply();
    });
  } catch {
    // The built page's item shows until the app sets it, as before.
  }
}

/** Runs from the document's head, after the navigation origin's (root.tsx). */
export const getLessonMenuSectionBootstrapScript = () =>
  `(${applyLessonMenuSection.toString()})(${JSON.stringify(LEARNING_RETURN_LOCATION_STORAGE_KEY)});`;
