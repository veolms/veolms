import { sql } from "kysely";
import type { SidenavMenuNode } from "@veolms/contracts";
import type { DatabaseExecutor as Executor } from "@veolms/database";

async function getUserRoleIds(database: Executor, userId: string): Promise<string[]> {
  const [directRows, scopedRows] = await Promise.all([
    database
      .selectFrom("user_roles")
      .select("role_id")
      .where("user_id", "=", userId)
      .execute(),
    database
      .selectFrom("role_assignments as ra")
      .select("ra.role_id")
      .where("ra.user_id", "=", userId)
      .where((eb) =>
        eb.or([
          eb("ra.expires_at", "is", null),
          eb("ra.expires_at", ">", sql<Date>`CURRENT_TIMESTAMP`),
        ]),
      )
      .execute(),
  ]);

  return Array.from(
    new Set([...directRows.map((r) => r.role_id), ...scopedRows.map((r) => r.role_id)]),
  );
}

export async function listUserRoleNames(
  database: Executor,
  userId: string,
): Promise<string[]> {
  const roleIds = await getUserRoleIds(database, userId);
  if (roleIds.length === 0) {
    return [];
  }

  const rows = await database
    .selectFrom("roles")
    .select("roles.name")
    .where("roles.id", "in", roleIds)
    .execute();

  return rows.map((row) => row.name);
}

export async function listUserPermissions(
  database: Executor,
  userId: string,
): Promise<string[]> {
  const roleIds = await getUserRoleIds(database, userId);
  if (roleIds.length === 0) {
    return [];
  }

  const rows = await database
    .selectFrom("menu_permissions")
    .innerJoin("menus", "menus.id", "menu_permissions.menu_id")
    .select([
      "menus.route_link",
      "menu_permissions.can_create",
      "menu_permissions.can_read",
      "menu_permissions.can_update",
      "menu_permissions.can_delete",
    ])
    .where("menu_permissions.role_id", "in", roleIds)
    .execute();

  const permissions = new Set<string>();
  for (const row of rows) {
    const baseRoute = row.route_link.replace(/^\//, "") || "home";
    if (row.can_create) permissions.add(`${baseRoute}:create`);
    if (row.can_read) permissions.add(`${baseRoute}:read`);
    if (row.can_update) permissions.add(`${baseRoute}:update`);
    if (row.can_delete) permissions.add(`${baseRoute}:delete`);
  }

  return Array.from(permissions);
}

export async function listUserMenus(
  database: Executor,
  userId: string,
): Promise<SidenavMenuNode[]> {
  const roleIds = await getUserRoleIds(database, userId);
  if (roleIds.length === 0) {
    return [];
  }

  const rows = await database
    .selectFrom("menu_permissions")
    .innerJoin("menus", "menus.id", "menu_permissions.menu_id")
    .select([
      "menus.id",
      "menus.parent_id",
      "menus.label",
      "menus.route_link",
      "menus.icon",
      "menus.expanded",
      "menus.check_list",
      "menus.is_both",
      "menu_permissions.can_create",
      "menu_permissions.can_read",
      "menu_permissions.can_update",
      "menu_permissions.can_delete",
    ])
    .where("menu_permissions.role_id", "in", roleIds)
    .orderBy("menus.created_at", "asc")
    .orderBy("menus.id", "asc")
    .execute();

  return buildMenuTree(rows);
}

export async function listPublicMenus(
  database: Executor,
): Promise<SidenavMenuNode[]> {
  const studentRole = await database
    .selectFrom("roles")
    .select("id")
    .where("name", "=", "student")
    .executeTakeFirst();

  if (!studentRole) {
    return [];
  }

  const rows = await database
    .selectFrom("menu_permissions")
    .innerJoin("menus", "menus.id", "menu_permissions.menu_id")
    .select([
      "menus.id",
      "menus.parent_id",
      "menus.label",
      "menus.route_link",
      "menus.icon",
      "menus.expanded",
      "menus.check_list",
      "menus.is_both",
      "menu_permissions.can_create",
      "menu_permissions.can_read",
      "menu_permissions.can_update",
      "menu_permissions.can_delete",
    ])
    .where("menu_permissions.role_id", "=", studentRole.id)
    .orderBy("menus.created_at", "asc")
    .orderBy("menus.id", "asc")
    .execute();

  return buildMenuTree(rows);
}

interface MenuRow {
  id: string;
  parent_id: string | null;
  label: string;
  route_link: string;
  icon: string | null;
  expanded: boolean;
  check_list: string | null;
  is_both: boolean;
  can_create: boolean | null;
  can_read: boolean | null;
  can_update: boolean | null;
  can_delete: boolean | null;
}

function buildMenuTree(rows: MenuRow[]): SidenavMenuNode[] {
  const menuMap = new Map<string, SidenavMenuNode>();
  for (const row of rows) {
    if (
      row.label === "Learning Space" ||
      row.route_link === "/learning-space" ||
      row.id === "00000000-0000-4000-9000-000000000009"
    ) {
      continue;
    }
    const existing = menuMap.get(row.id);
    if (existing) {
      existing.permissions.canCreate =
        existing.permissions.canCreate || Boolean(row.can_create);
      existing.permissions.canRead =
        existing.permissions.canRead || Boolean(row.can_read);
      existing.permissions.canUpdate =
        existing.permissions.canUpdate || Boolean(row.can_update);
      existing.permissions.canDelete =
        existing.permissions.canDelete || Boolean(row.can_delete);
    } else {
      menuMap.set(row.id, {
        id: row.id,
        parentId: row.parent_id,
        label: row.label,
        routeLink: row.route_link,
        icon: row.icon,
        expanded: Boolean(row.expanded),
        checkList: row.check_list,
        isBoth: Boolean(row.is_both),
        permissions: {
          canCreate: Boolean(row.can_create),
          canRead: Boolean(row.can_read),
          canUpdate: Boolean(row.can_update),
          canDelete: Boolean(row.can_delete),
        },
      });
    }
  }

  const accessibleMenus = Array.from(menuMap.values()).filter(
    (m) =>
      m.permissions.canRead ||
      m.permissions.canCreate ||
      m.permissions.canUpdate ||
      m.permissions.canDelete,
  );

  const rootMenus: SidenavMenuNode[] = [];
  const accessibleMap = new Map(accessibleMenus.map((m) => [m.id, m]));

  for (const menu of accessibleMenus) {
    if (menu.parentId && accessibleMap.has(menu.parentId)) {
      const parent = accessibleMap.get(menu.parentId)!;
      parent.children = parent.children ?? [];
      parent.children.push(menu);
    } else {
      rootMenus.push(menu);
    }
  }

  return rootMenus;
}
