import { lazy, Suspense } from "react";
import { useDeviceLimitPrompt } from "../store/deviceLimitPrompt";

const DeviceLimitDialog = lazy(() => import("./DeviceLimitDialog"));

/** Puts up the device question whenever a sign-in is waiting on it. */
export function DeviceLimitHost() {
  const prompt = useDeviceLimitPrompt();
  if (!prompt) return null;
  return (
    <Suspense fallback={null}>
      <DeviceLimitDialog onSignedIn={prompt.finish} onClose={prompt.cancel} />
    </Suspense>
  );
}
