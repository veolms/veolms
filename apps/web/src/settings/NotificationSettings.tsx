import type {
  NotificationChannel,
  NotificationPreference,
} from "@veolms/contracts";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { BellRingingIcon as BellRinging } from "@phosphor-icons/react/BellRinging";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { TrophyIcon as Trophy } from "@phosphor-icons/react/Trophy";

import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../services/notifications";
import { SettingRow, SettingsToggle } from "./SettingsControls";

const optionalNotificationTypes = [
  "course.published",
  "purchase.completed",
  "payment.failed",
  "refund.completed",
  "video.processing_completed",
  "video.processing_failed",
  "user.mentioned",
  "comment.replied",
  "qa.answered",
  "assignment.reminder",
  "learning.reminder",
  "certificate.generated",
] as const;

const courseUpdateTypes = [
  "course.published",
  "video.processing_completed",
  "video.processing_failed",
] as const;
const discussionTypes = [
  "user.mentioned",
  "comment.replied",
  "qa.answered",
] as const;
const reminderTypes = ["assignment.reminder", "learning.reminder"] as const;
const achievementTypes = ["certificate.generated"] as const;
const channels = ["in_app", "email"] as const;

function preferenceKey(type: string, channel: NotificationChannel): string {
  return `${type}:${channel}`;
}

function buildPreferenceMap(preferences: readonly NotificationPreference[]) {
  return new Map(
    preferences.map((preference) => [
      preferenceKey(preference.notificationType, preference.channel),
      preference.enabled,
    ]),
  );
}

export function NotificationSettings() {
  const query = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const preferenceMap = buildPreferenceMap(query.data?.preferences ?? []);
  const isEnabled = (type: string, channel: NotificationChannel) =>
    preferenceMap.get(preferenceKey(type, channel)) ?? true;
  const isChannelEnabled = (channel: NotificationChannel) =>
    optionalNotificationTypes.every((type) => isEnabled(type, channel));
  const isGroupEnabled = (types: readonly string[]) =>
    types.every((type) => channels.some((channel) => isEnabled(type, channel)));
  const isSaving = update.isPending;

  const save = (
    types: readonly string[],
    targetChannels: readonly NotificationChannel[],
    enabled: boolean,
  ) => {
    update.mutate({
      preferences: types.flatMap((notificationType) =>
        targetChannels.map((channel) => ({
          notificationType,
          channel,
          enabled,
        })),
      ),
    });
  };

  return (
    <div className="settings-detail" aria-label="Notification settings">
      <header className="settings-detail__header">
        <div>
          <h2>Notifications</h2>
          <p>Choose the updates that deserve your attention.</p>
        </div>
        <span className="settings-detail__saved">
          <CheckCircle size={17} weight="fill" />
          {update.isError
            ? "Save failed"
            : isSaving
              ? "Saving…"
              : "Saved automatically"}
        </span>
      </header>

      <section className="settings-section" aria-labelledby="delivery-heading">
        <header className="settings-section__heading">
          <BellRinging size={20} weight="duotone" />
          <div>
            <h3 id="delivery-heading">Delivery</h3>
            <p>Choose where optional updates should reach you.</p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            icon={Bell}
            label="In-app notifications"
            note="Show activity and reminders in the notification center."
          >
            <SettingsToggle
              checked={isChannelEnabled("in_app")}
              onChange={(enabled) =>
                save(optionalNotificationTypes, ["in_app"], enabled)
              }
              label="In-app notifications"
              disabled={query.isPending || isSaving}
            />
          </SettingRow>
          <SettingRow
            icon={BellRinging}
            label="Email notifications"
            note="Receive optional updates at your verified email address."
          >
            <SettingsToggle
              checked={isChannelEnabled("email")}
              onChange={(enabled) =>
                save(optionalNotificationTypes, ["email"], enabled)
              }
              label="Email notifications"
              disabled={query.isPending || isSaving}
            />
          </SettingRow>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="activity-heading">
        <header className="settings-section__heading">
          <ChatCircleDots size={20} weight="duotone" />
          <div>
            <h3 id="activity-heading">Course activity</h3>
            <p>
              Fine-tune updates from the courses and communities you follow.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            icon={BookOpen}
            label="Course updates"
            note="Published courses and media processing updates."
          >
            <SettingsToggle
              checked={isGroupEnabled(courseUpdateTypes)}
              onChange={(enabled) => save(courseUpdateTypes, channels, enabled)}
              label="Course updates"
              disabled={query.isPending || isSaving}
            />
          </SettingRow>
          <SettingRow
            icon={ChatCircleDots}
            label="Discussion replies"
            note="Replies, mentions, and answers in conversations you follow."
          >
            <SettingsToggle
              checked={isGroupEnabled(discussionTypes)}
              onChange={(enabled) => save(discussionTypes, channels, enabled)}
              label="Discussion replies"
              disabled={query.isPending || isSaving}
            />
          </SettingRow>
          <SettingRow
            icon={BellRinging}
            label="Learning reminders"
            note="Gentle prompts to make time for your next lesson."
          >
            <SettingsToggle
              checked={isGroupEnabled(reminderTypes)}
              onChange={(enabled) => save(reminderTypes, channels, enabled)}
              label="Learning reminders"
              disabled={query.isPending || isSaving}
            />
          </SettingRow>
          <SettingRow
            icon={Trophy}
            label="Milestones & achievements"
            note="Celebrate course completions and certificates."
          >
            <SettingsToggle
              checked={isGroupEnabled(achievementTypes)}
              onChange={(enabled) => save(achievementTypes, channels, enabled)}
              label="Milestones and achievements"
              disabled={query.isPending || isSaving}
            />
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
