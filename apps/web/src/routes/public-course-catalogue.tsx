import { Link, useLoaderData } from "react-router";
import type { CourseListResponse } from "@veolms/contracts";
import type { LoaderFunctionArgs } from "react-router";
import { publicCourseApi } from "../lib/public-course-api";
import { useInfiniteCourses } from "../services/courses";

export function loader({
  request,
}: LoaderFunctionArgs): Promise<CourseListResponse> {
  return publicCourseApi.list(request);
}

export function clientLoader({
  request,
}: LoaderFunctionArgs): Promise<CourseListResponse> {
  return publicCourseApi.list(request);
}
clientLoader.hydrate = true as const;

export function meta({ data }: { data?: CourseListResponse }) {
  return [
    { title: "Courses | VeoLMS" },
    {
      name: "description",
      content:
        data?.courses.map((course) => course.shortDescription).find(Boolean) ??
        "Explore courses on VeoLMS.",
    },
  ];
}

export default function PublicCourseCatalogue() {
  const initialData = useLoaderData() as CourseListResponse;
  const catalogue = useInfiniteCourses({ limit: 50, initialData });
  const courses = catalogue.data?.courses ?? initialData.courses;
  const firstImageIndex = courses.findIndex((course) => course.thumbnailUrl);

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
          Explore practical courses and follow a clear path from fundamentals to
          confident practice.
        </p>
      </header>

      {courses.length === 0 ? (
        <p className="rounded-2xl border border-(--border) bg-(--surface) p-6 text-(--muted)">
          New courses are coming soon.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course, index) => (
            <li key={course.id}>
              <Link
                to={`/catalogue/${encodeURIComponent(course.slug)}/overview`}
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
                    loading={index === firstImageIndex ? "eager" : "lazy"}
                    fetchPriority={index === firstImageIndex ? "high" : "auto"}
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
                    <span>
                      {course.pricing.pricingType === "free"
                        ? "Free"
                        : `${course.pricing.currency} ${course.pricing.salePrice ?? course.pricing.price}`}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {catalogue.hasNextPage ? (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            className="rounded-xl border border-(--border) bg-(--surface) px-5 py-3 text-sm font-semibold text-(--text) transition-colors hover:border-(--accent) disabled:cursor-wait disabled:opacity-60"
            disabled={catalogue.isFetchingNextPage}
            onClick={() => void catalogue.fetchNextPage()}
          >
            {catalogue.isFetchingNextPage
              ? "Loading courses…"
              : "Load more courses"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
