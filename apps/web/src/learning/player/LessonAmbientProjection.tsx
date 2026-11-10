import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePlayerState } from "@veolms/video-player";

const AMBIENT_FRAME_INTERVAL_MS = 480;

/** The video picture is drawn this small: the glow is a blur of it anyway. */
const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 54;
/**
 * The canvas is this much larger than the picture in it, so the blur
 * spreads into a transparent margin instead of stopping at the canvas edge.
 * The stylesheet scales the canvas up by the same factor
 * (`.ambient-canvas[data-ambient-prefiltered]`), so the picture covers what
 * it covered before.
 */
const SPREAD = 1.5;
const CANVAS_WIDTH = FRAME_WIDTH * SPREAD;
const CANVAS_HEIGHT = FRAME_HEIGHT * SPREAD;

let canvasFilterSupport: boolean | null = null;

/**
 * Whether the canvas can blur what it draws (`context.filter`). Chromium and
 * Firefox can; Safari before 18 cannot, and keeps the stylesheet's blur.
 */
function supportsCanvasFilter(): boolean {
  if (canvasFilterSupport === null) {
    const context = document.createElement("canvas").getContext("2d");
    canvasFilterSupport = typeof context?.filter === "string";
  }
  return canvasFilterSupport;
}

/**
 * Draws the video's current picture into `canvas`, blurred and saturated
 * there and then.
 *
 * The glow used to be a 96x54 picture blurred by the stylesheet
 * (`filter: blur(38px)`) at the size it is shown, about 1000x560 pixels.
 * The browser applies such a filter again every time anything under or
 * over it is drawn, and the video over it is drawn 30 times a second. With
 * a graphics card that is cheap; without one (a GPU Chrome has blocked,
 * common on office laptops, or Chrome run without it) the processor blurred
 * a screen-sized area 30 times a second and the video showed 6 to 12 of its
 * 30 frames (measured on procodrr.com, 2026-11-10). Blurred here, it is
 * blurred twice a second on a 144x81 canvas, and the browser only scales a
 * finished picture.
 */
function paintPrefiltered(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  shown: HTMLElement = canvas,
): boolean {
  if (shown.clientWidth <= 0) return false;
  const context = canvas.getContext("2d");
  if (!context) return false;
  if (canvas.width !== CANVAS_WIDTH) canvas.width = CANVAS_WIDTH;
  if (canvas.height !== CANVAS_HEIGHT) canvas.height = CANVAS_HEIGHT;

  const style = getComputedStyle(shown);
  const blur = Number.parseFloat(style.getPropertyValue("--ambient-blur"));
  const saturate = Number.parseFloat(
    style.getPropertyValue("--ambient-saturate"),
  );
  const scale = Number.parseFloat(style.getPropertyValue("--ambient-scale"));
  // The width the stylesheet's own blur was meant for: the element's, before
  // it is scaled up. The shell glow is not scaled but laid out at its full
  // size (see `.ambient-canvas--learning-shell[data-ambient-prefiltered]`),
  // so that size is taken back out.
  const laidOutAtFullSize = style.transform === "none";
  const width = laidOutAtFullSize
    ? shown.clientWidth / ((Number.isFinite(scale) ? scale : 1) * SPREAD)
    : shown.clientWidth;
  // The stylesheet's blur is in page pixels at that width, where the
  // picture is `width` wide; here the picture is FRAME_WIDTH wide.
  const radius = ((Number.isFinite(blur) ? blur : 38) * FRAME_WIDTH) / width;

  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.filter = `blur(${radius.toFixed(2)}px) saturate(${Number.isFinite(saturate) ? saturate : 1.55})`;
  context.drawImage(
    video,
    (CANVAS_WIDTH - FRAME_WIDTH) / 2,
    (CANVAS_HEIGHT - FRAME_HEIGHT) / 2,
    FRAME_WIDTH,
    FRAME_HEIGHT,
  );
  context.filter = "none";
  if (!shown.hasAttribute("data-ambient-prefiltered")) {
    shown.setAttribute("data-ambient-prefiltered", "");
  }
  return true;
}

