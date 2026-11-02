import type {
  HomePageCourseOption,
  HomePageHeroVideo,
} from "@veolms/contracts";
import { HOME_PAGE_HERO_LESSON } from "@veolms/contracts/home-page-defaults";
import { useState } from "react";
import { useHomePageLessonVideoOptions } from "../services/home";
import { HeroLessonVideoPicker } from "./HeroLessonVideoPicker";
import { HeroVideoUpload } from "./HeroVideoUpload";
import { SettingsSection, insetRowClass } from "./homePageSettingsControls";

type Source = HomePageHeroVideo["source"];

const SOURCES: readonly [Source, string, string][] = [
  [
    "default",
    "Default lesson",
    `Lesson ${HOME_PAGE_HERO_LESSON.lessonNumber} of /courses/${HOME_PAGE_HERO_LESSON.courseSlug}.`,
  ],
  ["lesson", "A course lesson", "Open a course and pick one of its videos."],
  [
    "upload",
    "Upload a video",
    "A video of its own, uploaded or from YouTube, just for the home page.",
  ],
];

/** The lesson chosen now, by name, under the choices. */
function ChosenLesson({
  heroVideo,
  courses,
}: {
  heroVideo: Extract<HomePageHeroVideo, { source: "lesson" }>;
  courses: readonly HomePageCourseOption[];
}) {
  const lessonsQuery = useHomePageLessonVideoOptions(heroVideo.courseId);
  const course = courses.find((item) => item.id === heroVideo.courseId);
  const lesson = lessonsQuery.data?.lessons.find(
    (item) => item.id === heroVideo.lessonId,
  );
  return (
    <p className="text-sm text-(--muted)" role="status">
      Playing{" "}
      <span className="font-semibold text-(--text)">
        {lesson
          ? `Lesson ${lesson.number}: ${lesson.title}`
          : lessonsQuery.isLoading
            ? "the chosen lesson"
            : "a lesson that is no longer available (the default plays instead)"}
      </span>
      {course ? ` from ${course.title}` : ""}.
    </p>
  );
}

/**
 * What the laptop in the hero picture plays: the default lesson, a lesson
 * video picked from a course, or a video uploaded for the home page.
 */
export function HeroVideoEditor({
  heroVideo,
  onChange,
  onUploadChosen,
  uploadSaving,
  courses,
  optionsLoading,
}: {
  heroVideo: HomePageHeroVideo;
  onChange: (heroVideo: HomePageHeroVideo) => void;
  /** An upload sent or an import queued: saved at once, unlike the rest. */
  onUploadChosen: (heroVideo: HomePageHeroVideo) => void;
  /** That save is under way. */
  uploadSaving: boolean;
  courses: readonly HomePageCourseOption[];
  optionsLoading: boolean;
}) {
  // Which way of choosing is open. A lesson or an upload is only chosen once
  // one has been picked, so this can differ from what is saved meanwhile.
  const [mode, setMode] = useState<Source>(heroVideo.source);

  return (
    <SettingsSection
      id="home-page-hero-video-heading"
      title="Laptop video"
      description="The video that plays on the laptop in the hero picture. Tip: a preview lesson, or a lesson of a free course, plays for every visitor, signed in or not."
    >
      <fieldset className="min-w-0">
        <legend className="sr-only">Video source</legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {SOURCES.map(([value, label, help]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 p-3.5 ${insetRowClass} ${
                mode === value
                  ? "border-(--accent)! ring-2 ring-(--accent)/20"
                  : ""
              }`}
            >
              <input
                type="radio"
                name="home-page-hero-video-source"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  if (value === "default") onChange({ source: "default" });
                }}
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-(--text)">
                  {label}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed break-words text-(--muted)">
                  {help}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {heroVideo.source === "lesson" ? (
        <ChosenLesson heroVideo={heroVideo} courses={courses} />
      ) : null}
      {mode !== heroVideo.source ? (
        <p className="text-sm text-(--muted)" role="status">
          {mode === "lesson"
            ? "Pick a lesson below to play it on the laptop."
            : "Upload or import a video below to play it on the laptop."}
        </p>
      ) : null}

      {mode === "lesson" ? (
        <HeroLessonVideoPicker
          courses={courses}
          optionsLoading={optionsLoading}
          selected={heroVideo.source === "lesson" ? heroVideo : null}
          onSelect={(courseId, lessonId) =>
            onChange({ source: "lesson", courseId, lessonId })
          }
        />
      ) : null}
      {mode === "upload" ? (
        <HeroVideoUpload
          uploaded={heroVideo.source === "upload" ? heroVideo : null}
          saving={uploadSaving}
          onUploaded={(mediaId, fileName) =>
            onUploadChosen({ source: "upload", mediaId, fileName })
          }
        />
      ) : null}
    </SettingsSection>
  );
}
