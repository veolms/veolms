import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type {
  LearningGoalSettings,
  LearningReminderDay,
} from "@veolms/contracts";
import { ThemedSelect } from "../ThemedSelect";
import { getDeviceTimeZone } from "../lib/device-time-zone";
import {
  useLearningGoalSettings,
  useUpdateLearningGoalSettings,
} from "../services/learning-goals";
import { LearningSelectRow, LearningToggleRow } from "./SettingsControls";
import { LEARNING_REMINDER_DAYS } from "./settingsPreferences";

// 15..720 minutes — the contract/DB cap is 720 (12 h), so the longest
// option is exactly the API's edge case.
const GOAL_MINUTE_STEPS = [
  15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720,
] as const;

function formatGoalOption(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes / day`;
  const hours = minutes / 60;
  const value = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${value} ${hours === 1 ? "hour" : "hours"} / day`;
}

const GOAL_OPTIONS: Array<[string, string]> = [
  ["none", "No goal"],
  ...GOAL_MINUTE_STEPS.map((minutes): [string, string] => [
    String(minutes),
    formatGoalOption(minutes),
  ]),
];

/** Every half hour across the day, labelled in 12-hour time. */
const REMINDER_TIME_OPTIONS: Array<[string, string]> = Array.from(
  { length: 48 },
  (_, slot): [string, string] => {
    const hour = Math.floor(slot / 2);
    const minute = slot % 2 === 0 ? "00" : "30";
    const value = `${String(hour).padStart(2, "0")}:${minute}`;
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    const period = hour < 12 ? "AM" : "PM";
    return [value, `${hour12}:${minute} ${period}`];
  },
);

const FALLBACK_SETTINGS: LearningGoalSettings = {
  dailyGoalMinutes: null,
  remindersEnabled: false,
  reminderDays: ["mon", "tue", "wed", "thu", "fri"],
  reminderTime: "19:00",
  timeZone: "UTC",
};

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

  // Nothing saved yet: the server's zone is a placeholder ("UTC"), so the
  // device zone is shown and is what the first save stores. Without this a
  // learner's days, streak and reminder time silently ran on UTC.
  const loadedSettings: LearningGoalSettings | undefined = query.data
    ? query.data.hasSavedSettings === false
      ? { ...query.data.settings, timeZone: deviceTimeZone }
      : query.data.settings
    : undefined;

  // Immediate-mutate: while a save is in flight the UI reflects the value
  // just chosen; afterwards the server response (written to the query
  // cache) is the source of truth.
  const settings: LearningGoalSettings =
    update.isPending && update.variables
      ? update.variables
      : (loadedSettings ?? FALLBACK_SETTINGS);

  const isSaving = update.isPending;
  const hasSaveError = query.isError || update.isError;
  // Also disabled when the settings could not be loaded: a save merges one
  // change into what is on screen, and saving over placeholder defaults
  // would wipe the learner's real goal and reminder schedule.
  const controlsDisabled = !isAuthenticated || !loadedSettings || isSaving;

  const save = (next: Partial<LearningGoalSettings>) => {
    if (!isAuthenticated || !loadedSettings) return;
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

  // The API accepts any 15..720 minutes and any HH:MM, so a value saved
  // elsewhere may sit off this select's grid — surface it as an extra
  // option instead of rendering an empty control.
  const goalOptions: Array<[string, string]> =
    settings.dailyGoalMinutes !== null &&
    !GOAL_MINUTE_STEPS.some((minutes) => minutes === settings.dailyGoalMinutes)
      ? [
          ...GOAL_OPTIONS,
          [
            String(settings.dailyGoalMinutes),
            formatGoalOption(settings.dailyGoalMinutes),
          ],
        ]
      : GOAL_OPTIONS;

  const reminderTimeOptions: Array<[string, string]> =
    REMINDER_TIME_OPTIONS.some(([value]) => value === settings.reminderTime)
      ? REMINDER_TIME_OPTIONS
      : [
          ...REMINDER_TIME_OPTIONS,
          [settings.reminderTime, settings.reminderTime],
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
          options={goalOptions}
          disabled={controlsDisabled}
        />
        <LearningSelectRow
          id="learning-time-zone"
          label="Time zone"
          note="Your learning day, streak and reminder time follow this zone."
          value={settings.timeZone}
          onChange={(timeZone) => save({ timeZone })}
          options={timeZoneOptions}
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
                options={reminderTimeOptions}
              />
            </div>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
