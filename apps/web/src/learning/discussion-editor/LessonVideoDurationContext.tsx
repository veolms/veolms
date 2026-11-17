import { createContext, useContext, type ReactNode } from "react";

const LessonVideoDurationContext = createContext<number | null>(null);

export function LessonVideoDurationProvider({
  seconds,
  children,
}: {
  seconds?: number | null;
  children: ReactNode;
}) {
  return (
    <LessonVideoDurationContext.Provider value={seconds ?? null}>
      {children}
    </LessonVideoDurationContext.Provider>
  );
}

export function useLessonVideoDuration(): number | null {
  return useContext(LessonVideoDurationContext);
}
