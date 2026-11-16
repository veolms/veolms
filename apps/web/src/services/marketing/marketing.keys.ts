import type {
  MarketingAudience,
  MarketingRecipientFilter,
} from "@veolms/contracts";

export const marketingKeys = {
  all: ["marketing"] as const,
  list: () => [...marketingKeys.all, "list"] as const,
  email: (id: string) => [...marketingKeys.all, "email", id] as const,
  report: (id: string) => [...marketingKeys.all, "report", id] as const,
  recipients: (id: string, filter: MarketingRecipientFilter, page: number) =>
    [...marketingKeys.all, "recipients", id, filter, page] as const,
  audienceCount: (audience: MarketingAudience | null) =>
    [
      ...marketingKeys.all,
      "audience-count",
      audience ? JSON.stringify(audience) : "none",
    ] as const,
  audienceOptions: () => [...marketingKeys.all, "audience-options"] as const,
  automations: () => [...marketingKeys.all, "automations"] as const,
};
