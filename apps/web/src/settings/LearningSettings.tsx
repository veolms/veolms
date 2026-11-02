import { useEffect, useState } from "react";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClosedCaptioningIcon as ClosedCaptioning } from "@phosphor-icons/react/ClosedCaptioning";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { AppSlider } from "../AppSlider";
import { LaptopWallpaperSettingsCard } from "./LaptopWallpaperSettingsCard";
import { LearningGoalSettingsCard } from "./LearningGoalSettingsCard";
import { PlayerThemePicker } from "./PlayerThemePicker";
import { StorageSettingsCard } from "./StorageSettingsCard";
import { useAdminOnlySettings } from "./useAdminOnlySettings";
import { LearningSelectRow, LearningToggleRow } from "./SettingsControls";
import "../styles/features/settings/learning.css";
import {
  LEARNING_PREFERENCES_KEY,
  LEARNING_PREFERENCES_EVENT,
  LEARNING_PREFERENCE_DEFAULTS,
  LEARNING_SEEK_INTERVAL_MAX,
  LEARNING_SEEK_INTERVAL_MIN,
  LEARNING_SEEK_INTERVAL_PRESETS,
  markCurriculumStickOpenSection,
  normalizeLearningSeekInterval,
  readLearningPreferences,
} from "./settingsPreferences";
import type { LearningPreferences } from "./settingsPreferences";
/**
 * The heights lesson videos come in: uploads are encoded at 360p, 720p and
 * 1080p (`VIDEO_QUALITIES` in the API's media service), YouTube imports
 * also have 480p. Stored as the player stores a quality picked in its menu
 * ("1080"): the two set the same preference. A video without the chosen
 * height plays the tallest it has below it (the shortest it has when all
 * are taller); see `variantForHeight` in the Shaka engine.
 */
const VIDEO_QUALITY_HEIGHTS = [1080, 720, 480, 360] as const;

/**
 * The options, with a height picked in the player that is not among them
 * (a YouTube import's 1440p, say) kept in the list, so the setting shows it.
 */
function videoQualityOptions(saved: string): [string, string][] {
  const heights: number[] = [...VIDEO_QUALITY_HEIGHTS];
  const savedHeight = Number(saved);
  if (
    Number.isInteger(savedHeight) &&
    savedHeight > 0 &&
    !heights.includes(savedHeight)
  ) {
    heights.push(savedHeight);
  }
  return [
    ["auto", "Auto (Recommended)"],
    ...heights
      .sort((left, right) => right - left)
      .map((height): [string, string] => [String(height), `${height}p`]),
  ];
}

