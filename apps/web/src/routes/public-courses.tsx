import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { CourseListResponse } from "@veolms/contracts";
import { publicCourseApi } from "../lib/public-course-api";

export function loader({ request }: LoaderFunctionArgs) {
  return publicCourseApi.list(request);
}

export function meta({ data }: { data?: CourseListResponse }) {
  const description = data?.courses.find(
    (course) => course.shortDescription,
  )?.shortDescription;
  return [
    { title: "Courses | VeoLMS" },
    {
      name: "description",
      content:
        description || "Explore courses and find your next skill to learn.",
    },
  ];
}

function formatPrice(course: CourseListResponse["courses"][number]): string {
  if (course.pricing.pricingType === "free") return "Free";
  const amount = course.pricing.salePrice ?? course.pricing.price;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: course.pricing.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PublicCourses() {
  const { courses } = useLoaderData() as CourseListResponse;
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 py-14 text-(--text) sm:px-8 lg:px-10">
      <header className="mb-10 max-w-3xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-(--accent)">
          VeoLMS courses
        </p>
        <h1 className="m-0 text-4xl font-bold tracking-tight sm:text-5xl">
          Learn something new
        </h1>
        <p className="mb-0 mt-4 text-lg leading-8 text-(--muted)">
          Explore practical courses and build skills at your own pace.
        </p>
      </header>

      {courses.length === 0 ? (
        <p className="rounded-2xl border border-(--border) bg-(--surface) p-6 text-(--muted)">
          New courses are coming soon.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                to={`/explore-courses/${encodeURIComponent(course.slug)}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-(--border) bg-(--surface) text-inherit no-underline transition-colors hover:border-(--accent)"
              >
                {course.thumbnailUrl ? (
                  <img
                    src={course.thumbnailUrl}
                    srcSet={course.thumbnailSrcSet
                      ?.map(({ url, width }) => `${url} ${width}w`)
                      .join(", ")}
                    sizes="(min-width: 1280px) 360px, (min-width: 640px) 45vw, 100vw"
                    alt=""
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-video w-full bg-(--surface-strong)" />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--accent)">
                    {course.categoryName || course.difficulty || "Course"}
                  </p>
                  <h2 className="m-0 text-xl font-semibold group-hover:text-(--accent)">
                    {course.title}
                  </h2>
                  <p className="mb-5 mt-3 line-clamp-3 leading-6 text-(--muted)">
                    {course.shortDescription}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-(--muted)">
                    {course.instructorName ? (
                      <span>{course.instructorName}</span>
                    ) : null}
                    <span>{course.totalLessons} lessons</span>
                    <span>{formatPrice(course)}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
