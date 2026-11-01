import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { useState, type ReactNode } from "react";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { cn } from "../lib/utils";
import { useGoogleButtonFont, type GoogleButtonFont } from "./googleButtonFont";
import type { LastGoogleAccount } from "./lastGoogleAccount";
import { GoogleBrandIcon } from "./SocialBrandIcons";

/**
 * The Google sign-in button, in the login card's own shape and colours and
 * within Google's sign-in branding guidelines:
 *
 * - Google's standard "G", unaltered, at 20px (the guidelines allow no other
 *   logo, colour or size), with 12px before it and 10px after it.
 * - Google Sans Medium, the guidelines' button font (see googleButtonFont).
 * - "Continue with Google", one of the guidelines' wordings; the account
 *   version says "Continue as <name>", as Google's own personalised button
 *   does.
 * - A dark fill in the dark themes and a light one in the light theme, the
 *   two backgrounds the "G" may stand on, here the card's own surface a
 *   shade deeper, with a 1px edge. The guidelines give Google's own fills
 *   as defaults and set no rule for the corner or the height (the button
 *   may be scaled, the logo kept unstretched), so the login card's own are
 *   used: 46px tall with 10px corners, like its email field and button
 *   (see LoginCardParts).
 */

/**
 * The surface both versions share. Important on the font: the login card's
 * stylesheet sets `font: inherit` on buttons, which outranks utilities.
 */
const googleSurfaceClasses = [
  "relative w-full min-h-11.5 rounded-[10px] border",
  "border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] text-(--text)",
  "text-[0.9375rem]! leading-5! font-medium! tracking-[0.1px]!",
].join(" ");

/**
 * The words' font (see useGoogleButtonFont): Google Sans once it is in (the
 * family named GOOGLE_BUTTON_FONT_FAMILY), else the app's own. While it is
 * on its way the words are hidden (`wordsClasses`).
 */
const fontClasses: Record<GoogleButtonFont, string> = {
  pending: "[font-family:var(--app-font-family,sans-serif)]!",
  google: "[font-family:LoginGoogleSans,var(--app-font-family,sans-serif)]!",
  fallback: "[font-family:var(--app-font-family,sans-serif)]!",
};
const wordsClasses = (font: GoogleButtonFont) =>
  font === "pending" ? "invisible" : undefined;

/** Hover and press: the text's colour laid over the fill, as Google does. */
const pressableClasses =
  "cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--text)_7%,transparent)] active:bg-[color-mix(in_srgb,var(--text)_11%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-progress disabled:hover:bg-transparent";

export function GoogleSignInButton({
  busyLabel,
  describedBy,
  disabled,
  onClick,
}: {
  /** Shown in place of the wording while a sign-in is under way. */
  busyLabel: string | null;
  /** The id of the message under the button, when one is shown. */
  describedBy?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const font = useGoogleButtonFont();
  return (
    <button
      aria-busy={busyLabel !== null}
      aria-describedby={describedBy}
      aria-label={busyLabel ? "Verifying Google sign-in" : undefined}
      className={cn(
        googleSurfaceClasses,
        fontClasses[font],
        pressableClasses,
        "flex items-center justify-center gap-2.5 px-3 whitespace-nowrap",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <GoogleBrandIcon size={20} />
      {busyLabel ? (
        <>
          <LoadingSpinnerIcon size={18} className="text-current!" />
          <span className={wordsClasses(font)}>{busyLabel}</span>
        </>
      ) : (
        <span className={wordsClasses(font)}>Continue with Google</span>
      )}
    </button>
  );
}

function AccountPicture({
  account,
  className,
}: {
  account: LastGoogleAccount;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (account.name || account.email).charAt(0).toUpperCase();
  return account.avatarUrl && !failed ? (
    <img
      alt=""
      className={cn("size-9 shrink-0 rounded-full object-cover", className)}
      decoding="async"
      draggable={false}
      height={36}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={account.avatarUrl}
      width={36}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_24%,var(--surface))] text-sm font-semibold text-(--accent-ink,var(--accent))",
        className,
      )}
    >
      {initial}
    </span>
  );
}

