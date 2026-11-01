import { useEffect, useRef, type RefObject } from "react";
import type { SidebarPreferences } from "../../settings/settingsPreferences";
import type { ShortcutPlatform } from "../../keyboardShortcuts";
import type {
  AppearanceSwipe,
  DockLongPress,
  SidebarResize,
  PointerPositionEvent,
  SidebarScreenSwipeStartEvent,
} from "../academyShellTypes";

export interface UseShellGestureRefsArgs {
  sidebarPreferences: SidebarPreferences;
  shortcutPlatform: ShortcutPlatform;
}

export interface UseShellGestureRefsResult {
  sidebarResizeRef: RefObject<SidebarResize | null>;
  sidebarResizeSyncTimerRef: RefObject<number | undefined>;
  sidebarScreenSwipeStartRef: RefObject<
    ((event: SidebarScreenSwipeStartEvent) => void) | null
  >;
  sidebarResizeMoveRef: RefObject<
    ((event: PointerPositionEvent) => void) | null
  >;
  sidebarResizeFinishRef: RefObject<
    ((event: PointerPositionEvent, cancelled?: boolean) => void) | null
  >;
  sidebarOverlaySwipeConsumedRef: RefObject<boolean>;
  appearanceSwipeRef: RefObject<AppearanceSwipe | null>;
  appearanceSwipeConsumedRef: RefObject<boolean>;
  dockLongPressRef: RefObject<DockLongPress | null>;
  dockLongPressConsumedUntilRef: RefObject<number>;
  longPressAudioContextRef: RefObject<AudioContext | null>;
  sidebarTooltipTimerRef: RefObject<number | null>;
  primaryShortcutModifier: "Meta" | "Control";
  settingsShortcutKeys: string[];
  sidebarShortcutTitle: "⌘+B" | "Ctrl+B";
  showKeyboardShortcuts: boolean;
  settingsControlTitle: string;
}

export function useShellGestureRefs({
  sidebarPreferences,
  shortcutPlatform,
}: UseShellGestureRefsArgs): UseShellGestureRefsResult {
  const sidebarResizeRef = useRef<SidebarResize | null>(null);
  const sidebarResizeSyncTimerRef = useRef<number | undefined>(undefined);
  useEffect(
    () => () => window.clearTimeout(sidebarResizeSyncTimerRef.current),
    [],
  );
  const sidebarScreenSwipeStartRef = useRef<
    ((event: SidebarScreenSwipeStartEvent) => void) | null
  >(null);
  const sidebarResizeMoveRef = useRef<
    ((event: PointerPositionEvent) => void) | null
  >(null);
  const sidebarResizeFinishRef = useRef<
    ((event: PointerPositionEvent, cancelled?: boolean) => void) | null
  >(null);
  const sidebarOverlaySwipeConsumedRef = useRef(false);
  const appearanceSwipeRef = useRef<AppearanceSwipe | null>(null);
  const appearanceSwipeConsumedRef = useRef(false);
  const dockLongPressRef = useRef<DockLongPress | null>(null);
  const dockLongPressConsumedUntilRef = useRef(0);
  const longPressAudioContextRef = useRef<AudioContext | null>(null);
  const sidebarTooltipTimerRef = useRef<number | null>(null);
  const usesMacShortcutStyle = shortcutPlatform === "mac";
  const primaryShortcutModifier = usesMacShortcutStyle ? "Meta" : "Control";
  const settingsShortcutKeys = usesMacShortcutStyle
    ? ["⌘", ","]
    : ["Ctrl", ","];
  const sidebarShortcutTitle = usesMacShortcutStyle ? "⌘+B" : "Ctrl+B";
  const showKeyboardShortcuts =
    sidebarPreferences.showKeyboardShortcuts !== false;
  const settingsShortcutTitle = usesMacShortcutStyle ? "⌘+," : "Ctrl+,";
  const settingsControlTitle = showKeyboardShortcuts
    ? `Open settings (${settingsShortcutTitle})`
    : "Open settings";
  return {
    sidebarResizeRef,
    sidebarResizeSyncTimerRef,
    sidebarScreenSwipeStartRef,
    sidebarResizeMoveRef,
    sidebarResizeFinishRef,
    sidebarOverlaySwipeConsumedRef,
    appearanceSwipeRef,
    appearanceSwipeConsumedRef,
    dockLongPressRef,
    dockLongPressConsumedUntilRef,
    longPressAudioContextRef,
    sidebarTooltipTimerRef,
    primaryShortcutModifier,
    settingsShortcutKeys,
    sidebarShortcutTitle,
    showKeyboardShortcuts,
    settingsControlTitle,
  };
}
