import procodrrLogoMark from "../assets/procodrr-logo-mark.svg";

type AppLoadingScreenProps = {
  variant?: "page" | "embedded";
};

function LoadingStatus() {
  return (
    <div
      className="flex w-full max-w-64 flex-col items-center gap-4 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="grid size-14 place-items-center rounded-2xl bg-(--surface) shadow-(--surface-depth-shadow)">
        <img
          className="h-8 w-auto"
          src={procodrrLogoMark}
          alt=""
          width={115}
          height={136}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold tracking-tight">
          Loading your workspace
        </p>
        <p className="text-xs leading-5 text-(--muted)">
          Restoring your saved layout…
        </p>
      </div>
      <span className="flex gap-1.5" aria-hidden="true">
        <span className="size-1.5 animate-pulse rounded-full bg-(--accent) motion-reduce:animate-none" />
        <span className="size-1.5 animate-pulse rounded-full bg-(--accent) [animation-delay:160ms] motion-reduce:animate-none" />
        <span className="size-1.5 animate-pulse rounded-full bg-(--accent) [animation-delay:320ms] motion-reduce:animate-none" />
      </span>
    </div>
  );
}

export function AppLoadingScreen({
  variant = "page",
}: AppLoadingScreenProps = {}) {
  if (variant === "embedded") {
    return (
      <div
        className="flex w-full min-h-60 flex-col items-center justify-center px-2 py-8 lg:min-h-70"
        data-app-loading
        aria-label="Loading ProCodrr"
      >
        <LoadingStatus />
      </div>
    );
  }

  return (
    <main
      className="fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-hidden bg-(--canvas) px-6 text-(--text)"
      data-app-loading
      aria-label="Loading ProCodrr"
    >
      <LoadingStatus />
    </main>
  );
}
