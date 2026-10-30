// Lets an extension adjust the Shaka runtime as soon as it is loaded, before
// any player is created from it (for example to patch Player.prototype).
// The default runtime loader calls notifyShakaRuntimeLoaded after every
// load, so an extension no longer has to download Shaka on every page just
// to be sure its changes are in place before the first player.
//
// The state lives on globalThis so that a second copy of this module, if a
// bundle ever ends up with one, still sees the same hooks and runtime.

export type ShakaRuntimeHook = (runtimeModule: unknown) => void;

interface ShakaRuntimeHookState {
  hooks: Set<ShakaRuntimeHook>;
  /** Run before the others (see `onShakaRuntimeLoaded`). */
  firstHooks?: Set<ShakaRuntimeHook>;
  /** Told of a hook added after the runtime was loaded (see `onShakaRuntimeHookAdded`). */
  lateHookListeners?: Set<() => void>;
  loaded: boolean;
  runtimeModule: unknown;
}

const STATE_KEY = Symbol.for("veolms.video-player.shaka-runtime-hooks");

function hookState(): ShakaRuntimeHookState {
  const store = globalThis as unknown as Record<
    symbol,
    ShakaRuntimeHookState | undefined
  >;
  let state = store[STATE_KEY];
  if (!state) {
    state = { hooks: new Set(), loaded: false, runtimeModule: undefined };
    store[STATE_KEY] = state;
  }
  return state;
}

function runHook(hook: ShakaRuntimeHook, runtimeModule: unknown): void {
  try {
    hook(runtimeModule);
  } catch {
    // A failing extension must not stop playback.
  }
}

/**
 * Runs `hook` with the Shaka module every time the default loader loads it,
 * and at once if it has already been loaded. Returns an unsubscribe function.
 *
 * `first`: run before the other hooks, whenever it was added. For a hook that
 * changes something the others take a copy of (Shaka's fetch plugin, which
 * an extension wraps in a scheme plugin of its own).
 */
export function onShakaRuntimeLoaded(
  hook: ShakaRuntimeHook,
  options: { first?: boolean } = {},
): () => void {
  const state = hookState();
  const hooks = options.first ? (state.firstHooks ??= new Set()) : state.hooks;
  hooks.add(hook);
  if (state.loaded) {
    runHook(hook, state.runtimeModule);
    for (const listener of state.lateHookListeners ?? []) {
      try {
        listener();
      } catch {
        // A listener's failure is its own.
      }
    }
  }
  return () => {
    hooks.delete(hook);
  };
}

/**
 * Calls `listener` each time a hook is added after the runtime has loaded:
 * an extension that arrived late (the app's extensions load after the
 * document head has started the first lesson's preload) has just changed the
 * runtime, and a player made before that may need configuring again.
 * Returns an unsubscribe function.
 */
export function onShakaRuntimeHookAdded(listener: () => void): () => void {
  const state = hookState();
  const listeners = (state.lateHookListeners ??= new Set());
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the default runtime loader once the Shaka module is loaded. */
export function notifyShakaRuntimeLoaded(runtimeModule: unknown): void {
  const state = hookState();
  if (state.loaded && state.runtimeModule === runtimeModule) return;
  state.loaded = true;
  state.runtimeModule = runtimeModule;
  for (const hook of state.firstHooks ?? []) runHook(hook, runtimeModule);
  for (const hook of state.hooks) runHook(hook, runtimeModule);
}
