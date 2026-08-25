import { screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { AccountSettings } from "../../src/settings/AccountSettings.tsx";
import { SecuritySettings } from "../../src/settings/SecuritySettings.tsx";
import { renderWithAppProviders } from "./test-utils.tsx";

describe("unconnected account settings", () => {
  it("does not claim that an export request was sent", () => {
    renderWithAppProviders(<AccountSettings role="student" />);

    expect(
      screen.getByRole("button", { name: "Export unavailable" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        /No request will be sent until the server export service is available/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Export requested")).not.toBeInTheDocument();
  });
});

describe("security settings", () => {
  it("exposes the account protection and session surfaces", () => {
    renderWithAppProviders(<SecuritySettings />);

    expect(
      screen.getByRole("heading", { name: "Privacy & security" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Passkeys" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Authenticator app" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Active sessions" }),
    ).toBeInTheDocument();
  });
});
