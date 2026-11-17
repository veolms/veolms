import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSitePageRequest,
  SaveSitePageDraftRequest,
  SiteLook,
  SiteOverviewResponse,
  SitePageResponse,
  UpdateSitePageRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { websiteKeys } from "./website.keys";
import { websiteService } from "./website.service";

function usePageRefresh() {
  const queryClient = useQueryClient();
  return (page: SitePageResponse) => {
    queryClient.setQueryData(websiteKeys.page(page.page.id), page);
    void queryClient.invalidateQueries({ queryKey: websiteKeys.overview() });
  };
}

export function useSaveWebsiteLook() {
  const queryClient = useQueryClient();
  return useMutation<SiteOverviewResponse, ApiError, SiteLook>({
    mutationFn: (look) => websiteService.saveLook(look),
    onSuccess: (overview) => {
      queryClient.setQueryData(websiteKeys.overview(), overview);
    },
  });
}

export function useCreateWebsitePage() {
  const refresh = usePageRefresh();
  return useMutation<SitePageResponse, ApiError, CreateSitePageRequest>({
    mutationFn: (body) => websiteService.createPage(body),
    onSuccess: refresh,
  });
}

export function useUpdateWebsitePage() {
  const refresh = usePageRefresh();
  return useMutation<
    SitePageResponse,
    ApiError,
    { id: string; body: UpdateSitePageRequest }
  >({
    mutationFn: ({ id, body }) => websiteService.updatePage(id, body),
    onSuccess: refresh,
  });
}

/** Autosave. The editor keeps its own copy, so the cache is not replaced. */
export function useSaveWebsiteDraft() {
  const queryClient = useQueryClient();
  return useMutation<
    SitePageResponse,
    ApiError,
    { id: string; body: SaveSitePageDraftRequest }
  >({
    mutationFn: ({ id, body }) => websiteService.saveDraft(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: websiteKeys.overview() });
    },
  });
}

export function usePublishWebsitePage() {
  const refresh = usePageRefresh();
  return useMutation<SitePageResponse, ApiError, string>({
    mutationFn: (id) => websiteService.publish(id),
    onSuccess: refresh,
  });
}

export function useRestoreWebsiteVersion() {
  const refresh = usePageRefresh();
  return useMutation<
    SitePageResponse,
    ApiError,
    { id: string; versionId: string }
  >({
    mutationFn: ({ id, versionId }) => websiteService.restore(id, versionId),
    onSuccess: refresh,
  });
}

export function useUnpublishWebsitePage() {
  const refresh = usePageRefresh();
  return useMutation<SitePageResponse, ApiError, string>({
    mutationFn: (id) => websiteService.unpublish(id),
    onSuccess: refresh,
  });
}

export function useDeleteWebsitePage() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: true }, ApiError, string>({
    mutationFn: (id) => websiteService.deletePage(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: websiteKeys.page(id) });
      void queryClient.invalidateQueries({ queryKey: websiteKeys.overview() });
    },
  });
}
