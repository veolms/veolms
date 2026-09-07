import type { ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient } from "../lib/query-client";
import {
  AUTOSYNC_QUERY_PERSISTENCE_BUSTER,
  autosyncManager,
  autosyncPersister,
} from "../lib/autosync";

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: autosyncPersister,
        buster: AUTOSYNC_QUERY_PERSISTENCE_BUSTER,
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          // Autosync needs durable paused mutations, but ordinary query data
          // may contain account-owned information and should not survive a
          // logout or be restored into another session.
          shouldDehydrateQuery: () => false,
          shouldDehydrateMutation: (mutation) => mutation.state.isPaused,
        },
      }}
      onSuccess={async () => {
        await autosyncManager.recover();
        await queryClient.resumePausedMutations();
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
