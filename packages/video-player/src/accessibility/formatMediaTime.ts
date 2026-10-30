const toWholeSeconds = (seconds: number) =>
  Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;

export function formatMediaTime(seconds: number): string {
  const totalSeconds = toWholeSeconds(seconds);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatTimeForScreenReader(seconds: number): string {
  const totalSeconds = toWholeSeconds(seconds);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(
      `${remainingSeconds} ${remainingSeconds === 1 ? "second" : "seconds"}`,
    );
  }

  return parts.join(", ");
}
