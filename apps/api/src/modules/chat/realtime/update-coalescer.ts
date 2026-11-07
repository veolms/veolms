/**
 * Coalesces "message changed" events for one message (reactions): when 500
 * people react to an announcement within a second, this process publishes
 * at most one update per message per second, carrying the newest state.
 */

const WINDOW_MS = 1_000;

interface Entry {
  version: number;
  publish: () => Promise<void>;
  timer: NodeJS.Timeout | null;
  lastSentAt: number;
}

export function createUpdateCoalescer(logger: {
  warn(object: object, message: string): void;
}) {
  const entries = new Map<string, Entry>();
  let stopped = false;

  function fire(key: string) {
    const entry = entries.get(key);
    if (!entry) return;
    entry.timer = null;
    entry.lastSentAt = Date.now();
    void entry.publish().catch((error: unknown) => {
      logger.warn({ err: error }, "Chat update could not be published");
    });
    // Forget it after a quiet window so the map stays small.
    setTimeout(() => {
      const current = entries.get(key);
      if (
        current &&
        current.timer === null &&
        Date.now() - current.lastSentAt >= WINDOW_MS
      ) {
        entries.delete(key);
      }
    }, WINDOW_MS).unref();
  }

  return {
    /** Publishes now, or once the window ends with the newest version. */
    submit(key: string, version: number, publish: () => Promise<void>) {
      if (stopped) return;
      const entry = entries.get(key);
      if (!entry) {
        entries.set(key, { version, publish, timer: null, lastSentAt: 0 });
        fire(key);
        return;
      }
      if (version < entry.version) return;
      entry.version = version;
      entry.publish = publish;
      if (entry.timer) return;
      const wait = Math.max(0, entry.lastSentAt + WINDOW_MS - Date.now());
      entry.timer = setTimeout(() => fire(key), wait);
      entry.timer.unref();
    },
    stop() {
      stopped = true;
      for (const entry of entries.values()) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      entries.clear();
    },
  };
}

export type UpdateCoalescer = ReturnType<typeof createUpdateCoalescer>;
