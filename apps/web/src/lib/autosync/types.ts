import type { MutationKey } from "@tanstack/react-query";

export interface AutosyncKey {
  entity: string;
  entityId: string;
  scope: string;
}

export type AutosyncStatus =
  | "idle"
  | "pending"
  | "syncing"
  | "saved"
  | "offline"
  | "blocked"
  | "error"
  | "conflict";

export interface AutosyncValidationResult {
  valid: boolean;
  message?: string;
}

export interface AutosyncSyncContext<TValue> {
  key: AutosyncKey;
  previousValue: TValue;
}

export type AutosyncSync<TValue, TServerValue> = (
  value: TValue,
  context: AutosyncSyncContext<TValue>,
) => Promise<TServerValue>;

export type AutosyncUpdater<TValue> =
  Partial<TValue> | ((currentValue: TValue) => TValue);

export interface AutosyncRegistration {
  key: AutosyncKey;
  mutationKey: MutationKey;
  flush: () => Promise<void>;
  isDirty: () => boolean;
  getStatus: () => AutosyncStatus;
}

export interface AutosyncOptions<TValue, TServerValue = TValue> {
  key: AutosyncKey;
  initialValue: TValue;
  sync: AutosyncSync<TValue, TServerValue>;
  enabled?: boolean;
  debounceMs?: number;
  maxWaitMs?: number;
  isEqual?: (left: TValue, right: TValue) => boolean;
  validate?: (
    value: TValue,
    context: AutosyncSyncContext<TValue>,
  ) => AutosyncValidationResult | boolean;
  onSynced?: (
    serverValue: TServerValue,
    submittedValue: TValue,
  ) => TValue | undefined;
}

export interface AutosyncResult<TValue> {
  value: TValue;
  update: (update: AutosyncUpdater<TValue>) => void;
  replaceFromServer: (value: TValue) => void;
  mergeFromServer: (value: Partial<TValue>) => void;
  discard: () => void;
  status: AutosyncStatus;
  error: string;
  isDirty: boolean;
  isRestoring: boolean;
  flush: () => Promise<void>;
}

export class AutosyncSyncError extends Error {
  readonly key: AutosyncKey;
  readonly status: AutosyncStatus;

  constructor(key: AutosyncKey, status: AutosyncStatus, message: string) {
    super(message);
    this.name = "AutosyncSyncError";
    this.key = key;
    this.status = status;
  }
}
