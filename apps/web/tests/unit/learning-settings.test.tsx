import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LearningSettings } from "../../src/settings/LearningSettings.js";
import { CURRICULUM_TEST_PREFERENCES_KEY } from "../../src/learning/curriculumTestPreferences.js";
import {
  CURRICULUM_LECTURE_COUNT_DEFAULT,
  CURRICULUM_SECTION_COUNT_DEFAULT,
} from "../../src/learning/curriculumSize.js";

describe("LearningSettings curriculum test controls", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("supports presets and custom session-only curriculum counts", async () => {
    render(<LearningSettings />);

    const sectionInput = await screen.findByRole("spinbutton", {
      name: "Sections",
    });
    fireEvent.change(sectionInput, { target: { value: "32" } });
    fireEvent.blur(sectionInput);

    fireEvent.click(screen.getByRole("button", { name: /Lectures preset:/ }));
    fireEvent.click(screen.getByRole("option", { name: "600 lectures" }));

    await waitFor(() =>
      expect(
        JSON.parse(
          sessionStorage.getItem(CURRICULUM_TEST_PREFERENCES_KEY) || "",
        ),
      ).toEqual({ sectionCount: 32, lectureCount: 600 }),
    );
    expect(
      screen.getByRole("status", {
        name: "",
      }),
    ).toHaveTextContent("32 sections · 600 lectures");

    fireEvent.click(screen.getByRole("button", { name: "Reset test data" }));
    expect(sectionInput).toHaveValue(CURRICULUM_SECTION_COUNT_DEFAULT);
    expect(screen.getByRole("spinbutton", { name: "Lectures" })).toHaveValue(
      CURRICULUM_LECTURE_COUNT_DEFAULT,
    );
  });

  it("saves a custom video skip interval up to one minute", async () => {
    render(<LearningSettings />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Skip interval: 10 seconds (Default)",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Custom…" }));

    const slider = screen.getByRole("slider", {
      name: "Custom skip interval in seconds",
    });
    expect(slider).toHaveAttribute("min", "5");
    expect(slider).toHaveAttribute("max", "60");
    fireEvent.change(slider, { target: { value: "47" } });

    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("veolms-learning-preferences") || "{}")
          .seekIntervalSeconds,
      ).toBe(47),
    );
    expect(screen.getByText("47s")).toBeVisible();
  });
});
