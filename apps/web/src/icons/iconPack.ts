import { useSyncExternalStore } from "react";
import { ICON_PACKS } from "./registry";
import type { IconPack } from "./registry";

export const ICON_PACK_KEY = "veolms-icon-pack";
export const DEFAULT_ICON_PACK: IconPack = "lucide";

const packIds = new Set<string>(ICON_PACKS);
const listeners = new Set<() => void>();

function isIconPack(value: string | null): value is IconPack {
  return value !== null && packIds.has(value);
}

function readStoredPack(): IconPack {
  if (typeof window === "undefined") return DEFAULT_ICON_PACK;

  try {
    const stored = window.localStorage.getItem(ICON_PACK_KEY);
    return isIconPack(stored) ? stored : DEFAULT_ICON_PACK;
  } catch {
    return DEFAULT_ICON_PACK;
  }
}

let currentPack = readStoredPack();

export function getIconPack(): IconPack {
  return currentPack;
}

export function setIconPack(pack: IconPack): void {
  if (pack === currentPack) return;
  currentPack = pack;

  try {
    window.localStorage.setItem(ICON_PACK_KEY, pack);
  } catch {}

  for (const listener of listeners) listener();
}

export function subscribeToIconPack(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIconPack(): IconPack {
  return useSyncExternalStore(
    subscribeToIconPack,
    getIconPack,
    () => DEFAULT_ICON_PACK,
  );
}
