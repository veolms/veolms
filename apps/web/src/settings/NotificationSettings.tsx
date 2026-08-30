import { useEffect, useState } from "react";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { BellRingingIcon as BellRinging } from "@phosphor-icons/react/BellRinging";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { TrophyIcon as Trophy } from "@phosphor-icons/react/Trophy";
import { SettingRow, SettingsToggle } from "./SettingsControls";

interface NotificationPreferences {
  email: boolean;
  inApp: boolean;
  courseUpdates: boolean;
  discussionReplies: boolean;
  learningReminders: boolean;
  achievements: boolean;
}

const STORAGE_KEY = "veolms-notification-preferences";
const defaults: NotificationPreferences = {
  email: true,
  inApp: true,
  courseUpdates: true,
  discussionReplies: true,
  learningReminders: true,
  achievements: true,
};

function readPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return defaults;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    return {
      ...defaults,
      ...(typeof parsed === "object" && parsed !== null ? parsed : {}),
    };
  } catch {
    return defaults;
  }
}

export function NotificationSettings() {
  const [preferences, setPreferences] = useState(defaults);
  const [storageReady, setStorageReady] = useState(false);
  const update = (next: Partial<NotificationPreferences>) =>
    setPreferences((current) => ({ ...current, ...next }));

  useEffect(() => {
    setPreferences(readPreferences());
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Preferences remain available for this session when storage is blocked.
    }
  }, [preferences, storageReady]);

  return (
    <div className="settings-detail" aria-label="Notification settings">
      <header className="settings-detail__header">
        <div>
          <h2>Notifications</h2>
          <p>Choose the updates that deserve your attention.</p>
        </div>
        <span className="settings-detail__saved">
          <CheckCircle size={17} weight="fill" /> Saved automatically
        </span>
      </header>

      <section className="settings-section" aria-labelledby="delivery-heading">
        <header className="settings-section__heading">
          <BellRinging size={20} weight="duotone" />
          <div>
            <h3 id="delivery-heading">Delivery</h3>
            <p>Keep a quiet channel open for what matters most.</p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            icon={Bell}
            label="In-app notifications"
            note="Show activity and reminders in the notification center."
          >
            <SettingsToggle
              checked={preferences.inApp}
              onChange={(inApp) => update({ inApp })}
              label="In-app notifications"
            />
          </SettingRow>
          <SettingRow
            icon={BellRinging}
            label="Email digest"
            note="Receive a concise daily summary of course activity."
          >
            <SettingsToggle
              checked={preferences.email}
              onChange={(email) => update({ email })}
              label="Email digest"
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
            note="New lessons, materials, and changes to enrolled courses."
          >
            <SettingsToggle
              checked={preferences.courseUpdates}
              onChange={(courseUpdates) => update({ courseUpdates })}
              label="Course updates"
            />
          </SettingRow>
          <SettingRow
            icon={ChatCircleDots}
            label="Discussion replies"
            note="Replies, mentions, and answers in conversations you follow."
          >
            <SettingsToggle
              checked={preferences.discussionReplies}
              onChange={(discussionReplies) => update({ discussionReplies })}
              label="Discussion replies"
            />
          </SettingRow>
          <SettingRow
            icon={BellRinging}
            label="Learning reminders"
            note="Gentle prompts to make time for your next lesson."
          >
            <SettingsToggle
              checked={preferences.learningReminders}
              onChange={(learningReminders) => update({ learningReminders })}
              label="Learning reminders"
            />
          </SettingRow>
          <SettingRow
            icon={Trophy}
            label="Milestones & achievements"
            note="Celebrate course completions and learning streaks."
          >
            <SettingsToggle
              checked={preferences.achievements}
              onChange={(achievements) => update({ achievements })}
              label="Milestones and achievements"
            />
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
