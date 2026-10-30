import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { FingerprintIcon as Fingerprint } from "@phosphor-icons/react/Fingerprint";
import { DevicesIcon as Devices } from "@phosphor-icons/react/Devices";
import { IdentificationCardIcon as IdentificationCard } from "@phosphor-icons/react/IdentificationCard";
import { UserGearIcon as UserGear } from "@phosphor-icons/react/UserGear";
import { VideoIcon as Video } from "@phosphor-icons/react/Video";
import {
  MAX_MAX_DEVICES_PER_STUDENT,
  MIN_MAX_DEVICES_PER_STUDENT,
  MAX_MAX_SIMULTANEOUS_STREAMS,
  MIN_MAX_SIMULTANEOUS_STREAMS,
} from "@veolms/contracts";
import {
  SettingRow,
  SettingsToggle,
  StatusNote,
} from "../settings/SettingsControls";
import { ThemedSelect, type ThemedSelectOption } from "../ThemedSelect";
import { PlatformSettingsStatus } from "./PlatformSettingsStatus";
import { usePlatformSettingsEditor } from "./usePlatformSettingsEditor";

// The rows' controls drop under their text on a phone, as in Settings >
// Privacy & Security.
const ROW_CLASS =
  "max-[480px]:[grid-template-columns:2rem_minmax(0,1fr)] max-[480px]:[&_.settings-row__control]:col-start-2";

const NO_DEVICE_LIMIT = "none";

const DEVICE_LIMIT_OPTIONS: readonly ThemedSelectOption[] = [
  ...Array.from(
    {
      length: MAX_MAX_DEVICES_PER_STUDENT - MIN_MAX_DEVICES_PER_STUDENT + 1,
    },
    (_, index): ThemedSelectOption => {
      const count = MIN_MAX_DEVICES_PER_STUDENT + index;
      return [String(count), count === 1 ? "1 device" : `${count} devices`];
    },
  ),
  [NO_DEVICE_LIMIT, "No limit"],
];

const NO_STREAM_LIMIT = "none";

const STREAM_LIMIT_OPTIONS: readonly ThemedSelectOption[] = [
  ...Array.from(
    {
      length: MAX_MAX_SIMULTANEOUS_STREAMS - MIN_MAX_SIMULTANEOUS_STREAMS + 1,
    },
    (_, index): ThemedSelectOption => {
      const count = MIN_MAX_SIMULTANEOUS_STREAMS + index;
      return [String(count), count === 1 ? "1 stream" : `${count} streams`];
    },
  ),
  [NO_STREAM_LIMIT, "No limit"],
];

/**
 * The academy's sign-in and enrolment rules for students. Admins and
 * instructors always sign in with a second step; that is not a setting.
 */
export function PlatformSecurityTab({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const { query, settings, save } = usePlatformSettingsEditor(setNotice);

  if (!settings) {
    return (
      <PlatformSettingsStatus
        isError={query.isError}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const {
    requireVerifiedPhoneForEnrollment,
    maxDevicesPerStudent,
    maxSimultaneousStreams,
  } = settings.security;

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>Security</h2>
          <p>How students sign in, and what they need before they enrol.</p>
        </div>
      </header>

      <section
        className="settings-section"
        aria-labelledby="platform-sign-in-heading"
      >
        <header className="settings-section__heading mb-3">
          <Fingerprint size={20} weight="duotone" />
          <div>
            <h3 id="platform-sign-in-heading">Two-factor sign-in</h3>
            <p>
              A second step after the sign-in code, an authenticator app or a
              passkey, for the academy&rsquo;s team. Students sign in without
              one.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={UserGear}
            label="Admins, instructors and team members"
            note="Always sign in with a second step, to protect courses, payments and student records."
          >
            <StatusNote>Always on</StatusNote>
          </SettingRow>
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="platform-devices-heading"
      >
        <header className="settings-section__heading mb-3">
          <Devices size={20} weight="duotone" />
          <div>
            <h3 id="platform-devices-heading">Devices</h3>
            <p>How many devices a student can be signed in on at once.</p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={Devices}
            label="Devices per student"
            note="A student signing in on one more is shown their devices, with roughly where each signed in, and signs one out to continue. Your team is never limited."
          >
            <ThemedSelect
              id="platform-max-devices"
              ariaLabel="Devices per student"
              value={
                maxDevicesPerStudent === null
                  ? NO_DEVICE_LIMIT
                  : String(maxDevicesPerStudent)
              }
              options={DEVICE_LIMIT_OPTIONS}
              onValueChange={(value) => {
                const limit = value === NO_DEVICE_LIMIT ? null : Number(value);
                save(
                  { security: { maxDevicesPerStudent: limit } },
                  limit === null
                    ? "Students can sign in on any number of devices."
                    : `Students can now be signed in on ${limit} ${limit === 1 ? "device" : "devices"} at once.`,
                );
              }}
            />
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Video}
            label="Streams at a time"
            note="How many devices a student can play video on at the same time. The most recent play wins; the others pause."
          >
            <ThemedSelect
              id="platform-max-streams"
              ariaLabel="Streams at a time"
              value={
                maxSimultaneousStreams === null
                  ? NO_STREAM_LIMIT
                  : String(maxSimultaneousStreams)
              }
              options={STREAM_LIMIT_OPTIONS}
              onValueChange={(value) => {
                const limit = value === NO_STREAM_LIMIT ? null : Number(value);
                save(
                  { security: { maxSimultaneousStreams: limit } },
                  limit === null
                    ? "Students can play video on any number of devices at the same time."
                    : `Students can now play video on ${limit} ${limit === 1 ? "device" : "devices"} at a time.`,
                );
              }}
            />
          </SettingRow>
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="platform-enrolment-heading"
      >
        <header className="settings-section__heading mb-3">
          <IdentificationCard size={20} weight="duotone" />
          <div>
            <h3 id="platform-enrolment-heading">Enrolment</h3>
            <p>What a student confirms before they can join a course.</p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={DeviceMobile}
            label="Verified mobile number"
            note="New students confirm their mobile number with a text message code before they enrol in any course, free or paid. Students who already had an account are not asked."
          >
            <SettingsToggle
              checked={requireVerifiedPhoneForEnrollment}
              label="Require a verified mobile number to enrol"
              onChange={(required) =>
                save(
                  {
                    security: { requireVerifiedPhoneForEnrollment: required },
                  },
                  required
                    ? "Students now verify their mobile number to enrol."
                    : "Students can enrol without a verified mobile number.",
                )
              }
            />
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
