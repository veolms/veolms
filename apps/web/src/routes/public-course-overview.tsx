import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { CourseOverviewResponse } from "@veolms/contracts";
import { publicCourseApi } from "../lib/public-course-api";

export function loader({ request, params }: LoaderFunctionArgs) {
  if (!params.courseSlug)
    throw new Response("Course not found.", { status: 404 });
  return publicCourseApi.overview(request, params.courseSlug);
}

export function meta({ data }: { data?: CourseOverviewResponse }) {
  const course = data?.course;
  return [
    { title: course ? `${course.title} | VeoLMS` : "Course | VeoLMS" },
    {
      name: "description",
      content: course?.shortDescription || course?.description || "",
    },
    { property: "og:title", content: course?.title ?? "VeoLMS course" },
    {
      property: "og:description",
      content: course?.shortDescription || course?.description || "",
    },
    ...(course?.thumbnailUrl
      ? [{ property: "og:image", content: course.thumbnailUrl }]
      : []),
  ];
}

function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${totalMinutes} min`;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

export default function PublicCourseOverview() {
  const { course, category, creator, sections, stats, pricing, includes } =
    useLoaderData() as CourseOverviewResponse;
  const price =
    pricing?.pricingType === "paid"
      ? new Intl.NumberFormat("en", {
          style: "currency",
          currency: pricing.currency,
          maximumFractionDigits: 0,
        }).format(pricing.salePrice ?? pricing.price)
      : "Free";

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8 text-(--text) sm:px-8 sm:py-12 lg:px-10">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-(--muted)">
        <Link
          to="/explore-courses"
          className="text-(--accent) no-underline hover:underline"
        >
          Courses
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{course.title}</span>
      </nav>
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] lg:items-center">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-(--accent)">
            {category?.name ?? course.difficulty ?? "Course"}
          </p>
          <h1 className="m-0 text-4xl font-bold tracking-tight sm:text-5xl">
            {course.title}
          </h1>
          {course.shortDescription ? (
            <p className="mb-0 mt-5 text-lg leading-8 text-(--muted)">
              {course.shortDescription}
            </p>
          ) : null}
          <p className="mb-0 mt-4 text-sm text-(--muted)">
            {creator?.displayName ? `Taught by ${creator.displayName}` : null}
          </p>
          <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-(--muted)">Sections</dt>
              <dd className="m-0 mt-1 font-semibold">{stats.totalSections}</dd>
            </div>
            <div>
              <dt className="text-(--muted)">Lessons</dt>
              <dd className="m-0 mt-1 font-semibold">{stats.totalLessons}</dd>
            </div>
            <div>
              <dt className="text-(--muted)">Estimated length</dt>
              <dd className="m-0 mt-1 font-semibold">
                {formatDuration(stats.totalDurationSeconds)}
              </dd>
            </div>
          </dl>
        </div>
        {course.thumbnailUrl ? (
          <img
            src={course.thumbnailUrl}
            srcSet={course.thumbnailSrcSet
              ?.map(({ url, width }) => `${url} ${width}w`)
              .join(", ")}
            sizes="(min-width: 1024px) 40vw, 100vw"
            alt=""
            className="aspect-video w-full rounded-2xl border border-(--border) object-cover"
          />
        ) : null}
      </header>
      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--surface) p-5 sm:p-6">
        <div>
          <p className="m-0 text-sm text-(--muted)">Course price</p>
          <p className="m-0 mt-1 text-2xl font-bold">{price}</p>
        </div>
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-(--accent) px-5 py-3 text-sm font-semibold text-(--on-accent,#ffffff) no-underline"
        >
          Sign in to enroll
        </Link>
      </section>
      {course.description ? (
        <section className="mt-12 max-w-4xl" aria-labelledby="about-course">
          <h2 id="about-course" className="text-2xl font-bold">
            About this course
          </h2>
          <p className="whitespace-pre-line text-base leading-7 text-(--muted)">
            {course.description}
          </p>
        </section>
      ) : null}
      {includes && includes.length > 0 ? (
        <section className="mt-10 max-w-4xl" aria-labelledby="course-includes">
          <h2 id="course-includes" className="text-2xl font-bold">
            What you will get
          </h2>
          <ul className="mt-4 grid gap-3 pl-5 text-(--muted) sm:grid-cols-2">
            {includes.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mt-12 max-w-4xl" aria-labelledby="course-curriculum">
        <h2 id="course-curriculum" className="text-2xl font-bold">
          Course curriculum
        </h2>
        <ol className="mt-5 space-y-4 pl-6">
          {sections.map((section) => (
            <li
              key={section.id}
              className="rounded-xl border border-(--border) bg-(--surface) p-5"
            >
              <h3 className="m-0 text-lg font-semibold">{section.title}</h3>
              <ol className="mt-3 space-y-2 pl-5 text-(--muted)">
                {(section.lessons ?? []).map((lesson) => (
                  <li key={lesson.id}>{lesson.title}</li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
