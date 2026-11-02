import { cacheTags, createCache } from "@veolms/api-core";
import type { SidenavResponse } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { config } from "../../config.ts";
import * as navigationRepository from "./navigation.repository.ts";

export interface NavigationServiceOptions {
  database: Kysely<Database>;
}

/**
 * The side navigation, per user (or for visitors), asked for on every page
 * load. It follows from the user's roles and the menus, which change only
 * through migrations and seeds: a role granted or revoked clears the user,
 * a role edited clears every entry (`rbac`). Kept as long as a sign-in.
 */
const sidenavs = createCache<SidenavResponse>({
  name: "navigation.sidenav",
  ttlMs: config.SESSION_AUTH_CACHE_TTL_MS,
  maxEntries: 20_000,
  maxBytes: 16 * 1024 * 1024,
});

const VISITOR_KEY = "visitor";

export function createNavigationService({
  database,
}: NavigationServiceOptions) {
  async function getSidenav(userId?: string | null): Promise<SidenavResponse> {
    if (!userId) {
      return await sidenavs.fetch(
        VISITOR_KEY,
        async () => ({
          menus: await navigationRepository.listPublicMenus(database),
          permissions: [],
          roles: [],
        }),
        { tags: [cacheTags.rbac] },
      );
    }

    return await sidenavs.fetch(
      userId.toLowerCase(),
      () => navigationRepository.getUserSidenav(database, userId),
      { tags: [cacheTags.user(userId), cacheTags.rbac] },
    );
  }

  return {
    getSidenav,
  };
}

export type NavigationService = ReturnType<typeof createNavigationService>;
