const FLIGHT_MS = 420;
const FLIGHT_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** The laptop screen's corners (its `rounded-2xl`). */
const SCREEN_RADIUS = "16px";

/**
 * The picture the hero's laptop is showing, flown between the laptop and
 * the whole window. Used as its video leaves full screen ("in"), so the
 * video seems to return into the laptop.
 *
 * A canvas holding the video's current frame is laid over the page where
 * the laptop's screen is drawn, in the screen's own perspective (the
 * transform that fits the screen onto the laptop, see
 * `useHeroLaptopScreen`), and its transform is animated between that and
 * one that fills the window. Resolves once the flight has landed; the
 * returned function takes the canvas away. Nothing is flown (and the
 * function does nothing) where motion is reduced or the laptop's screen is
 * not found.
 */
export async function flyHeroLaptopVideo(
  shell: HTMLElement,
  direction: "out" | "in",
): Promise<() => void> {
  const nothing = () => undefined;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return nothing;
  }
  const screen = shell.closest<HTMLElement>("[data-hero-measured]");
  const section = screen?.closest("section");
  const video = shell.querySelector<HTMLVideoElement>(
    "video:not([data-player-standby])",
  );
  if (!screen || !section || !video) return nothing;

  const width = screen.offsetWidth;
  const height = screen.offsetHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    // The frame as the laptop shows it: cropped to the screen's shape.
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const scale = Math.max(
        width / video.videoWidth,
        height / video.videoHeight,
      );
      const drawnWidth = video.videoWidth * scale;
      const drawnHeight = video.videoHeight * scale;
      try {
        context.drawImage(
          video,
          (width - drawnWidth) / 2,
          (height - drawnHeight) / 2,
          drawnWidth,
          drawnHeight,
        );
      } catch {
        // A frame that cannot be drawn leaves the screen black.
      }
    }
  }

  const sectionBox = section.getBoundingClientRect();
  const onLaptop = {
    transform: `translate(${sectionBox.left}px, ${sectionBox.top}px) ${screen.style.transform}`,
    borderRadius: SCREEN_RADIUS,
  };
  const onWindow = {
    transform: `translate(0px, 0px) scale(${window.innerWidth / width}, ${window.innerHeight / height})`,
    borderRadius: "0px",
  };
  Object.assign(canvas.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: `${width}px`,
    height: `${height}px`,
    transformOrigin: "0 0",
    zIndex: "2147483647",
    pointerEvents: "none",
    background: "#000",
  });
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  await canvas
    .animate(
      direction === "out" ? [onLaptop, onWindow] : [onWindow, onLaptop],
      {
        duration: FLIGHT_MS,
        easing: FLIGHT_EASING,
        fill: "forwards",
      },
    )
    .finished.catch(() => undefined);
  return () => canvas.remove();
}
