// The login card's own parts (method switch, country picker) are styled here.
import "../auth/auth.css";
import "../onboarding/onboarding.css";
import { useSearchParams } from "react-router";
import { OnboardingStage } from "../onboarding/OnboardingStage";
import { getAuthRouteMeta } from "../routing/routeDescriptors";
import { usePublicAcademyBrand } from "../services/academy";

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
 * admin home), its launch plays again.
 */
export default function StartRoute() {
  const [searchParams] = useSearchParams();
  const replay = searchParams.has("replay");
  if (replay) return <ReplayStage />;
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
