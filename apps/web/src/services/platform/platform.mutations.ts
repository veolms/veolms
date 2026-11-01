import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  PlatformSettingsResponse,
  PublicPlatformSettingsResponse,
  UpdatePlatformSettingsRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authKeys } from "../auth";
import { platformKeys } from "./platform.keys";
import { platformService } from "./platform.service";

/**
 * Saves one setting the moment it is changed, as the Settings page does. The
 * page shows the change at once and returns to the saved value if the save
 * fails.
 */
export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient();
  return useMutation<
    PlatformSettingsResponse,
    ApiError,
    UpdatePlatformSettingsRequest,
    { previous: PlatformSettingsResponse | undefined }
  >({
    mutationFn: (changes) => platformService.updateSettings(changes),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: platformKeys.settings() });
      const previous = queryClient.getQueryData<PlatformSettingsResponse>(
        platformKeys.settings(),
      );
      if (previous) {
        queryClient.setQueryData<PlatformSettingsResponse>(
          platformKeys.settings(),
          {
            ...previous,
            settings: {
              appearance: {
                ...previous.settings.appearance,
                ...changes.appearance,
              },
              security: { ...previous.settings.security, ...changes.security },
              invoice: { ...previous.settings.invoice, ...changes.invoice },
            },
          },
        );
      }
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) {
        queryClient.setQueryData(platformKeys.settings(), context.previous);
      }
    },
    onSuccess: (saved, changes) => {
      queryClient.setQueryData(platformKeys.settings(), saved);
      // Visitors are never sent the invoice details; neither is this copy.
      const { appearance, security } = saved.settings;
      queryClient.setQueryData<PublicPlatformSettingsResponse>(
        platformKeys.publicSettings(),
        { appearance, security },
      );
      if (changes.security?.requireVerifiedPhoneForEnrollment !== undefined) {
        void queryClient.invalidateQueries({ queryKey: authKeys.config() });
      }
    },
  });
}
