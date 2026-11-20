import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { AFFILIATE_CODE_PATTERN, AFFILIATE_REF_PARAM } from "@veolms/contracts";

import { useCurrentUser } from "../services/auth";
import {
  useClaimAffiliateReferral,
  useRecordAffiliateClick,
} from "../services/affiliates";

/**
 * Set when this browser recorded an affiliate click, until it has been tied
 * to an account. The click itself lives in an HttpOnly cookie the page
 * cannot read; this only says whether there is anything to claim.
 */
const CLAIM_PENDING_KEY = "veo_aff_claim_pending";

function readClaimPending(): boolean {
  try {
    return window.localStorage.getItem(CLAIM_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function writeClaimPending(pending: boolean): void {
  try {
    if (pending) window.localStorage.setItem(CLAIM_PENDING_KEY, "1");
    else window.localStorage.removeItem(CLAIM_PENDING_KEY);
  } catch {
    // Private mode or storage switched off: the account link waits for the
    // next click; the cookie still credits purchases in this browser.
  }
}

/**
 * Affiliate links (PRD section 11): public pages are static files, so only
 * the browser sees `?ref=`. On the first load with one, this tells the API
 * once (the API sets the cookie), then takes `ref` out of the address so
 * shared screenshots and bookmarks do not carry it. After the visitor signs
 * in, the click is tied to their account once, so a purchase on another
 * device is still credited. The page never waits for either call, and a
 * failure changes nothing for the visitor.
 */
export function AffiliateReferralCapture() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: user } = useCurrentUser();
  const { mutate: record } = useRecordAffiliateClick();
  const { mutate: claim } = useClaimAffiliateReferral();
  const handledRef = useRef<string | null>(null);
  const claimedForRef = useRef<string | null>(null);

  const ref = searchParams.get(AFFILIATE_REF_PARAM);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!ref || handledRef.current === ref) return;
    handledRef.current = ref;
    const code = ref.trim();
    if (AFFILIATE_CODE_PATTERN.test(code)) {
      record(
        {
          code,
          landingPath: window.location.pathname,
          referrer: document.referrer || null,
        },
        {
          // A signed-in visitor's click is tied to their account by the
          // API at once; only a signed-out one waits for a claim.
          onSuccess: () => writeClaimPending(!userId),
        },
      );
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(AFFILIATE_REF_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [ref, record, setSearchParams, userId]);

  useEffect(() => {
    if (!userId || claimedForRef.current === userId) return;
    if (!readClaimPending()) return;
    claimedForRef.current = userId;
    claim(undefined, {
      onSuccess: () => writeClaimPending(false),
    });
  }, [userId, claim]);

  return null;
}
