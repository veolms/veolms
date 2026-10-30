import type { HomePageHero } from "@veolms/contracts/home-page-defaults";

/**
 * The hero for a signed-in learner who has not enrolled in anything yet: it
 * points them at a first course. The two actions keep the labels the academy
 * configured. The line above the headline is their greeting instead (see
 * `getNewLearnerGreeting`).
 */
export function getNewLearnerHero(hero: HomePageHero): HomePageHero {
  return {
    ...hero,
    eyebrow: "",
    headline: "Start Your",
    highlightedHeadline: "Learning Journey.",
    description:
      "Find a course that matches your interests and build your understanding one lesson at a time.",
  };
}

/** The line above that hero's title, greeting the learner by first name. */
export function getNewLearnerGreeting(learnerName: string): string {
  const firstName = learnerName.trim().split(/\s+/u)[0];
  return firstName ? `Hi, ${firstName} 👋` : "Hi there 👋";
}
