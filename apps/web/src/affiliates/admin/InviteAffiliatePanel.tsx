import { AFFILIATE_CODE_PATTERN } from "@veolms/contracts";
import { useState } from "react";

import { Button } from "../../components/Button";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import { useInviteAffiliate } from "../../services/affiliates";
import { looksLikeEmail } from "../../team/teamFormat";
import {
  inputClassName,
  PanelBody,
  PanelFooter,
  secondaryButtonClassName,
} from "../../team/TeamBits";

/** Invites someone by email; accepting approves them without a review. */
export function InviteAffiliatePanel({ onClose }: { onClose: () => void }) {
  const invite = useInviteAffiliate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const codeInvalid =
    code.trim() !== "" && !AFFILIATE_CODE_PATTERN.test(code.trim());
  const valid = looksLikeEmail(email.trim()) && !codeInvalid;

  return (
    <SlideOverPanel
      label="Invite"
      title="Invite an affiliate"
      onClose={onClose}
    >
      <PanelBody>
        <div className="flex flex-col gap-4 text-sm">
          <p className="m-0 text-(--muted)">
            They get an email with the join page. Once they sign in with this
            address and accept the terms, they&apos;re approved.
          </p>
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            Email
            <input
              type="email"
              className={inputClassName}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            Their code (optional)
            <input
              className={inputClassName}
              value={code}
              maxLength={20}
              placeholder="Made from the email if left empty"
              onChange={(event) => setCode(event.target.value)}
            />
            {codeInvalid ? (
              <span className="text-xs font-normal text-rose-500">
                3 to 20 letters, digits or hyphens.
              </span>
            ) : null}
          </label>
          {invite.error ? (
            <p role="alert" className="m-0 text-rose-500">
              {invite.error.message}
            </p>
          ) : null}
          {sent ? (
            <p role="status" className="m-0 text-(--text)">
              Invitation sent to {sent}.
            </p>
          ) : null}
        </div>
      </PanelBody>
      <PanelFooter>
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={onClose}
        >
          {sent ? "Done" : "Cancel"}
        </button>
        <Button
          elevation="flat"
          motion="static"
          disabled={!valid || invite.isPending}
          onClick={() =>
            invite.mutate(
              {
                email: email.trim(),
                ...(code.trim() ? { code: code.trim() } : {}),
              },
              {
                onSuccess: () => {
                  setSent(email.trim());
                  setEmail("");
                  setCode("");
                },
              },
            )
          }
        >
          {invite.isPending ? "Sending…" : "Send invitation"}
        </Button>
      </PanelFooter>
    </SlideOverPanel>
  );
}
