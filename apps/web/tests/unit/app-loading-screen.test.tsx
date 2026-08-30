import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppLoadingScreen } from "../../src/bootstrap/AppLoadingScreen";

describe("AppLoadingScreen", () => {
  it("covers the viewport when used as a page takeover", () => {
    const { container } = render(<AppLoadingScreen />);
    const loading = screen.getByLabelText("Loading ProCodrr");

    expect(loading.tagName).toBe("MAIN");
    expect(loading).toHaveClass("fixed", "inset-0");
    expect(container.querySelector("[data-app-loading]")).toBe(loading);
  });

  it("stays in document flow when embedded in the auth form column", () => {
    render(<AppLoadingScreen variant="embedded" />);
    const loading = screen.getByLabelText("Loading ProCodrr");

    expect(loading.tagName).toBe("DIV");
    expect(loading).not.toHaveClass("fixed");
    expect(screen.getByText("Loading your workspace")).toBeInTheDocument();
    expect(screen.getByText("Restoring your saved layout…")).toBeInTheDocument();
  });
});
