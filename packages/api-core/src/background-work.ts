/**
 * Extension points around background work: the loops that claim queued
 * rows (`FOR UPDATE SKIP LOCKED`) or scan whole tables on a timer, and the
 * handling of each row they found.
 *
 * Background work runs outside any HTTP request. A deployment that keeps
 * per-request state (for example a setting on each database connection,
 * see `onConnectionAcquired` in @veolms/database) uses these hooks to give
 * that work the state it needs:
 *
 * - a **pass** is one claim or scan over the whole queue or table;
 * - an **item** is the handling of one row the pass found, named by its
 *   table and id so the hook can look up whatever else it needs.
 *
 * With no hooks set (the default), both helpers simply run the work.
 */

export interface BackgroundItem {
  /** The table the row was claimed from, e.g. "outbox_events". */
  table: string;
  id: string;
}

export interface BackgroundWorkHooks {
  aroundPass?: <T>(job: string, run: () => Promise<T>) => Promise<T>;
  aroundItem?: <T>(
    job: string,
    item: BackgroundItem,
    run: () => Promise<T>,
  ) => Promise<T>;
}

let hooks: BackgroundWorkHooks = {};

/** Sets the hooks (replacing earlier ones); `{}` removes them. */
export function setBackgroundWorkHooks(next: BackgroundWorkHooks): void {
  hooks = next;
}

/** Runs one claim or scan of a background loop, through `aroundPass`. */
export async function runBackgroundPass<T>(
  job: string,
  run: () => Promise<T>,
): Promise<T> {
  const around = hooks.aroundPass;
  return around ? await around(job, run) : await run();
}

/** Runs the handling of one claimed row, through `aroundItem`. */
export async function runBackgroundItem<T>(
  job: string,
  item: BackgroundItem,
  run: () => Promise<T>,
): Promise<T> {
  const around = hooks.aroundItem;
  return around ? await around(job, item, run) : await run();
}
