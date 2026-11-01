import { useEffect, useState } from "react";
import googleSansFontUrl from "../assets/fonts/google-sans-latin.woff2?url";

// The Google button's words are in Google Sans, the font Google's sign-in
// guidelines ask for. The app ships its Latin letters (the same file as the
// Android sign-in sheet), fetched as soon as the login card's code loads.
//
// A browser fetches a font only when text first uses it, so on a phone the
// card's first opening drew the words in the app's font and redrew them a
// moment later in Google Sans: the words visibly moved. Now the words wait
// for the font a short while; should it still be on its way, this card uses
// the app's font and keeps it, so the words never change while shown.

/** Named in GoogleSignInButton's font classes too; keep the two in step. */
const GOOGLE_BUTTON_FONT_FAMILY = "LoginGoogleSans";
/** How long the words may stay hidden on the card's first opening. */
const FONT_WAIT_MS = 400;

let fontLoaded = false;
let fontLoading: Promise<void> | null = null;

function loadGoogleButtonFont(): Promise<void> {
  if (fontLoading) return fontLoading;
  if (typeof FontFace === "undefined" || typeof document === "undefined") {
    fontLoading = Promise.resolve();
    return fontLoading;
  }
  const face = new FontFace(
    GOOGLE_BUTTON_FONT_FAMILY,
    `url(${googleSansFontUrl}) format("woff2")`,
    { weight: "400 700", display: "block" },
  );
  document.fonts.add(face);
  fontLoading = face.load().then(
    () => {
      fontLoaded = true;
    },
    () => {
      // The app's font shows the words instead.
    },
  );
  return fontLoading;
}
loadGoogleButtonFont();

/**
 * "pending" while the words wait (hide them), "google" once Google Sans is
 * in, "fallback" when it came too late for this card (use the app's font).
 * Decided once per card, so its words never switch fonts while shown.
 */
export type GoogleButtonFont = "pending" | "google" | "fallback";

export function useGoogleButtonFont(): GoogleButtonFont {
  const [font, setFont] = useState<GoogleButtonFont>(() =>
    fontLoaded ? "google" : "pending",
  );
  useEffect(() => {
    if (font !== "pending") return;
    let settled = false;
    const settle = (next: GoogleButtonFont) => {
      if (settled) return;
      settled = true;
      setFont(next);
    };
    const timer = window.setTimeout(() => settle("fallback"), FONT_WAIT_MS);
    void loadGoogleButtonFont().then(() =>
      settle(fontLoaded ? "google" : "fallback"),
    );
    return () => {
      settled = true;
      window.clearTimeout(timer);
    };
  }, [font]);
  return font;
}