/** The video's picture as it is, for the stylesheet to blur (old Safari). */
function paintUnfiltered(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  if (canvas.width !== FRAME_WIDTH) canvas.width = FRAME_WIDTH;
  if (canvas.height !== FRAME_HEIGHT) canvas.height = FRAME_HEIGHT;
  context.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
}

/**
 * Shows what was drawn in `buffer` as the background picture of `element`.
 *
 * The glow that spreads under the whole app (the "shell" glow) is an
 * ordinary painted element, not a canvas. A canvas is always a compositor
 * layer of its own, and one lying under the page forces everything above
 * it (the lesson frame, the sidebar, the lesson list) into layers of their
 * own too. Without a graphics card the browser then put all of those
 * together again for every frame of the video: the page drew 28 to 33
 * times a second where it draws 58 to 60 with the same glow painted as a
 * background (headless Chrome, GPU off, 2x, 2026-11-10). A background
 * picture is part of the page's own layer and is painted again only when
 * it changes, twice a second.
 *
 * The picture is decoded before it is shown, and the one before it stays
 * underneath until then, so the glow never blinks between two pictures.
 */
function showAsBackground(
  element: HTMLElement,
  buffer: HTMLCanvasElement,
  isCurrent: () => boolean,
): void {
  const url = buffer.toDataURL("image/png");
  const image = new Image();
  const show = () => {
    if (!isCurrent() || !element.isConnected) return;
    element.style.backgroundImage = `url("${url}")`;
  };
  image.src = url;
  // A picture that cannot be decoded is shown anyway: nothing is lost.
  image.decode().then(show, show);
}

const SHELL_GLOW_GEOMETRY = ["top", "left", "width", "height"] as const;

interface ShellGlowShape {
  /** Whether the shell is the one the glow belongs to (not the mini player). */
  anchored: boolean;
  /** How much larger than the shell the glow is laid out. */
  spread: number;
}

/**
 * What placing the glow needs from the stylesheet. Read once, not on every
 * scroll: asking for computed style there made the browser restyle the
 * page in the middle of each scrolled frame.
 */
function readShellGlowShape(
  glow: HTMLElement,
  videoShell: HTMLElement,
): ShellGlowShape {
  // Only a shell the stylesheet names as the glow's anchor has one: not
  // the mini player's.
  const anchored = getComputedStyle(videoShell)
    .getPropertyValue("anchor-name")
    .includes("--learning-ambient-video-shell");
  const scale = Number.parseFloat(
    getComputedStyle(glow).getPropertyValue("--ambient-scale"),
  );
  return { anchored, spread: (Number.isFinite(scale) ? scale : 1) * SPREAD };
}

/**
 * The elements that move the video when they scroll: its scrolling
 * ancestors up to the element the glow is laid out in. The lesson list
 * scrolls on its own and is not one of them.
 */
function scrollersAround(videoShell: HTMLElement, host: HTMLElement) {
  const scrollers: HTMLElement[] = [];
  for (
    let element = videoShell.parentElement;
    element && element !== host;
    element = element.parentElement
  ) {
    const { overflowX, overflowY } = getComputedStyle(element);
    if (/(auto|scroll)/.test(overflowY) || /(auto|scroll)/.test(overflowX)) {
      scrollers.push(element);
    }
  }
  return scrollers;
}

/**
 * Lays the glow that spreads under the whole app out around the video, in
 * pixels, by measuring the video's shell.
 *
 * The stylesheet does the same with anchor positioning (`anchor()` and
 * `anchor-size()` on `.ambient-canvas--learning-shell`), and that is what
 * a glow not yet drawn keeps. But an element placed by `anchor()` is drawn
 * apart from the page under it, as a canvas is: with the GPU off the page
 * drew 30 to 36 times a second with the glow placed that way and 58 to 60
 * with the very same box written in pixels (headless Chrome, 2x,
 * 2026-11-10). The box is the shell's, grown by the glow's scale and the
 * margin its blur spreads into (see `SPREAD`).
 */
