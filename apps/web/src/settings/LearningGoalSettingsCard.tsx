import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type {
  LearningGoalSettings,
  LearningReminderDay,
} from "@veolms/contracts";
import { ThemedSelect } from "../ThemedSelect";
import {
  useLearningGoalSettings,
  useUpdateLearningGoalSettings,
} from "../services/learning-goals";
import { LearningSelectRow, LearningToggleRow } from "./SettingsControls";
import { LEARNING_REMINDER_DAYS } from "./settingsPreferences";

const GOAL_OPTIONS: Array<[string, string]> = [
  ["none", "No goal"],
  ["15", "15 minutes / day"],
  ["30", "30 minutes / day"],
  ["45", "45 minutes / day"],
  ["60", "1 hour / day"],
  ["90", "1.5 hours / day"],
  ["120", "2 hours / day"],
  ["180", "3 hours / day"],
];

const FALLBACK_SETTINGS: LearningGoalSettings = {
  dailyGoalMinutes: null,
  remindersEnabled: false,
  reminderDays: ["mon", "tue", "wed", "thu", "fri"],
  reminderTime: "19:00",
  timeZone: "UTC",
};

function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const COMMON_TIME_ZONES: Array<[string, string]> = [
  ["Asia/Kolkata", "Asia/Kolkata (IST)"],
  ["Europe/London", "Europe/London (GMT)"],
  ["America/New_York", "America/New_York (EST)"],
  ["Asia/Singapore", "Asia/Singapore (SGT)"],
  ["UTC", "UTC"],
];

export function LearningGoalSettingsCard({
  isAuthenticated = true,
}: {
  isAuthenticated?: boolean;
}) {
  const query = useLearningGoalSettings({ enabled: isAuthenticated });
  const update = useUpdateLearningGoalSettings();
  const deviceTimeZone = getDeviceTimeZone();

  // Immediate-mutate: while a save is in flight the UI reflects the value
  // just chosen; afterwards the server response (written to the query
  // cache) is the source of truth.
  const settings: LearningGoalSettings =
    update.isPending && update.variables
      ? update.variables
      : (query.data?.settings ?? FALLBACK_SETTINGS);

  const isSaving = update.isPending;
  const hasSaveError = query.isError || update.isError;
  const controlsDisabled = !isAuthenticated || query.isPending || isSaving;

  const save = (next: Partial<LearningGoalSettings>) => {
    if (!isAuthenticated) return;
    update.mutate({ ...settings, ...next });
  };

  const toggleReminderDay = (day: LearningReminderDay) =>
    save({
      reminderDays: settings.reminderDays.includes(day)
        ? settings.reminderDays.filter((item) => item !== day)
        : [...settings.reminderDays, day],
    });

  const timeZoneOptions: Array<[string, string]> = [
    [deviceTimeZone, `Auto (device) — ${deviceTimeZone}`],
    ...COMMON_TIME_ZONES.filter(([zone]) => zone !== deviceTimeZone),
    ...(settings.timeZone !== deviceTimeZone &&
    !COMMON_TIME_ZONES.some(([zone]) => zone === settings.timeZone)
      ? [[settings.timeZone, settings.timeZone] as [string, string]]
      : []),
  ];

  return (
    <section
      className="settings-learning-card"
      aria-labelledby="learning-goal-heading"
    >
      <header className="settings-learning-card__heading">
        <Target size={21} weight="duotone" />
        <h3 id="learning-goal-heading">Learning goal &amp; reminders</h3>
        <span
          className={`settings-learning-card__status ${hasSaveError ? "text-red-400!" : ""}`}
          role={hasSaveError ? "alert" : "status"}
        >
          {hasSaveError ? (
            <WarningCircle size={15} weight="fill" aria-hidden="true" />
          ) : (
            <CheckCircle size={15} weight="fill" aria-hidden="true" />
          )}
          {!isAuthenticated
            ? "Sign in to set a goal"
            : query.isError
              ? "Could not load your goal"
              : update.isError
                ? "Save failed"
                : isSaving
                  ? "Saving…"
                  : "Synced to your account"}
        </span>
      </header>
      <div className="settings-learning-card__rows">
        <LearningSelectRow
          id="learning-daily-goal"
          label="Daily learning goal"
          note="Set how much you want to learn each day. Your home widget and streak use this."
          value={
            settings.dailyGoalMinutes === null
              ? "none"
              : String(settings.dailyGoalMinutes)
          }
          onChange={(value) =>
            save({
              dailyGoalMinutes: value === "none" ? null : Number(value),
            })
          }
          options={GOAL_OPTIONS}
          disabled={controlsDisabled}
        />
        <LearningToggleRow
          label="Learning reminders"
          note="Get reminded to keep your learning streak going."
          checked={settings.remindersEnabled}
          onChange={(remindersEnabled) => save({ remindersEnabled })}
          disabled={controlsDisabled}
        />
        <fieldset
          className="settings-learning-reminder-fields"
          disabled={controlsDisabled || !settings.remindersEnabled}
        >
          <legend>Reminder schedule</legend>
          <span className="settings-learning-field-label">Days</span>
          <div className="settings-learning-days" aria-label="Reminder days">
            {LEARNING_REMINDER_DAYS.map(([day, label]) => (
              <button
                type="button"
                key={day}
                aria-pressed={settings.reminderDays.includes(
                  day as LearningReminderDay,
                )}
                onClick={() => toggleReminderDay(day as LearningReminderDay)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="settings-learning-reminder-selects">
            <div>
              <span>Time</span>
              <ThemedSelect
                id="learning-reminder-time"
                value={settings.reminderTime}
                onValueChange={(reminderTime) => save({ reminderTime })}
                ariaLabel="Reminder time"
                options={[
                  ["07:00", "7:00 AM"],
                  ["12:00", "12:00 PM"],
                  ["19:00", "7:00 PM"],
                  ["21:00", "9:00 PM"],
                ]}
              />
            </div>
            <div>
              <span>Time zone</span>
              <ThemedSelect
                id="learning-time-zone"
                value={settings.timeZone}
                onValueChange={(timeZone) => save({ timeZone })}
                ariaLabel="Reminder time zone"
                options={timeZoneOptions}
              />
            </div>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
