import {
  useLayoutEffect,
  useRef,
  type CanvasHTMLAttributes,
  type Ref,
} from "react";
import {
  decodeSpriteSheet,
  getDecodedSpriteSheet,
  getNearestDecodedFrame,
  isFrameFetched,
  subscribeFramesDecoded,
} from "../storyboard/spriteSheetStore";
import type { StoryboardFrame } from "../storyboard/storyboardTypes";

/** The drawing's width before the canvas has a size on screen. */
const FALLBACK_CANVAS_WIDTH = 480;
/** The drawing is never made wider than this, however large the player. */
const MAX_CANVAS_WIDTH = 1920;

interface Drawn {
  source: ImageBitmap;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The drawing's size: the box the picture fills on screen (fitted the way
 * `object-fit: contain` fits it), in device pixels. Drawing at that size
 * with high-quality smoothing is sharper than drawing at the frame's own
 * size and letting the page scale the canvas.
 */
function backingSize(canvas: HTMLCanvasElement, aspect: number) {
  const ratio = window.devicePixelRatio || 1;
  const boxWidth = canvas.clientWidth;
  const boxHeight = canvas.clientHeight;
  let width = boxWidth > 0 ? boxWidth : FALLBACK_CANVAS_WIDTH / ratio;
  if (boxHeight > 0 && width / aspect > boxHeight) width = boxHeight * aspect;
  const deviceWidth = Math.max(
    1,
    Math.min(MAX_CANVAS_WIDTH, Math.round(width * ratio)),
  );
  return {
    width: deviceWidth,
    height: Math.max(1, Math.round(deviceWidth / aspect)),
  };
}

/** Draws `drawn` over the whole canvas; false when it could not. */
function paint(canvas: HTMLCanvasElement, drawn: Drawn): boolean {
  const context = canvas.getContext("2d");
  if (!context) return false;
  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      drawn.source,
      drawn.x,
      drawn.y,
      drawn.width,
      drawn.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return true;
  } catch {
    // The picture was let go meanwhile; the next frame draws again.
    return false;
  }
}

/**
 * Draws one storyboard frame from a sheet kept in `spriteSheetStore` (or a
 * preview video's decoded picture).
 *
 * The canvas keeps its last picture until the next one is drawn, so moving
 * between frames never flashes black, even when a sheet has to be decoded
 * again first. It stays invisible until its first picture (normally drawn
 * before the first paint, from the decoded sheet).
 *
 * While a preview video's picture is decoded, the closest picture already
 * decoded stands in for it. A picture that arrives after the pointer has
 * moved on is still drawn, unless one asked for later is already on the
 * canvas: a sweep faster than decoding then shows pictures trailing just
 * behind the pointer instead of holding one picture until it stops.
 *
 * While the frame's picture is not downloaded yet (a preview video fetches
 * its parts only where the timeline is used), whatever is shown is dimmed
 * under a passing shimmer until its own picture is drawn, so a picture
 * from elsewhere is never taken for this moment.
 */
