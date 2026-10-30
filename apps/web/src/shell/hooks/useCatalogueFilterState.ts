import {
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { useWishlistIds } from "../../wishlist";
import type {
  CourseEnrollmentFilter,
  CourseSort,
  CourseStatusFilter,
} from "../../courses/catalogue";
import { COURSE_CATALOGUE_SEARCH_SESSION_KEY } from "../../store/accountBrowserState";
import {
  DEFAULT_DEBOUNCE_DELAY_MS,
  useDebounce,
} from "../../hooks/useDebounce";
import {
  isStoredString,
  useSessionStorageState,
} from "../../learning/useSessionStorageState";

export interface UseCatalogueFilterStateArgs {
  page: string;
  requestedSection: string | null;
}

export interface UseCatalogueFilterStateResult {
  activeSection: string;
  setActiveSection: Dispatch<SetStateAction<string>>;
  creatorEnrollmentFilter: CourseEnrollmentFilter;
  setCreatorEnrollmentFilter: Dispatch<SetStateAction<CourseEnrollmentFilter>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  debouncedSearch: string;
  statusFilter: CourseStatusFilter;
  setStatusFilter: Dispatch<SetStateAction<CourseStatusFilter>>;
  filterOwnerRef: RefObject<string | null>;
  sort: CourseSort;
  setSort: Dispatch<SetStateAction<CourseSort>>;
  wishlisted: ReadonlySet<string>;
  storedPreferencesReady: boolean;
  setStoredPreferencesReady: Dispatch<SetStateAction<boolean>>;
}

export function useCatalogueFilterState({
  page,
  requestedSection,
}: UseCatalogueFilterStateArgs): UseCatalogueFilterStateResult {
  const [activeSection, setActiveSection] = useState(() => {
    if (page === "home") return "Home";
    if (page === "courses") return "Courses";
    if (requestedSection) return requestedSection;
    // Keep the initializer deterministic to avoid a server/client hydration
    // mismatch. Route props become authoritative in the effect below.
    return "Courses";
  });
  const [creatorEnrollmentFilter, setCreatorEnrollmentFilter] =
    useState<CourseEnrollmentFilter>("all");
  const [search, setSearch] = useSessionStorageState(
    COURSE_CATALOGUE_SEARCH_SESSION_KEY,
    "",
    isStoredString,
  );
  const debouncedSearch = useDebounce(search, DEFAULT_DEBOUNCE_DELAY_MS);
  const [statusFilter, setStatusFilter] = useState<CourseStatusFilter>("all");
  const filterOwnerRef = useRef<string | null>(null);
  const [sort, setSort] = useState<CourseSort>("latest");
  const wishlisted = useWishlistIds();
  const [storedPreferencesReady, setStoredPreferencesReady] = useState(false);
  return {
    activeSection,
    setActiveSection,
    creatorEnrollmentFilter,
    setCreatorEnrollmentFilter,
    search,
    setSearch,
    debouncedSearch,
    statusFilter,
    setStatusFilter,
    filterOwnerRef,
    sort,
    setSort,
    wishlisted,
    storedPreferencesReady,
    setStoredPreferencesReady,
  };
}
