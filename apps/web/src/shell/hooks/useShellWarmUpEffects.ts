import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { SETTINGS_ROUTE_STYLESHEETS } from "../../routes/settingsRouteStylesheets";
import {
  loginDialogBody,
  settingsPageBody,
  workspacePageBody,
} from "../../routing/prerenderedBodies";
import {
  loadCourseCatalogueModule,
  loadProfileMenuModule,
  loadMobileMenuDrawerModule,
} from "../academyLazyPages";
import { SETTINGS_ENTRY_SELECTOR } from "../academyShellConstants";

export interface UseShellWarmUpEffectsArgs {
  compactNavigation: boolean;
  /** Known to be signed out (not while the session is still being checked). */
  isGuest: boolean;
  mobileMenuOpen: boolean;
  mobileNavigationSheetMounted: boolean;
  setMobileNavigationSheetMounted: Dispatch<SetStateAction<boolean>>;
}

export interface UseShellWarmUpEffectsResult {
  settingsWarmed: boolean;
}

export function useShellWarmUpEffects({
  compactNavigation,
  isGuest,
  mobileMenuOpen,
  mobileNavigationSheetMounted,
  setMobileNavigationSheetMounted,
}: UseShellWarmUpEffectsArgs): UseShellWarmUpEffectsResult {
  // Settings and Discussions are fetched once the shell is idle, or sooner
  // if the pointer or the keyboard reaches one of the ways into them. The page's own code comes
  // with the import, its route module with `PrefetchPageLinks` (rendered
  // below once this has run), and the stylesheets that route links are
  // fetched outright.
  const [settingsWarmed, setSettingsWarmed] = useState(false);
  useEffect(() => {
    let idleHandle = 0;
    let timeoutHandle = 0;
    const onIntent = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(SETTINGS_ENTRY_SELECTOR)
      ) {
        warm();
      }
    };
    const stop = () => {
      if (idleHandle) window.cancelIdleCallback?.(idleHandle);
      window.clearTimeout(timeoutHandle);
      document.removeEventListener("pointerover", onIntent, true);
      document.removeEventListener("focusin", onIntent, true);
      document.removeEventListener("pointerdown", onIntent, true);
    };
    function warm() {
      stop();
      setSettingsWarmed(true);
      void settingsPageBody.preload().catch(() => undefined);
      // Discussions likewise: it is in two pieces, and until both are here
      // the page is placeholders from top to bottom.
      void import("../../workspace/WorkspacePages")
        .then((module) =>
          Promise.all([
            workspacePageBody.preload(),
            module.preloadDiscussionsWorkspace(),
          ]),
        )
        .catch(() => undefined);
      // The route's stylesheets are waited for before the page is shown.
      // Fetched here, they are in the browser's cache by then (a prefetch
      // hint alone is the browser's to ignore, and some do).
      for (const href of SETTINGS_ROUTE_STYLESHEETS) {
        void fetch(href).catch(() => undefined);
      }
    }
    document.addEventListener("pointerover", onIntent, {
      capture: true,
      passive: true,
    });
    document.addEventListener("focusin", onIntent, true);
    document.addEventListener("pointerdown", onIntent, {
      capture: true,
      passive: true,
    });
    // A visitor who has asked their browser to save data only pays for
    // Settings when they are about to open it.
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true;
    if (!saveData) {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(warm, { timeout: 6000 });
      } else {
        timeoutHandle = window.setTimeout(warm, 3500);
      }
    }
    return stop;
  }, []);

  useEffect(() => {
    if (!isGuest) return undefined;
    // Logging in is what a visitor is most likely to do next: the login
    // pop-up's code and the Google Sans its Google button uses are fetched
    // once the page is idle, so the first tap on Login opens it at once.
    // (The Login button also fetches it when shown or touched.)
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true;
    if (saveData) return undefined;
    const warm = () => void loginDialogBody.preload().catch(() => undefined);
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(warm, 1000);
    return () => window.clearTimeout(handle);
  }, [isGuest]);

  useEffect(() => {
    // The catalogue module is behind a route-body lazy(); warm it once the
    // shell is idle so navigating to /courses never shows its fallback.
    const warm = () => void loadCourseCatalogueModule();
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 5000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(warm, 2500);
    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    if (mobileNavigationSheetMounted) return undefined;
    if (mobileMenuOpen) {
      setMobileNavigationSheetMounted(true);
      return undefined;
    }
    if (!compactNavigation) return undefined;
    // Warm the sheet while the main thread is idle so the first tap on the
    // "You" button opens it without waiting for the drawer chunk. The sheet
    // body renders the profile identity/menu, so warm that module with it.
    const mount = () => {
      void loadMobileMenuDrawerModule();
      void loadProfileMenuModule();
      setMobileNavigationSheetMounted(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(mount, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(mount, 1500);
    return () => window.clearTimeout(handle);
  }, [
    compactNavigation,
    mobileMenuOpen,
    mobileNavigationSheetMounted,
    setMobileNavigationSheetMounted,
  ]);
  return {
    settingsWarmed,
  };
}
