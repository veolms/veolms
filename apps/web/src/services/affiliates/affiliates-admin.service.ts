import type {
  AdminAffiliateDetail,
  AdminAffiliatesQueryInput,
  AdminAffiliatesResponse,
  AdminCommissionRow,
  AdminCommissionsQueryInput,
  AdminCommissionsResponse,
  AdminPayout,
  AdminPayoutDetailsResponse,
  AdminPayoutsQueryInput,
  AdminPayoutsResponse,
  AffiliateAdjustmentRequest,
  AffiliateAdminSettingsResponse,
  AffiliateAuditEntry,
  AffiliateCommissionRuleInput,
  AffiliateProductOption,
  AffiliateReportQuery,
  AffiliateReportSummary,
  AffiliateRule,
  AffiliateStatusAction,
  ClosePayoutRequest,
  CreateAdminPayoutsRequest,
  CreateAdminPayoutsResponse,
  InviteAffiliateRequest,
  MarkPayoutPaidRequest,
  SetOrderAttributionRequest,
  SetOrderAttributionResponse,
  UpdateAffiliateProgramSettingsRequest,
} from "@veolms/contracts";

import { api, getApiBaseUrl } from "../../lib/api-client";

/** A list's filters as query values: empty ones left out. */
export type AdminListParams = Record<
  string,
  string | number | boolean | undefined | null
>;

function cleanParams<T extends object>(params: T): T {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  ) as T;
}

function queryString(params: AdminListParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(cleanParams(params))) {
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** The academy admin's side of the affiliate program (Affiliates page). */
export const affiliatesAdminService = {
  getSettings: () =>
    api.get<AffiliateAdminSettingsResponse>("/affiliates/settings"),
  updateSettings: (changes: UpdateAffiliateProgramSettingsRequest) =>
    api.put<AffiliateAdminSettingsResponse>("/affiliates/settings", changes),

  listRules: () => api.get<{ items: AffiliateRule[] }>("/affiliates/rules"),
  setRule: (rule: AffiliateCommissionRuleInput) =>
    api.put<AffiliateRule>("/affiliates/rules", rule),
  deleteRule: (id: string) =>
    api.delete<{ message: string }>(`/affiliates/rules/${id}`),
  listProducts: () =>
    api.get<{ items: AffiliateProductOption[] }>("/affiliates/products"),

  listAffiliates: (query: AdminAffiliatesQueryInput) =>
    api.get<AdminAffiliatesResponse>("/affiliates", {
      params: cleanParams(query),
    }),
  getAffiliate: (id: string) =>
    api.get<AdminAffiliateDetail>(`/affiliates/${id}`),
  invite: (payload: InviteAffiliateRequest) =>
    api.post<AdminAffiliateDetail>("/affiliates/invitations", payload),
  changeStatus: (input: {
    id: string;
    action: AffiliateStatusAction;
    reason?: string;
  }) =>
    api.post<AdminAffiliateDetail>(
      `/affiliates/${input.id}/${input.action}`,
      input.reason ? { reason: input.reason } : {},
    ),
  getPayoutDetails: (id: string) =>
    api.get<AdminPayoutDetailsResponse>(`/affiliates/${id}/payout-details`),

  listCommissions: (query: AdminCommissionsQueryInput) =>
    api.get<AdminCommissionsResponse>("/affiliates/commissions", {
      params: cleanParams(query),
    }),
  approveCommission: (id: string) =>
    api.post<AdminCommissionRow>(`/affiliates/commissions/${id}/approve`, {}),
  rejectCommission: (input: { id: string; reason: string }) =>
    api.post<AdminCommissionRow>(`/affiliates/commissions/${input.id}/reject`, {
      reason: input.reason,
    }),
  addAdjustment: (payload: AffiliateAdjustmentRequest) =>
    api.post<AdminCommissionRow>(
      "/affiliates/commissions/adjustments",
      payload,
    ),
  setOrderAttribution: (input: {
    orderId: string;
    body: SetOrderAttributionRequest;
  }) =>
    api.put<SetOrderAttributionResponse>(
      `/affiliates/orders/${input.orderId}/attribution`,
      input.body,
    ),

  listPayouts: (query: AdminPayoutsQueryInput) =>
    api.get<AdminPayoutsResponse>("/affiliates/payouts", {
      params: cleanParams(query),
    }),
  createPayouts: (payload: CreateAdminPayoutsRequest) =>
    api.post<CreateAdminPayoutsResponse>("/affiliates/payouts", payload),
  markPaid: (input: { id: string; body: MarkPayoutPaidRequest }) =>
    api.post<AdminPayout>(
      `/affiliates/payouts/${input.id}/mark-paid`,
      input.body,
    ),
  closePayout: (input: {
    id: string;
    status: "rejected" | "failed";
    body: ClosePayoutRequest;
  }) =>
    api.post<AdminPayout>(
      `/affiliates/payouts/${input.id}/${input.status === "rejected" ? "reject" : "fail"}`,
      input.body,
    ),

  getSummary: (query: AffiliateReportQuery) =>
    api.get<AffiliateReportSummary>("/affiliates/reports/summary", {
      params: cleanParams(query),
    }),
  listAudit: (subjectId?: string) =>
    api.get<{ items: AffiliateAuditEntry[] }>("/affiliates/audit", {
      params: subjectId ? { subjectId } : {},
    }),

  /**
   * Links that download a CSV (the session cookie goes with them), with the
   * list's own filters so the file holds what the screen shows.
   */
  payoutsExportUrl: (filters: AdminListParams = { status: "requested" }) =>
    `${getApiBaseUrl()}/affiliates/payouts/export${queryString(filters)}`,
  reportExportUrl: (
    type: "commissions" | "affiliates",
    filters: AdminListParams = {},
  ) =>
    `${getApiBaseUrl()}/affiliates/reports/export${queryString({ type, ...filters })}`,
};
