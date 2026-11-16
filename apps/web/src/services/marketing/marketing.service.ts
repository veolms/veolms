import type {
  MarketingAudience,
  MarketingAudienceCountResponse,
  MarketingAudienceOptionsResponse,
  MarketingAutomationKey,
  MarketingAutomationListResponse,
  MarketingEmail,
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
