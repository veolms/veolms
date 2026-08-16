import typescriptCourseThumbnail from "../assets/course-thumbnails/typescript.jpg";
import javascriptCourseThumbnail from "../assets/course-thumbnails/javascript.jpg";
import nodeCourseThumbnail from "../assets/course-thumbnails/nodejs.jpg";
import figmaCourseThumbnail from "../assets/course-thumbnails/figma.jpg";
import mongodbCourseThumbnail from "../assets/course-thumbnails/mongodb.jpg";
import awsCourseThumbnail from "../assets/course-thumbnails/aws.jpg";
import veolmsCourseThumbnail from "../assets/learning-thumbnails/veolms-course.webp";
import illustratorCourseThumbnail from "../assets/learning-thumbnails/illustrator-course.webp";
import reactCourseThumbnail from "../assets/learning-thumbnails/react-course.webp";
import d3CourseThumbnail from "../assets/learning-thumbnails/d3-course.webp";

export const JAVASCRIPT_BRAND_COLOR = "#F7DF1E";

const courseBrandColorsBySlug: Record<string, string | undefined> = {
  "javascript-course": JAVASCRIPT_BRAND_COLOR,
};

export const getCourseBrandColor = (courseSlug: string | undefined) =>
  courseSlug ? courseBrandColorsBySlug[courseSlug] : undefined;

const courseTitlesBySlug: Record<string, string | undefined> = {
  "ui-ux-design-mastery": "UI/UX Design Mastery",
  "backend-nodejs": "Complete Backend with Node.js",
  "typescript-course": "The Ultimate TypeScript Course",
  "javascript-course": "The Complete JavaScript Course",
  "figma-ui-essentials": "Figma UI Essentials",
  "mongodb-database-design": "MongoDB & Database Design",
  "aws-cloud-practitioner": "AWS Cloud Practitioner Essentials",
  "building-veolms": "Building VeoLMS: Idea to Production",
  "illustrator-designers": "Adobe Illustrator for UI Designers",
  "advanced-react": "Advanced React Development",
  "data-visualization-d3": "Data Visualization with D3.js",
};

export const getCourseTitle = (courseSlug: string | undefined) =>
  (courseSlug ? courseTitlesBySlug[courseSlug] : undefined) ||
  (typeof window !== "undefined"
    ? window.localStorage.getItem("veolms-current-course-title")
    : null) ||
  "UI/UX Design Mastery";

const courseThumbnailsBySlug: Record<string, string | undefined> = {
  "typescript-course": typescriptCourseThumbnail,
  "javascript-course": javascriptCourseThumbnail,
  "backend-nodejs": nodeCourseThumbnail,
  "figma-ui-essentials": figmaCourseThumbnail,
  "mongodb-database-design": mongodbCourseThumbnail,
  "aws-cloud-practitioner": awsCourseThumbnail,
  "building-veolms": veolmsCourseThumbnail,
  "illustrator-designers": illustratorCourseThumbnail,
  "advanced-react": reactCourseThumbnail,
  "data-visualization-d3": d3CourseThumbnail,
};

export const getCourseThumbnail = (courseSlug: string | undefined) =>
  (courseSlug ? courseThumbnailsBySlug[courseSlug] : undefined) ||
  typescriptCourseThumbnail;
