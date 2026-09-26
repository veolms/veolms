import { useRef } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";

export interface OtpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  label: string;
}

const CODE_LENGTH = 6;
const FIELD_ID_PREFIX = "auth-otp-digit";
const POSITIONS: readonly number[] = [0, 1, 2, 3, 4, 5];
const NON_DIGITS = /\D/g;

export function OtpCodeInput({
  describedBy,
  disabled = false,
  invalid = false,
  label,
  onChange,
  value,
}: OtpCodeInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const moveFocus = (position: number) => {
    inputs.current[position]?.focus();
  };

  const writeDigit = (position: number, digit: string) => {
    onChange(
      (value.slice(0, position) + digit + value.slice(position + 1)).slice(
        0,
        CODE_LENGTH,
      ),
    );
  };

  const clearDigit = (position: number) => {
    onChange(value.slice(0, position) + value.slice(position + 1));
  };

  const pressKey = (
    event: KeyboardEvent<HTMLInputElement>,
    position: number,
  ) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(position + (event.key === "ArrowLeft" ? -1 : 1));
      return;
    }

    if (event.key !== "Backspace") {
      return;
    }

    event.preventDefault();

    if (value[position] !== undefined) {
      clearDigit(position);
      return;
    }

    if (position > 0) {
      moveFocus(position - 1);
      clearDigit(position - 1);
    }
  };

  const fillFrom = (position: number, digits: string) => {
    const filled =
      digits.length === CODE_LENGTH
        ? digits
        : (value.slice(0, position) + digits).slice(0, CODE_LENGTH);

    onChange(filled);
    moveFocus(Math.min(filled.length, CODE_LENGTH - 1));
  };

  const pasteCode = (
    event: ClipboardEvent<HTMLInputElement>,
    position: number,
  ) => {
    const digits = event.clipboardData
      .getData("text")
      .replace(NON_DIGITS, "")
      .slice(0, CODE_LENGTH);

    if (digits === "") {
      return;
    }

    event.preventDefault();
    fillFrom(position, digits);
  };

  const changeDigit = (position: number, entry: string) => {
    const digits = entry.replace(NON_DIGITS, "").slice(0, CODE_LENGTH);

    if (digits === "") {
      return;
    }

    if (digits.length > 1) {
      fillFrom(position, digits);
      return;
    }

    writeDigit(position, digits);
    moveFocus(position + 1);
  };

  return (
    <div className="auth-otp">
      {POSITIONS.map((position) => {
        const place = position + 1;
        const fieldId = `${FIELD_ID_PREFIX}-${place}`;

        return (
          <div className="auth-otp__slot" key={position}>
            <label className="auth-otp__label" htmlFor={fieldId}>
              {`${label} digit ${place} of ${CODE_LENGTH}`}
            </label>
            <input
              ref={(node) => {
                inputs.current[position] = node;
              }}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              autoComplete="one-time-code"
              className="auth-otp__digit"
              disabled={disabled}
              id={fieldId}
              inputMode="numeric"
              maxLength={1}
              onChange={(event) => changeDigit(position, event.target.value)}
              onFocus={(event) => event.target.select()}
              onKeyDown={(event) => pressKey(event, position)}
              onPaste={(event) => pasteCode(event, position)}
              type="text"
              value={value[position] ?? ""}
            />
          </div>
        );
      })}
    </div>
  );
}
