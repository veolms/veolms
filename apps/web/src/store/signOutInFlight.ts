/**
 * A sign-out the page shows at once and tells the server after
 * (`useSignOut`, `cancelPendingLogin`). Until the server has ended the
 * session, the browser still sends its cookie, and the server still answers
 * for the account. A lesson page that asked for its video in that moment was
 * given it, and kept playing it signed out instead of asking the visitor to
 * log in (the "signing out while a locked lesson plays" journey, about one
 * run in two). Requests whose answer depends on who is signed in wait for
 * `afterSignOut()` first.
 */
let pending: Promise<void> | null = null;

/** Marks a sign-out as on its way to the server until `done` settles. */
export function holdUntilSignedOut(done: Promise<unknown>): void {
  const held = done.then(
    () => undefined,
    () => undefined,
  );
  pending = held;
  void held.then(() => {
    if (pending === held) pending = null;
  });
}

/** Resolves once no sign-out is on its way to the server. */
export function afterSignOut(): Promise<void> {
  return pending ?? Promise.resolve();
}