/**
 * The button for the Google account this browser last signed in with: its
 * picture, "Continue as <first name>" over the address, and Google's "G".
 * The arrow beside it opens Google's own account chooser for any other
 * account. A small "Last used" tag sits on its top edge when Google was how
 * this browser last signed in.
 */
export function GoogleAccountButton({
  account,
  lastUsed,
  busyLabel,
  describedBy,
  disabled,
  onContinue,
  onChooseAccount,
}: {
  account: LastGoogleAccount;
  lastUsed: boolean;
  busyLabel: string | null;
  describedBy?: string;
  disabled: boolean;
  onContinue: () => void;
  onChooseAccount: () => void;
}) {
  const font = useGoogleButtonFont();
  const firstName = account.name.split(/\s+/)[0] || account.name;
  const secondLine: ReactNode = busyLabel ? (
    <span className="flex items-center gap-1.5">
      <LoadingSpinnerIcon size={13} className="text-current!" />
      {busyLabel}
    </span>
  ) : (
    account.email
  );
  return (
    <div
      className={cn(
        googleSurfaceClasses,
        fontClasses[font],
        // Two lines, so taller than the one-line buttons. A size container:
        // on narrow phones everything tightens (the arrow's area, the gaps,
        // the picture, the name) so the picture can stay.
        "@container flex min-h-14.5 items-stretch",
      )}
    >
      {lastUsed ? (
        // Centred on the button's top edge, half above it and half below.
        // The fill is the accent mixed into the card's colour, not
        // see-through, so the edge does not show through it.
        <span className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,var(--surface))] px-2 py-px [font-family:var(--app-font-family,sans-serif)] text-[0.6875rem] leading-3.5 font-semibold tracking-[0.02em] whitespace-nowrap text-(--accent-ink,var(--accent))">
          Last used
        </span>
      ) : null}
      <button
        aria-busy={busyLabel !== null}
        aria-describedby={describedBy}
        aria-label={`Continue as ${account.name} (${account.email}) with Google${lastUsed ? ", last used" : ""}`}
        className={cn(
          pressableClasses,
          // More room right of the small "G" than left of the picture, so
          // each icon's side gap is close to the space above and below it.
          "flex min-w-0 flex-1 items-center gap-3 rounded-l-[9px] py-2.5 pr-4 pl-3 text-left @max-[20rem]:gap-2.5 @max-[20rem]:pr-2.5 @max-[16.5rem]:gap-2 @max-[16.5rem]:pr-2 @max-[16.5rem]:pl-2.5",
        )}
        disabled={disabled}
        onClick={onContinue}
        type="button"
      >
        <AccountPicture
          account={account}
          className="@max-[20rem]:size-8 @max-[16.5rem]:size-7"
        />
        <span
          className={cn("flex min-w-0 flex-1 flex-col", wordsClasses(font))}
        >
          {/* Wraps rather than cutting the name off when the button is narrow. */}
          <span className="line-clamp-2 leading-4.5! wrap-anywhere @max-[20rem]:text-sm">
            Continue as {firstName}
          </span>
          <span className="truncate text-xs leading-4 font-normal text-(--muted)">
            {secondLine}
          </span>
        </span>
        <GoogleBrandIcon size={20} />
      </button>
      <span
        aria-hidden="true"
        className="my-2.5 w-px shrink-0 bg-[color-mix(in_srgb,var(--text)_18%,transparent)]"
      />
      <button
        aria-label="Use another Google account"
        title="Use another Google account"
        className={cn(
          pressableClasses,
          "grid w-11 shrink-0 place-items-center rounded-r-[9px] text-(--muted) hover:text-(--text) @max-[20rem]:w-9 @max-[16.5rem]:w-8",
        )}
        disabled={disabled}
        onClick={onChooseAccount}
        type="button"
      >
        <CaretDown size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
