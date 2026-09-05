import { readMiniPlayerWidthPreference } from "./lessonPlayerPersistence";

export const LEARNING_PLAYER_MOTION_DURATION_MS = 500;
export const LEARNING_PLAYER_MOTION_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
export const LEARNING_PLAYER_MINIMIZE_BORDER_RADIUS = "13px";
export const LEARNING_DESKTOP_MINIMIZE_MEDIA_QUERY = "(min-width: 641px)";

export const LEARNING_CONTENT_FADE_START_VIEWPORT_PROGRESS = 0.3;
export const LEARNING_CONTENT_FADE_END_VIEWPORT_PROGRESS = 0.4;
export const LEARNING_BACKGROUND_MOUNT_VIEWPORT_PROGRESS = 0.38;
export const LEARNING_BACKGROUND_REVEAL_START_VIEWPORT_PROGRESS = 0.4;
export const LEARNING_BACKGROUND_REVEAL_END_VIEWPORT_PROGRESS = 0.6;

export const LEARNING_MINI_PLAYER_ASPECT_RATIO = 16 / 9;
export const LEARNING_MINI_PLAYER_DESKTOP_INFO_BAR_HEIGHT = 52;
export const LEARNING_MINI_PLAYER_MARGIN = 12;
export const LEARNING_MINI_PLAYER_MIN_WIDTH = 200;
export const LEARNING_MINI_PLAYER_PHONE_MAX_VIEWPORT_WIDTH = 640;
export const LEARNING_MINI_PLAYER_DESKTOP_MIN_VIEWPORT_WIDTH = 1024;
export const LEARNING_MINI_PLAYER_PHONE_WIDTH = 200;
export const LEARNING_MINI_PLAYER_TABLET_WIDTH = 260;
export const LEARNING_MINI_PLAYER_DESKTOP_WIDTH = 320;
export const LEARNING_MINI_PLAYER_DESKTOP_PLAYLIST_HEIGHT = 320;
export const LEARNING_MINI_PLAYER_DESKTOP_PLAYLIST_MIN_HEIGHT = 120;
export const LEARNING_MINI_PLAYER_CURRICULUM_SCROLL_CONTROL_BOTTOM_CLEARANCE =
  "40%";

export interface LearningMiniPlayerLayout {
  left: number;
  top: number;
  width: number;
  playlistHeight?: number;
}

export const getLearningMiniPlayerPlaylistHeight = (
  layout?: Pick<LearningMiniPlayerLayout, "playlistHeight"> | null,
) =>
  layout?.playlistHeight ?? LEARNING_MINI_PLAYER_DESKTOP_PLAYLIST_HEIGHT;

export const getLearningMiniPlayerHeight = (
  width: number,
  isDesktop = isDesktopLearningMinimizeViewport(),
  isExpanded = false,
  playlistHeight = LEARNING_MINI_PLAYER_DESKTOP_PLAYLIST_HEIGHT,
) =>
  width / LEARNING_MINI_PLAYER_ASPECT_RATIO +
  (isDesktop
    ? LEARNING_MINI_PLAYER_DESKTOP_INFO_BAR_HEIGHT +
      (isExpanded ? playlistHeight : 0)
    : 0);

export type LearningMiniPlayerResizeEdges =
  "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export interface LearningPlayerViewportBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface LearningBackgroundMotionState {
  contentOpacity: number;
  revealProgress: number;
  shouldMount: boolean;
  viewportProgress: number;
}

export interface LearningBackgroundMotionOptions {
  contentFadeStartViewportProgress?: number;
  viewportTop?: number;
}

export interface LearningMinimizeGeometry {
  targetScale: number;
  targetX: number;
  targetY: number;
}

export const isDesktopLearningMinimizeViewport = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia(LEARNING_DESKTOP_MINIMIZE_MEDIA_QUERY).matches;

export const isUnifiedDesktopLearningMotionSurface = (
  element: HTMLElement | null,
): boolean =>
  element !== null &&
  isDesktopLearningMinimizeViewport() &&
  element.hasAttribute("data-learning-motion-surface");

export const getLearningPlayerMotionTargetElement = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-learning-player-motion-target]");

export const isUnifiedDesktopPlayerMinimize = (
  motionTarget: HTMLElement | null,
): boolean =>
  motionTarget !== null &&
  isDesktopLearningMinimizeViewport() &&
  motionTarget.hasAttribute("data-learning-player-motion-target") &&
  getLearningMotionSurfaceElement() !== null;

const UNIFIED_DESKTOP_EXIT_SELECTORS = [
  ".learning-workspace__curriculum-column",
  ".learning-workspace__lesson-content",
] as const;

