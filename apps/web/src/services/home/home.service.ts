import type {
  GuestHomePageResponse,
  HomeDiscoveryResponse,
  HomePageOptionsResponse,
  HomePageSettings,
  HomePageSettingsResponse,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const homeService = {
  getDiscovery(): Promise<HomeDiscoveryResponse> {
    return api.get<HomeDiscoveryResponse>("/home/discovery");
  },
  getGuestPage(): Promise<GuestHomePageResponse> {
    return api.get<GuestHomePageResponse>("/home/guest-page");
  },
  getPageSettings(): Promise<HomePageSettingsResponse> {
    return api.get<HomePageSettingsResponse>("/home/page-settings");
  },
  getPageSettingsOptions(): Promise<HomePageOptionsResponse> {
    return api.get<HomePageOptionsResponse>("/home/page-settings/options");
  },
  updatePageSettings(
    settings: HomePageSettings,
  ): Promise<HomePageSettingsResponse> {
    return api.put<HomePageSettingsResponse>("/home/page-settings", settings);
  },
};
