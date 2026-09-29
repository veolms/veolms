import {
  useDebugValue,
  useMemo,
  useSyncExternalStore,
} from "react";

export { useSyncExternalStore };

type SnapshotReader<Snapshot> = () => Snapshot;

function createSelectionReader<Snapshot, Selection>(
  readSnapshot: SnapshotReader<Snapshot>,
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (previous: Selection, next: Selection) => boolean,
): SnapshotReader<Selection> {
  let hasSnapshot = false;
  let previousSnapshot: Snapshot;
  let previousSelection: Selection;

  return () => {
    const snapshot = readSnapshot();
    if (hasSnapshot && Object.is(previousSnapshot, snapshot)) {
      return previousSelection;
    }

    const selection = selector(snapshot);
    if (
      hasSnapshot &&
      isEqual?.(previousSelection, selection)
    ) {
      previousSnapshot = snapshot;
      return previousSelection;
    }

    hasSnapshot = true;
    previousSnapshot = snapshot;
    previousSelection = selection;
    return selection;
  };
}

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: SnapshotReader<Snapshot>,
  getServerSnapshot: SnapshotReader<Snapshot> | undefined,
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (previous: Selection, next: Selection) => boolean,
): Selection {
  const getSelection = useMemo(
    () => createSelectionReader(getSnapshot, selector, isEqual),
    [getSnapshot, selector, isEqual],
  );
  const getServerSelection = useMemo(
    () =>
      getServerSnapshot
        ? createSelectionReader(getServerSnapshot, selector, isEqual)
        : undefined,
    [getServerSnapshot, selector, isEqual],
  );
  const selection = useSyncExternalStore(
    subscribe,
    getSelection,
    getServerSelection,
  );
  useDebugValue(selection);
  return selection;
}
