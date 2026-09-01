import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { IdentifierForm } from "../../src/auth/IdentifierForm.tsx";
import type { IdentifierFormProps } from "../../src/auth/IdentifierForm.tsx";
import { SocialLoginActions } from "../../src/auth/SocialLoginActions.tsx";
import {
  GitHubBrandIcon,
  GoogleBrandIcon,
} from "../../src/auth/SocialBrandIcons.tsx";
import {
  getDefaultLoginMethod,
  isMethodSwitchVisible,
} from "../../src/auth/authConfig.ts";
import { renderWithQueryClient } from "./test-utils.tsx";

vi.mock("../../src/ThemedSelect.tsx", () => ({
  ThemedSelect: ({
    ariaLabel,
    onValueChange,
    options,
    value,
  }: {
    ariaLabel: string;
    onValueChange: (value: string) => void;
    options: readonly (readonly [string, string])[];
    value: string;
  }) => (
    <select
      aria-label={ariaLabel}
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  ),
}));

const renderForm = (props: Partial<IdentifierFormProps> = {}) => {
  const onSubmit = vi.fn();
  const view = render(
    <IdentifierForm status="idle" onSubmit={onSubmit} {...props} />,
  );

  return { ...view, onSubmit };
};

const renderEmailForm = (props: Partial<IdentifierFormProps> = {}) =>
  renderForm({ ...props, forcedMethod: "email" });
const renderMobileForm = (props: Partial<IdentifierFormProps> = {}) =>
  renderForm({ ...props, forcedMethod: "mobile" });

const itWhenBothMethodsAreEnabled = isMethodSwitchVisible() ? it : it.skip;

describe("identifier method switch", () => {
  it("labels the switch and says what submitting the identifier will do", () => {
    renderForm();

    const methodLabel = isMethodSwitchVisible()
      ? "Continue with"
      : `Continue with ${getDefaultLoginMethod()}`;
    expect(screen.getByText(methodLabel)).toBeInTheDocument();
    expect(
      screen.getByText("We'll send you a one-time code"),
    ).toBeInTheDocument();
  });

  itWhenBothMethodsAreEnabled(
    "lists mobile ahead of email, as the reference design does",
    () => {
      renderForm();

      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
        "Mobile",
        "Email",
      ]);
    },
  );

  it("starts with the configured default method", () => {
    renderForm();

    if (getDefaultLoginMethod() === "mobile") {
      expect(screen.getByLabelText("Mobile number")).toHaveAttribute(
        "placeholder",
        "Enter your mobile number",
      );
    } else {
      expect(screen.getByLabelText("Email address")).toHaveAttribute(
        "placeholder",
        "Enter your email address",
      );
    }

    if (isMethodSwitchVisible()) {
      const mobileTab = screen.getByRole("tab", { name: "Mobile" });
      const emailTab = screen.getByRole("tab", { name: "Email" });
      expect(mobileTab).toHaveAttribute("aria-selected", "true");
      expect(mobileTab).toHaveAttribute("tabindex", "0");
      expect(emailTab).toHaveAttribute("aria-selected", "false");
      expect(emailTab).toHaveAttribute("tabindex", "-1");
    }
  });

  it("names each field so password managers and keyboards recognise it", () => {
    const defaultView = renderForm();
    const defaultField =
      getDefaultLoginMethod() === "mobile"
        ? screen.getByLabelText("Mobile number")
        : screen.getByLabelText("Email address");

    expect(defaultField).toHaveAttribute(
      "autocomplete",
      getDefaultLoginMethod() === "mobile" ? "tel-national" : "email",
    );

    defaultView.unmount();
    renderEmailForm();

    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "email",
    );
  });

  itWhenBothMethodsAreEnabled(
    "swaps the field and its label when the method changes",
    () => {
      renderForm();

      fireEvent.click(screen.getByRole("tab", { name: "Email" }));

      expect(screen.getByLabelText("Email address")).toHaveAttribute(
        "placeholder",
        "Enter your email address",
      );
      expect(screen.queryByLabelText("Mobile number")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("tab", { name: "Mobile" }));

      expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
      expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    },
  );

  itWhenBothMethodsAreEnabled(
    "walks the tabs with the arrow keys and selects on focus",
    () => {
      renderForm();

      fireEvent.keyDown(screen.getByRole("tab", { name: "Mobile" }), {
        key: "ArrowRight",
      });
      expect(screen.getByLabelText("Email address")).toBeInTheDocument();

      fireEvent.keyDown(screen.getByRole("tab", { name: "Email" }), {
        key: "ArrowLeft",
      });
      expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
    },
  );

  itWhenBothMethodsAreEnabled(
    "gives each method a decorative glyph that leaves its name alone",
    () => {
      renderForm();

      for (const name of ["Mobile", "Email"]) {
        const glyph = screen.getByRole("tab", { name }).querySelector("svg");
        expect(glyph).not.toBeNull();
        expect(glyph).toHaveAttribute("aria-hidden", "true");
      }
    },
  );

  itWhenBothMethodsAreEnabled(
    "keeps aria-selected and the tab stop on the chosen method",
    () => {
      renderForm();

      fireEvent.click(screen.getByRole("tab", { name: "Email" }));

      const emailTab = screen.getByRole("tab", { name: "Email" });
      const mobileTab = screen.getByRole("tab", { name: "Mobile" });
      expect(mobileTab).toHaveAttribute("aria-selected", "false");
      expect(mobileTab).toHaveAttribute("tabindex", "-1");
      expect(emailTab).toHaveAttribute("aria-selected", "true");
      expect(emailTab).toHaveAttribute("tabindex", "0");
    },
  );
});

