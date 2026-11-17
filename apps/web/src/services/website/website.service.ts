import type {
  CreateSitePageRequest,
  SaveSitePageDraftRequest,
  SiteCourseCardsResponse,
  SiteLook,
  SiteOverviewResponse,
  SitePageResponse,
  UpdateSitePageRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

const pagePath = (id: string) => `/site/pages/${encodeURIComponent(id)}`;

/** The website builder (creator-features/40): pages, look, publishing. */
export const websiteService = {
  overview(): Promise<SiteOverviewResponse> {
    return api.get<SiteOverviewResponse>("/site");
  },
  saveLook(look: SiteLook): Promise<SiteOverviewResponse> {
    return api.put<SiteOverviewResponse>("/site/look", look);
  },
  courseCards(): Promise<SiteCourseCardsResponse> {
    return api.get<SiteCourseCardsResponse>("/site/courses");
  },
  createPage(body: CreateSitePageRequest): Promise<SitePageResponse> {
    return api.post<SitePageResponse>("/site/pages", body);
  },
  page(id: string): Promise<SitePageResponse> {
    return api.get<SitePageResponse>(pagePath(id));
  },
  updatePage(
    id: string,
    body: UpdateSitePageRequest,
  ): Promise<SitePageResponse> {
    return api.patch<SitePageResponse>(pagePath(id), body);
  },
  saveDraft(
    id: string,
    body: SaveSitePageDraftRequest,
  ): Promise<SitePageResponse> {
    return api.put<SitePageResponse>(`${pagePath(id)}/draft`, body);
  },
  publish(id: string): Promise<SitePageResponse> {
    return api.post<SitePageResponse>(`${pagePath(id)}/publish`, {});
  },
  restore(id: string, versionId: string): Promise<SitePageResponse> {
    return api.post<SitePageResponse>(
      `${pagePath(id)}/versions/${encodeURIComponent(versionId)}/restore`,
      {},
    );
  },
  unpublish(id: string): Promise<SitePageResponse> {
    return api.post<SitePageResponse>(`${pagePath(id)}/unpublish`, {});
  },
  deletePage(id: string): Promise<{ deleted: true }> {
    return api.delete<{ deleted: true }>(pagePath(id));
  },
};
