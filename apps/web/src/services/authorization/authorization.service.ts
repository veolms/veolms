import { api } from "../../lib/api-client";
import type { CapabilitiesResponse, CapabilitiesQuery } from "@veolms/contracts";

export const authorizationService = {
  getCapabilities: (params?: CapabilitiesQuery): Promise<CapabilitiesResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.courseId) searchParams.set("courseId", params.courseId);

    const query = searchParams.toString();
    const endpoint = query ? `/me/capabilities?${query}` : "/me/capabilities";

    return api.get<CapabilitiesResponse>(endpoint);
  },
};
