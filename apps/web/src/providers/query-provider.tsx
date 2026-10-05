import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
} from "@tanstack/react-query-persist-client";
import { queryClient } from "../lib/query-client";
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

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AutosyncPersistenceBootstrap />
      {children}
    </QueryClientProvider>
  );
}
