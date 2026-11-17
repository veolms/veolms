import { useQuery } from "@tanstack/react-query";
import { websiteKeys } from "./website.keys";
import { websiteService } from "./website.service";

export function useWebsiteOverview() {
  return useQuery({
    queryKey: websiteKeys.overview(),
    queryFn: () => websiteService.overview(),
  });
}

export function useWebsitePage(id: string) {
  return useQuery({
    queryKey: websiteKeys.page(id),
    queryFn: () => websiteService.page(id),
    // The editor holds its own copy while editing; never swap it mid-edit.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/** Published courses for course grids and the course picker. */
export function useWebsiteCourseCards() {
  return useQuery({
    queryKey: websiteKeys.courseCards(),
    queryFn: () => websiteService.courseCards(),
    staleTime: 60_000,
  });
}
