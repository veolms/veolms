import procodrrLogoMark from "../assets/procodrr-logo-mark.svg";

export function AppLoadingScreen() {
  return (
    <main
      className="fixed inset-0 grid min-h-dvh place-items-center overflow-hidden bg-[var(--canvas)] px-6 text-[var(--text)]"
      data-app-loading
      aria-label="Loading ProCodrr"
    >
      <div
        className="flex flex-col items-center gap-4 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="grid size-14 place-items-center rounded-2xl bg-[var(--surface)] shadow-[var(--surface-depth-shadow)]">
          <img
            className="h-8 w-auto"
            src={procodrrLogoMark}
            alt=""
            width={115}
            height={136}
          />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Loading your workspace</p>
          <p className="text-xs text-[var(--muted)]">
            Restoring your saved layout…
          </p>
        </div>
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--accent)] motion-reduce:animate-none" />
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:160ms] motion-reduce:animate-none" />
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:320ms] motion-reduce:animate-none" />
        </span>
      </div>
    </main>
  );
}
