import type { Route } from "./+types/home-marker";
import hero512 from "../assets/learning-thumbnails/typescript-instructor-hero-512.webp";
import hero640 from "../assets/learning-thumbnails/typescript-instructor-hero-640.webp";
import hero800 from "../assets/learning-thumbnails/typescript-instructor-hero-800.webp";
import hero1600 from "../assets/learning-thumbnails/typescript-instructor-hero.webp";
import { getRouteMeta } from "../routing/routeDescriptors";

export const links: Route.LinksFunction = () => [
  {
    rel: "preload",
    as: "image",
    href: hero640,
    imageSrcSet: `${hero512} 512w, ${hero640} 640w, ${hero800} 800w, ${hero1600} 1600w`,
    imageSizes:
      "(max-width: 820px) calc(100vw - 50px), (max-width: 1180px) 40vw, 430px",
  },
];

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function HomeMarker() {
  return null;
}
