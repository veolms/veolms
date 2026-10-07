import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  HomePageSettings,
  HomePageSettingsResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { homeKeys } from "./home.keys";
import { homeService } from "./home.service";

export function useUpdateHomePageSettings() {
  const queryClient = useQueryClient();

  return useMutation<HomePageSettingsResponse, ApiError, HomePageSettings>({
    mutationFn: (settings) => homeService.updatePageSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(homeKeys.pageSettings(), saved);
      // The public page is resolved from these settings.
      void queryClient.invalidateQueries({ queryKey: homeKeys.guestPage() });
    },
  });
}
