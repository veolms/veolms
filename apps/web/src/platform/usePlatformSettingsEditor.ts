import type { UpdatePlatformSettingsRequest } from "@veolms/contracts";
import { getApiError } from "../lib/api-error";
import {
  usePlatformSettings,
  useUpdatePlatformSettings,
} from "../services/platform";

/**
 * The Platform page's saved settings, and a save that tells the admin how it
 * went. Each control saves the moment it changes, as Settings does; the page
 * shows the change at once and puts it back if the save fails.
 */
export function usePlatformSettingsEditor(
  setNotice?: (message: string) => void,
) {
  const query = usePlatformSettings();
  const update = useUpdatePlatformSettings();

  const save = (changes: UpdatePlatformSettingsRequest, saved: string) =>
    update.mutate(changes, {
      onSuccess: () => setNotice?.(saved),
      onError: (error) =>
        setNotice?.(
          getApiError(error).message || "The change could not be saved.",
        ),
    });

  return { query, settings: query.data?.settings, save };
}
