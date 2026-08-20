import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { Check } from "@phosphor-icons/react/Check";
import { Circle } from "@phosphor-icons/react/Circle";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Play } from "@phosphor-icons/react/Play";
import { X } from "@phosphor-icons/react/X";
import React, { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { lessonsById, sections } from "./courseContent";
import { IconButton } from "./IconButton";
import {
  isStoredBoolean,
  isStoredString,
  useSessionStorageState,
} from "./useSessionStorageState";

interface CurriculumProps {
  selectedLesson: number;
  onSelectLesson: (lessonNumber: number) => void;
  courseTitle: string;
  courseThumbnail: string;
  onClose?: () => void;
  focusRequest?: number;
  persistenceKey: string;
  scrollportId?: string;
  scrollportRef?: RefObject<HTMLElement | null>;
}

export function Curriculum({
  selectedLesson,
  onSelectLesson,
  courseTitle,
  courseThumbnail,
  onClose,
  focusRequest = 0,
  persistenceKey,
  scrollportId,
  scrollportRef,
}: CurriculumProps) {
  const [expanded, setExpanded] = useState<number[]>([1, 2]);
  const storageBase = `veolms-learning-${persistenceKey}-curriculum`;
  const [lessonSearch, setLessonSearch] = useSessionStorageState(
    `${storageBase}-search`,
    "",
    isStoredString,
  );
  const [searchOpen, setSearchOpen] = useSessionStorageState(
    `${storageBase}-search-open`,
    false,
    isStoredBoolean,
  );
  const activeLessonSearch = searchOpen ? lessonSearch : "";
  const lessonSearchInputRef = useRef<HTMLInputElement>(null);
  const activeLessonRef = useRef<HTMLButtonElement>(null);
  const handledFocusRequestRef = useRef(0);
  const currentSection =
    sections.find((section) =>
      section.lessons.some(([number]) => number === selectedLesson),
    ) || sections[0]!;
  const currentLesson = lessonsById.get(selectedLesson) || lessonsById.get(1)!;
  const courseProgress = 52;

  const toggleSection = (id: number) => {
    setExpanded((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  useEffect(() => {
    if (!searchOpen) return undefined;
    const frame = window.requestAnimationFrame(() =>
      lessonSearchInputRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    if (!focusRequest || focusRequest === handledFocusRequestRef.current)
      return undefined;

    handledFocusRequestRef.current = focusRequest;
    setExpanded((current) =>
      current.includes(currentSection.id)
        ? current
        : [...current, currentSection.id],
    );

    let firstFrame: number;
    let secondFrame: number | undefined;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const activeLesson = activeLessonRef.current;
        const curriculum = activeLesson?.closest(".learning-curriculum");
        if (!activeLesson || !curriculum) return;

        const activeTop =
          activeLesson.getBoundingClientRect().top -
          curriculum.getBoundingClientRect().top +
          curriculum.scrollTop;

        curriculum.scrollTo({
          top: activeTop,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [focusRequest, currentSection.id]);

  return (
    <aside
      ref={scrollportRef}
      id={scrollportId}
      className="learning-curriculum"
      aria-label="Course curriculum"
    >
      <div className="learning-curriculum__hero">
        <img
          src={courseThumbnail}
          alt=""
          className="learning-curriculum__cover"
        />
        <div className="learning-curriculum__shade" aria-hidden="true" />
        <header className="learning-curriculum__overview">
          <div className="learning-curriculum__overview-content">
            <div className="learning-curriculum__title-row">
              <div className="min-w-0">
                <h2>{courseTitle}</h2>
              </div>
              {onClose && (
                <IconButton
                  label="Close lesson list"
                  onClick={onClose}
                  className="learning-curriculum__close"
                >
                  <X size={21} />
                </IconButton>
              )}
              <IconButton
                label={searchOpen ? "Close lesson search" : "Search lessons"}
                pressed={searchOpen}
                onClick={() => setSearchOpen((open) => !open)}
                className="learning-curriculum__search-toggle"
              >
                <MagnifyingGlass size={19} />
              </IconButton>
            </div>
          </div>
        </header>

        <div className="learning-curriculum__sticky-meta">
          <div className="learning-curriculum__progress-copy">
            <span>Course progress</span>
            <strong>{courseProgress}%</strong>
          </div>
          <div
            className="learning-curriculum__progress-track"
            role="progressbar"
            aria-label={`Course progress: ${courseProgress} percent`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={courseProgress}
          >
            <span style={{ width: `${courseProgress}%` }} />
          </div>
          <p className="learning-curriculum__current">
            {`Section ${currentSection.id}: ${currentSection.title}`} ·{" "}
            {currentLesson[1]}
          </p>
        </div>
      </div>

      <label
        className={`learning-curriculum__search ${searchOpen ? "is-visible" : ""}`}
        aria-hidden={!searchOpen ? true : undefined}
      >
        <MagnifyingGlass size={19} aria-hidden="true" />
        <span className="sr-only">Search lessons</span>
        <input
          ref={lessonSearchInputRef}
          type="search"
          tabIndex={searchOpen ? 0 : -1}
          value={lessonSearch}
          onChange={(event) => setLessonSearch(event.target.value)}
          placeholder="Search lessons..."
        />
      </label>

      <div className="learning-curriculum__lesson-list">
        {sections.map((section) => {
          const matchingLessons = section.lessons.filter((lesson) =>
            lesson[1].toLowerCase().includes(activeLessonSearch.toLowerCase()),
          );
          const isOpen =
            expanded.includes(section.id) ||
            Boolean(activeLessonSearch && matchingLessons.length > 0);
          if (
            activeLessonSearch &&
            !section.title
              .toLowerCase()
              .includes(activeLessonSearch.toLowerCase()) &&
            matchingLessons.length === 0
          )
            return null;
          return (
            <section key={section.id} className="learning-curriculum__section">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={isOpen}
                className="learning-curriculum__section-toggle"
              >
                <span className={`learning-curriculum__section-arrow${isOpen ? " is-open" : ""}`} aria-hidden="true">
                  <CaretRight size={17} />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  Section {section.id}: {section.title}
                </span>
                <span className="learning-curriculum__section-progress">
                  {section.progress}
                </span>
              </button>
              {matchingLessons.length > 0 && (
                <div
                  className={`learning-curriculum__section-lessons ${isOpen ? "is-open" : ""}`}
                  aria-hidden={!isOpen ? true : undefined}
                  inert={!isOpen ? true : undefined}
                >
                  <div className="learning-curriculum__section-lessons-inner">
                    {matchingLessons.map(
                      ([number, title, duration, status]) => {
                        const active = selectedLesson === number;
                        return (
                          <button
                            type="button"
                            key={number}
                            ref={active ? activeLessonRef : undefined}
                            onClick={() => {
                              onSelectLesson(number);
                              onClose?.();
                            }}
                            className={`learning-curriculum__lesson ${active ? "is-active" : ""}`}
                          >
                            {active ? (
                              <span className="learning-curriculum__lesson-status">
                                <Play size={10} weight="fill" />
                              </span>
                            ) : status === "done" ? (
                              <span className="learning-curriculum__lesson-status">
                                <Check size={12} weight="bold" />
                              </span>
                            ) : (
                              <Circle
                                size={20}
                                className="learning-curriculum__lesson-status learning-curriculum__lesson-status--todo"
                              />
                            )}
                            <span className="learning-curriculum__lesson-number">
                              {number}.
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {title}
                            </span>
                            <span className="learning-curriculum__lesson-duration">
                              {duration}
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
