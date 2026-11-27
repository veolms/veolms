import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { normalizeCertificateCode } from "@veolms/contracts/certificate";
import { useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { Button } from "../components/Button";
import { ElevatedCard } from "../components/ElevatedCard";
import { certificateInputClass, certificatePath } from "./certificateUi";

/**
 * `/verify`: the address printed on every certificate. Anyone types the
 * certificate ID from it and is taken to the certificate's page, which says
 * whether it is valid. `?id=` fills the box.
 */
export function CertificateLookupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [value, setValue] = useState(params.get("id") ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const inputId = useId();
  const noteId = useId();

  const check = () => {
    const code = normalizeCertificateCode(value);
    if (!code) {
      setProblem(
        "That isn't a certificate ID. It has 16 letters and numbers, like 7P5S-1588-Z9M0-4ASG.",
      );
      return;
    }
    void navigate(certificatePath(code));
  };

  return (
    <main
      className="flex w-full min-w-0 flex-col gap-5 font-sans"
      aria-labelledby="verify-title"
    >
      <ElevatedCard padded className="flex max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 [:root[data-theme=light]_&]:text-emerald-700">
            <SealCheck size={22} weight="fill" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1
              id="verify-title"
              className="m-0 text-[1.25rem] font-bold text-(--text)"
            >
              Verify a certificate
            </h1>
            <p className="m-0 mt-0.5 text-[0.86rem] text-(--muted)">
              Enter the certificate ID printed at the bottom of the certificate.
            </p>
          </div>
        </div>
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            check();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Certificate ID
          </label>
          <input
            id={inputId}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setProblem(null);
            }}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            aria-invalid={problem !== null}
            aria-describedby={noteId}
            className={`${certificateInputClass} min-w-0 flex-1 font-mono tracking-wider uppercase`}
          />
          <Button type="submit" className="h-11 rounded-[10px] px-5">
            Verify
          </Button>
        </form>
        <p
          id={noteId}
          role={problem ? "alert" : undefined}
          className={`m-0 text-[0.8rem] ${problem ? "text-rose-500" : "text-(--muted)"}`}
        >
          {problem ??
            "You can also scan the QR code on the certificate: it opens the same page."}
        </p>
      </ElevatedCard>
    </main>
  );
}
