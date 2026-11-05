import type { SupportTechnicalDetails } from "@veolms/contracts/support";

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg\/(\d+)/u, "Edge"],
  [/OPR\/(\d+)/u, "Opera"],
  [/SamsungBrowser\/(\d+)/u, "Samsung Internet"],
  [/Firefox\/(\d+)/u, "Firefox"],
  [/CriOS\/(\d+)/u, "Chrome"],
  [/Chrome\/(\d+)/u, "Chrome"],
  [/Version\/(\d+)[\d.]* .*Safari/u, "Safari"],
];

function browserName(userAgent: string): string | undefined {
  for (const [pattern, name] of BROWSERS) {
    const version = pattern.exec(userAgent)?.[1];
    if (version) return `${name} ${version}`;
  }
  return undefined;
}

function systemName(userAgent: string): string | undefined {
  const android = /Android (\d+(?:\.\d+)?)/u.exec(userAgent)?.[1];
  if (android) return `Android ${android}`;
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)[_\d]*/u.exec(userAgent)?.[1];
  if (ios) return `iOS ${ios}`;
  if (/Windows NT 10/u.test(userAgent)) return "Windows 10 or 11";
  if (/Windows/u.test(userAgent)) return "Windows";
  if (/Mac OS X/u.test(userAgent)) return "macOS";
  if (/CrOS/u.test(userAgent)) return "ChromeOS";
  if (/Linux/u.test(userAgent)) return "Linux";
  return undefined;
}

/** What "Include technical details" sends, read from this browser. */
export function readTechnicalDetails(): SupportTechnicalDetails {
  if (typeof navigator === "undefined") return {};
  const userAgent = navigator.userAgent;
  const ratio = window.devicePixelRatio || 1;
  return {
    browser: browserName(userAgent),
    os: systemName(userAgent),
    screen: `${window.screen.width} × ${window.screen.height}${ratio !== 1 ? ` @${Math.round(ratio * 100) / 100}x` : ""}`,
    userAgent: userAgent.slice(0, 500),
  };
}