export function LearningSettings({
  isAuthenticated = true,
}: {
  isAuthenticated?: boolean;
}) {
  const [preferences, setPreferences] = useState({
    ...LEARNING_PREFERENCE_DEFAULTS,
  });
  // Shown to admins alone (see `useAdminOnlySettings`): the player theme,
  // which learners are not offered yet (see `useLearningPlayerTheme`), and
  // the settings below that nothing reads yet, so changing them did nothing:
  // default speed (the player keeps its own), theatre mode on
  // opening, captions by default and their language, the transcript (there
  // is none), four course navigation choices, and the two scrollbars (with
  // scrollbars hidden by default they changed nothing either).
  const showAdminSettings = useAdminOnlySettings();
  const [storageReady, setStorageReady] = useState(false);
  const [customSeekInterval, setCustomSeekInterval] = useState(false);
  const update = (next: Partial<LearningPreferences>) =>
    setPreferences((current) => ({ ...current, ...next }));
  const updateSeekInterval = (value: string) => {
    const isCustom = value === "custom";
    setCustomSeekInterval(isCustom);
    update({
      seekIntervalSeconds: isCustom
        ? LEARNING_SEEK_INTERVAL_PRESETS.includes(
            preferences.seekIntervalSeconds as (typeof LEARNING_SEEK_INTERVAL_PRESETS)[number],
          )
          ? 20
          : preferences.seekIntervalSeconds
        : normalizeLearningSeekInterval(value),
    });
  };

  useEffect(() => {
    const storedPreferences = readLearningPreferences();
    setPreferences(storedPreferences);
    setCustomSeekInterval(
      !LEARNING_SEEK_INTERVAL_PRESETS.includes(
        storedPreferences.seekIntervalSeconds as (typeof LEARNING_SEEK_INTERVAL_PRESETS)[number],
      ),
    );
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(
        LEARNING_PREFERENCES_KEY,
        JSON.stringify(preferences),
      );
    } catch {
      // Preferences remain available for this session when storage is blocked.
    }
    window.dispatchEvent(
      new CustomEvent(LEARNING_PREFERENCES_EVENT, { detail: preferences }),
    );
    document.documentElement.dataset.lessonPageScrollbar =
      preferences.showLessonPageScrollbar ? "visible" : "hidden";
    document.documentElement.dataset.curriculumScrollbar =
      preferences.showCurriculumScrollbar ? "visible" : "hidden";
    markCurriculumStickOpenSection(preferences.stickOpenSection);
  }, [preferences, storageReady]);

  return (
    <div
      className="settings-learning"
      aria-label="Playback and Learning settings"
    >
      <header className="settings-learning__header">
        <div>
          <h2>Playback &amp; Learning</h2>
          <p>
            Customize your lesson playback, course navigation, and learning
            goals.
          </p>
        </div>
        <span className="settings-learning__saved">
          <CheckCircle size={17} weight="fill" /> All changes are saved
          automatically
        </span>
      </header>

      <div className="settings-learning__grid">
        <section
          className="settings-learning-card"
          aria-labelledby="playback-preferences-heading"
        >
          <header className="settings-learning-card__heading">
            <PlayCircle size={21} weight="duotone" />
            <h3 id="playback-preferences-heading">Playback preferences</h3>
          </header>
          <div className="settings-learning-card__rows">
            {showAdminSettings ? (
              <>
                <PlayerThemePicker
                  value={preferences.videoPlayerTheme}
                  onChange={(videoPlayerTheme) => update({ videoPlayerTheme })}
                />
                <LearningSelectRow
                  id="learning-playback-speed"
                  label="Default playback speed"
                  note="Select the default speed for videos."
                  value={preferences.playbackSpeed}
                  onChange={(playbackSpeed) => update({ playbackSpeed })}
                  options={[
                    ["0.75", "0.75×"],
                    ["1", "1×"],
                    ["1.25", "1.25×"],
                    ["1.5", "1.5×"],
                    ["2", "2×"],
                  ]}
                />
              </>
            ) : null}
            <LearningSelectRow
              id="learning-video-quality"
              label="Default video quality"
              note="Every video starts at this quality. Picking one in the player changes it too."
              value={preferences.videoQuality}
              onChange={(videoQuality) => update({ videoQuality })}
              options={videoQualityOptions(preferences.videoQuality)}
            />
            <LearningSelectRow
              id="learning-seek-interval"
              label="Skip interval"
              note="Used by Left/Right arrows and double-tap seeking."
              value={
                customSeekInterval
                  ? "custom"
                  : String(preferences.seekIntervalSeconds)
              }
              onChange={updateSeekInterval}
              options={[
                ["5", "5 seconds"],
                ["10", "10 seconds (Default)"],
                ["15", "15 seconds"],
                ["30", "30 seconds"],
                ["60", "60 seconds"],
                ["custom", "Custom…"],
              ]}
            />
            {customSeekInterval ? (
              <div className="settings-learning-custom-range">
                <span className="settings-learning-custom-range__copy">
                  <strong>Custom skip interval</strong>
                  <small>Choose any value from 5 seconds to 1 minute.</small>
                </span>
                <div className="settings-learning-custom-range__control">
                  <AppSlider
                    id="learning-custom-seek-interval"
                    min={LEARNING_SEEK_INTERVAL_MIN}
                    max={LEARNING_SEEK_INTERVAL_MAX}
                    step={1}
                    value={preferences.seekIntervalSeconds}
                    aria-label="Custom skip interval in seconds"
                    aria-valuetext={`${preferences.seekIntervalSeconds} seconds`}
                    onChange={(event) =>
                      update({
                        seekIntervalSeconds: normalizeLearningSeekInterval(
                          event.currentTarget.value,
                        ),
                      })
                    }
                  />
                  <output htmlFor="learning-custom-seek-interval">
                    {preferences.seekIntervalSeconds}s
                  </output>
                </div>
              </div>
            ) : null}
            <LearningToggleRow
              label="Always start lectures from beginning"
              note="Play every lecture from 0:00 instead of resuming where you stopped."
              checked={!preferences.resumeFromLastPosition}
              onChange={(startFromBeginning) =>
                update({ resumeFromLastPosition: !startFromBeginning })
              }
            />
            {showAdminSettings ? (
              <>
                <LearningToggleRow
                  label="Start lessons in theatre mode"
                  note="Open the learning workspace with an expanded player."
                  checked={preferences.startInTheaterMode}
                  onChange={(startInTheaterMode) =>
                    update({ startInTheaterMode })
                  }
                />
                <LearningToggleRow
                  label="Show lesson page scrollbar"
                  note="Drag vertically to scroll or sideways to resize course content."
                  checked={preferences.showLessonPageScrollbar}
                  onChange={(showLessonPageScrollbar) =>
                    update({ showLessonPageScrollbar })
                  }
                />
                <LearningToggleRow
                  label="Show course content scrollbar"
                  note="Display the scrollbar inside the course content panel."
                  checked={preferences.showCurriculumScrollbar}
                  onChange={(showCurriculumScrollbar) =>
                    update({ showCurriculumScrollbar })
                  }
                />
              </>
            ) : null}
          </div>
        </section>

        <LearningGoalSettingsCard isAuthenticated={isAuthenticated} />

        <LaptopWallpaperSettingsCard />

        {showAdminSettings ? (
          <section
            className="settings-learning-card"
            aria-labelledby="captions-heading"
          >
            <header className="settings-learning-card__heading">
              <ClosedCaptioning size={21} weight="duotone" />
              <h3 id="captions-heading">Captions &amp; transcript</h3>
            </header>
            <div className="settings-learning-card__rows">
              <LearningToggleRow
                label="Show captions by default"
                note="Automatically enable captions when available."
                checked={preferences.captionsByDefault}
                onChange={(captionsByDefault) => update({ captionsByDefault })}
              />
              <LearningSelectRow
                id="learning-caption-language"
                label="Preferred caption language"
                note="Select your preferred caption language."
                value={preferences.captionLanguage}
                onChange={(captionLanguage) => update({ captionLanguage })}
                options={[
                  ["English", "English"],
                  ["Hindi", "Hindi"],
                  ["Spanish", "Spanish"],
                  ["French", "French"],
                ]}
              />
              <LearningToggleRow
                label="Auto-scroll transcript"
                note="Keep the currently spoken sentence visible."
                checked={preferences.autoScrollTranscript}
                onChange={(autoScrollTranscript) =>
                  update({ autoScrollTranscript })
                }
              />
              <LearningToggleRow
                label="Highlight current transcript line"
                note="Highlight the sentence currently being spoken."
                checked={preferences.highlightTranscriptLine}
                onChange={(highlightTranscriptLine) =>
                  update({ highlightTranscriptLine })
                }
              />
            </div>
          </section>
        ) : null}

        <section
          className="settings-learning-card"
          aria-labelledby="course-navigation-heading"
        >
          <header className="settings-learning-card__heading">
            <BookOpen size={21} weight="duotone" />
            <h3 id="course-navigation-heading">Course navigation</h3>
          </header>
          <div className="settings-learning-card__rows">
            {showAdminSettings ? (
              <>
                <LearningToggleRow
                  label="Open current section automatically"
                  note="Automatically expand the section containing the active lecture."
                  checked={preferences.openCurrentSection}
                  onChange={(openCurrentSection) =>
                    update({ openCurrentSection })
                  }
                />
                <LearningToggleRow
                  label="Continue with next incomplete lecture"
                  note="Resume a course from the next lecture that is not completed."
                  checked={preferences.continueWithNextIncomplete}
                  onChange={(continueWithNextIncomplete) =>
                    update({ continueWithNextIncomplete })
                  }
                />
                <LearningToggleRow
                  label="Automatically move to the next section"
                  note="Open the next section after completing the last lecture."
                  checked={preferences.automaticallyMoveNextSection}
                  onChange={(automaticallyMoveNextSection) =>
                    update({ automaticallyMoveNextSection })
                  }
                />
                <LearningToggleRow
                  label="Keep completed lectures visible"
                  note="Continue showing completed lectures in the course outline."
                  checked={preferences.keepCompletedLecturesVisible}
                  onChange={(keepCompletedLecturesVisible) =>
                    update({ keepCompletedLecturesVisible })
                  }
                />
              </>
            ) : null}
            <LearningToggleRow
              label="Keep the open section's heading in view"
              note="The heading of an open section stays at the top of the course outline while its lessons scroll."
              checked={preferences.stickOpenSection}
              onChange={(stickOpenSection) => update({ stickOpenSection })}
            />
          </div>
        </section>

        {isAuthenticated ? <StorageSettingsCard /> : null}
      </div>
    </div>
  );
}
