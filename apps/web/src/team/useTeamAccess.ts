import type { Permission, TeamRole } from "@veolms/contracts";
import { useCallback } from "react";
import { useCapabilities } from "../services/authorization";
import { useAuthStore } from "../store/auth.store";

/**
 * What the signed-in person may do on the Team page. Mirrors the API's
 * rules so the page never offers what the API would refuse: you can only
 * hand out (or take away) roles whose every permission you hold for every
 * course (an instructor's stop at their own), only an admin hands out admin,
 * and only an admin tunes a built-in role.
 */
export function useTeamAccess() {
  const capabilities = useCapabilities();
  const roles = useAuthStore((state) => state.user?.roles);
  const isAdmin = Boolean(
    roles?.some((role) => role.toLowerCase() === "admin"),
  );
  const { can, canOnCourse } = capabilities;

  /** Held through a role that reaches every course. */
  const holdsEverywhere = useCallback(
    (key: Permission) => isAdmin || canOnCourse(key, null),
    [canOnCourse, isAdmin],
  );

  const canGrantRole = useCallback(
    (role: Pick<TeamRole, "name" | "permissions">) => {
      if (isAdmin) return true;
      if (role.name.toLowerCase() === "admin") return false;
      return role.permissions.every((key) => holdsEverywhere(key));
    },
    [holdsEverywhere, isAdmin],
  );

  const canGrantPermissions = useCallback(
    (keys: readonly Permission[]) => keys.every((key) => holdsEverywhere(key)),
    [holdsEverywhere],
  );

  /** Admin's own role always holds everything; the rest an admin may tune. */
  const canEditRole = useCallback(
    (role: Pick<TeamRole, "name" | "isSystem">) => {
      if (role.name.toLowerCase() === "admin") return false;
      if (role.isSystem) return isAdmin;
      return can("role.update");
    },
    [can, isAdmin],
  );

  const canReadTeam = can("team.read");
  const canReadRoles = can("role.read");

  return {
    isLoading: capabilities.isPending,
    isAdmin,
    can,
    holdsEverywhere,
    canGrantRole,
    canGrantPermissions,
    canEditRole,
    canReadTeam,
    canReadRoles,
    canViewPage: canReadTeam || canReadRoles,
  };
}
