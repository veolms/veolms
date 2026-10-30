import type { SplitFrameDrag } from "../../components/splitFrame";

export interface CurriculumResize extends SplitFrameDrag {
  handle: HTMLElement;
}

export interface CurriculumPointerEvent {
  pointerId: number;
  clientX: number;
}

export interface FloatingLessonDrawerResize {
  pointerId: number;
  startX: number;
  startWidth: number;
  originalWidth: number;
  previewWidth: number;
  dismissOnEnd: boolean;
  handle: HTMLElement;
}

export interface CurriculumScreenSwipe {
  pointerId: number;
  active: boolean;
  startedAt: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTimestamp: number;
  velocityX: number;
  closedAtStart: boolean;
  expandedWidthAtStart: number;
  target: "curriculum" | "lesson-drawer";
  /** The touch began on the course content panel itself. */
  startedOnPanel: boolean;
  handle: HTMLDivElement;
}

export interface CurriculumScreenSwipeStartEvent {
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
