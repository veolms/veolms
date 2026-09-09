import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type PlayerInteractionMode = "desktop" | "mobile" | "responsive";

const MOBILE_WIDTH_QUERY = "(max-width: 640px)";

const PlayerMobileInteractionContext = createContext(false);
const responsiveModeListeners = new Set<() => void>();
let responsiveModeListening = false;
let responsiveModeMediaQuery: MediaQueryList | null = null;
let windowedMobileMode = false;
let fullscreenModeActive = false;
let fullscreenMobileMode = false;

function getResponsiveMobileSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") {
    return window.innerWidth <= 640;
  }
  return window.matchMedia(MOBILE_WIDTH_QUERY).matches;
}

function getFullscreenActive(): boolean {
  if (typeof document === "undefined") return false;
  const webkitDocument = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return Boolean(
    document.fullscreenElement ?? webkitDocument.webkitFullscreenElement,
  );
}

function getResponsiveModeStoreSnapshot(): boolean {
  if (!responsiveModeListening) return getResponsiveMobileSnapshot();
  return fullscreenModeActive ? fullscreenMobileMode : windowedMobileMode;
}

function updateResponsiveModeStore(): void {
  const previousMode = getResponsiveModeStoreSnapshot();
  const fullscreenActive = getFullscreenActive();

  if (fullscreenActive) {
    if (!fullscreenModeActive) fullscreenMobileMode = windowedMobileMode;
  } else {
    windowedMobileMode = getResponsiveMobileSnapshot();
  }
  fullscreenModeActive = fullscreenActive;

  if (getResponsiveModeStoreSnapshot() === previousMode) return;
  for (const listener of responsiveModeListeners) listener();
}

function startResponsiveModeStore(): void {
  windowedMobileMode = getResponsiveMobileSnapshot();
  fullscreenModeActive = getFullscreenActive();
  fullscreenMobileMode = windowedMobileMode;
  responsiveModeMediaQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia(MOBILE_WIDTH_QUERY)
      : null;
  responsiveModeMediaQuery?.addEventListener?.(
    "change",
    updateResponsiveModeStore,
  );
  window.visualViewport?.addEventListener("resize", updateResponsiveModeStore);
  window.addEventListener("resize", updateResponsiveModeStore);
  window.addEventListener("orientationchange", updateResponsiveModeStore);
  document.addEventListener("fullscreenchange", updateResponsiveModeStore);
  document.addEventListener(
    "webkitfullscreenchange",
    updateResponsiveModeStore,
  );
  responsiveModeListening = true;
}

function stopResponsiveModeStore(): void {
  responsiveModeMediaQuery?.removeEventListener?.(
    "change",
    updateResponsiveModeStore,
  );
  window.visualViewport?.removeEventListener(
    "resize",
    updateResponsiveModeStore,
  );
  window.removeEventListener("resize", updateResponsiveModeStore);
  window.removeEventListener("orientationchange", updateResponsiveModeStore);
  document.removeEventListener("fullscreenchange", updateResponsiveModeStore);
  document.removeEventListener(
    "webkitfullscreenchange",
    updateResponsiveModeStore,
  );
  responsiveModeMediaQuery = null;
  responsiveModeListening = false;
}

function subscribeToResponsiveMobileMode(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  responsiveModeListeners.add(onStoreChange);
  if (!responsiveModeListening) startResponsiveModeStore();

  return () => {
    responsiveModeListeners.delete(onStoreChange);
    if (responsiveModeListeners.size === 0 && responsiveModeListening) {
      stopResponsiveModeStore();
    }
  };
}

export function useResolvedPlayerMobileInteraction(
  mode: PlayerInteractionMode,
): boolean {
  const responsiveMobile = useSyncExternalStore(
    subscribeToResponsiveMobileMode,
    getResponsiveModeStoreSnapshot,
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
