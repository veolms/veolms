import { useEffect } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";

export function PlayerHud() {
  const controller = usePlayerController();
  const hud = usePlayerState(({ ui }) => ui.hud);

  useEffect(() => {
    if (!hud) return undefined;
    const timer = setTimeout(() => controller.clearHud(hud.id), 850);
    return () => clearTimeout(timer);
  }, [controller, hud]);

  if (!hud) return null;
  return (
    <div
      key={hud.id}
      className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
      role="status"
      aria-live="polite"
    >
      <span className="animate-[video-player-hud_850ms_ease-out_forwards] rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white shadow-xl backdrop-blur-md motion-reduce:animate-none">
        {hud.text}
      </span>
    </div>
  );
}
