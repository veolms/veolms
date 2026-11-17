import {
  MARKETING_COURSE_LINK,
  type MarketingDesign,
  type MarketingAutomationKey,
  type MarketingBlock,
  type MarketingTemplateKey,
} from "@veolms/contracts";

/**
 * Where a new email starts: six broadcast templates and one ready email per
 * automation. Plain, friendly words the creator edits; `{...}` words are
 * filled in per student. Buttons point at the academy's own pages, which
 * the creator replaces with the page they mean.
 */

export interface StarterEmail {
  name: string;
  subject: string;
  preheader: string;
  blocks: MarketingBlock[];
  design?: MarketingDesign;
}

const design = (
  theme: MarketingDesign["theme"],
  headerAlign: MarketingDesign["headerAlign"] = "left",
): MarketingDesign => ({ theme, accent: null, font: "modern", headerAlign });

let counter = 0;
/** Block ids only need to be unique within one email. */
function id(): string {
  counter = (counter + 1) % 1_000_000;
  return `b${Date.now().toString(36)}${counter.toString(36)}`;
}

const headingBlock = (
  text: string,
  size: "large" | "medium" | "small" = "large",
  align: "left" | "center" | "right" = "left",
): MarketingBlock => ({ id: id(), type: "heading", text, size, align });
const textBlock = (
  text: string,
  align: "left" | "center" | "right" = "left",
): MarketingBlock => ({ id: id(), type: "text", text, align });
const buttonBlock = (
  label: string,
  url: string,
  align: "left" | "center" | "right" = "left",
): MarketingBlock => ({
  id: id(),
  type: "button",
  label,
  url,
  align,
  style: "filled",
  color: null,
  fullWidth: false,
});
const dividerBlock = (): MarketingBlock => ({ id: id(), type: "divider" });

const couponBlock = (code: string, note: string): MarketingBlock => ({
  id: id(),
  type: "coupon",
  code,
  title: "Your code",
  note,
});
const cardBlock = (card: {
  source: "course" | "workshop" | "custom";
  meta: string;
  title: string;
  text: string;
  url: string;
  buttonLabel: string;
}): MarketingBlock => ({
  id: id(),
  type: "card",
  sourceId: null,
  imageUrl: null,
  ...card,
});
const quoteBlock = (text: string, name: string): MarketingBlock => ({
  id: id(),
  type: "quote",
  text,
  name,
});

export function broadcastTemplate(
  key: MarketingTemplateKey,
  siteUrl: string,
): StarterEmail {
  const site = siteUrl.replace(/\/+$/u, "");
  const courses = `${site}/courses`;
  switch (key) {
    case "blank":
      return {
        name: "Untitled email",
        subject: "",
        preheader: "",
        blocks: [textBlock("Hi {first_name},\n\nWrite your message here.")],
        design: design("midnight"),
      };
    case "welcome":
      return {
        name: "Welcome email",
        subject: "Welcome to {academy_name}, {first_name}!",
        preheader: "Here's how to get the most out of your learning.",
        blocks: [
          headingBlock("Welcome, {first_name}!", "large", "center"),
          textBlock(
            "We're so glad you're here. {academy_name} is where you'll learn step by step, at your own pace.",
            "center",
          ),
          buttonBlock("Start learning", courses, "center"),
          dividerBlock(),
          headingBlock("Three tips for a great start", "small"),
          textBlock(
            "**1.** Watch one lesson a day, even a short one.\n**2.** Try every example yourself.\n**3.** Ask questions: we read every message.",
          ),
          quoteBlock(
            "I finished my first course in three weeks, just 20 minutes a day.",
            "A happy student",
          ),
        ],
        design: design("clean", "center"),
      };
    case "launch":
      return {
        name: "New course launch",
        subject: "It's here: our new course is open",
        preheader:
          "Everything you need to know, and a launch price for early students.",
        blocks: [
          headingBlock("Our new course is live"),
          textBlock(
            "Hi {first_name},\n\nThe course many of you asked for is finally open.",
          ),
          cardBlock({
            source: "course",
            meta: "New course",
            title: "Your course name",
            text: "Pick one of your courses in this card to fill it in.",
            url: courses,
            buttonLabel: "See the course",
          }),
          headingBlock("What you'll learn", "small"),
          textBlock(
            "**1.** The basics, explained simply\n**2.** Real projects you can show\n**3.** The mistakes to avoid",
          ),
          textBlock("The launch price is for the first week only."),
        ],
        design: design("ocean"),
      };
    case "workshop":
      return {
        name: "Workshop invite",
        subject: "Join me live: free workshop this week",
        preheader: "Save your seat. It takes one click.",
        blocks: [
          headingBlock("You're invited to a live workshop"),
          textBlock(
            "Hi {first_name},\n\nI'm hosting a live session where I'll show you exactly how I do it, and answer your questions.",
          ),
          cardBlock({
            source: "workshop",
            meta: "Live online · add the date",
            title: "Your workshop title",
            text: "Pick one of your workshops in this card to fill it in.",
            url: `${site}/workshops`,
            buttonLabel: "Save my seat",
          }),
          textBlock(
            "Can't make it live? Register anyway and you'll get the recording.",
          ),
        ],
        design: design("warm"),
      };
    case "offer":
      return {
        name: "Limited-time offer",
        subject: "{first_name}, a special price ends soon",
        preheader: "Only until the date below.",
        blocks: [
          headingBlock("A special offer, just for you", "large", "center"),
          textBlock(
            "Hi {first_name},\n\nFor a few days only, you can join at a lower price. Use this code at checkout:",
            "center",
          ),
          couponBlock("SAVE20", "Ends on the date you set · any course"),
          buttonBlock("Claim the offer", courses, "center"),
          textBlock(
            "After the end date the price goes back to normal.",
            "center",
          ),
        ],
        design: design("ember", "center"),
      };
    case "newsletter":
      return {
        name: "Newsletter",
        subject: "This week at {academy_name}",
        preheader: "What's new, one tip, and what's coming next.",
        blocks: [
          headingBlock("This week at {academy_name}"),
          textBlock(
            "Hi {first_name},\n\nHere's a quick round-up of what's new.",
          ),
          headingBlock("One tip", "medium"),
          textBlock("Share one useful idea your students can use today."),
          quoteBlock(
            "Add a line a student sent you this week.",
            "Student name",
          ),
          dividerBlock(),
          headingBlock("Coming next", "medium"),
          textBlock("Tell them what to look forward to."),
          buttonBlock("Keep learning", courses),
        ],
        design: design("forest"),
      };
  }
}

