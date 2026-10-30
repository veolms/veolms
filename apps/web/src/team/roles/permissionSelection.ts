import {
  permissionCatalogue,
  withImpliedPermissions,
  type Permission,
} from "@veolms/contracts";

/**
 * The role editor's ticking rules: ticking a permission ticks what it needs;
 * unticking one unticks whatever needs it, so a role never holds a
 * permission without its prerequisites.
 */

const allKeys: Permission[] = permissionCatalogue.flatMap((group) =>
  group.entries.map((entry) => entry.key),
);

/** Every key that needs `key`, directly or through others. */
function dependentsOf(key: Permission): Permission[] {
  return allKeys.filter(
    (other) => other !== key && withImpliedPermissions([other]).has(key),
  );
}

export function tick(
  selected: ReadonlySet<Permission>,
  keys: readonly Permission[],
): Set<Permission> {
  return new Set([...selected, ...withImpliedPermissions(keys)]);
}

export function untick(
  selected: ReadonlySet<Permission>,
  keys: readonly Permission[],
): Set<Permission> {
  const next = new Set(selected);
  for (const key of keys) {
    next.delete(key);
    for (const dependent of dependentsOf(key)) next.delete(dependent);
  }
  return next;
}

/** Ticked by the user, or only because another ticked key needs it. */
export function isRequiredByOther(
  selected: ReadonlySet<Permission>,
  key: Permission,
): boolean {
  return dependentsOf(key).some((dependent) => selected.has(dependent));
}
