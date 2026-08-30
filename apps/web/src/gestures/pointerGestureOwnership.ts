export const POINTER_GESTURE_CLAIM_EVENT = "veolms:pointer-gesture-claim";

export interface PointerGestureClaim {
  owner: "curriculum" | "learning-space";
  pointerId: number;
}

export const claimPointerGesture = (claim: PointerGestureClaim) => {
  window.dispatchEvent(
    new CustomEvent<PointerGestureClaim>(POINTER_GESTURE_CLAIM_EVENT, {
      detail: claim,
    }),
  );
};

export const subscribeToPointerGestureClaims = (
  listener: (claim: PointerGestureClaim) => void,
) => {
  const handleClaim = (event: Event) => {
    const detail = (event as CustomEvent<PointerGestureClaim>).detail;
    if (
      (detail?.owner !== "curriculum" && detail?.owner !== "learning-space") ||
      !Number.isInteger(detail.pointerId)
    )
      return;
    listener(detail);
  };

  window.addEventListener(POINTER_GESTURE_CLAIM_EVENT, handleClaim);
  return () =>
    window.removeEventListener(POINTER_GESTURE_CLAIM_EVENT, handleClaim);
};
