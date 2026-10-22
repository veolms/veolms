import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  BUILT_IN_PLAYER_THEMES,
  PLAYER_THEME_OPTIONS,
  getPlayerThemes,
  resolvePlayerTheme,
  subscribePlayerThemes,
  type PlayerTheme,
  type PlayerThemeDefinition,
} from "./playerThemes";

const PlayerThemeContext = createContext<PlayerThemeDefinition>(
  BUILT_IN_PLAYER_THEMES.youtube,
);

export interface PlayerThemeProviderProps {
  children: ReactNode;
  theme?: PlayerTheme;
}

export function PlayerThemeProvider({
  children,
  theme = "youtube",
}: PlayerThemeProviderProps) {
  const resolvedTheme = useMemo(() => resolvePlayerTheme(theme), [theme]);
  return (
    <PlayerThemeContext.Provider value={resolvedTheme}>
      {children}
    </PlayerThemeContext.Provider>
  );
}

export function usePlayerTheme(): PlayerThemeDefinition {
  return useContext(PlayerThemeContext);
}

const getBuiltInPlayerThemes = () => PLAYER_THEME_OPTIONS;

/**
 * Every theme a picker can offer: the built-in ones, then those plugins
 * registered. Updates when a plugin registers one later.
 */
export function usePlayerThemes(): readonly PlayerThemeDefinition[] {
  return useSyncExternalStore(
    subscribePlayerThemes,
    getPlayerThemes,
    getBuiltInPlayerThemes,
  );
}
