import { useCurrentUser } from "../services/auth";

/** Starts session reconciliation on routes that use authenticated data. */
export function SessionInitializer() {
  useCurrentUser();
  return null;
}
