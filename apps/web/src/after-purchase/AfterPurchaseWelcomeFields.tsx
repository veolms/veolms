import {
  AFTER_PURCHASE_FIRST_NAME,
  AFTER_PURCHASE_LINK_LABEL_MAX,
  AFTER_PURCHASE_MESSAGE_MAX,
  fillWelcomeMessage,
  isSafeWelcomeLink,
} from "@veolms/contracts";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { Button } from "../components/Button";

/** The welcome as the creator types it (empty strings while typing). */
export interface WelcomeDraft {
  message: string;
  linkLabel: string;
  linkUrl: string;
}

export const EMPTY_WELCOME_DRAFT: WelcomeDraft = {
  message: "",
  linkLabel: "",
  linkUrl: "",
};

export function welcomeDraftFrom(
  welcome:
    | {
        message: string | null;
        linkLabel: string | null;
        linkUrl: string | null;
      }
    | null
    | undefined,
): WelcomeDraft {
  return {
    message: welcome?.message ?? "",
    linkLabel: welcome?.linkLabel ?? "",
    linkUrl: welcome?.linkUrl ?? "",
  };
}

/** What is saved: trimmed, and empty means none. */
export function welcomePayload(draft: WelcomeDraft) {
  return {
    message: draft.message.trim() || null,
    linkLabel: draft.linkLabel.trim() || null,
    linkUrl: draft.linkUrl.trim() || null,
  };
}

export function sameWelcome(a: WelcomeDraft, b: WelcomeDraft): boolean {
  const left = welcomePayload(a);
  const right = welcomePayload(b);
  return (
    left.message === right.message &&
    left.linkLabel === right.linkLabel &&
    left.linkUrl === right.linkUrl
  );
}

/** The same rules the server applies, said where the creator types. */
export function welcomeErrors(draft: WelcomeDraft): {
  linkLabel?: string;
  linkUrl?: string;
} {
  const { linkLabel, linkUrl } = welcomePayload(draft);
  const errors: { linkLabel?: string; linkUrl?: string } = {};
  if (linkUrl && !isSafeWelcomeLink(linkUrl)) {
    errors.linkUrl = "Use a link that starts with https://";
  } else if (linkLabel && !linkUrl) {
    errors.linkUrl = "Add the link the button opens";
  }
  if (linkUrl && !linkLabel) errors.linkLabel = "Give the button some words";
  return errors;
}

export const DEFAULT_WELCOME_PREVIEW =
  "Welcome! Everything is ready. Start whenever you like.";

/**
 * The creator's side of the welcome a buyer reads after paying: a message
 * (with `{first_name}`), one optional button, and a preview of how it looks
 * on the order page. Styled by the screen it sits in (`inputClassName`,
 * `textareaClassName`), so it matches the rest of that form.
 */
export function AfterPurchaseWelcomeFields({
  idPrefix,
  value,
  onChange,
  onBlur,
  disabled = false,
  messagePlaceholder = `Hi ${AFTER_PURCHASE_FIRST_NAME}, welcome aboard! Start with lesson 1, and join our WhatsApp group for doubts.`,
  inputClassName,
  textareaClassName,
  labelClassName = "block text-[13px] font-medium text-(--text)",
}: {
  idPrefix: string;
  value: WelcomeDraft;
  onChange: (next: WelcomeDraft) => void;
  /** Called when a field loses focus (to save). */
  onBlur?: () => void;
  disabled?: boolean;
  messagePlaceholder?: string;
  inputClassName: string;
  textareaClassName: string;
  labelClassName?: string;
}) {
  const errors = welcomeErrors(value);
  const preview = value.message.trim()
    ? fillWelcomeMessage(value.message.trim(), "Asha")
    : DEFAULT_WELCOME_PREVIEW;
  const showButton = Boolean(
    value.linkLabel.trim() && value.linkUrl.trim() && !errors.linkUrl,
  );

  const insertFirstName = () =>
    onChange({
      ...value,
      message: `${value.message}${
        value.message && !value.message.endsWith(" ") ? " " : ""
      }${AFTER_PURCHASE_FIRST_NAME}`.slice(0, AFTER_PURCHASE_MESSAGE_MAX),
    });

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${idPrefix}-message`} className={labelClassName}>
            Welcome message
          </label>
          <button
            type="button"
            onClick={insertFirstName}
            disabled={disabled}
            className="cursor-pointer text-[12px] font-medium text-(--accent) hover:underline"
          >
            Insert {AFTER_PURCHASE_FIRST_NAME}
          </button>
        </div>
        <div className="relative">
          <textarea
            id={`${idPrefix}-message`}
            rows={4}
            maxLength={AFTER_PURCHASE_MESSAGE_MAX}
            value={value.message}
            placeholder={messagePlaceholder}
            onChange={(event) =>
              onChange({ ...value, message: event.target.value })
            }
            onBlur={onBlur}
            disabled={disabled}
            className={textareaClassName}
          />
          <span className="pointer-events-none absolute right-3 bottom-2 text-[0.72rem] text-(--muted)">
            {value.message.length} / {AFTER_PURCHASE_MESSAGE_MAX}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="grid gap-1.5">
          <label htmlFor={`${idPrefix}-link-label`} className={labelClassName}>
            Button words <span className="text-(--muted)">(optional)</span>
          </label>
          <input
            id={`${idPrefix}-link-label`}
            type="text"
            maxLength={AFTER_PURCHASE_LINK_LABEL_MAX}
            value={value.linkLabel}
            placeholder="Join our WhatsApp group"
            aria-invalid={Boolean(errors.linkLabel)}
            onChange={(event) =>
              onChange({ ...value, linkLabel: event.target.value })
            }
            onBlur={onBlur}
            disabled={disabled}
            className={inputClassName}
          />
          {errors.linkLabel ? (
            <p className="m-0 text-[12px] text-rose-500" role="alert">
              {errors.linkLabel}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${idPrefix}-link-url`} className={labelClassName}>
            Button link
          </label>
          <input
            id={`${idPrefix}-link-url`}
            type="url"
            inputMode="url"
            value={value.linkUrl}
            placeholder="https://chat.whatsapp.com/…"
            aria-invalid={Boolean(errors.linkUrl)}
            onChange={(event) =>
              onChange({ ...value, linkUrl: event.target.value })
            }
            onBlur={onBlur}
            disabled={disabled}
            className={inputClassName}
          />
          {errors.linkUrl ? (
            <p className="m-0 text-[12px] text-rose-500" role="alert">
              {errors.linkUrl}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className="text-[12px] font-medium text-(--muted)">
          Preview, as a buyer named Asha sees it after paying
        </span>
        <div className="grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--canvas) p-4">
          <p className="m-0 whitespace-pre-line text-sm leading-6 text-(--text)">
            {preview}
          </p>
          {showButton ? (
            <div>
              <Button
                type="button"
                variant="quiet"
                elevation="flat"
                tabIndex={-1}
                aria-hidden="true"
                className="pointer-events-none"
              >
                {value.linkLabel.trim()}
                <ArrowSquareOut size={15} />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