function placeShellGlow(
  glow: HTMLElement,
  videoShell: HTMLElement,
  shape: ShellGlowShape | null = null,
): void {
  if (
    glow.dataset.ambientProjectionScope !== "app" ||
    !glow.hasAttribute("data-ambient-prefiltered")
  ) {
    return;
  }
  const { anchored, spread } = shape ?? readShellGlowShape(glow, videoShell);
  const parent = glow.offsetParent;
  const shellRect = videoShell.getBoundingClientRect();
  if (!(parent instanceof HTMLElement) || !anchored || shellRect.width <= 0) {
    for (const property of SHELL_GLOW_GEOMETRY) {
      glow.style.removeProperty(property);
    }
    return;
  }
  const parentRect = parent.getBoundingClientRect();
  const width = shellRect.width * spread;
  const height = shellRect.height * spread;
  const next = {
    top:
      shellRect.top -
      parentRect.top -
      parent.clientTop +
      parent.scrollTop -
      (height - shellRect.height) / 2,
    left:
      shellRect.left -
      parentRect.left -
      parent.clientLeft +
      parent.scrollLeft -
      (width - shellRect.width) / 2,
    width,
    height,
  };
  for (const property of SHELL_GLOW_GEOMETRY) {
    const value = `${next[property].toFixed(2)}px`;
    if (glow.style.getPropertyValue(property) !== value) {
      glow.style.setProperty(property, value);
    }
  }
}

export interface LessonAmbientProjectionProps {
  enabled: boolean;
}

