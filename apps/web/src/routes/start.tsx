// The shared dropdown (country picker) styles; the academy layout loads them elsewhere.
import "../styles/shell/controls.css";
// The login card's own parts (method switch, country picker) are styled here.
import "../auth/auth.css";
import "../onboarding/onboarding.css";
import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { getApiError } from "../lib/api-error";
import { OnboardingStage } from "../onboarding/OnboardingStage";
import { getAuthRouteMeta } from "../routing/routeDescriptors";
import { usePublicAcademyBrand } from "../services/academy";
import { onboardingService } from "../services/onboarding";

export function meta() {
  return Object.entries(
    getAuthRouteMeta(
      "Start your academy",
      "Courses, live classes and payments, under your own name. Free for 14 days, no card needed.",
    ),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

/**
 * The sign-up stage. On the platform site, a creator signs up and launches
 * their academy; with `?replay` on an academy's own address (from its
 * admin home), its launch plays again. An academy's own address takes no
 * sign-ups (they are on the VeoLMS website), so there /start is its home.
 */
export default function StartRoute() {
  const [searchParams] = useSearchParams();
  const replay = searchParams.has("replay");
  if (replay) return <ReplayStage />;
  return <SignupStage />;
}

/** Asks first whether this address takes sign-ups; an academy's does not. */
function SignupStage() {
  const [takesSignups, setTakesSignups] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    onboardingService.checkAddress("start").then(
      () => !cancelled && setTakesSignups(true),
      (error: unknown) =>
        !cancelled && setTakesSignups(getApiError(error).status !== 404),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  if (takesSignups === false) return <Navigate to="/" replace />;
  if (takesSignups === null) {
    return <div className="h-dvh w-full bg-(--canvas)" aria-busy="true" />;
  }
  return <OnboardingStage mode="signup" />;
}

function ReplayStage() {
  const brand = usePublicAcademyBrand();
  if (!brand.data && !brand.isError) {
    return <div className="h-dvh w-full bg-(--canvas)" aria-busy="true" />;
  }
  return (
    <OnboardingStage
      mode="replay"
      replayName={brand.data?.name ?? "Your academy"}
    />
  );
}
