import { useEffect, useState } from "react";

const DEFAULT_HOME_GREETING = "Good morning";

export function getHomeTimeGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 16) return "Good afternoon";
  return "Good evening";
}

export function useHomeTimeGreeting() {
  const [greeting, setGreeting] = useState(DEFAULT_HOME_GREETING);

  useEffect(() => {
    setGreeting(getHomeTimeGreeting(new Date().getHours()));
  }, []);

  return greeting;
}
