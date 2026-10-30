import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  BUILT_IN_PLAYER_THEMES,
  resolvePlayerTheme,
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
