type ResetHandler = () => void;

const resetHandlers = new Set<ResetHandler>();

export function registerLearningInteractionReset(handler: ResetHandler) {
  resetHandlers.add(handler);
  return () => resetHandlers.delete(handler);
}

export function resetLoadedLearningInteractions() {
  for (const reset of resetHandlers) reset();
}