const applyInlineMinimizeCorner = (element: HTMLElement) => {
  element.style.setProperty(
    "border-radius",
    LEARNING_PLAYER_MINIMIZE_BORDER_RADIUS,
    "important",
  );
  element.style.setProperty("overflow", "hidden", "important");
  element.style.setProperty("transition-property", "transform", "important");
};

const clearInlineMinimizeCorner = (element: HTMLElement) => {
  element.style.removeProperty("border-radius");
  element.style.removeProperty("overflow");
  element.style.removeProperty("transition-property");
};

export function syncUnifiedDesktopChildExitMotion(
  surface: HTMLElement,
  options: {
    durationMs: number;
    exitX: number;
    exitY: number;
  },
): void {
  if (!isUnifiedDesktopLearningMotionSurface(surface)) return;

  const duration = `${Math.max(0, options.durationMs)}ms`;
  const transform = `translate3d(${options.exitX.toFixed(3)}px, ${options.exitY.toFixed(3)}px, 0)`;

  for (const selector of UNIFIED_DESKTOP_EXIT_SELECTORS) {
    const child = surface.querySelector<HTMLElement>(selector);
    if (!child) continue;
    child.style.transform = transform;
    child.style.transformOrigin = "top left";
    child.style.transitionDuration = duration;
    child.style.transitionProperty = "transform";
    child.style.transitionTimingFunction = LEARNING_PLAYER_MOTION_EASING;
    child.style.willChange = "transform";
  }
}

export function clearUnifiedDesktopChildExitMotion(surface: HTMLElement) {
  for (const selector of UNIFIED_DESKTOP_EXIT_SELECTORS) {
    const child = surface.querySelector<HTMLElement>(selector);
    if (!child) continue;
    child.style.removeProperty("transform");
    child.style.removeProperty("transform-origin");
    child.style.removeProperty("transition-duration");
    child.style.removeProperty("transition-property");
    child.style.removeProperty("transition-timing-function");
    child.style.removeProperty("will-change");
  }
}

export function clearLearningMiniPlayerVideoCornerRadius(host: HTMLElement) {
  host
    .querySelectorAll<HTMLElement>(".video-shell, .youtube-player, video")
    .forEach(clearInlineMinimizeCorner);
}

export function applyLearningPlayerMinimizeCornerRadius() {
  const motionTarget = getLearningPlayerMotionTargetElement();
  if (motionTarget) applyInlineMinimizeCorner(motionTarget);

  const persistentPlayer = document.querySelector<HTMLElement>(
    "[data-learning-persistent-player]",
  );
  if (!persistentPlayer) return;

  persistentPlayer.dataset.learningPlayerMinimizeCorners = "true";
  applyInlineMinimizeCorner(persistentPlayer);
  if (persistentPlayer.hasAttribute("data-learning-mini-player")) {
    persistentPlayer
      .querySelectorAll<HTMLElement>(".video-shell, .youtube-player, video")
      .forEach(clearInlineMinimizeCorner);
    return;
  }
  persistentPlayer
    .querySelectorAll<HTMLElement>(".video-shell, .youtube-player, video")
    .forEach(applyInlineMinimizeCorner);
}

export function clearLearningPlayerMinimizeCornerRadius() {
  const motionTarget = getLearningPlayerMotionTargetElement();
  if (motionTarget) clearInlineMinimizeCorner(motionTarget);

  document
    .querySelectorAll<HTMLElement>(
      "[data-learning-persistent-player][data-learning-player-minimize-corners]",
    )
    .forEach((player) => {
      clearInlineMinimizeCorner(player);
      player
        .querySelectorAll<HTMLElement>(".video-shell, .youtube-player, video")
        .forEach(clearInlineMinimizeCorner);
      delete player.dataset.learningPlayerMinimizeCorners;
    });
}

export function clearLearningPlayerMinimizeClipSurfaceStyles(
  surface: HTMLElement,
) {
  clearUnifiedDesktopChildExitMotion(surface);
  surface.style.removeProperty("z-index");
  delete surface.dataset.learningPlayerMotionPhase;
}

export const getLearningMotionSurfaceElement = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-learning-motion-surface]");

