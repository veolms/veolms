import { api } from "../../lib/api-client";
import type { SidenavResponse } from "@veolms/contracts";

export const navigationService = {
  getSidenav: (): Promise<SidenavResponse> => {
    return api.get<SidenavResponse>("/navigation/sidenav");
  },
};
