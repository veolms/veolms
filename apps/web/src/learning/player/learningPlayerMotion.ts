export const LEARNING_PLAYER_MOTION_DURATION_MS = 300;
export const LEARNING_PLAYER_MOTION_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

export const LEARNING_CONTENT_FADE_START_VIEWPORT_PROGRESS = 0.3;
export const LEARNING_CONTENT_FADE_END_VIEWPORT_PROGRESS = 0.4;
export const LEARNING_BACKGROUND_MOUNT_VIEWPORT_PROGRESS = 0.38;
export const LEARNING_BACKGROUND_REVEAL_START_VIEWPORT_PROGRESS = 0.4;
export const LEARNING_BACKGROUND_REVEAL_END_VIEWPORT_PROGRESS = 0.6;

export const LEARNING_MINI_PLAYER_ASPECT_RATIO = 16 / 9;
export const LEARNING_MINI_PLAYER_MARGIN = 12;
export const LEARNING_MINI_PLAYER_MIN_WIDTH = 200;
export const LEARNING_MINI_PLAYER_PHONE_MAX_VIEWPORT_WIDTH = 640;
export const LEARNING_MINI_PLAYER_DESKTOP_MIN_VIEWPORT_WIDTH = 1024;
export const LEARNING_MINI_PLAYER_PHONE_WIDTH = 200;
export const LEARNING_MINI_PLAYER_TABLET_WIDTH = 260;
export const LEARNING_MINI_PLAYER_DESKTOP_WIDTH = 320;

export interface LearningMiniPlayerLayout {
  left: number;
  top: number;
  width: number;
}

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
  const height = width / LEARNING_MINI_PLAYER_ASPECT_RATIO;
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
): LearningMiniPlayerLayout => {
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
  const initialHeight = initialLayout.width / LEARNING_MINI_PLAYER_ASPECT_RATIO;
  const height = width / LEARNING_MINI_PLAYER_ASPECT_RATIO;
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
    top: clampLearningPlayerValue(top, minimumTop, maximumTop),
    width,
  };
};
