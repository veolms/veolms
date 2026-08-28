import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";

const messages: Record<string, string> = {
  DRM: "Your browser could not play this protected content.",
  MANIFEST: "The stream manifest could not be loaded.",
  NETWORK: "Your connection was interrupted while loading the video.",
  UNSUPPORTED: "This video format is not supported by your browser.",
  SOURCE: "The video source is unavailable.",
  MEDIA: "The browser could not decode this video.",
};

export function ErrorOverlay() {
  const controller = usePlayerController();
  const error = usePlayerState(({ media }) => media.error);
  if (!error) return null;

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-black/75 p-6 text-center text-white backdrop-blur-sm"
      role="alert"
    >
      <div className="max-w-sm space-y-4">
        <WarningCircle size={42} className="mx-auto text-amber-300" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Unable to play this video</h2>
          <p className="text-sm text-white/70">
            {messages[error.category] ?? error.message}
          </p>
        </div>
        {error.recoverable ? (
          <button
            type="button"
            className="mx-auto inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={() => void controller.reload().catch(() => undefined)}
          >
            <ArrowClockwise size={18} />
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
