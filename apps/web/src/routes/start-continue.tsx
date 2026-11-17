import "../onboarding/onboarding.css";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { resolveMfaSetupView } from "../auth/mfaGate";
import { Button } from "../components/Button";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { getApiError } from "../lib/api-error";
import { StageDock, StageQuestion, VeoMark } from "../onboarding/StagePieces";
import { APP_HOME_PATH, MFA_CHALLENGE_PATH } from "../routing/routeAccess";
import { getAuthRouteMeta } from "../routing/routeDescriptors";
import { useHandoffSignIn } from "../services/auth";

export function meta() {
  return Object.entries(
    getAuthRouteMeta("Opening your academy", "Signing you in to your academy."),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

/**
 * Where an academy's owner lands from its launch (or from "Welcome back"
 * on the platform site): the one-time token in the address's fragment signs
 * them in here, then their admin home opens. The token is taken out of the
 * address at once, so it is never left in the history.
 */
export default function StartContinueRoute() {
  const navigate = useNavigate();
  const handoff = useHandoffSignIn();
  const started = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setProblem("This sign-in link is incomplete. Sign in instead.");
      return;
    }
    handoff.mutate(token, {
      onSuccess: (session) => {
        const view = resolveMfaSetupView({
          ...session.user,
          mfaVerified: !session.mfaRequired,
          totpEnabled: session.totpEnabled,
          passkeyEnabled: session.passkeyEnabled,
          mfaMandatory: session.mfaMandatory,
        });
        void navigate(
          view === "enroll" || view === "verify"
            ? MFA_CHALLENGE_PATH
            : APP_HOME_PATH,
          { replace: true },
        );
      },
      onError: (error) => setProblem(getApiError(error).message),
    });
  }, [handoff, navigate]);

  return (
    <div className="@container relative flex h-dvh w-full flex-col overflow-hidden bg-[radial-gradient(120%_90%_at_50%_38%,color-mix(in_srgb,var(--accent)_9%,var(--canvas))_0%,var(--canvas)_55%,color-mix(in_srgb,#000_35%,var(--canvas))_100%)] text-(--text) [--stage-ease:cubic-bezier(.16,1,.3,1)] [:root[data-theme=light]_&]:bg-[radial-gradient(120%_90%_at_50%_38%,color-mix(in_srgb,var(--accent)_7%,var(--surface))_0%,var(--canvas)_70%)]">
      <header className="flex min-h-14.5 items-center px-5 pt-3.5">
        <VeoMark />
      </header>
      <div className="flex flex-1 flex-col justify-center">
        {problem ? (
          <>
            <StageQuestion title="This link has expired.">
              {problem}
            </StageQuestion>
            <div className="h-8" />
            <StageDock>
              <Button
                className="h-11.5"
                onClick={() => void navigate("/login", { replace: true })}
              >
                Sign in
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Button>
            </StageDock>
          </>
        ) : (
          <div className="grid justify-items-center gap-4" role="status">
            <LoadingSpinnerIcon />
            <p className="m-0 text-[15px] font-semibold text-(--muted)">
              Opening your academy…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