export function automationTemplate(
  key: MarketingAutomationKey,
  siteUrl: string,
): StarterEmail {
  const courses = `${siteUrl.replace(/\/+$/u, "")}/courses`;
  switch (key) {
    case "welcome":
      return {
        name: "Welcome new students",
        subject: "Welcome to {academy_name}, {first_name}!",
        preheader: "Your first step takes 5 minutes.",
        blocks: [
          headingBlock("Welcome, {first_name}!"),
          textBlock(
            "Thanks for joining {academy_name}. Pick a course and watch your first lesson today. It only takes a few minutes.",
          ),
          buttonBlock("Explore courses", courses),
        ],
      };
    case "purchase_thanks":
      return {
        name: "Thank you after buying",
        subject: "Thank you, {first_name}. Here's how to start",
        preheader: "Three tips to finish {course_title}.",
        blocks: [
          headingBlock("Thank you for joining {course_title}"),
          textBlock(
            "Hi {first_name},\n\nI'm really happy you're here. Three tips that help students finish:\n\n**1.** Set a time each day, even 20 minutes\n**2.** Do the exercises, don't only watch\n**3.** Ask when you're stuck",
          ),
          buttonBlock("Open the course", MARKETING_COURSE_LINK),
        ],
      };
    case "start_nudge":
      return {
        name: "Nudge to start",
        subject: "{first_name}, your course is waiting",
        preheader: "The first lesson is short. Start today.",
        blocks: [
          headingBlock("Ready for your first lesson?"),
          textBlock(
            "Hi {first_name},\n\nYou haven't started {course_title} yet. The first lesson is short, and it's the hardest step. After that it gets easier.",
          ),
          buttonBlock("Start the first lesson", MARKETING_COURSE_LINK),
        ],
      };
    case "win_back":
      return {
        name: "Win back inactive students",
        subject: "We miss you, {first_name}",
        preheader: "Pick up right where you left off.",
        blocks: [
          headingBlock("Pick up where you left off"),
          textBlock(
            "Hi {first_name},\n\nIt's been a while. Life gets busy, we get it. Your progress is saved, so you can continue in one click.",
          ),
          buttonBlock("Continue learning", courses),
        ],
      };
    case "access_ending":
      return {
        name: "Access ending soon",
        subject: "Your access to {course_title} ends soon",
        preheader: "Finish the lessons you have left.",
        blocks: [
          headingBlock("Your access ends soon"),
          textBlock(
            "Hi {first_name},\n\nYour access to {course_title} ends soon. Now is a good time to finish the lessons you have left.",
          ),
          buttonBlock("Open the course", MARKETING_COURSE_LINK),
        ],
      };
    case "checkout_reminder":
      return {
        name: "Finish your checkout",
        subject: "You left {course_title} in your checkout",
        preheader: "Your place is still open.",
        blocks: [
          headingBlock("Still thinking about it?"),
          textBlock(
            "Hi {first_name},\n\nYou started joining {course_title} but didn't finish paying. If the payment failed, you can try again now.\n\nHave a question before you join? Just reply to this email.",
          ),
          buttonBlock("Finish joining", MARKETING_COURSE_LINK),
        ],
      };
  }
}
