/**
 * Late-binding reset hooks for the learning-interaction coordinators.
 *
 * The API client must clear optimistic interaction state when a session
 * ends, but importing the coordinators directly would pull the whole
 * learning-interaction cache machinery into the startup bundle of every
 * page. Coordinator modules register their reset here when they load; on
 * pages that never load them there is nothing to reset, which is the same
 * outcome as calling reset() on untouched coordinators.
 */
type InteractionResetHandler = () => void;

const resetHandlers = new Set<InteractionResetHandler>();

export function registerInteractionResetHandler(
  handler: InteractionResetHandler,
): () => void {
  resetHandlers.add(handler);
  return () => {
    resetHandlers.delete(handler);
  };
}

export function resetRegisteredInteractionState(): void {
  for (const handler of resetHandlers) handler();
}
