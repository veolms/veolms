import type { EnrolledCourse } from "@veolms/contracts";
import { useState } from "react";
import { CourseThumbnailPlaceholder } from "../../courses/CourseThumbnailPlaceholder";
import { getCourseThumbnailCdnUrl } from "../../courses/courseMedia";

/**
 * An enrolled course's thumbnail, filling the box it is put in. A stored
 * address that no longer loads falls back to the one built from the
 * thumbnail's media id, and then to the placeholder.
 */
export function LearnerCourseThumbnail({
  course,
  priority = false,
}: {
  course: Pick<EnrolledCourse, "courseThumbnailUrl" | "courseThumbnailMediaId">;
  /** One of the first pictures the page paints. */
  priority?: boolean;
}) {
  const sources = [
    course.courseThumbnailUrl?.trim(),
    getCourseThumbnailCdnUrl(course.courseThumbnailMediaId),
  ].filter(
    (source, index, all): source is string =>
      Boolean(source) && all.indexOf(source) === index,
  );
  const sourcesKey = sources.join("\n");
  const [failed, setFailed] = useState({ key: sourcesKey, count: 0 });
  const failedCount = failed.key === sourcesKey ? failed.count : 0;
  const source = sources[failedCount];

  if (!source) return <CourseThumbnailPlaceholder />;

  return (
    <img
      src={source}
      alt=""
      width={960}
      height={540}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding="async"
      onError={() => setFailed({ key: sourcesKey, count: failedCount + 1 })}
      className="size-full object-cover"
    />
  );
}
