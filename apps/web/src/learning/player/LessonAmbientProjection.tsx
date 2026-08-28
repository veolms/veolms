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

export interface LessonAmbientProjectionProps {
  enabled: boolean;
  theaterMode: boolean;
}

export function LessonAmbientProjection({
  enabled,
  theaterMode,
}: LessonAmbientProjectionProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const inlineCanvasRef = useRef<HTMLCanvasElement>(null);
  const shellCanvasRef = useRef<HTMLCanvasElement>(null);
  const [shellHost, setShellHost] = useState<HTMLElement | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const { error, playing } = usePlayerState(
    ({ media }) => ({
      error: Boolean(media.error),
      playing: media.playing,
    }),
    (left, right) =>
      left.error === right.error && left.playing === right.playing,
  );

  const getShell = useCallback(
    () => anchorRef.current?.closest<HTMLElement>(".video-shell") ?? null,
    [],
  );

  const paintFrame = useCallback(() => {
    const video = getShell()?.querySelector("video");
    if (!enabled || !video || video.readyState < 2) return;

    try {
      for (const canvas of [inlineCanvasRef.current, shellCanvasRef.current]) {
        if (!canvas) continue;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) continue;
        if (canvas.width !== 96) canvas.width = 96;
        if (canvas.height !== 54) canvas.height = 54;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    } catch {
      // Cross-origin media may forbid canvas projection; video playback remains usable.
    }
  }, [enabled, getShell]);

  useLayoutEffect(() => {
    const shell = getShell();
    setShellHost(shell);
    setPortalHost(shell?.closest<HTMLElement>(".courses-app") ?? null);
  }, [getShell]);

  useEffect(() => {
    const shell = getShell();
    const canvas = shellCanvasRef.current;
    if (!portalHost || !shell || !canvas) return undefined;

    let animationFrame = 0;
    const syncProjectionBounds = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const bounds = shell.getBoundingClientRect();
        canvas.style.left = `${bounds.left}px`;
        canvas.style.top = `${bounds.top}px`;
        canvas.style.width = `${bounds.width}px`;
        canvas.style.height = `${bounds.height}px`;
      });
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncProjectionBounds);
    const scrollport = shell.closest(".courses-main");

    resizeObserver?.observe(shell);
    scrollport?.addEventListener("scroll", syncProjectionBounds, {
      passive: true,
    });
    window.addEventListener("resize", syncProjectionBounds, { passive: true });
    window.visualViewport?.addEventListener("resize", syncProjectionBounds);
    syncProjectionBounds();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      scrollport?.removeEventListener("scroll", syncProjectionBounds);
      window.removeEventListener("resize", syncProjectionBounds);
      window.visualViewport?.removeEventListener(
        "resize",
        syncProjectionBounds,
      );
    };
  }, [getShell, portalHost, theaterMode]);

  useEffect(() => {
    if (!enabled) return undefined;
    const video = getShell()?.querySelector("video");
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
  }, [enabled, getShell, paintFrame, playing, shellHost]);

  const visible = enabled && !error;
  return (
    <>
      <span ref={anchorRef} hidden />
      {portalHost
        ? createPortal(
            <canvas
              ref={shellCanvasRef}
              aria-hidden="true"
              data-ambient-shell-projection
              className={`ambient-canvas ambient-canvas--shell ${visible ? "ambient-canvas--visible" : ""}`}
            />,
            portalHost,
          )
        : null}
      {shellHost
        ? createPortal(
            <canvas
              ref={inlineCanvasRef}
              aria-hidden="true"
              data-ambient-inline-projection
              className={`ambient-canvas ${visible ? "ambient-canvas--visible" : ""}`}
            />,
            shellHost,
          )
        : null}
    </>
  );
}
