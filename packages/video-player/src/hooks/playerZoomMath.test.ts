import { describe, expect, it } from "vitest";
import {
  clampPlayerPan,
  clampPlayerZoom,
  getPlayerFillZoom,
  getPlayerZoomGeometry,
} from "./playerZoomMath";

describe("player zoom math", () => {
  it("keeps zoom between 1x and 10x", () => {
    expect(clampPlayerZoom(0.4)).toBe(1);
    expect(clampPlayerZoom(4.5)).toBe(4.5);
    expect(clampPlayerZoom(14)).toBe(10);
  });

  it("calculates zoom-to-fill for letterboxed video", () => {
    const geometry = getPlayerZoomGeometry(400, 300, 1_600, 900);
    expect(geometry.mediaWidth).toBe(400);
    expect(geometry.mediaHeight).toBe(225);
    expect(getPlayerFillZoom(geometry)).toBeCloseTo(4 / 3);
  });

  it("keeps panning inside the visible media edges", () => {
    const geometry = getPlayerZoomGeometry(400, 300, 1_600, 900);
    expect(clampPlayerPan({ x: 500, y: -500 }, 2, geometry)).toEqual({
      x: 200,
      y: -75,
    });
    expect(clampPlayerPan({ x: 40, y: 20 }, 1, geometry)).toEqual({
      x: 0,
      y: 0,
    });
  });
});
