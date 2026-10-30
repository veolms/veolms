import { useMemo, useState } from "react";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounce } from "../hooks/useDebounce";

export type StudentOutcomeFilter = "attempted" | "not_attempted" | "all";

interface FilterableStudent {
  studentName: string;
  studentEmail: string | null;
  attemptCount: number;
}

/**
 * The Student outcomes list's search and filter. Both run over the whole
 * list the analytics returned, not only the rows loaded so far, and keep
 * its order (those who attempted first, the latest first). Opens on the
 * students who attempted: they are the ones whose answers can be reviewed.
 */
export function useStudentOutcomeFilter<Student extends FilterableStudent>(
  students: readonly Student[],
) {
  const [filter, setFilter] = useState<StudentOutcomeFilter>("attempted");
  const [search, setSearch] = useState("");
  const query = useDebounce(search, DEFAULT_DEBOUNCE_DELAY_MS)
    .trim()
    .toLowerCase();

  const counts = useMemo(() => {
    const attempted = students.filter((s) => s.attemptCount > 0).length;
    return {
      attempted,
      not_attempted: students.length - attempted,
      all: students.length,
    } satisfies Record<StudentOutcomeFilter, number>;
  }, [students]);

  const visible = useMemo(
    () =>
      students.filter(
        (student) =>
          (filter === "all" ||
            (filter === "attempted"
              ? student.attemptCount > 0
              : student.attemptCount === 0)) &&
          (!query ||
            student.studentName.toLowerCase().includes(query) ||
            Boolean(student.studentEmail?.toLowerCase().includes(query))),
      ),
    [students, filter, query],
  );

  return { filter, setFilter, search, setSearch, counts, visible, query };
}
