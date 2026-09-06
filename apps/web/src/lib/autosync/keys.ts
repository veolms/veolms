import type { MutationKey } from "@tanstack/react-query";
import type { AutosyncKey } from "./types";

const encodeKeyPart = (value: string) => encodeURIComponent(value);

export const getAutosyncKey = (key: AutosyncKey) =>
  `${key.entity}:${key.entityId}:${key.scope}`;

export const getAutosyncDraftKey = (key: AutosyncKey) =>
  `veolms:autosync:draft:${encodeKeyPart(key.entity)}:${encodeKeyPart(
    key.entityId,
  )}:${encodeKeyPart(key.scope)}`;

export const getAutosyncMutationScopeKey = (key: AutosyncKey) =>
  `veolms:autosync:mutation:${encodeKeyPart(getAutosyncKey(key))}`;

export const getAutosyncMutationKey = (key: AutosyncKey): MutationKey => [
  "autosync",
  key.entity,
  key.entityId,
  key.scope,
];

export const autosyncKeysEqual = (left: AutosyncKey, right: AutosyncKey) =>
  left.entity === right.entity &&
  left.entityId === right.entityId &&
  left.scope === right.scope;
