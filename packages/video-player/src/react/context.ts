import { createContext, useContext } from "react";
import type { PlayerController } from "./PlayerController";

export const PlayerControllerContext = createContext<PlayerController | null>(
  null,
);

export function usePlayerController(): PlayerController {
  const controller = useContext(PlayerControllerContext);
  if (!controller) {
    throw new Error("Player hooks must be used inside a PlayerRoot.");
  }
  return controller;
}
