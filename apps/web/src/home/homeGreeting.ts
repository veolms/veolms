export function getHomeTimeGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 16) return "Good afternoon";
  return "Good evening";
}
