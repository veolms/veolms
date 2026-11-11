import { HeadphonesIcon as Headphones } from "@phosphor-icons/react/Headphones";
import { usePlayerState } from "@veolms/video-player";

/**
 * What an audio lesson shows where a video's picture would be: the theme's
 * colour glowing behind the lesson's artwork, which breathes while it
 * plays. The player's own controls (the central play button, the bar
 * along the bottom) stand over it, as over a video; it takes no taps.
 */
export function LessonAudioArtwork({
  lessonTitle,
  courseTitle,
}: {
  lessonTitle: string;
  courseTitle?: string;
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
      <div className="flex size-full flex-col items-center justify-center gap-[clamp(0.5rem,4cqh,1.25rem)] pb-[8cqh]">
        <div className="relative flex size-[clamp(3.5rem,30cqh,8.5rem)] items-center justify-center">
          {playing ? (
            <>
              <span className="absolute inset-0 animate-ping rounded-[28%] bg-(--accent) opacity-15 [animation-duration:2.4s]" />
              <span className="absolute -inset-3 rounded-[30%] bg-(--accent) opacity-10 blur-lg" />
            </>
          ) : null}
          <div className="relative flex size-full items-center justify-center rounded-[28%] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--accent)_45%,#0c122c)_0%,#0b0e1f_100%)] shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
            {/* Paused, the player's play button stands here instead. */}
            <Headphones
              weight="fill"
              className={`size-[45%] text-(--accent) transition-opacity duration-200 ${
                playing ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        </div>
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
