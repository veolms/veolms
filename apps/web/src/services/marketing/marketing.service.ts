import type {
  MarketingAudience,
  MarketingAudienceCountResponse,
  MarketingAudienceOptionsResponse,
  MarketingAutomationKey,
  MarketingAutomationListResponse,
  MarketingCardFill,
  MarketingEmail,
  MarketingImageContentType,
  MarketingImagePresignResponse,
  MarketingEmailListResponse,
  MarketingPreviewRequest,
  MarketingPreviewResponse,
  MarketingRecipientFilter,
  MarketingRecipientsResponse,
  MarketingReport,
  MarketingTemplateKey,
  UpdateMarketingEmailRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";
import { mediaService } from "../media/media.service";

const emailPath = (id: string) => `/marketing/emails/${encodeURIComponent(id)}`;

/** Email marketing (creator-features/34): broadcasts, automations, reports. */
export const marketingService = {
  list(): Promise<MarketingEmailListResponse> {
    return api.get<MarketingEmailListResponse>("/marketing/emails");
  },
  create(template: MarketingTemplateKey): Promise<MarketingEmail> {
    return api.post<MarketingEmail>("/marketing/emails", { template });
  },
  get(id: string): Promise<MarketingEmail> {
    return api.get<MarketingEmail>(emailPath(id));
  },
  update(
    id: string,
    body: UpdateMarketingEmailRequest,
  ): Promise<MarketingEmail> {
    return api.patch<MarketingEmail>(emailPath(id), body);
  },
  duplicate(id: string): Promise<MarketingEmail> {
    return api.post<MarketingEmail>(`${emailPath(id)}/duplicate`, {});
  },
  remove(id: string): Promise<{ deleted: true }> {
    return api.delete<{ deleted: true }>(emailPath(id));
  },
  schedule(id: string, sendAt: string | null): Promise<MarketingEmail> {
    return api.post<MarketingEmail>(`${emailPath(id)}/schedule`, { sendAt });
  },
  cancel(id: string): Promise<MarketingEmail> {
    return api.post<MarketingEmail>(`${emailPath(id)}/cancel`, {});
  },
  resend(id: string, subject: string): Promise<MarketingEmail> {
    return api.post<MarketingEmail>(`${emailPath(id)}/resend`, { subject });
  },
  sendTest(id: string): Promise<{ sentTo: string }> {
    return api.post<{ sentTo: string }>(`${emailPath(id)}/test`, {});
  },
  /**
   * Uploads an image for an email straight to storage, then checks it;
   * answers its public address. The type must already be an image's.
   */
  async uploadImage(file: File): Promise<{ url: string }> {
    const contentType = file.type as MarketingImageContentType;
    const { uploadId, uploadUrl } =
      await api.post<MarketingImagePresignResponse>(
        "/marketing/images/presign",
        { contentType, fileSize: file.size },
      );
    await mediaService.uploadFileToPresignedUrl(uploadUrl, file);
    return await api.post<{ url: string }>("/marketing/images/complete", {
      uploadId,
      contentType,
    });
  },
  /** A course's or workshop's words, to fill an email card with. */
  cardFill(
    source: "course" | "workshop",
    id: string,
  ): Promise<MarketingCardFill> {
    return api.get<MarketingCardFill>(
      `/marketing/cards/${source}/${encodeURIComponent(id)}`,
    );
  },
  preview(body: MarketingPreviewRequest): Promise<MarketingPreviewResponse> {
    return api.post<MarketingPreviewResponse>("/marketing/preview", body);
  },
  countAudience(
    audience: MarketingAudience,
  ): Promise<MarketingAudienceCountResponse> {
    return api.post<MarketingAudienceCountResponse>(
      "/marketing/audience/count",
      { audience },
    );
  },
  audienceOptions(): Promise<MarketingAudienceOptionsResponse> {
    return api.get<MarketingAudienceOptionsResponse>(
      "/marketing/audience/options",
    );
  },
  report(id: string): Promise<MarketingReport> {
    return api.get<MarketingReport>(`${emailPath(id)}/report`);
  },
  recipients(
    id: string,
    filter: MarketingRecipientFilter,
    page: number,
  ): Promise<MarketingRecipientsResponse> {
    const query = new URLSearchParams({ filter, page: String(page) });
    return api.get<MarketingRecipientsResponse>(
      `${emailPath(id)}/recipients?${query}`,
    );
  },
  automations(): Promise<MarketingAutomationListResponse> {
    return api.get<MarketingAutomationListResponse>("/marketing/automations");
  },
  openAutomation(key: MarketingAutomationKey): Promise<MarketingEmail> {
    return api.post<MarketingEmail>(`/marketing/automations/${key}/email`, {});
  },
  setAutomationActive(
    key: MarketingAutomationKey,
    active: boolean,
  ): Promise<MarketingEmail> {
    return api.post<MarketingEmail>(`/marketing/automations/${key}/active`, {
      active,
    });
  },
};
