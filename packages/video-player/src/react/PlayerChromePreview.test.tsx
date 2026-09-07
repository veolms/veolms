import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MuteButton } from "../controls/MuteButton";
import { PlayButton } from "../controls/PlayButton";
import { TimeDisplay } from "../controls/TimeDisplay";
import { PlayerChromePreview } from "./PlayerChromePreview";

afterEach(() => {
  cleanup();
});

describe("PlayerChromePreview", () => {
  it("renders package controls without a video element", () => {
    render(
      <PlayerChromePreview>
        <PlayButton />
        <TimeDisplay />
      </PlayerChromePreview>,
    );

    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(
      screen.getByLabelText("0:00 elapsed of 0:00"),
    ).toBeTruthy();
    expect(document.querySelector("video")).toBeNull();
  });

  it("can seed mute and volume into the preview chrome", () => {
    render(
      <PlayerChromePreview muted volume={0.4}>
        <MuteButton />
      </PlayerChromePreview>,
    );

    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
  });
});
