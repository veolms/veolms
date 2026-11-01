import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  HomePageSettings,
  HomePageSettingsResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { homeKeys } from "./home.keys";
import { homeService } from "./home.service";
import { clearSessionGuestHomePage } from "./home.session";

export function useUpdateHomePageSettings() {
  const queryClient = useQueryClient();

  return useMutation<HomePageSettingsResponse, ApiError, HomePageSettings>({
    mutationFn: (settings) => homeService.updatePageSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(homeKeys.pageSettings(), saved);
      // The public page is resolved from these settings, and this tab may
      // be holding the page as it was before them.
      clearSessionGuestHomePage();
      void queryClient.invalidateQueries({ queryKey: homeKeys.guestPage() });
    },
  });
}
