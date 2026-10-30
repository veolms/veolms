import {
  AnalyticsTabPlaceholder,
  LoadingTab,
  type AnalyticsTabPlaceholderSpec,
} from "@veolms/analytics-ui";
import { Button } from "../../components/Button";

/** The loading and failed states every tab shows the same way. */
export function TabState({
  isLoading,
  isError,
  onRetry,
  placeholder,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** The tab's own tiles and cards, drawn with shimmers while it loads. */
  placeholder?: AnalyticsTabPlaceholderSpec;
}) {
  if (isError) {
    // Without this a failed load left the loading cards up for good.
    return (
      <div
        role="alert"
        className="rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface,var(--surface)) p-6 text-sm text-(--muted)"
      >
        <p className="font-semibold text-(--text)">
          Analytics could not be loaded.
        </p>
        <p className="mt-1">
          Check your connection and try again. Nothing has been changed.
        </p>
        <Button motion="static" className="mt-4 h-9 text-xs" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (isLoading) {
    return placeholder ? (
      <AnalyticsTabPlaceholder spec={placeholder} />
    ) : (
      <LoadingTab />
    );
  }
  return null;
}
