import { useQuery } from "@tanstack/react-query";
import { aiKeys } from "./ai.keys";
import { aiService } from "./ai.service";

/** Platform → AI: the settings and this month's usage (admins). */
export function useAiSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: aiKeys.settings(),
    queryFn: aiService.getSettings,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

/** Whether AI buttons work now, and why not (staff screens). */
export function useAiAvailability(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: aiKeys.availability(),
    queryFn: aiService.getAvailability,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    retry: false,
  });
}
