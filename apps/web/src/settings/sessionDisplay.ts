export function formatSessionDevice(
  userAgent: string | null | undefined,
): string {
  if (!userAgent?.trim()) {
    return "Unknown device";
  }

  const browser = detectBrowser(userAgent);
  const os = detectOs(userAgent);

  if (browser && os) {
    return `${browser} on ${os}`;
  }

  return browser ?? os ?? "Unknown device";
}

export function isMobileSession(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && /mobile|android|iphone|ipad|ipod/i.test(userAgent));
}

export function formatRelativeDate(dateStr: string | undefined): string {
  if (!dateStr) return "Unknown";
  try {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  } catch {
    return "Unknown";
  }
}

function detectBrowser(userAgent: string): string | null {
  if (/Edg(?:e|A|iOS)?\//.test(userAgent)) return "Edge";
  if (/OPR\/|Opera\//.test(userAgent)) return "Opera";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(userAgent) && !/Chromium\//.test(userAgent)) {
    return "Chrome";
  }
  if (/Safari\//.test(userAgent) && !/Chrome\/|CriOS\//.test(userAgent)) {
    return "Safari";
  }

  return null;
}

function detectOs(userAgent: string): string | null {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return null;
}
