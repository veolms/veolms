import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
} from "@tanstack/react-query-persist-client";
import { queryClient } from "../lib/query-client";
import { startAccountSessionCopies } from "../services/accountSessionCopies";
import { authKeys } from "../services/auth/auth.keys";
import { SESSION_PRESENCE_KEY } from "../store/sessionPresence";
// Not the autosync barrel: that would pull the autosave UI into the startup
// bundle of every page.
import { autosyncManager } from "../lib/autosync/manager";
import {
  AUTOSYNC_QUERY_PERSISTENCE_BUSTER,
  autosyncPersister,
} from "../lib/autosync/tanstack";

interface QueryProviderProps {
  children: ReactNode;
}

const persistOptions = {
  queryClient,
  persister: autosyncPersister,
  buster: AUTOSYNC_QUERY_PERSISTENCE_BUSTER,
  maxAge: 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    // Autosync needs durable paused mutations, but ordinary query data may
    // contain account-owned information and should not survive a logout or
    // be restored into another session.
    shouldDehydrateQuery: () => false,
    shouldDehydrateMutation: (mutation: { state: { isPaused: boolean } }) =>
      mutation.state.isPaused,
  },
};

function AutosyncPersistenceBootstrap() {
  const restorePromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};

    // Restoring durable drafts can require an IndexedDB open. Query startup
    // must not wait on that storage or on a queued mutation retry; neither
    // persisted query data nor the draft registry is needed to render pages.
    restorePromiseRef.current ??= persistQueryClientRestore(
      persistOptions,
    ).then(
      () => undefined,
      () => undefined,
    );
    void restorePromiseRef.current.then(() => {
      if (disposed) return;
      unsubscribe = persistQueryClientSubscribe(persistOptions);
      void autosyncManager
        .recover()
        .then(() => queryClient.resumePausedMutations())
        .catch(() => undefined);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return null;
}

/**
 * Puts the tab's copies of the learner's answers (enrolled courses,
 * wishlist, the open course's access) in place after hydration. It comes
 * before the rest of the app, so its effect runs before any of theirs asks
 * for them.
 */
function AccountSessionCopies() {
  useEffect(() => startAccountSessionCopies(queryClient), []);
  return null;
}

/**
 * Signing in or out in another tab of this site changes the "was signed in"
 * flag in local storage, which every other tab is told about. They check
 * their session at once instead of carrying on with the old one until a
 * request fails: the session check's answer does the rest (no account:
 * the tab is signed out; another account: it switches).
 */
function SessionChangesInOtherTabs() {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_PRESENCE_KEY && event.key !== null) return;
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AccountSessionCopies />
      <SessionChangesInOtherTabs />
      <AutosyncPersistenceBootstrap />
      {children}
    </QueryClientProvider>
  );
}