export function getLearningMinimizeGeometry(
  element: HTMLElement,
  options: {
    capMiniWidthToElement?: boolean;
    preferredWidth?: number;
  } = {},
): LearningMinimizeGeometry {
  const bounds = element.getBoundingClientRect();
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const startWidth = bounds.width || viewportWidth;
  const startLeft = Number.isFinite(bounds.left) ? bounds.left : 0;
  const startTop = Number.isFinite(bounds.top) ? bounds.top : 0;
  const target = getDefaultLearningMiniPlayerLayout(
    options.capMiniWidthToElement ? startWidth : Number.POSITIVE_INFINITY,
    undefined,
    options.preferredWidth ?? readMiniPlayerWidthPreference() ?? undefined,
  );

  return {
    targetScale: target.width / startWidth,
    targetX: target.left - startLeft,
    targetY: Math.max(1, target.top - startTop),
  };
}

export function runLearningPlayerFlipRestore(
  element: HTMLElement,
  startRect: DOMRect,
): () => void {
  const endRect = element.getBoundingClientRect();
  if (
    startRect.width <= 0 ||
    endRect.width <= 0 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return () => undefined;
  }

  const scale = startRect.width / endRect.width;
  const inverseTransform = `translate3d(${(
    startRect.left - endRect.left
  ).toFixed(3)}px, ${(startRect.top - endRect.top).toFixed(
    3,
  )}px, 0) scale(${scale.toFixed(5)})`;
  element.dataset.learningPlayerRestorePhase = "expanding";
  element.style.borderRadius = "13px";
  element.style.overflow = "hidden";
  element.style.transform = inverseTransform;
  element.style.transformOrigin = "top left";
  element.style.transition = "none";
  element.style.willChange = "transform";
  element.style.zIndex = "190";

  let finished = false;
  let frame = window.requestAnimationFrame(() => {
    frame = 0;
    element.style.transition = `transform ${LEARNING_PLAYER_MOTION_DURATION_MS}ms ${LEARNING_PLAYER_MOTION_EASING}`;
    element.style.transform = "translate3d(0, 0, 0) scale(1)";
  });
  const finish = () => {
    if (finished) return;
    finished = true;
    cleanup();
    element.style.removeProperty("border-radius");
    element.style.removeProperty("overflow");
    element.style.removeProperty("transform");
    element.style.removeProperty("transform-origin");
    element.style.removeProperty("transition");
    element.style.removeProperty("will-change");
    element.style.removeProperty("z-index");
    delete element.dataset.learningPlayerRestorePhase;
  };
  const handleTransitionEnd = (event: TransitionEvent) => {
    if (event.target === element && event.propertyName === "transform") finish();
  };
  const timer = window.setTimeout(
    finish,
    LEARNING_PLAYER_MOTION_DURATION_MS + 80,
  );
  const cleanup = () => {
    if (frame) window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    element.removeEventListener("transitionend", handleTransitionEnd);
  };
  element.addEventListener("transitionend", handleTransitionEnd);

  return finish;
}

export const clampLearningPlayerValue = (
  value: number,
  minimum: number,
  maximum: number,
) => Math.min(maximum, Math.max(minimum, value));

export const getLearningBackgroundMotionState = (
  videoBottom: number,
  viewportHeight: number,
  options: LearningBackgroundMotionOptions = {},
): LearningBackgroundMotionState => {
  const safeViewportHeight = Math.max(1, viewportHeight);
  const viewportTop = options.viewportTop ?? 0;
  const viewportProgress = clampLearningPlayerValue(
    (videoBottom - viewportTop) / safeViewportHeight,
    0,
    1,
  );
  const revealRange =
    LEARNING_BACKGROUND_REVEAL_END_VIEWPORT_PROGRESS -
    LEARNING_BACKGROUND_REVEAL_START_VIEWPORT_PROGRESS;
  const contentFadeStart = clampLearningPlayerValue(
    options.contentFadeStartViewportProgress ??
      LEARNING_CONTENT_FADE_START_VIEWPORT_PROGRESS,
    0,
    LEARNING_CONTENT_FADE_END_VIEWPORT_PROGRESS,
  );
  const contentFadeRange = Math.max(
    0.0001,
    LEARNING_CONTENT_FADE_END_VIEWPORT_PROGRESS - contentFadeStart,
  );

  return {
    contentOpacity:
      1 -
      clampLearningPlayerValue(
        (viewportProgress - contentFadeStart) / contentFadeRange,
        0,
        1,
      ),
    revealProgress: clampLearningPlayerValue(
      (viewportProgress - LEARNING_BACKGROUND_REVEAL_START_VIEWPORT_PROGRESS) /
        revealRange,
      0,
      1,
    ),
    shouldMount:
      viewportProgress >= LEARNING_BACKGROUND_MOUNT_VIEWPORT_PROGRESS,
    viewportProgress,
  };
};

const sampleCubicBezier = (first: number, second: number, progress: number) =>
  ((1 - 3 * second + 3 * first) * progress + (3 * second - 6 * first)) *
    progress *
    progress +
  3 * first * progress;

