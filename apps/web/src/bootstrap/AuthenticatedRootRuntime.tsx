import type { ReactNode } from "react";
import { QueryProvider } from "../providers/query-provider";
import { SessionInitializer } from "./SessionInitializer";

interface AuthenticatedRootRuntimeProps {
  children: ReactNode;
}

/**
 * Providers used by authenticated and account routes. Public lesson pages do
 * not issue application API queries, so keeping this in an auto-loaded route
 * chunk avoids making React Query and session code part of their first paint.
 */
export function AuthenticatedRootRuntime({
  children,
}: AuthenticatedRootRuntimeProps) {
  return (
    <QueryProvider>
      <SessionInitializer />
      {children}
    </QueryProvider>
  );
}
