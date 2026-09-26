import { z } from "zod";

const dashboardKpiSchema = z.strictObject({
  value: z.number(),
  previousValue: z.number(),
  changePercent: z.number().nullable(),
});

export const dashboardSummaryResponseSchema = z.strictObject({
  revenue: z.strictObject({
    value: z.number(),
    previousValue: z.number(),
    changePercent: z.number().nullable(),
    currency: z.string().length(3),
  }),
  students: z.strictObject({
    total: z.number().int().nonnegative(),
    newThisMonth: z.number().int().nonnegative(),
  }),
  activeLearners: dashboardKpiSchema,
  watchHours: dashboardKpiSchema,
});

export type DashboardSummaryResponse = z.infer<
  typeof dashboardSummaryResponseSchema
>;