const sampleCubicBezierDerivative = (
  first: number,
  second: number,
  progress: number,
) =>
  (3 * (1 - 3 * second + 3 * first) * progress + 2 * (3 * second - 6 * first)) *
    progress +
  3 * first;

export const easeLearningPlayerMotionProgress = (progress: number) => {
  const input = clampLearningPlayerValue(progress, 0, 1);
  let curveProgress = input;

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const error = sampleCubicBezier(0.16, 0.3, curveProgress) - input;
    const derivative = sampleCubicBezierDerivative(0.16, 0.3, curveProgress);
    if (Math.abs(error) < 0.0001 || Math.abs(derivative) < 0.0001) break;
    curveProgress = clampLearningPlayerValue(
      curveProgress - error / derivative,
      0,
      1,
    );
  }

  return sampleCubicBezier(1, 1, curveProgress);
};

export const clearLearningPlayerMinimizeMotionStyles = (
  element: HTMLElement,
) => {
  clearLearningPlayerMinimizeCornerRadius();
  element.style.removeProperty("border-radius");
  element.style.removeProperty("overflow");
  element.style.removeProperty("transform");
  element.style.removeProperty("transform-origin");
  element.style.removeProperty("transition-duration");
  element.style.removeProperty("transition-property");
  element.style.removeProperty("transition-timing-function");
  element.style.removeProperty("will-change");
  element.style.removeProperty("z-index");
  delete element.dataset.learningPlayerMotionPhase;
};

export const getLearningPlayerViewportBounds =
  (): LearningPlayerViewportBounds => {
    const viewport = window.visualViewport;
    return {
      height: viewport?.height ?? window.innerHeight,
      left: viewport?.offsetLeft ?? 0,
      top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? window.innerWidth,
    };
  };

export const getLearningMiniPlayerBottomEdge = (
  viewport = getLearningPlayerViewportBounds(),
) => {
  const viewportBottom = viewport.top + viewport.height;
  const mobileNavigation = document.querySelector<HTMLElement>(
    ".mobile-bottom-nav:not(.is-scroll-hidden)",
  );
  const navigationRect = mobileNavigation?.getBoundingClientRect();
  if (
    navigationRect &&
    navigationRect.height > 0 &&
    navigationRect.top < viewportBottom &&
    navigationRect.bottom > viewport.top
  ) {
    return navigationRect.top - LEARNING_MINI_PLAYER_MARGIN;
  }
  return viewportBottom - LEARNING_MINI_PLAYER_MARGIN;
};

export const getLearningMiniPlayerWidthBounds = (
  viewport = getLearningPlayerViewportBounds(),
) => {
  const maximumWidth = Math.max(
    1,
    viewport.width - LEARNING_MINI_PLAYER_MARGIN * 2,
  );
  return {
    maximumWidth,
    minimumWidth: Math.min(LEARNING_MINI_PLAYER_MIN_WIDTH, maximumWidth),
  };
};

export const getPreferredLearningMiniPlayerWidth = (viewportWidth: number) => {
  if (viewportWidth <= LEARNING_MINI_PLAYER_PHONE_MAX_VIEWPORT_WIDTH) {
    return LEARNING_MINI_PLAYER_PHONE_WIDTH;
  }
  if (viewportWidth < LEARNING_MINI_PLAYER_DESKTOP_MIN_VIEWPORT_WIDTH) {
    return LEARNING_MINI_PLAYER_TABLET_WIDTH;
  }
  return LEARNING_MINI_PLAYER_DESKTOP_WIDTH;
};

export const getDefaultLearningMiniPlayerLayout = (
  maximumSourceWidth = Number.POSITIVE_INFINITY,
  viewport = getLearningPlayerViewportBounds(),
  preferredWidth = getPreferredLearningMiniPlayerWidth(viewport.width),
): LearningMiniPlayerLayout => {
  const { maximumWidth, minimumWidth } =
    getLearningMiniPlayerWidthBounds(viewport);
  const width = Math.min(
    maximumSourceWidth,
    clampLearningPlayerValue(preferredWidth, minimumWidth, maximumWidth),
  );
  const height = getLearningMiniPlayerHeight(width);
  return {
    left: viewport.left + viewport.width - LEARNING_MINI_PLAYER_MARGIN - width,
    top: Math.max(
      viewport.top + LEARNING_MINI_PLAYER_MARGIN,
      getLearningMiniPlayerBottomEdge(viewport) - height,
    ),
    width,
  };
};

