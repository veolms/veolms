import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";

/** What a Platform section shows while its settings load, or when they fail. */
export function PlatformSettingsStatus({
  isError,
  onRetry,
}: {
  isError: boolean;
  onRetry: () => void;
}) {
  if (!isError) {
    return (
      <CenteredLoadingSpinner
        label="Loading platform settings"
        className="min-h-52 py-24"
      />
    );
  }
  return (
    <section
      role="alert"
      className="settings-section grid place-items-center gap-3 p-10! text-center"
    >
      <p className="text-sm font-semibold text-(--text)">
        The platform settings could not be loaded.
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </section>
  );
}
