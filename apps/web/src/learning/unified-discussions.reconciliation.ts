export type ReconciliationCreationStatus = "pending" | "confirmed";

export interface ReconciliationEntity {
  id: string | number;
  clientId?: string;
  serverId?: string;
  creationStatus?: ReconciliationCreationStatus;
  [key: string]: unknown;
}

const identityFields = new Set([
  "id",
  "clientId",
  "serverId",
  "creationStatus",
  "localSequence",
]);

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null) return false;
  if (typeof left !== "object" || typeof right !== "object") return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((value, index) => areValuesEqual(value, right[index]))
    );
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      areValuesEqual(leftRecord[key], rightRecord[key]),
  );
}

function getUpdatedAt(entity: ReconciliationEntity): number | undefined {
  return typeof entity.updatedAt === "string"
    ? Date.parse(entity.updatedAt)
    : undefined;
}

function remoteIsNewer(
  remote: ReconciliationEntity,
  existing: ReconciliationEntity,
): boolean {
  const remoteUpdatedAt = getUpdatedAt(remote);
  const existingUpdatedAt = getUpdatedAt(existing);
  return (
    remoteUpdatedAt !== undefined &&
    !Number.isNaN(remoteUpdatedAt) &&
    existingUpdatedAt !== undefined &&
    !Number.isNaN(existingUpdatedAt) &&
    remoteUpdatedAt > existingUpdatedAt
  );
}

/**
 * Reconciles a unified remote entity with the legacy cache entity that the
 * existing interaction coordinators update.
 *
 * The previous unified response is the remote baseline. A legacy field that
 * differs from that baseline is newer local cache state and is retained. If
 * no baseline exists yet, an updatedAt advance is the only generic signal
 * that the remote representation is newer; otherwise differing legacy fields
 * are retained. Identity/lifecycle metadata always stays with the legacy
 * entity so optimistic creation reconciliation does not change its client
 * identity.
 */
export function reconcileUnifiedEntity<
  T extends ReconciliationEntity,
>(
  remote: T,
  existing: T | undefined,
  previousRemote?: Readonly<Record<string, unknown>>,
): T {
  if (!existing) return remote;

  const next: ReconciliationEntity = { ...remote };
  const useLegacyDifferences =
    previousRemote !== undefined || !remoteIsNewer(remote, existing);

  for (const key of Object.keys(existing)) {
    if (identityFields.has(key)) {
      next[key] = existing[key];
      continue;
    }

    if (
      useLegacyDifferences &&
      (previousRemote === undefined
        ? !areValuesEqual(existing[key], remote[key])
        : !areValuesEqual(existing[key], previousRemote[key]))
    ) {
      next[key] = existing[key];
    }
  }

  return next as T;
}

export function isLocalClientEntity(entity: ReconciliationEntity): boolean {
  return Boolean(entity.clientId?.startsWith("client-"));
}

export function mergeLocalOnlyEntities<T extends ReconciliationEntity>(
  reconciled: readonly T[],
  existing: readonly T[],
  identity: (entity: T) => string | undefined,
  shouldKeepLocalOnly: (entity: T) => boolean = () => true,
): T[] {
  const present = new Set(
    reconciled.map(identity).filter((value): value is string => Boolean(value)),
  );
  const result = [...reconciled];

  for (const entity of existing) {
    if (!isLocalClientEntity(entity)) continue;
    if (!shouldKeepLocalOnly(entity)) continue;
    const entityIdentity = identity(entity);
    if (entityIdentity && present.has(entityIdentity)) continue;
    result.push(entity);
    if (entityIdentity) present.add(entityIdentity);
  }

  return result;
}

export function filterTombstonedEntities<T extends ReconciliationEntity>(
  entities: readonly T[],
  isTombstoned: (entity: T) => boolean,
): T[] {
  return entities.filter((entity) => !isTombstoned(entity));
}