export const getLearningMiniPlayerPointerResizeLayout = (
  initialLayout: LearningMiniPlayerLayout,
  edges: LearningMiniPlayerResizeEdges,
  deltaX: number,
  deltaY: number,
  viewport = getLearningPlayerViewportBounds(),
  isExpanded = false,
): LearningMiniPlayerLayout => {
  const isDesktop = isDesktopLearningMinimizeViewport();
  const playlistHeight = getLearningMiniPlayerPlaylistHeight(initialLayout);
  const horizontalDirection = edges.includes("e")
    ? 1
    : edges.includes("w")
      ? -1
      : 0;
  const verticalDirection = edges.includes("s")
    ? 1
    : edges.includes("n")
      ? -1
      : 0;
  const isExpandedVerticalResize =
    isDesktop && isExpanded && verticalDirection !== 0;

  if (isExpandedVerticalResize) {
    const chromeHeight =
      initialLayout.width / LEARNING_MINI_PLAYER_ASPECT_RATIO +
      LEARNING_MINI_PLAYER_DESKTOP_INFO_BAR_HEIGHT;
    const initialHeight = chromeHeight + playlistHeight;
    const initialBottom = initialLayout.top + initialHeight;
    const minTop = viewport.top + LEARNING_MINI_PLAYER_MARGIN;
    const bottomEdge = getLearningMiniPlayerBottomEdge(viewport);
    const maxPlaylist = Math.max(
      LEARNING_MINI_PLAYER_DESKTOP_PLAYLIST_MIN_HEIGHT,
      edges.includes("n")
        ? initialBottom - minTop - chromeHeight
        : bottomEdge - initialLayout.top - chromeHeight,
    );
    const nextPlaylistHeight = clampLearningPlayerValue(
      playlistHeight + (edges.includes("s") ? deltaY : -deltaY),
      LEARNING_MINI_PLAYER_DESKTOP_PLAYLIST_MIN_HEIGHT,
      maxPlaylist,
    );
    const height = chromeHeight + nextPlaylistHeight;
    const top = edges.includes("n")
      ? initialBottom - height
      : initialLayout.top;
    const maximumTop = Math.max(minTop, bottomEdge - height);

    return {
      left: initialLayout.left,
      playlistHeight: nextPlaylistHeight,
      top: clampLearningPlayerValue(top, minTop, maximumTop),
      width: initialLayout.width,
    };
  }
  const aspectAdjustedVerticalDirection =
    verticalDirection / LEARNING_MINI_PLAYER_ASPECT_RATIO;
  const widthDelta =
    horizontalDirection && verticalDirection
      ? (horizontalDirection * deltaX +
          aspectAdjustedVerticalDirection * deltaY) /
        (horizontalDirection * horizontalDirection +
          aspectAdjustedVerticalDirection * aspectAdjustedVerticalDirection)
      : horizontalDirection
        ? horizontalDirection * deltaX
        : verticalDirection * deltaY * LEARNING_MINI_PLAYER_ASPECT_RATIO;
  const { maximumWidth, minimumWidth } =
    getLearningMiniPlayerWidthBounds(viewport);
  const width = clampLearningPlayerValue(
    initialLayout.width + widthDelta,
    minimumWidth,
    maximumWidth,
  );
  const initialHeight = getLearningMiniPlayerHeight(
    initialLayout.width,
    isDesktop,
    isExpanded,
    playlistHeight,
  );
  const height = getLearningMiniPlayerHeight(
    width,
    isDesktop,
    isExpanded,
    playlistHeight,
  );
  const initialRight = initialLayout.left + initialLayout.width;
  const initialBottom = initialLayout.top + initialHeight;
  const minimumLeft = viewport.left + LEARNING_MINI_PLAYER_MARGIN;
  const maximumLeft = Math.max(
    minimumLeft,
    viewport.left + viewport.width - LEARNING_MINI_PLAYER_MARGIN - width,
  );
  const minimumTop = viewport.top + LEARNING_MINI_PLAYER_MARGIN;
  const maximumTop = Math.max(
    minimumTop,
    getLearningMiniPlayerBottomEdge(viewport) - height,
  );
  const left = edges.includes("w")
    ? initialRight - width
    : edges.includes("e")
      ? initialLayout.left
      : initialLayout.left + (initialLayout.width - width) / 2;
  const top = edges.includes("n")
    ? initialBottom - height
    : edges.includes("s")
      ? initialLayout.top
      : initialLayout.top + (initialHeight - height) / 2;

  return {
    left: clampLearningPlayerValue(left, minimumLeft, maximumLeft),
    playlistHeight,
    top: clampLearningPlayerValue(top, minimumTop, maximumTop),
    width,
  };
};