export function SpriteFrameCanvas({
  className,
  frame,
  onDrawn,
  ...canvasProps
}: Omit<CanvasHTMLAttributes<HTMLCanvasElement>, "children"> & {
  frame: StoryboardFrame;
  /** Called after each picture is drawn. */
  onDrawn?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Request order of the picture asked for last, and of the one drawn (a
  // stand-in counts half, so its own picture still replaces it).
  const requestRef = useRef(0);
  const drawnRequestRef = useRef(0);
  const drawnRef = useRef<Drawn | null>(null);
  // The frame asked for last, and whether its own picture (not a stand-in)
  // is on the canvas.
  const frameRef = useRef(frame);
  const exactRef = useRef(false);
  const onDrawnRef = useRef(onDrawn);
  useLayoutEffect(() => {
    onDrawnRef.current = onDrawn;
  });
  // Shown and hidden directly, like the canvas itself: a drag changes the
  // frame on every animation frame.
  const pendingRef = useRef<HTMLSpanElement>(null);
  const setPending = (pending: boolean) => {
    if (pendingRef.current) pendingRef.current.hidden = !pending;
  };

  // Follows the canvas's size on screen; a new size clears the drawing, so
  // the last picture is drawn again at once.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const drawn = drawnRef.current;
      if (!drawn) return;
      const size = backingSize(canvas, drawn.width / drawn.height);
      if (canvas.width === size.width && canvas.height === size.height) {
        return;
      }
      canvas.width = size.width;
      canvas.height = size.height;
      paint(canvas, drawn);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const width = frame.width ?? 1;
    const height = frame.height ?? 1;
    const size = backingSize(canvas, width / height);
    if (canvas.width !== size.width || canvas.height !== size.height) {
      // Resizing clears the drawing: draw the last picture again.
      canvas.width = size.width;
      canvas.height = size.height;
      if (drawnRef.current) paint(canvas, drawnRef.current);
    }

    const request = (requestRef.current += 1);
    frameRef.current = frame;
    exactRef.current = false;
    const draw = (source: ImageBitmap, order: number, exact: boolean) => {
      if (order < drawnRequestRef.current) return;
      const drawn = { source, x: frame.x ?? 0, y: frame.y ?? 0, width, height };
      if (!paint(canvas, drawn)) return;
      drawnRef.current = drawn;
      canvas.style.opacity = "1";
      drawnRequestRef.current = order;
      if (exact && request === requestRef.current) {
        exactRef.current = true;
        setPending(false);
      }
      onDrawnRef.current?.();
    };

    const decoded = getDecodedSpriteSheet(frame.imageUrl);
    if (decoded) {
      draw(decoded, request, true);
      return undefined;
    }
    if (!isFrameFetched(frame.imageUrl)) {
      setPending(true);
      // A card waiting for its first picture opens on the placeholder.
      onDrawnRef.current?.();
    }
    const standIn = getNearestDecodedFrame(frame.imageUrl);
    if (standIn) draw(standIn, request - 0.5, false);
    let mounted = true;
    void decodeSpriteSheet(frame.imageUrl).then((sheet) => {
      if (!mounted || !canvas.isConnected) return;
      if (sheet) {
        draw(sheet, request, true);
        return;
      }
      // Not decoded this far (a fast sweep decodes a chunk's first picture
      // only): the closest one stands in until it is.
      const later = getNearestDecodedFrame(frame.imageUrl);
      if (later) draw(later, request - 0.5, false);
    });
    return () => {
      // Only an unmount stops a late picture; a newer frame does not.
      mounted = canvas.isConnected;
    };
  }, [frame]);

  // A stand-in is replaced by the frame's own picture as soon as some
  // decode produces it (the pointer slowed down over it, for one).
  useLayoutEffect(
    () =>
      subscribeFramesDecoded(() => {
        const canvas = canvasRef.current;
        if (!canvas || exactRef.current) return;
        const current = frameRef.current;
        const source = getDecodedSpriteSheet(current.imageUrl);
        if (!source) return;
        const drawn = {
          source,
          x: current.x ?? 0,
          y: current.y ?? 0,
          width: current.width ?? 1,
          height: current.height ?? 1,
        };
        if (!paint(canvas, drawn)) return;
        drawnRef.current = drawn;
        canvas.style.opacity = "1";
        drawnRequestRef.current = requestRef.current;
        exactRef.current = true;
        setPending(false);
        onDrawnRef.current?.();
      }),
    [],
  );

  return (
    <>
      <canvas
        {...canvasProps}
        ref={canvasRef}
        aria-hidden="true"
        className={`opacity-0 ${className ?? ""}`}
      />
      <PendingPicture ref={pendingRef} />
    </>
  );
}

/**
 * Over a picture not downloaded yet: the canvas (or the video behind it)
 * dimmed, with a soft light passing across. The sweep's keyframes are in
 * the player's stylesheet. Hidden until a picture is waited for.
 */
function PendingPicture({ ref }: { ref: Ref<HTMLSpanElement> }) {
  return (
    <span
      ref={ref}
      hidden
      aria-hidden="true"
      data-video-player-preview-pending=""
      className="pointer-events-none absolute inset-0 z-1 overflow-hidden rounded-[inherit] bg-black/45"
    >
      <span className="absolute inset-y-0 -left-1/2 w-1/2 animate-[video-player-preview-pending_1.3s_ease-in-out_infinite] bg-linear-to-r from-transparent via-white/14 to-transparent motion-reduce:animate-none" />
    </span>
  );
}
