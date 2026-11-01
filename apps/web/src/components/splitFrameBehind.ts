import { createContext } from "react";

/**
 * True for a page drawn behind the lesson player (LearningBackgroundSurface)
 * rather than shown as the route. A SplitFramePane in a page that was the
 * route and has gone behind the lesson (the player being maximized over it)
 * lets go of the frame, which is the lesson page's again.
 *
 * Kept apart from SplitFramePane so that the shell can provide it without
 * loading the component or its stylesheet.
 */
export const SplitFrameBehindContext = createContext(false);
