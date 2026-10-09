import type { HomePageHero } from "@veolms/contracts/home-page-defaults";

/**
 * The hero for a signed-in learner who has not enrolled in anything yet: it
 * points them at a first course. The two actions keep the labels the academy
 * configured.
 */
export function getNewLearnerHero(hero: HomePageHero): HomePageHero {
  return {
    ...hero,
    headline: "Start Your",
    highlightedHeadline: "Learning Journey.",
    description:
      "You haven't enrolled in a course yet. Pick one, learn it in depth, and build foundations that last.",
  };
}

/** The line above that hero's title, greeting the learner by first name. */
export function getNewLearnerGreeting(learnerName: string): string {
  const firstName = learnerName.trim().split(/\s+/u)[0];
  return firstName ? `Hi, ${firstName} 👋` : "Hi there 👋";
}
