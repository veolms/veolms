export const MIN_PLAYER_ZOOM = 1;
export const MAX_PLAYER_ZOOM = 10;

export interface PlayerZoomGeometry {
  containerHeight: number;
  containerWidth: number;
  mediaHeight: number;
  mediaWidth: number;
}

export interface PlayerPan {
  x: number;
  y: number;
}

export function clampPlayerZoom(scale: number): number {
  return Math.min(MAX_PLAYER_ZOOM, Math.max(MIN_PLAYER_ZOOM, scale));
}

export function getPlayerZoomGeometry(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): PlayerZoomGeometry {
  const safeContainerWidth = Math.max(1, containerWidth);
  const safeContainerHeight = Math.max(1, containerHeight);
  const videoRatio =
    videoWidth > 0 && videoHeight > 0
      ? videoWidth / videoHeight
      : safeContainerWidth / safeContainerHeight;
  const containerRatio = safeContainerWidth / safeContainerHeight;

  if (videoRatio >= containerRatio) {
    return {
      containerHeight: safeContainerHeight,
      containerWidth: safeContainerWidth,
      mediaHeight: safeContainerWidth / videoRatio,
      mediaWidth: safeContainerWidth,
    };
  }

  return {
    containerHeight: safeContainerHeight,
    containerWidth: safeContainerWidth,
    mediaHeight: safeContainerHeight,
    mediaWidth: safeContainerHeight * videoRatio,
  };
}

export function getPlayerFillZoom(geometry: PlayerZoomGeometry): number {
  return clampPlayerZoom(
    Math.max(
      geometry.containerWidth / geometry.mediaWidth,
      geometry.containerHeight / geometry.mediaHeight,
    ),
  );
}

export function clampPlayerPan(
  pan: PlayerPan,
  scale: number,
  geometry: PlayerZoomGeometry,
): PlayerPan {
  if (scale <= MIN_PLAYER_ZOOM) return { x: 0, y: 0 };
  const maxX = Math.max(
    0,
    (geometry.mediaWidth * scale - geometry.containerWidth) / 2,
  );
  const maxY = Math.max(
    0,
    (geometry.mediaHeight * scale - geometry.containerHeight) / 2,
  );
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}
