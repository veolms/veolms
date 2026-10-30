import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  PointerEvent,
} from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { cn } from "../lib/utils";
import { OTP_CODE_LENGTH } from "./otpCodeEntry";

export interface OtpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  label: string;
  autoFocus?: boolean;
  /**
   * "login": the login card's larger boxes, split three and three by a
   * dash. Elsewhere (two-factor, settings) the compact row.
   */
  look?: "compact" | "login";
  /** The field's id, for a label outside it. */
  id?: string;
}

// The six boxes are one text field. They used to be six fields of one
// digit each, so the code could not be selected or copied as a whole:
// Ctrl+A took one digit, and a drag stopped at the box's edge. Now a single
// field holds the code, laid over the boxes and invisible, and the boxes
// draw what it holds: its digits, its selection (Ctrl+A, Shift+arrows, a
// drag across them) and where typing goes. Select all, copy, cut, paste
// and a phone's "code from your messages" are the field's own.
//
// A mouse drag is placed by the boxes (the field's own text layout is
// hidden and does not line up with them); a finger is left to the field,
// so a long press still offers Paste.

const CODE_LENGTH = OTP_CODE_LENGTH;
export const OTP_CODE_FIELD_ID = "auth-otp-code";
const POSITIONS: readonly number[] = [0, 1, 2, 3, 4, 5];
const NON_DIGITS = /\D/g;

/** The login card's boxes. Font marked important (see LoginCardParts). */
const loginBoxClasses =
  "grid h-14 w-[clamp(36px,10.5vw,46px)] place-items-center rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_45%,var(--surface))] text-[1.375rem]! font-semibold! text-(--text) tabular-nums";
const loginActiveClasses =
  "border-(--accent) shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]";

/** The compact boxes keep `auth-otp__digit` (auth.css) for size and colour. */
const compactBoxClasses = "auth-otp__digit grid place-items-center";
const compactActiveClasses =
  "border-(--accent)! outline-2 outline-offset-1 outline-[color-mix(in_srgb,var(--accent)_65%,transparent)]";
const compactDisabledClasses =
  "border-[color-mix(in_srgb,var(--text)_8%,transparent)]! bg-[color-mix(in_srgb,var(--surface)_62%,transparent)]! text-(--muted)! cursor-not-allowed";

/** A selected digit, in both looks. */
const selectedClasses =
  "bg-[color-mix(in_srgb,var(--accent)_38%,var(--surface))]! border-[color-mix(in_srgb,var(--accent)_70%,transparent)]!";

interface Selection {
  start: number;
  end: number;
}

