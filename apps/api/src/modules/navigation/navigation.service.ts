import type { SidenavResponse } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import * as navigationRepository from "./navigation.repository.ts";

export interface NavigationServiceOptions {
  database: Kysely<Database>;
}

export function createNavigationService({ database }: NavigationServiceOptions) {
  async function getSidenav(userId?: string | null): Promise<SidenavResponse> {
    if (!userId) {
      const publicMenus = await navigationRepository.listPublicMenus(database);
      return {
        menus: publicMenus,
        permissions: [],
        roles: [],
      };
    }

    const [roles, permissions, menus] = await Promise.all([
      navigationRepository.listUserRoleNames(database, userId),
      navigationRepository.listUserPermissions(database, userId),
      navigationRepository.listUserMenus(database, userId),
    ]);

    return {
      menus,
      permissions,
      roles,
    };
  }

  return {
    getSidenav,
  };
}

export type NavigationService = ReturnType<typeof createNavigationService>;
