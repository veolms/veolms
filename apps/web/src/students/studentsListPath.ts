/**
 * The Students list as staff last left it in this tab (its search, as
 * `?q=`), so "Back to Students" on a student's page returns to the same
 * results instead of an empty search.
 */
const STORAGE_KEY = "veolms-students-list-search";

export function rememberStudentsListSearch(search: string): void {
  try {
    if (search && search !== "?") {
      window.sessionStorage.setItem(STORAGE_KEY, search);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage blocked: Back goes to the plain list.
  }
}

/** "/students", or "/students?q=…" as last left. */
export function studentsListPath(): string {
  try {
    const search = window.sessionStorage.getItem(STORAGE_KEY);
    return search && search.startsWith("?")
      ? `/students${search}`
      : "/students";
  } catch {
    return "/students";
  }
}
