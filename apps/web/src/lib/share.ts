/**
 * Whether sharing should open the device's own share sheet.
 *
 * Not on Windows: Chrome and Edge hand `navigator.share` to the Windows share
 * window, which often stops responding and then cannot be closed (seen on
 * Windows 11 in 2026-11, whatever was shared). There a link is copied
 * instead, as everywhere without a share sheet.
 */
export function canOpenShareSheet(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent;
  // "Windows" (client hints), "Win32" (navigator.platform), "Windows NT" (UA).
  return !/^win|windows/iu.test(platform);
}
