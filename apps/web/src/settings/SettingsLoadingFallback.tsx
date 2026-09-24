import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";

export function SettingsLoadingFallback() {
  return (
    <div
      className="grid min-h-[55vh] w-full place-items-center px-4 py-8 text-(--muted)"
      role="status"
      aria-live="polite"
      aria-label="Loading settings"
      data-app-loading
    >
      <CircleNotch
        size={24}
        className="animate-spin text-(--accent) motion-reduce:animate-none"
        aria-hidden="true"
      />
    </div>
  );
}
