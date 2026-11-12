import { HeadphonesIcon as Headphones } from "@phosphor-icons/react/Headphones";
import { usePlayerState } from "@veolms/video-player";
import { useEffect, useRef } from "react";

/**
 * What an audio lesson shows where a video's picture would be: the theme's
 * colour glowing behind the lesson's artwork, the sound's waveform under
 * it, and the lesson's name. The player's own controls stand over it, as
 * over a video; it takes no taps.
 */
export function LessonAudioArtwork({
  lessonTitle,
  courseTitle,
  src,
  analysable = false,
}: {
  lessonTitle: string;
  courseTitle?: string;
  /** The file playing: which of the player's media elements to listen to. */
  src: string;
  /** Storage lets the file be read across origins: the sound is analysed. */
  analysable?: boolean;
}) {
  const playing = usePlayerState(({ media }) => media.playing);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [container-type:size] bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--accent)_30%,#060812)_0%,#05070d_62%,#030409_100%)]"
      data-lesson-audio-artwork=""
    >
      {/* Sized by the stage itself (a container): small on a phone, larger
          in a theatre or full screen. */}
      <div className="flex size-full flex-col items-center justify-center gap-[clamp(0.5rem,4cqh,1.25rem)] pb-[10cqh]">
        <div className="relative flex size-[clamp(3rem,26cqh,7.5rem)] items-center justify-center">
          {playing ? (
            <span className="absolute -inset-3 rounded-[30%] bg-(--accent) opacity-15 blur-xl" />
          ) : null}
          <div className="relative flex size-full items-center justify-center rounded-[28%] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--accent)_45%,#0c122c)_0%,#0b0e1f_100%)] shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
            <Headphones weight="fill" className="size-[45%] text-(--accent)" />
          </div>
        </div>
        <LessonAudioWaveform
          playing={playing}
          src={src}
          analysable={analysable}
        />
        {/* The names, where the stage is tall enough (not on a phone). */}
        <div className="hidden max-w-[80%] min-w-0 flex-col items-center text-center text-white [@container_(min-height:19rem)]:flex">
          <p className="m-0 max-w-full truncate text-lg font-bold tracking-[-0.015em]">
            {lessonTitle}
          </p>
          {courseTitle ? (
            <p className="m-0 mt-0.5 max-w-full truncate text-[0.82rem] text-white/60">
              {courseTitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** How many bars the waveform has (mirrored about its middle). */
const BAR_COUNT = 48;

/**
 * A media element's analyser. An element can be connected to Web Audio
 * only once, and then plays through it for good, so the graph is kept for
 * the element's life (the player reuses its elements for later lessons).
 */
const analysers = new WeakMap<HTMLMediaElement, AnalyserNode>();

/**
 * The element's analyser, connected only once its audio context is
 * running: an element routed through a context that is not would play in
 * silence. Null when that cannot be had (the waveform then only moves).
 */
async function connectAnalyser(
  element: HTMLMediaElement,
): Promise<AnalyserNode | null> {
  const existing = analysers.get(element);
  if (existing) {
    if (existing.context.state !== "running") {
      await (existing.context as AudioContext).resume().catch(() => undefined);
    }
    return existing;
  }
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return null;
  let context: AudioContext;
  try {
    context = new AudioContextClass();
  } catch {
    return null;
  }
  await context.resume().catch(() => undefined);
  if (context.state !== "running") {
    void context.close().catch(() => undefined);
    return null;
  }
  try {
    const source = context.createMediaElementSource(element);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    source.connect(analyser);
    analyser.connect(context.destination);
    analysers.set(element, analyser);
    // The element plays through this context for good, a later lesson's
    // video too: whenever it plays, the context runs.
    element.addEventListener("play", () => {
      if (context.state !== "running") void context.resume().catch(() => {});
    });
    return analyser;
  } catch {
    void context.close().catch(() => undefined);
    return null;
  }
}

/** The bars' heights at rest: a calm, even shape (0 to 1). */
function restingLevels(): number[] {
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    const fromMiddle = Math.abs(index - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
    return 0.08 + 0.1 * Math.cos(fromMiddle * Math.PI * 0.5) ** 2;
  });
}

/**
 * The sound's waveform: bars that follow the audio while it plays (from
 * the analyser, or, where the sound cannot be analysed, a moving likeness
 * of it) and settle into a calm line when it stops. Drawn on a canvas,
 * only while it plays and can be seen.
 */
function LessonAudioWaveform({
  playing,
  src,
  analysable,
}: {
  playing: boolean;
  src: string;
  analysable: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelsRef = useRef<number[]>(restingLevels());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context2d = canvas.getContext("2d");
    if (!context2d) return undefined;
    let frame = 0;
    let disposed = false;
    let analyser: AnalyserNode | null = null;
    const bins = new Uint8Array(128);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const accent =
      getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#7c8cff";

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
    };

    const draw = () => {
      const { width, height } = canvas;
      context2d.clearRect(0, 0, width, height);
      const gap = width / BAR_COUNT;
      const barWidth = Math.max(1, gap * 0.55);
      context2d.fillStyle = accent;
      levelsRef.current.forEach((level, index) => {
        const barHeight = Math.max(barWidth, level * height);
        const x = index * gap + (gap - barWidth) / 2;
        const y = (height - barHeight) / 2;
        context2d.globalAlpha = 0.35 + level * 0.65;
        context2d.beginPath();
        context2d.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        context2d.fill();
      });
      context2d.globalAlpha = 1;
    };

    /** Eases every bar towards where it should be, for a fluid motion. */
    const settle = (targets: number[], amount: number) => {
      levelsRef.current = levelsRef.current.map(
        (level, index) => level + ((targets[index] ?? 0) - level) * amount,
      );
    };

    const fromAnalyser = (source: AnalyserNode): number[] => {
      source.getByteFrequencyData(bins);
      // Speech and music live in the lower bins; the right half mirrors
      // the left, so the shape is even about the middle.
      const half = BAR_COUNT / 2;
      const usable = Math.floor(bins.length * 0.7);
      const left = Array.from({ length: half }, (_, index) => {
        const bin = Math.floor((index / half) ** 1.4 * usable);
        return Math.min(1, ((bins[bin] ?? 0) / 255) ** 1.2 * 1.15);
      }).reverse();
      return [...left, ...[...left].reverse()].map((value) =>
        Math.max(0.06, value),
      );
    };

    const likeness = (time: number): number[] =>
      Array.from({ length: BAR_COUNT }, (_, index) => {
        const fromMiddle =
          Math.abs(index - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
        const wave =
          0.5 +
          0.25 * Math.sin(time * 3.1 + index * 0.55) +
          0.2 * Math.sin(time * 5.3 + index * 1.7) +
          0.12 * Math.sin(time * 9.7 + index * 0.31);
        return Math.max(0.08, wave * (1 - fromMiddle * 0.55));
      });

    const loop = (now: number) => {
      if (disposed) return;
      if (!document.hidden) {
        settle(analyser ? fromAnalyser(analyser) : likeness(now / 1000), 0.35);
        draw();
      }
      frame = requestAnimationFrame(loop);
    };

    const sizes = new ResizeObserver(() => {
      resize();
      draw();
    });
    sizes.observe(canvas);
    resize();

    if (!playing || reducedMotion) {
      // Still: eased to rest, then left alone.
      let steps = 0;
      const rest = restingLevels();
      const calm = () => {
        if (disposed) return;
        settle(rest, 0.25);
        draw();
        steps += 1;
        if (steps < 24) frame = requestAnimationFrame(calm);
      };
      frame = requestAnimationFrame(calm);
    } else {
      void (async () => {
        if (analysable) {
          const element = findPlayingElement(canvas, src);
          analyser = element ? await connectAnalyser(element) : null;
        }
        if (!disposed) frame = requestAnimationFrame(loop);
      })();
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      sizes.disconnect();
    };
  }, [analysable, playing, src]);

  return (
    <canvas
      ref={canvasRef}
      className="h-[clamp(1.25rem,12cqh,3.5rem)] w-[min(78%,34rem)]"
    />
  );
}

/**
 * The player's media element playing `src`. The player keeps a second one
 * ready for the next lesson; the one with this file is the one to hear.
 */
function findPlayingElement(
  from: Element,
  src: string,
): HTMLMediaElement | null {
  const root =
    from.closest("[data-video-player-shell-overlay-host]") ??
    from.closest('[role="region"]') ??
    document;
  const elements = [...root.querySelectorAll<HTMLMediaElement>("video, audio")];
  return (
    elements.find((element) => element.currentSrc === src) ??
    elements.find((element) => !element.paused) ??
    null
  );
}
