import type { SidebarMode } from "../settings/settingsPreferences";

export type ThemePreference = "light" | "dark" | "device";
export type AppearanceOption = ThemePreference | "theme";
export type AppearanceSwipeSource = AppearanceOption;

export interface AppearanceSwipe {
  pointerId: number;
  source: AppearanceSwipeSource;
  startX: number;
}

export interface DockLongPress {
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
  action: () => void;
}

export type SidebarGestureSource =
  "rail" | "screen" | "overlay" | "overlay-rail";

export interface SidebarResize {
  pointerId: number;
  source: SidebarGestureSource;
  screenOverlayAtStart: boolean;
  active: boolean;
  startedAt: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTimestamp: number;
  velocityX: number;
  startWidth: number;
  expandedWidthAtStart: number;
  modeAtStart: SidebarMode;
  collapsedAtStart: boolean;
  previewWidth: number;
  handle: HTMLElement | null;
}

export interface PointerPositionEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
  buttons?: number;
  pointerType?: string;
  preventDefault?: () => void;
}

export interface SidebarScreenSwipeStartEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  timeStamp: number;
  target: EventTarget | null;
  handle: HTMLDivElement;
  splitX?: number;
}

export interface SidebarTooltip {
  label: string;
  active: boolean;
  top: number;
  left: number;
  focusVisible: boolean;
  preferenceControlled: boolean;
}

export interface CoursesPageRenderContext {
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden: boolean;
}
