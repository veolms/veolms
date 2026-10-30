import { getApiError } from "../lib/api-error";
import { getDeviceTimeZone } from "../lib/device-time-zone";
import { useUpdateProgressSharing } from "../services/learning-goals";

/**
 * The learner's choice to let other members see their progress. Off until
 * they turn it on. The switch is the one the settings pages draw
 * (`settings-toggle`), written in Tailwind because that one's styles are
 * loaded with the settings pages only.
 */
export function ProgressSharingSwitch({
  shared,
  setNotice,
}: {
  shared: boolean;
  setNotice?: (message: string) => void;
}) {
  const update = useUpdateProgressSharing();
  // What was asked for shows at once, and stays until the history that
  // says so has been fetched again.
  const checked =
    update.isPending && update.variables ? update.variables.shared : shared;

  const toggle = () => {
    if (update.isPending) return;
    const next = !checked;
    update.mutate(
      { shared: next, timeZone: getDeviceTimeZone() },
      {
        onSuccess: () =>
          setNotice?.(
            next
              ? "Your progress is now visible to other members."
              : "Your progress is private again.",
          ),
        onError: (error) => setNotice?.(getApiError(error).message),
      },
    );
  };

  return (
    <div className="flex max-w-full items-center gap-3.5">
      <span className="min-w-0 text-right">
        <strong
          id="progress-sharing-label"
          className="block text-sm font-semibold text-(--text)"
        >
          Share my progress
        </strong>
        <span
          id="progress-sharing-note"
          className="block text-xs leading-5 text-(--muted)"
        >
          {checked
            ? "Other members can see your days."
            : "Only you and the admins can see it."}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby="progress-sharing-label"
        aria-describedby="progress-sharing-note"
        onClick={toggle}
        className={`relative inline-flex h-6 w-10.5 shrink-0 cursor-pointer items-center rounded-full p-0.75 transition-[background-color,box-shadow] duration-150 hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
          checked
            ? "bg-(--accent)"
            : "bg-[color-mix(in_srgb,var(--text)_28%,var(--surface))]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`block size-4.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-150 ease-out motion-reduce:transition-none ${
            checked ? "translate-x-4.5" : ""
          }`}
        />
      </button>
    </div>
  );
}
