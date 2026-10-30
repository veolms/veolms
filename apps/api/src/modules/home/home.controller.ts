import type { HomeDiscoveryResponse } from "@veolms/contracts";
import type { HomeDiscoveryService } from "./home.discovery.service.ts";

export function createHomeController({
  service,
}: {
  service: HomeDiscoveryService;
}) {
  async function getDiscovery(): Promise<HomeDiscoveryResponse> {
    return await service.getDiscovery();
  }

  return { getDiscovery };
}

export type HomeController = ReturnType<typeof createHomeController>;
