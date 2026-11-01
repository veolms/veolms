/**
 * What a like feels like, on the Discussions page and under a lesson video
 * alike: the thumb lifts with a small burst, and the like sound plays. It
 * only follows a press (browsers allow sound after one).
 */

const BURST_PARTICLES = 8;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The like sound (public/static/sounds/like.mp3: two soft taps, 0.3 s). */
const LIKE_SOUND_URL = "/static/sounds/like.mp3";

let likeAudio: HTMLAudioElement | null = null;

export function playLikeSound() {
  try {
    likeAudio ??= new Audio(LIKE_SOUND_URL);
    const audio = likeAudio;
    audio.volume = 0.6;
    // A like pressed while the last sound still plays starts it again.
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch {
    // No sound where audio is unavailable; the like itself is unaffected.
  }
}

/** The thumb's lift and a small burst around it, as on YouTube. The
 * element should be positioned (relative) so the burst centres on it. */
export function celebrateLike(icon: HTMLElement) {
  if (prefersReducedMotion()) return;
  icon.animate(
    [
      { transform: "scale(1) rotate(0deg)" },
      {
        transform: "scale(1.5) rotate(-22deg) translateY(-2px)",
        offset: 0.35,
      },
      { transform: "scale(0.9) rotate(6deg)", offset: 0.7 },
      { transform: "scale(1) rotate(0deg)" },
    ],
    { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  );
  for (let index = 0; index < BURST_PARTICLES; index += 1) {
    const angle = (index / BURST_PARTICLES) * Math.PI * 2;
    const x = Math.cos(angle) * 12;
    const y = Math.sin(angle) * 12;
    const particle = document.createElement("span");
    particle.className =
      "pointer-events-none absolute top-1/2 left-1/2 size-[3px] rounded-full bg-current";
    icon.append(particle);
    const motion = particle.animate(
      [
        { transform: "translate(-50%, -50%) scale(0)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`,
          opacity: 1,
          offset: 0.55,
        },
        {
          transform: `translate(calc(-50% + ${x * 1.45}px), calc(-50% + ${y * 1.45}px)) scale(0)`,
          opacity: 0,
        },
      ],
      { duration: 480, delay: 90, easing: "ease-out", fill: "backwards" },
    );
    motion.onfinish = () => particle.remove();
    motion.oncancel = () => particle.remove();
  }
}

/** The chime and the burst for a like button whose thumb is marked
 * `data-like-icon`. */
export function cheerLike(button: HTMLElement) {
  playLikeSound();
  const icon = button.querySelector<HTMLElement>("[data-like-icon]");
  if (icon) celebrateLike(icon);
}
