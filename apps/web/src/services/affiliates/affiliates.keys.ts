export const affiliatesKeys = {
  all: ["affiliates"] as const,
  program: () => [...affiliatesKeys.all, "program"] as const,
  me: () => [...affiliatesKeys.all, "me"] as const,
  stats: (from?: string, to?: string) =>
    [...affiliatesKeys.all, "stats", from ?? "", to ?? ""] as const,
  commissions: (status?: string) =>
    [...affiliatesKeys.all, "commissions", status ?? "all"] as const,
  payouts: () => [...affiliatesKeys.all, "payouts"] as const,
};

/** The admin's side, kept apart from the affiliate's own. */
export const affiliatesAdminKeys = {
  all: ["affiliates-admin"] as const,
  settings: () => [...affiliatesAdminKeys.all, "settings"] as const,
  rules: () => [...affiliatesAdminKeys.all, "rules"] as const,
  products: () => [...affiliatesAdminKeys.all, "products"] as const,
  list: (query: object) => [...affiliatesAdminKeys.all, "list", query] as const,
  detail: (id: string) => [...affiliatesAdminKeys.all, "detail", id] as const,
  commissions: (query: object) =>
    [...affiliatesAdminKeys.all, "commissions", query] as const,
  payouts: (query: object) =>
    [...affiliatesAdminKeys.all, "payouts", query] as const,
  summary: (from?: string, to?: string) =>
    [...affiliatesAdminKeys.all, "summary", from ?? "", to ?? ""] as const,
  audit: (subjectId?: string) =>
    [...affiliatesAdminKeys.all, "audit", subjectId ?? ""] as const,
};
