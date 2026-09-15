import { authStore } from "../../store/auth.store";

export type OptimisticEditKind = "thread" | "reply" | "note";

export interface OptimisticEditFields {
  content?: string;
  plainText?: string;
  visibility?: string;
}

export interface OptimisticEditRecord {
  readonly kind: OptimisticEditKind;
  readonly clientId: string;
  readonly serverId: string;
  readonly baseline: OptimisticEditFields;
  readonly optimistic: OptimisticEditFields;
  readonly authGeneration: number;
  status: "pending" | "confirmed";
  authoritative?: OptimisticEditFields;
}

export interface BeginOptimisticEditArgs {
  kind: OptimisticEditKind;
  clientId: string;
  serverId: string;
  baseline: OptimisticEditFields;
  optimistic: OptimisticEditFields;
}

function editKey(kind: OptimisticEditKind, clientId: string): string {
  return `${kind}:${clientId}`;
}

function isCurrentGeneration(record: OptimisticEditRecord): boolean {
  return record.authGeneration === authStore.getWriteGeneration();
}

function plainTextFromContent(content: string): string {
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getOptimisticEditFields(
  response: unknown,
  fallback: OptimisticEditFields,
): OptimisticEditFields {
  const entity =
    response && typeof response === "object"
      ? (response as Record<string, unknown>)
      : {};
  const content =
    typeof entity.content === "string" ? entity.content : fallback.content;
  return {
    content,
    plainText:
      typeof entity.plainText === "string"
        ? entity.plainText
        : content === undefined
          ? fallback.plainText
          : plainTextFromContent(content),
    ...(typeof entity.visibility === "string"
      ? { visibility: entity.visibility }
      : fallback.visibility !== undefined
        ? { visibility: fallback.visibility }
        : {}),
  };
}

export class OptimisticEditCoordinator {
  private records = new Map<string, OptimisticEditRecord>();

  begin(args: BeginOptimisticEditArgs): OptimisticEditRecord | undefined {
    this.pruneStaleGenerations();
    const key = editKey(args.kind, args.clientId);
    const existing = this.records.get(key);
    if (existing?.status === "pending") return undefined;

    const record: OptimisticEditRecord = {
      ...args,
      authGeneration: authStore.getWriteGeneration(),
      status: "pending",
    };
    this.records.set(key, record);
    return record;
  }

  confirm(
    kind: OptimisticEditKind,
    clientId: string,
    authoritative: OptimisticEditFields,
  ): OptimisticEditRecord | undefined {
    const record = this.get(kind, clientId);
    if (!record || !isCurrentGeneration(record)) return undefined;
    record.status = "confirmed";
    record.authoritative = authoritative;
    return record;
  }

  fail(
    kind: OptimisticEditKind,
    clientId: string,
  ): OptimisticEditRecord | undefined {
    const record = this.get(kind, clientId);
    if (!record || !isCurrentGeneration(record)) return undefined;
    this.records.delete(editKey(kind, clientId));
    return record;
  }

  acknowledge(kind: OptimisticEditKind, clientId: string): void {
    const record = this.get(kind, clientId);
    if (record?.status === "confirmed") {
      this.records.delete(editKey(kind, clientId));
    }
  }

  /** Removes a record once its entity has been permanently deleted. */
  discard(kind: OptimisticEditKind, clientId: string): void {
    this.records.delete(editKey(kind, clientId));
  }

  get(
    kind: OptimisticEditKind,
    clientId: string,
  ): OptimisticEditRecord | undefined {
    const record = this.records.get(editKey(kind, clientId));
    if (!record || !isCurrentGeneration(record)) return undefined;
    return record;
  }

  findForEntity(
    kind: OptimisticEditKind,
    entity: { id: string | number; clientId?: string; serverId?: string },
  ): OptimisticEditRecord | undefined {
    this.pruneStaleGenerations();
    const direct = entity.clientId
      ? this.get(kind, entity.clientId)
      : undefined;
    if (direct) return direct;

    for (const record of this.records.values()) {
      if (
        record.kind === kind &&
        isCurrentGeneration(record) &&
        (record.serverId === entity.serverId ||
          record.serverId === String(entity.id))
      ) {
        return record;
      }
    }
    return undefined;
  }

  isEditing(kind: OptimisticEditKind, clientId: string): boolean {
    return this.get(kind, clientId)?.status === "pending";
  }

  getActiveRecords(kind?: OptimisticEditKind): OptimisticEditRecord[] {
    this.pruneStaleGenerations();
    return Array.from(this.records.values()).filter(
      (record) => kind === undefined || record.kind === kind,
    );
  }

  reset(): void {
    this.records.clear();
  }

  private pruneStaleGenerations(): void {
    for (const [key, record] of this.records) {
      if (!isCurrentGeneration(record)) this.records.delete(key);
    }
  }
}

export const optimisticEditCoordinator = new OptimisticEditCoordinator();
