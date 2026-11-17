import { useMemo, useState } from "react";
import type { CourseBundle } from "@veolms/contracts";
import { PackageIcon as Package } from "@phosphor-icons/react/Package";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { Button } from "../components/Button";
import { useManagedBundles } from "../services/bundles";
import { useMyCourses } from "../services/courses";
import { CourseBundleEditor } from "./CourseBundleEditor";

const inr = (amount: number) =>
  `₹${Math.round(amount).toLocaleString("en-IN")}`;

/**
 * The bundles this course is in (creator-features/bundles-in-checkout).
 * A bundle is made and changed here, from any of its courses; it is then
 * offered on the price card of every course in it.
 */
export function CourseBundlesCard({ courseId }: { courseId: string | null }) {
  const bundlesQuery = useManagedBundles({ enabled: Boolean(courseId) });
  const coursesQuery = useMyCourses({ enabled: Boolean(courseId) });
  const [editing, setEditing] = useState<CourseBundle | "new" | null>(null);

  const courses = useMemo(
    () => coursesQuery.data?.courses ?? [],
    [coursesQuery.data],
  );
  const priceOf = useMemo(
    () => new Map(courses.map((course) => [course.id, course.price ?? 0])),
    [courses],
  );
  const bundles = useMemo(
    () =>
      (bundlesQuery.data ?? []).filter(
        (bundle) =>
          bundle.status !== "archived" &&
          (bundle.items ?? []).some((item) => item.courseId === courseId),
      ),
    [bundlesQuery.data, courseId],
  );

  return (
    <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
      <div className="mb-4.5">
        <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
          Bundles with this course
        </h3>
        <p className="m-0 text-(--muted) text-[0.83rem]">
          Sell this course together with others for less. A bundle shows on the
          price card of every course in it, with what buyers save.
        </p>
      </div>

      {!courseId ? (
        <div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] p-5 text-center text-xs text-(--muted)">
          Save course basics before making a bundle.
        </div>
      ) : bundlesQuery.isError ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-red-400">
            Unable to load bundles. {bundlesQuery.error?.message ?? ""}
          </p>
          <Button
            type="button"
            onClick={() => void bundlesQuery.refetch()}
            className="w-fit"
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {bundles.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {bundles.map((bundle) => {
                const items = bundle.items ?? [];
                const apart = items.reduce(
                  (sum, item) => sum + (priceOf.get(item.courseId) ?? 0),
                  0,
                );
                const saving = apart - bundle.price;
                return (
                  <li
                    key={bundle.id}
                    className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-3.5 py-2.5"
                  >
                    <Package
                      size={16}
                      weight="bold"
                      className="shrink-0 text-(--accent)"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.88rem] font-semibold text-(--text)">
                        {bundle.title}
                      </span>
                      <span className="block text-[0.76rem] text-(--muted)">
                        {items.length} courses · {inr(bundle.price)}
                        {saving > 0
                          ? ` · saves ${inr(saving)}`
                          : " · saves nothing at today's prices"}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[0.72rem] font-semibold ${
                        bundle.status === "published"
                          ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                          : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted)"
                      }`}
                    >
                      {bundle.status === "published" ? "Live" : "Draft"}
                    </span>
                    <Button variant="quiet" onClick={() => setEditing(bundle)}>
                      Edit
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Button
            type="button"
            className="w-fit"
            disabled={bundlesQuery.isLoading || coursesQuery.isLoading}
            onClick={() => setEditing("new")}
          >
            <Plus size={15} weight="bold" />
            Make a bundle
          </Button>
        </div>
      )}

      {courseId && editing ? (
        <CourseBundleEditor
          courseId={courseId}
          bundle={editing === "new" ? null : editing}
          courses={courses}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
