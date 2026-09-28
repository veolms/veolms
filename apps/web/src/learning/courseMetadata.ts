import typescriptCourseThumbnail from "../assets/course-thumbnails/typescript-960.webp";
import typescriptCourseThumbnail160 from "../assets/course-thumbnails/typescript-160.webp?no-inline";
import typescriptCourseThumbnail320 from "../assets/course-thumbnails/typescript-320.webp";
import typescriptCourseThumbnail640 from "../assets/course-thumbnails/typescript-640.webp";
import javascriptCourseThumbnail from "../assets/course-thumbnails/javascript-960.webp";
import javascriptCourseThumbnail160 from "../assets/course-thumbnails/javascript-160.webp?no-inline";
import javascriptCourseThumbnail320 from "../assets/course-thumbnails/javascript-320.webp";
import javascriptCourseThumbnail640 from "../assets/course-thumbnails/javascript-640.webp";
import nodeCourseThumbnail from "../assets/course-thumbnails/nodejs-960.webp";
import nodeCourseThumbnail160 from "../assets/course-thumbnails/nodejs-160.webp?no-inline";
import nodeCourseThumbnail320 from "../assets/course-thumbnails/nodejs-320.webp";
import nodeCourseThumbnail640 from "../assets/course-thumbnails/nodejs-640.webp";
import figmaCourseThumbnail from "../assets/course-thumbnails/figma-960.webp";
import figmaCourseThumbnail160 from "../assets/course-thumbnails/figma-160.webp?no-inline";
import figmaCourseThumbnail320 from "../assets/course-thumbnails/figma-320.webp";
import figmaCourseThumbnail640 from "../assets/course-thumbnails/figma-640.webp";
import mongodbCourseThumbnail from "../assets/course-thumbnails/mongodb-960.webp";
import mongodbCourseThumbnail160 from "../assets/course-thumbnails/mongodb-160.webp?no-inline";
import mongodbCourseThumbnail320 from "../assets/course-thumbnails/mongodb-320.webp";
import mongodbCourseThumbnail640 from "../assets/course-thumbnails/mongodb-640.webp";
import awsCourseThumbnail from "../assets/course-thumbnails/aws-960.webp";
import awsCourseThumbnail160 from "../assets/course-thumbnails/aws-160.webp?no-inline";
import awsCourseThumbnail320 from "../assets/course-thumbnails/aws-320.webp";
import awsCourseThumbnail640 from "../assets/course-thumbnails/aws-640.webp";
import veolmsCourseThumbnail from "../assets/learning-thumbnails/veolms-course-960.webp";
import veolmsCourseThumbnail160 from "../assets/learning-thumbnails/veolms-course-160.webp?no-inline";
import veolmsCourseThumbnail320 from "../assets/learning-thumbnails/veolms-course-320.webp";
import veolmsCourseThumbnail640 from "../assets/learning-thumbnails/veolms-course-640.webp";
import illustratorCourseThumbnail from "../assets/learning-thumbnails/illustrator-course-960.webp";
import illustratorCourseThumbnail160 from "../assets/learning-thumbnails/illustrator-course-160.webp?no-inline";
import illustratorCourseThumbnail320 from "../assets/learning-thumbnails/illustrator-course-320.webp";
import illustratorCourseThumbnail640 from "../assets/learning-thumbnails/illustrator-course-640.webp";
import reactCourseThumbnail from "../assets/learning-thumbnails/react-course-960.webp";
import reactCourseThumbnail160 from "../assets/learning-thumbnails/react-course-160.webp?no-inline";
import reactCourseThumbnail320 from "../assets/learning-thumbnails/react-course-320.webp";
import reactCourseThumbnail640 from "../assets/learning-thumbnails/react-course-640.webp";
import d3CourseThumbnail from "../assets/learning-thumbnails/d3-course-960.webp";
import d3CourseThumbnail160 from "../assets/learning-thumbnails/d3-course-160.webp?no-inline";
import d3CourseThumbnail320 from "../assets/learning-thumbnails/d3-course-320.webp";
import d3CourseThumbnail640 from "../assets/learning-thumbnails/d3-course-640.webp";

export const JAVASCRIPT_BRAND_COLOR = "#F7DF1E";

const courseBrandColorsBySlug: Record<string, string | undefined> = {
  "javascript-course": JAVASCRIPT_BRAND_COLOR,
};

export const getCourseBrandColor = (courseSlug: string | undefined) =>
  courseSlug ? courseBrandColorsBySlug[courseSlug] : undefined;

const courseTitlesBySlug: Record<string, string | undefined> = {
  "ui-ux-design-mastery": "UI/UX Design Mastery",
  "backend-nodejs": "Complete Backend with Node.js",
  "complete-backend-development-with-nodejs":
    "Complete Backend Development with Node.js",
  "typescript-course": "The Ultimate TypeScript Course",
  "ultimate-typescript-course": "The Ultimate TypeScript Course",
  "javascript-course": "The Complete JavaScript Course",
  "figma-ui-essentials": "Figma UI Essentials",
  "mongodb-database-design": "MongoDB & Database Design",
  "aws-cloud-practitioner": "AWS Cloud Practitioner Essentials",
  "building-veolms": "Building VeoLMS: Idea to Production",
  "building-procodrr-idea-to-production":
    "Building ProCodrr: Idea to Production",
  "illustrator-designers": "Adobe Illustrator for UI Designers",
  "advanced-react": "Advanced React Development",
  "data-visualization-d3": "Data Visualization with D3.js",
};

