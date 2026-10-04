import type { HomeDiscoveryResponse } from "@veolms/contracts";

import { api } from "../../lib/api-client";

export const homeService = {
  getDiscovery(): Promise<HomeDiscoveryResponse> {
    return api.get<HomeDiscoveryResponse>("/home/discovery");
  },
};