describe("email validation", () => {
  it("rejects an empty address on submit", () => {
    renderEmailForm();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeInTheDocument();
  });

  it("rejects a value that is not an address", () => {
    renderEmailForm();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeInTheDocument();
  });

  it("hands a normalised address to the caller", () => {
    const { onSubmit } = renderEmailForm();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "  Learner@ProCodrr.com  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSubmit).toHaveBeenCalledWith({
      method: "email",
      email: "learner@procodrr.com",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("error reporting", () => {
  it("announces the message and marks the field invalid", () => {
    renderMobileForm();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const field = screen.getByLabelText("Mobile number");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Please enter a valid 10-digit mobile number for India.",
    );
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", alert.id);
  });

  it("shows a message the caller supplies, such as a failed send", () => {
    const failure = "We couldn't send the verification code. Please try again.";
    renderMobileForm({ errorMessage: failure });

    expect(screen.getByRole("alert")).toHaveTextContent(failure);
    expect(screen.getByLabelText("Mobile number")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  itWhenBothMethodsAreEnabled(
    "drops the previous message when the method changes",
    () => {
      renderForm();

      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      fireEvent.click(screen.getByRole("tab", { name: "Email" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Email address")).toHaveAttribute(
        "aria-invalid",
        "false",
      );
    },
  );

  it("re-checks the field when it loses focus", () => {
    renderEmailForm();

    const field = screen.getByLabelText("Email address");
    fireEvent.change(field, { target: { value: "not-an-email" } });
    fireEvent.blur(field);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please enter a valid email address.",
    );
  });
});

describe("sending state", () => {
  it("locks the primary action while a code is on its way", () => {
    renderForm({ status: "sending" });

    const submit = screen.getByRole("button", { name: "Sending..." });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
  });
});

describe("mobile validation", () => {
  const submitMobile = (value: string) => {
    const view = renderMobileForm();

    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    return view;
  };

  it("keeps the country trigger down to the dial code it contributes", () => {
    renderMobileForm();

    expect(screen.getByRole("combobox", { name: "Country code" })).toHaveValue(
      "IN",
    );
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
      "+91",
    );
  });

  it("rejects a number that is one digit short", () => {
    submitMobile("987654321");

    expect(
      screen.getByText(
        "Please enter a valid 10-digit mobile number for India.",
      ),
    ).toBeInTheDocument();
  });

  it("rejects a number outside India's mobile range", () => {
    submitMobile("5876543210");

    expect(
      screen.getByText(
        "Please enter a valid 10-digit mobile number for India.",
      ),
    ).toBeInTheDocument();
  });

  it("uses the selected country's digit count in validation", () => {
    renderMobileForm();

    fireEvent.change(screen.getByRole("combobox", { name: "Country code" }), {
      target: { value: "SG" },
    });
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "9123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText(
        "Please enter a valid 8-digit mobile number for Singapore.",
      ),
    ).toBeInTheDocument();
  });

  it("refreshes an existing validation message when the country changes", () => {
    renderMobileForm();

    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "9123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Country code" }), {
      target: { value: "SG" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please enter a valid 8-digit mobile number for Singapore.",
    );
  });

  it("hands a valid number to the caller in international form", () => {
    const { onSubmit } = submitMobile("098765 43210");

    expect(onSubmit).toHaveBeenCalledWith({
      method: "mobile",
      phoneNo: "+919876543210",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("social login actions", () => {
  it("offers Google ahead of GitHub under an 'OR' divider", () => {
    renderWithQueryClient(<SocialLoginActions />);

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Continue with Google", "Continue with GitHub"]);
    expect(screen.getByText("OR")).toBeInTheDocument();
  });

  it("carries the real brand marks rather than monochrome glyphs", () => {
    renderWithQueryClient(<SocialLoginActions />);

    const [google, github] = screen.getAllByRole("button");
    expect(google?.querySelector('path[fill="#FFC107"]')).not.toBeNull();
    expect(github?.querySelector('svg[fill="currentColor"]')).not.toBeNull();
  });
});

describe("social brand icons", () => {
  it("keeps Google's four brand colours so the mark survives every palette", () => {
    const { container } = render(<GoogleBrandIcon />);

    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      [...container.querySelectorAll("path")].map((path) =>
        path.getAttribute("fill"),
      ),
    ).toEqual(["#FFC107", "#FF3D00", "#4CAF50", "#1976D2"]);
  });

  it("paints GitHub with the button's own text colour", () => {
    const { container } = render(<GitHubBrandIcon />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("fill", "currentColor");
  });

  it("defaults to the 18px the social row asks every icon for", () => {
    const { container } = render(<GoogleBrandIcon />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
  });

  it("sizes both marks from one numeric prop, like the Phosphor icons here", () => {
    const { container } = render(
      <>
        <GoogleBrandIcon size={24} />
        <GitHubBrandIcon size={24} />
      </>,
    );

    const sizes = [...container.querySelectorAll("svg")].map((svg) => [
      svg.getAttribute("width"),
      svg.getAttribute("height"),
    ]);
    expect(sizes).toEqual([
      ["24", "24"],
      ["24", "24"],
    ]);
  });
});
