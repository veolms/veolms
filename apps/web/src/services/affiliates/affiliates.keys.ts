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
  list: (status?: string, q?: string) =>
    [...affiliatesAdminKeys.all, "list", status ?? "all", q ?? ""] as const,
  detail: (id: string) => [...affiliatesAdminKeys.all, "detail", id] as const,
  commissions: (filters: Record<string, string | undefined>) =>
    [...affiliatesAdminKeys.all, "commissions", filters] as const,
  payouts: (status?: string) =>
    [...affiliatesAdminKeys.all, "payouts", status ?? "all"] as const,
  summary: (from?: string, to?: string) =>
    [...affiliatesAdminKeys.all, "summary", from ?? "", to ?? ""] as const,
  audit: (subjectId?: string) =>
    [...affiliatesAdminKeys.all, "audit", subjectId ?? ""] as const,
};
