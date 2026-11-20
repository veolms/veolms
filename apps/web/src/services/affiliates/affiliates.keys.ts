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
