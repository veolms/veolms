import type { FastifyReply, FastifyRequest } from "fastify";
import type { NavigationService } from "./navigation.service.ts";

export interface NavigationControllerOptions {
  service: NavigationService;
}

export function createNavigationController({ service }: NavigationControllerOptions) {
  async function getSidenav(request: FastifyRequest, _reply: FastifyReply) {
    const userId = request.user?.id ?? null;
    return service.getSidenav(userId);
  }

  return {
    getSidenav,
  };
}

export type NavigationController = ReturnType<typeof createNavigationController>;
