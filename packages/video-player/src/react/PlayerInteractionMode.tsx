import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type PlayerInteractionMode = "desktop" | "mobile" | "responsive";

const DESKTOP_WIDTH_QUERY = "(min-width: 40rem)";
const PHONE_HEIGHT_QUERY = "(max-height: 40rem)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";

const PlayerMobileInteractionContext = createContext(false);

function getResponsiveMobileSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") {
    return Math.min(window.innerWidth, window.innerHeight) < 640;
  }

  const narrowViewport = !window.matchMedia(DESKTOP_WIDTH_QUERY).matches;
  const landscapePhone =
    window.matchMedia(PHONE_HEIGHT_QUERY).matches &&
    window.matchMedia(COARSE_POINTER_QUERY).matches;
  return narrowViewport || landscapePhone;
}

function subscribeToResponsiveMobileMode(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const mediaQueries =
    typeof window.matchMedia === "function"
      ? [
          window.matchMedia(DESKTOP_WIDTH_QUERY),
          window.matchMedia(PHONE_HEIGHT_QUERY),
          window.matchMedia(COARSE_POINTER_QUERY),
        ]
      : [];
  for (const mediaQuery of mediaQueries) {
    mediaQuery.addEventListener?.("change", onStoreChange);
  }
  window.visualViewport?.addEventListener("resize", onStoreChange);
  window.addEventListener("orientationchange", onStoreChange);

  return () => {
    for (const mediaQuery of mediaQueries) {
      mediaQuery.removeEventListener?.("change", onStoreChange);
    }
    window.visualViewport?.removeEventListener("resize", onStoreChange);
    window.removeEventListener("orientationchange", onStoreChange);
  };
}

export function useResolvedPlayerMobileInteraction(
  mode: PlayerInteractionMode,
): boolean {
  const responsiveMobile = useSyncExternalStore(
    subscribeToResponsiveMobileMode,
    getResponsiveMobileSnapshot,
    () => false,
  );
  if (mode === "mobile") return true;
  if (mode === "desktop") return false;
  return responsiveMobile;
}

export function PlayerInteractionModeProvider({
  children,
  mobile,
}: {
  children: ReactNode;
  mobile: boolean;
}) {
  return (
    <PlayerMobileInteractionContext.Provider value={mobile}>
      {children}
    </PlayerMobileInteractionContext.Provider>
  );
}

export function usePlayerMobileInteraction(): boolean {
  return useContext(PlayerMobileInteractionContext);
}