export function OtpCodeInput({
  describedBy,
  disabled = false,
  invalid = false,
  label,
  autoFocus = false,
  onChange,
  value,
  look = "compact",
  id = OTP_CODE_FIELD_ID,
}: OtpCodeInputProps) {
  const login = look === "login";
  const field = useRef<HTMLInputElement | null>(null);
  const boxes = useRef<(HTMLDivElement | null)[]>([]);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState<Selection>({
    start: value.length,
    end: value.length,
  });

  const readSelection = useCallback(() => {
    const input = field.current;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    setSelection((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);

  const select = (start: number, end = start) => {
    const input = field.current;
    if (!input) return;
    input.setSelectionRange(start, end);
    readSelection();
  };

  // The field reports a moved selection (arrows, Ctrl+A, a drag, a tap)
  // through the document's `selectionchange`.
  useEffect(() => {
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, [readSelection]);

  // The field is disabled while a code is checked or sent, which takes the
  // cursor out of it (and keeps `autoFocus` from placing it when it opens
  // disabled). When it comes back, so does the cursor: on the last box
  // after a wrong code, so typing replaces its digit and Backspace clears
  // it, else at the end, where typing goes.
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    const reenabled = wasDisabled.current && !disabled;
    wasDisabled.current = disabled;
    const input = field.current;
    if (!reenabled || !input) return;
    if (invalid) {
      input.focus();
      select(Math.max(0, input.value.length - 1));
      return;
    }
    if (autoFocus && document.activeElement !== input) {
      input.focus();
      select(input.value.length);
    }
    // Only when the field comes back; the rest is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const digits = input.value.replace(NON_DIGITS, "");
    // More than a code's worth arrives when a whole code is typed or
    // inserted beside one already there (the keyboard's suggestion from a
    // text message): the newest code is the one meant.
    const next =
      digits.length > CODE_LENGTH ? digits.slice(-CODE_LENGTH) : digits;
    const caret = Math.min(
      next.length,
      (input.selectionStart ?? next.length) -
        (input.value.length - digits.length),
    );
    onChange(next);
    // React writes the value back after this; the cursor is put after it.
    requestAnimationFrame(() => select(Math.max(0, caret)));
  };

  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData("text").replace(NON_DIGITS, "");
    // A whole code replaces what is there, wherever the cursor stands.
    if (digits.length >= CODE_LENGTH) {
      event.preventDefault();
      onChange(digits.slice(0, CODE_LENGTH));
      requestAnimationFrame(() => select(CODE_LENGTH));
    }
  };

  const pressKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    // The cursor stands on a box (its border), as it did when each box was
    // a field of its own: a digit typed there replaces the box's digit
    // rather than pushing the rest along, and Backspace clears that digit.
    // At the end, after the last digit, Backspace clears the one before.
    const onFilledBox = start === end && start < input.value.length;
    if (
      onFilledBox &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (/^\d$/.test(event.key) || event.key === "Backspace")
    ) {
      input.setSelectionRange(start, start + 1);
    }
    requestAnimationFrame(readSelection);
  };

  // Where on the boxes a mouse pointer is: the place before the digit under
  // it, or after it past its middle.
  const placeAt = (clientX: number) => {
    let place = 0;
    boxes.current.forEach((box, position) => {
      if (!box) return;
      const rect = box.getBoundingClientRect();
      if (clientX >= rect.left + rect.width / 2) place = position + 1;
    });
    return Math.min(place, value.length);
  };

  const boxAt = (clientX: number) =>
    boxes.current.findIndex((box) => {
      if (!box) return false;
      const rect = box.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right;
    });

  // Where a mouse drag began: the place it is measured from, and the digit
  // it was pressed on, which the selection keeps whichever way it goes.
  const dragFrom = useRef<number | null>(null);
  const pressedDigit = useRef<number | null>(null);
  const pointerDown = (event: PointerEvent<HTMLInputElement>) => {
    if (disabled || event.pointerType !== "mouse" || event.button !== 0) return;
    event.preventDefault();
    const input = event.currentTarget;
    input.focus();
    if (event.shiftKey) {
      const anchor =
        input.selectionStart === selection.start
          ? selection.end
          : selection.start;
      const place = placeAt(event.clientX);
      dragFrom.current = anchor;
      pressedDigit.current = null;
      select(Math.min(anchor, place), Math.max(anchor, place));
    } else {
      // A press on a filled box puts the cursor on it (its border), so
      // typing replaces its digit; nothing is selected until a drag.
      const onDigit = boxAt(event.clientX);
      if (onDigit >= 0 && onDigit < value.length) {
        pressedDigit.current = onDigit;
        dragFrom.current = onDigit;
        select(onDigit);
      } else {
        const place = placeAt(event.clientX);
        pressedDigit.current = null;
        dragFrom.current = place;
        select(place);
      }
    }
    input.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLInputElement>) => {
    if (dragFrom.current === null || event.pointerType !== "mouse") return;
    const pressed = pressedDigit.current;
    if (pressed !== null) {
      // Still on the pressed box: no selection yet.
      if (boxAt(event.clientX) === pressed) return select(pressed);
      const place = placeAt(event.clientX);
      // Leftwards the pressed digit is the last one taken, rightwards the
      // first; either way it is in.
      return place <= pressed
        ? select(place, pressed + 1)
        : select(pressed, Math.max(place, pressed + 1));
    }
    const from = dragFrom.current;
    const place = placeAt(event.clientX);
    if (place === from) return;
    select(Math.min(from, place), Math.max(from, place));
  };
  const pointerUp = (event: PointerEvent<HTMLInputElement>) => {
    if (event.pointerType !== "mouse") return;
    dragFrom.current = null;
    pressedDigit.current = null;
  };

  // Copying says so for a moment, above the boxes.
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
  const noteCopied = () => {
    const input = field.current;
    if (!input || input.selectionStart === input.selectionEnd) return;
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  // A double click selects the whole code, as it would a word.
  const doubleClick = () => select(0, value.length);

  const { start, end } = selection;
  const collapsed = start === end;
  // The box typing goes to: the one after the cursor, or the last box.
  const activeBox = Math.min(start, CODE_LENGTH - 1);

  return (
    <div
      className={cn(
        "relative",
        login
          ? "flex items-center justify-center gap-[clamp(5px,1.6vw,8px)]"
          : "auth-otp",
      )}
    >
      {POSITIONS.map((position) => {
        const digit = value[position] ?? "";
        const selected =
          focused && !collapsed && position >= start && position < end;
        const active = focused && collapsed && position === activeBox;
        return (
          <Fragment key={position}>
            {login && position === CODE_LENGTH / 2 ? (
              <span
                aria-hidden="true"
                className="mx-0.5 h-0.5 w-2.5 shrink-0 rounded-xs bg-[color-mix(in_srgb,var(--text)_14%,transparent)]"
              />
            ) : null}
            <div
              aria-hidden="true"
              aria-invalid={invalid || undefined}
              ref={(node) => {
                boxes.current[position] = node;
              }}
              className={cn(
                login ? loginBoxClasses : compactBoxClasses,
                "relative select-none",
                login && invalid && "border-(--danger)",
                login && disabled && "opacity-60",
                !login && disabled && compactDisabledClasses,
                active && (login ? loginActiveClasses : compactActiveClasses),
                selected && selectedClasses,
              )}
            >
              {digit}
              {active && digit === "" ? (
                <span className="pointer-events-none absolute h-[45%] w-0.5 animate-pulse rounded-full bg-(--accent)" />
              ) : null}
            </div>
          </Fragment>
        );
      })}
      <span aria-live="polite" className="sr-only">
        {copied ? "Code copied" : ""}
      </span>
      {copied ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-(--text) px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-(--surface) shadow-[0_4px_14px_rgb(0_0_0/25%)] animate-in fade-in zoom-in-95 duration-150"
        >
          <Check size={13} weight="bold" aria-hidden="true" />
          Code copied
        </span>
      ) : null}
      <input
        ref={field}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-label={label}
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        className="absolute inset-0 m-0 h-full w-full cursor-text border-0 bg-transparent p-0 text-base text-transparent caret-transparent outline-none selection:bg-transparent! selection:text-transparent! disabled:cursor-not-allowed"
        disabled={disabled}
        id={id}
        inputMode="numeric"
        onBlur={() => setFocused(false)}
        onChange={change}
        onCopy={noteCopied}
        onCut={noteCopied}
        onDoubleClick={doubleClick}
        onFocus={() => {
          setFocused(true);
          readSelection();
        }}
        onKeyDown={pressKey}
        onPaste={paste}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onSelect={readSelection}
        pattern="[0-9]*"
        spellCheck={false}
        type="text"
        value={value}
      />
    </div>
  );
}
