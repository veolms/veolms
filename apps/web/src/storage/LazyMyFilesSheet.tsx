import { lazy, Suspense } from "react";

const MyFilesSheet = lazy(() =>
  import("./MyFilesSheet").then((module) => ({ default: module.MyFilesSheet })),
);

/**
 * "Manage storage" loaded when first opened: the pages that offer it (the
 * Learning settings, a discussion or support composer whose file did not
 * fit) do not carry the files list's code until it is wanted.
 */
export function LazyMyFilesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <MyFilesSheet onClose={onClose} />
    </Suspense>
  );
}
