import { z } from "zod";

export const notificationChannelSchema = z.enum(["in_app", "email"]);
export const notificationCategorySchema = z.enum([
  "transactional",
  "social",
  "learning",
  "system",
]);

export const notificationSchema = z.strictObject({
  id: z.uuid(),
  type: z.string().min(1).max(100),
  category: notificationCategorySchema,
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(2000),
  deepLink: z.string().min(1).max(1000).nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

const queryBooleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const notificationListQuerySchema = z.strictObject({
  type: z.string().min(1).max(100).optional(),
  category: notificationCategorySchema.optional(),
  unread: queryBooleanSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const notificationListResponseSchema = z.strictObject({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
});

export const notificationSummarySchema = z.strictObject({
  totalCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  mentionCount: z.number().int().nonnegative(),
  learningCount: z.number().int().nonnegative(),
  announcementCount: z.number().int().nonnegative(),
});

export const notificationIdParamsSchema = z.strictObject({
  id: z.uuid(),
});

export const markAllNotificationsReadResponseSchema = z.strictObject({
  updatedCount: z.number().int().nonnegative(),
});

export const archiveNotificationResponseSchema = z.strictObject({
  archived: z.literal(true),
});

export const notificationPreferenceSchema = z.strictObject({
  notificationType: z.string().min(1).max(100),
  channel: notificationChannelSchema,
  enabled: z.boolean(),
});

export const notificationPreferencesResponseSchema = z.strictObject({
  preferences: z.array(notificationPreferenceSchema),
});

export const updateNotificationPreferencesSchema = z.strictObject({
  preferences: z
    .array(notificationPreferenceSchema)
    .min(1)
    .max(100)
    .refine(
      (preferences) =>
        new Set(
          preferences.map(
            (preference) =>
              `${preference.notificationType}:${preference.channel}`,
          ),
        ).size === preferences.length,
      { message: "Each notification type and channel may appear only once." },
    ),
});

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationListQuery = z.output<
  typeof notificationListQuerySchema
>;
export type NotificationListResponse = z.infer<
  typeof notificationListResponseSchema
>;
export type NotificationSummary = z.infer<typeof notificationSummarySchema>;
export type NotificationPreference = z.infer<
  typeof notificationPreferenceSchema
>;
export type NotificationPreferencesResponse = z.infer<
  typeof notificationPreferencesResponseSchema
>;
export type UpdateNotificationPreferences = z.infer<
  typeof updateNotificationPreferencesSchema
>;
