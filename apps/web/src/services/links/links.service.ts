import type {
  CreateShortLinkRequest,
  ShortLink,
  ShortLinkListResponse,
  ShortLinkPathCheckResponse,
  UpdateShortLinkRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

/** Short links on the site's own domain (Settings > Links). */
export const linksService = {
  list(): Promise<ShortLinkListResponse> {
    return api.get<ShortLinkListResponse>("/links");
  },

  /** Whether a path is free; without one, a short free path to suggest. */
  checkPath(
    path: string,
    linkId?: string,
  ): Promise<ShortLinkPathCheckResponse> {
    const query = new URLSearchParams();
    if (path) query.set("path", path);
    if (linkId) query.set("linkId", linkId);
    return api.get<ShortLinkPathCheckResponse>(`/links/check?${query}`);
  },

  create(body: CreateShortLinkRequest): Promise<ShortLink> {
    return api.post<ShortLink>("/links", body);
  },

  update(id: string, body: UpdateShortLinkRequest): Promise<ShortLink> {
    return api.patch<ShortLink>(`/links/${encodeURIComponent(id)}`, body);
  },

  remove(id: string): Promise<{ deleted: true }> {
    return api.delete<{ deleted: true }>(`/links/${encodeURIComponent(id)}`);
  },
};
