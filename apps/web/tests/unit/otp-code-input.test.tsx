import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { OtpCodeInput } from "../../src/auth/OtpCodeInput.tsx";
import type { OtpCodeInputProps } from "../../src/auth/OtpCodeInput.tsx";

const renderInput = (props: Partial<OtpCodeInputProps> = {}) => {
  const onChange = vi.fn();
  const view = render(
    <OtpCodeInput
      label="Verification code"
      onChange={onChange}
      value=""
      {...props}
    />,
  );

  return { ...view, onChange };
};

const positions = () => screen.getAllByRole("textbox");

const positionAt = (place: number) =>
  screen.getByLabelText<HTMLInputElement>(
    `Verification code digit ${place} of 6`,
  );

describe("code layout", () => {
  it("offers six positions, each named for a screen reader", () => {
    renderInput();

    expect(positions()).toHaveLength(6);
    expect(
      screen.getByLabelText("Verification code digit 1 of 6"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Verification code digit 6 of 6"),
    ).toBeInTheDocument();
  });

  it("shows the code so far, one digit to a position", () => {
    renderInput({ value: "1409" });

    const expected = ["1", "4", "0", "9", "", ""];
    positions().forEach((position, index) => {
      expect(position).toHaveValue(expected[index]);
    });
  });
});

describe("typing a code", () => {
  it("records the digit and jumps to the next position", () => {
    const { onChange } = renderInput({ value: "14" });

    fireEvent.change(positionAt(3), { target: { value: "0" } });

    expect(onChange).toHaveBeenCalledWith("140");
    expect(positionAt(4)).toHaveFocus();
  });

  it("ignores letters and symbols so only digits reach the code", () => {
    const { onChange } = renderInput();

    fireEvent.change(positionAt(1), { target: { value: "a" } });
    fireEvent.change(positionAt(1), { target: { value: "-" } });

    expect(onChange).not.toHaveBeenCalled();
    expect(positionAt(2)).not.toHaveFocus();
  });

  it("spreads an autofilled code that lands in a single position", () => {
    const { onChange } = renderInput();

    fireEvent.change(positionAt(1), { target: { value: "140926" } });

    expect(onChange).toHaveBeenCalledWith("140926");
    expect(positionAt(6)).toHaveFocus();
  });
});

describe("correcting a code", () => {
  it("steps back and clears the previous digit on an empty position", () => {
    const { onChange } = renderInput({ value: "140" });

    fireEvent.keyDown(positionAt(4), { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith("14");
    expect(positionAt(3)).toHaveFocus();
  });

  it("clears a filled position in place and stays on it", () => {
    const { onChange } = renderInput({ value: "140926" });
    const last = positionAt(6);
    last.focus();

    fireEvent.keyDown(last, { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith("14092");
    expect(last).toHaveFocus();
  });

  it("walks between positions with the left and right arrow keys", () => {
    renderInput({ value: "140926" });

    fireEvent.keyDown(positionAt(3), { key: "ArrowRight" });
    expect(positionAt(4)).toHaveFocus();

    fireEvent.keyDown(positionAt(4), { key: "ArrowLeft" });
    expect(positionAt(3)).toHaveFocus();
  });
});

describe("pasting a code", () => {
  it("fills every position from a full code dropped on any of them", () => {
    const { onChange } = renderInput();

    fireEvent.paste(positionAt(4), {
      clipboardData: { getData: () => "140926" },
    });

    expect(onChange).toHaveBeenCalledWith("140926");
    expect(positionAt(6)).toHaveFocus();
  });

  it("strips the spaces and dashes a copied code carries", () => {
    const { onChange } = renderInput();

    fireEvent.paste(positionAt(1), {
      clipboardData: { getData: () => "14 09-26" },
    });

    expect(onChange).toHaveBeenCalledWith("140926");
  });
});

describe("rejected code", () => {
  it("flags every position while leaving the wrong code on screen", () => {
    renderInput({ invalid: true, value: "140926" });

    const expected = ["1", "4", "0", "9", "2", "6"];
    positions().forEach((position, index) => {
      expect(position).toHaveAttribute("aria-invalid", "true");
      expect(position).toHaveValue(expected[index]);
    });
  });

  it("still states aria-invalid on a clean code rather than dropping it", () => {
    renderInput({ value: "140" });

    positions().forEach((position) => {
      expect(position).toHaveAttribute("aria-invalid", "false");
    });
  });

  it("points every position at the message element only when there is one", () => {
    const { onChange, rerender } = renderInput();

    positions().forEach((position) => {
      expect(position).not.toHaveAttribute("aria-describedby");
    });

    rerender(
      <OtpCodeInput
        describedBy="auth-otp-error"
        label="Verification code"
        onChange={onChange}
        value=""
      />,
    );

    positions().forEach((position) => {
      expect(position).toHaveAttribute("aria-describedby", "auth-otp-error");
    });
  });
});

describe("input affordances", () => {
  it("lets a phone autofill the code it just received by SMS", () => {
    renderInput();

    positions().forEach((position) => {
      expect(position).toHaveAttribute("autocomplete", "one-time-code");
    });
  });

  it("locks every position while the code is being checked", () => {
    renderInput({ disabled: true, value: "140926" });

    positions().forEach((position) => {
      expect(position).toBeDisabled();
    });
  });

  it("asks for a numeric keypad and never leans on a placeholder", () => {
    renderInput();

    positions().forEach((position) => {
      expect(position).toHaveAttribute("inputmode", "numeric");
      expect(position).toHaveAttribute("maxlength", "1");
      expect(position).not.toHaveAttribute("placeholder");
    });
  });

  it("selects the digit it already holds so typing over it replaces it", () => {
    renderInput({ value: "140926" });
    const third = positionAt(3);

    third.focus();

    expect(third.selectionStart).toBe(0);
    expect(third.selectionEnd).toBe(1);
  });
});
