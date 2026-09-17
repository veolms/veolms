import { useQuery } from "@tanstack/react-query";
import type { LinkPreviewResponse } from "@veolms/contracts";
import { learningInteractionsService } from "./learning-interactions.service";
import { learningInteractionKeys } from "./learning-interactions.keys";

export function useLinkPreview(url?: string | null) {
  const normalizedUrl = url?.trim();
  const isValidUrl = Boolean(
    normalizedUrl &&
      (normalizedUrl.startsWith("http://") ||
        normalizedUrl.startsWith("https://")),
  );

  return useQuery<LinkPreviewResponse>({
    queryKey: learningInteractionKeys.linkPreview(normalizedUrl || ""),
    queryFn: () => learningInteractionsService.getLinkPreview(normalizedUrl!),
    enabled: isValidUrl,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  });
}

const URL_REGEX = /(https?:\/\/[^\s<>"'`()]+)/i;

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = URL_REGEX.exec(text);
  if (!match || !match[1]) return null;
  const raw = match[1].replace(/[.,;:!?]+$/, "");
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}
