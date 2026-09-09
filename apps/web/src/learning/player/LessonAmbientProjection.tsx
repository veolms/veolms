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
}

export function LessonAmbientProjection({
  enabled,
}: LessonAmbientProjectionProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const inlineCanvasRef = useRef<HTMLCanvasElement>(null);
  const shellCanvasRef = useRef<HTMLCanvasElement>(null);
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
    setShellOverlayHost(
      shell?.querySelector<HTMLElement>(
        '[data-video-player-shell-overlay-host=""]',
      ) ?? null,
    );
    setPortalHost(shell?.closest<HTMLElement>(".courses-app") ?? null);
  }, [getShell]);

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
      {!fullscreen && portalHost
        ? createPortal(
            <canvas
              ref={shellCanvasRef}
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
                <canvas
                  ref={shellCanvasRef}
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
