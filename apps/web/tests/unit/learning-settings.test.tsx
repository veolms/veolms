import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LearningSettings } from "../../src/settings/LearningSettings.js";
import { CURRICULUM_TEST_PREFERENCES_KEY } from "../../src/learning/curriculumTestPreferences.js";

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
    expect(sectionInput).toHaveValue(23);
    expect(screen.getByRole("spinbutton", { name: "Lectures" })).toHaveValue(
      600,
    );
  });
});
