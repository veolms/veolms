type ProfileAutosaveFlush = () => Promise<void>;

let activeProfileAutosaveFlush: ProfileAutosaveFlush | null = null;

export const registerProfileAutosaveFlush = (
  flush: ProfileAutosaveFlush,
): (() => void) => {
  activeProfileAutosaveFlush = flush;
  return () => {
    if (activeProfileAutosaveFlush === flush) {
      activeProfileAutosaveFlush = null;
    }
  };
};

export const flushProfileAutosave = async (): Promise<void> => {
  await activeProfileAutosaveFlush?.();
};