export const getCourseTitle = (courseSlug: string | undefined) =>
  (courseSlug ? courseTitlesBySlug[courseSlug] : undefined) ||
  "UI/UX Design Mastery";

const courseThumbnailsBySlug: Record<string, string | undefined> = {
  "ui-ux-design-mastery": "/static/instructor-poster-960.webp",
  "typescript-course": typescriptCourseThumbnail,
  "javascript-course": javascriptCourseThumbnail,
  "backend-nodejs": nodeCourseThumbnail,
  "complete-backend-development-with-nodejs": nodeCourseThumbnail,
  "ultimate-typescript-course": typescriptCourseThumbnail,
  "figma-ui-essentials": figmaCourseThumbnail,
  "mongodb-database-design": mongodbCourseThumbnail,
  "aws-cloud-practitioner": awsCourseThumbnail,
  "building-veolms": veolmsCourseThumbnail,
  "illustrator-designers": illustratorCourseThumbnail,
  "advanced-react": reactCourseThumbnail,
  "data-visualization-d3": d3CourseThumbnail,
};

const courseThumbnailSrcSetsBySlug: Record<string, string | undefined> = {
  "ui-ux-design-mastery":
    "/static/instructor-poster-160.webp 160w, /static/instructor-poster-320.webp 320w, /static/instructor-poster-640.webp 640w, /static/instructor-poster-960.webp 960w",
  "typescript-course": `${typescriptCourseThumbnail160} 160w, ${typescriptCourseThumbnail320} 320w, ${typescriptCourseThumbnail640} 640w, ${typescriptCourseThumbnail} 960w`,
  "ultimate-typescript-course": `${typescriptCourseThumbnail160} 160w, ${typescriptCourseThumbnail320} 320w, ${typescriptCourseThumbnail640} 640w, ${typescriptCourseThumbnail} 960w`,
  "javascript-course": `${javascriptCourseThumbnail160} 160w, ${javascriptCourseThumbnail320} 320w, ${javascriptCourseThumbnail640} 640w, ${javascriptCourseThumbnail} 960w`,
  "backend-nodejs": `${nodeCourseThumbnail160} 160w, ${nodeCourseThumbnail320} 320w, ${nodeCourseThumbnail640} 640w, ${nodeCourseThumbnail} 960w`,
  "complete-backend-development-with-nodejs": `${nodeCourseThumbnail160} 160w, ${nodeCourseThumbnail320} 320w, ${nodeCourseThumbnail640} 640w, ${nodeCourseThumbnail} 960w`,
  "figma-ui-essentials": `${figmaCourseThumbnail160} 160w, ${figmaCourseThumbnail320} 320w, ${figmaCourseThumbnail640} 640w, ${figmaCourseThumbnail} 960w`,
  "mongodb-database-design": `${mongodbCourseThumbnail160} 160w, ${mongodbCourseThumbnail320} 320w, ${mongodbCourseThumbnail640} 640w, ${mongodbCourseThumbnail} 960w`,
  "aws-cloud-practitioner": `${awsCourseThumbnail160} 160w, ${awsCourseThumbnail320} 320w, ${awsCourseThumbnail640} 640w, ${awsCourseThumbnail} 960w`,
  "building-veolms": `${veolmsCourseThumbnail160} 160w, ${veolmsCourseThumbnail320} 320w, ${veolmsCourseThumbnail640} 640w, ${veolmsCourseThumbnail} 960w`,
  "illustrator-designers": `${illustratorCourseThumbnail160} 160w, ${illustratorCourseThumbnail320} 320w, ${illustratorCourseThumbnail640} 640w, ${illustratorCourseThumbnail} 960w`,
  "advanced-react": `${reactCourseThumbnail160} 160w, ${reactCourseThumbnail320} 320w, ${reactCourseThumbnail640} 640w, ${reactCourseThumbnail} 960w`,
  "data-visualization-d3": `${d3CourseThumbnail160} 160w, ${d3CourseThumbnail320} 320w, ${d3CourseThumbnail640} 640w, ${d3CourseThumbnail} 960w`,
};

export const getCourseThumbnail = (courseSlug: string | undefined) =>
  (courseSlug ? courseThumbnailsBySlug[courseSlug] : undefined) ||
  typescriptCourseThumbnail;

export const getCourseThumbnailSrcSet = (courseSlug: string | undefined) =>
  (courseSlug ? courseThumbnailSrcSetsBySlug[courseSlug] : undefined) ||
  `${typescriptCourseThumbnail160} 160w, ${typescriptCourseThumbnail320} 320w, ${typescriptCourseThumbnail640} 640w, ${typescriptCourseThumbnail} 960w`;