export function LessonAmbientProjection({
  enabled,
}: LessonAmbientProjectionProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const inlineCanvasRef = useRef<HTMLCanvasElement>(null);
  const shellGlowRef = useRef<HTMLDivElement>(null);
  /** Where the shell glow is drawn before it is shown as a background. */
  const shellBufferRef = useRef<HTMLCanvasElement | null>(null);
  const shellPaintRef = useRef(0);
  const [shellHost, setShellHost] = useState<HTMLElement | null>(null);
  const [shellOverlayHost, setShellOverlayHost] = useState<HTMLElement | null>(
    null,
  );
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const { error, fullscreen, playing } = usePlayerState(
    ({ media, ui }) => ({
      error: Boolean(media.error),
      fullscreen: ui.fullscreen,
      playing: media.playing,
    }),
    (left, right) =>
      left.error === right.error &&
      left.fullscreen === right.fullscreen &&
      left.playing === right.playing,
  );

  const getShell = useCallback(
    () => anchorRef.current?.closest<HTMLElement>(".video-shell") ?? null,
    [],
  );

  const paintFrame = useCallback(() => {
    const video = getShell()?.querySelector<HTMLVideoElement>(
      "video:not([data-player-standby])",
    );
    if (!enabled || !video || video.readyState < 2) return;

    try {
      const prefiltered = supportsCanvasFilter();
      const inline = inlineCanvasRef.current;
      if (inline) {
        if (prefiltered) {
          paintPrefiltered(inline, video);
        } else {
          paintUnfiltered(inline, video);
        }
      }
      const shellGlow = shellGlowRef.current;
      // Not drawn where the page is drawn without a graphics card (see the
      // stylesheet rule on `[data-ambient-projection-scope="app"]`).
      if (
        shellGlow &&
        !(
          shellGlow.dataset.ambientProjectionScope === "app" &&
          document.documentElement.dataset.rendering === "software"
        )
      ) {
        const buffer = (shellBufferRef.current ??=
          document.createElement("canvas"));
        const painted = prefiltered
          ? paintPrefiltered(buffer, video, shellGlow)
          : (paintUnfiltered(buffer, video), true);
        if (painted) {
          // Placed again with every picture: the video's place can change
          // with nothing here hearing of it (a banner opening above it).
          const videoShell = getShell();
          if (videoShell) placeShellGlow(shellGlow, videoShell);
          const paint = ++shellPaintRef.current;
          showAsBackground(
            shellGlow,
            buffer,
            () => shellPaintRef.current === paint,
          );
        }
      }
    } catch {
      // Cross-origin media may forbid canvas projection; video playback remains usable.
    }
  }, [enabled, getShell]);

  useLayoutEffect(() => {
    const shell = getShell();
    setShellHost(shell);
    setShellOverlayHost(
      shell?.querySelector<HTMLElement>(
        '[data-video-player-shell-overlay-host=""]',
      ) ?? null,
    );
    setPortalHost(shell?.closest<HTMLElement>(".courses-app") ?? null);
  }, [getShell]);

  // The shell glow follows the video as the page is resized or scrolled:
  // only when what scrolls carries the video (not the lesson list), and
  // with the stylesheet read once, when sizes change.
  useEffect(() => {
    const videoShell = getShell();
    if (!enabled || fullscreen || !videoShell || !portalHost) return undefined;
    let frame = 0;
    let shape: ShellGlowShape | null = null;
    const place = () => {
      frame = 0;
      const glow = shellGlowRef.current;
      if (!glow || !videoShell.isConnected) return;
      shape ??= readShellGlowShape(glow, videoShell);
      placeShellGlow(glow, videoShell, shape);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };
    const reshape = () => {
      shape = null;
      schedule();
    };
    const observer = new ResizeObserver(reshape);
    observer.observe(videoShell);
    observer.observe(portalHost);
    const scrollers = scrollersAround(videoShell, portalHost);
    for (const scroller of scrollers) {
      scroller.addEventListener("scroll", schedule, { passive: true });
    }
    window.addEventListener("resize", reshape);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      for (const scroller of scrollers) {
        scroller.removeEventListener("scroll", schedule);
      }
      window.removeEventListener("resize", reshape);
    };
  }, [enabled, fullscreen, getShell, portalHost, shellHost]);

  // Entering or leaving full screen swaps the shell glow for a new, blank
  // one (see below), so it is painted again then: otherwise only the loop
  // that runs while the video plays would, and a paused video kept no glow.
  useEffect(() => {
    if (!enabled) return undefined;
    const video = getShell()?.querySelector<HTMLVideoElement>(
      "video:not([data-player-standby])",
    );
    paintFrame();
    video?.addEventListener("loadeddata", paintFrame);
    video?.addEventListener("seeked", paintFrame);

    if (!playing) {
      return () => {
        video?.removeEventListener("loadeddata", paintFrame);
        video?.removeEventListener("seeked", paintFrame);
      };
    }

    let animationFrame = 0;
    let lastPaint = 0;
    const draw = (time: number) => {
      if (time - lastPaint >= AMBIENT_FRAME_INTERVAL_MS) {
        paintFrame();
        lastPaint = time;
      }
      animationFrame = window.requestAnimationFrame(draw);
    };
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      video?.removeEventListener("loadeddata", paintFrame);
      video?.removeEventListener("seeked", paintFrame);
    };
  }, [enabled, fullscreen, getShell, paintFrame, playing, shellHost]);

  const visible = enabled && !error;
  return (
    <>
      <span ref={anchorRef} hidden />
      {!fullscreen && portalHost
        ? createPortal(
            <div
              ref={shellGlowRef}
              aria-hidden="true"
              data-ambient-shell-projection
              data-ambient-projection-scope="app"
              className={`ambient-canvas ambient-canvas--shell ambient-canvas--learning-shell ${visible ? "ambient-canvas--visible" : ""}`}
            />,
            portalHost,
          )
        : null}
      {shellOverlayHost
        ? createPortal(
            <>
              {fullscreen ? (
                <div
                  ref={shellGlowRef}
                  aria-hidden="true"
                  data-ambient-shell-projection
                  data-ambient-projection-scope="fullscreen"
                  className={`ambient-canvas ambient-canvas--shell ambient-canvas--learning-shell ambient-canvas--fullscreen-shell ${visible ? "ambient-canvas--visible" : ""}`}
                />
              ) : null}
              <canvas
                ref={inlineCanvasRef}
                aria-hidden="true"
                data-ambient-inline-projection
                className={`ambient-canvas ${visible ? "ambient-canvas--visible" : ""}`}
              />
            </>,
            shellOverlayHost,
          )
        : null}
    </>
  );
}
