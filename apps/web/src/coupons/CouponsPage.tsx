import { useEffect } from "react";
import type { Coupon } from "@veolms/contracts";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { Button } from "../components/Button";
import { useCurrentUser } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import { getUserRoles, isStaffRole } from "../shell/workspaceRole";
import type { NavigateTo } from "../routing/navigation";
import { useUpdateCoupon } from "../services/coupons";
import { getApiError } from "../lib/api-error";
import { CouponSummaryCards } from "./CouponSummaryCards";
import { CouponFiltersBar } from "./CouponFiltersBar";
import { CouponsTable } from "./CouponsTable";
import { CouponsAccessDenied } from "./CouponsAccessDenied";
import { useCouponsFilter } from "./useCouponsFilter";
import { surfaceClass } from "./couponHelpers";

export interface CouponsPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

export function CouponsPage({ onNavigatePage, setNotice }: CouponsPageProps) {
  const { data: authUser, isFetched: authUserFetched } = useCurrentUser();
  const storeUser = useAuthStore((s) => s.user);
  const isAuthReady = Boolean(storeUser) || authUserFetched;
  const user = authUserFetched ? authUser : storeUser;
  const userRoles = getUserRoles(user);
  const isAuthorized = Boolean(user && isStaffRole(userRoles));

  const {
    coupons,
    counts,
    summaryMetrics,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    discountTypeFilter,
    setDiscountTypeFilter,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useCouponsFilter({ enabled: isAuthorized });

  const updateMutation = useUpdateCoupon();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      const isInput =
        activeTag === "input" ||
        activeTag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (!isInput && (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key === "k"))) {
        event.preventDefault();
        document.getElementById("coupons-search-input")?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleOpenCreate = () => {
    onNavigatePage?.("/coupons/create");
  };

  const handleOpenEdit = (coupon: Coupon) => {
    onNavigatePage?.(`/coupons/${coupon.id}`);
  };

  const handleToggleStatus = async (coupon: Coupon) => {
    try {
      await updateMutation.mutateAsync({
        id: coupon.id,
        payload: { isActive: !coupon.isActive },
      });
      setNotice?.(
        coupon.isActive
          ? `${coupon.code} is now inactive.`
          : `${coupon.code} is now active.`,
      );
    } catch (err) {
      setNotice?.(getApiError(err).message);
    }
  };

  if (!isAuthReady) {
    return (
      <main data-coupon-surface="" className="mx-auto grid w-full max-w-[1320px] place-items-center py-24">
        <CircleNotch size={28} className="mb-3 animate-spin text-(--accent)" />
        <p className="text-sm text-(--muted)">Loading promotions workspace...</p>
      </main>
    );
  }

  if (!isAuthorized) {
    return <CouponsAccessDenied onNavigatePage={onNavigatePage} />;
  }

  return (
    <main
      data-coupon-surface=""
      className="mx-auto grid w-full max-w-[1320px] gap-3.5 sm:gap-6"
      aria-labelledby="coupons-page-title"
    >
      <header className="flex flex-col gap-3.5 border-b border-(--border) pt-2 pb-4.5 sm:gap-5 sm:pt-0 sm:pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-(--accent)">
            <span className="size-1.5 rounded-full bg-(--accent)" aria-hidden="true" />
            Promotions workspace
          </p>
          <h1
            id="coupons-page-title"
            className="mt-2.5 text-[clamp(1.75rem,3vw,2.55rem)] font-semibold tracking-[-0.04em] text-(--text) sm:mt-2"
          >
            Coupons
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-(--muted)">
            Create discount codes, schedule campaigns, and track redemptions
            from one library.
          </p>
        </div>
        <div className="shrink-0 pt-2 pb-0.5 sm:py-0">
          <Button onClick={handleOpenCreate}>
            <Plus size={16} weight="bold" />
            Create coupon
          </Button>
        </div>
      </header>

      <CouponSummaryCards
        metrics={summaryMetrics}
        activeTab={activeTab}
        onFilterTab={setActiveTab}
      />

      <section className={surfaceClass} aria-label="Coupon library">
        <div className="flex items-start justify-between gap-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2.5 sm:p-7">
          <div>
            <h2 className="text-base font-bold tracking-tight text-(--text) sm:text-lg">
              Coupon library
            </h2>
            <p className="mt-0.5 text-xs text-(--muted)">
              Search, filter, and open any coupon to edit it.
            </p>
          </div>
          <Button className="hidden sm:inline-flex" onClick={handleOpenCreate}>
            <Plus size={16} weight="bold" />
            New coupon
          </Button>
        </div>

        <CouponFiltersBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          counts={counts}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          discountTypeFilter={discountTypeFilter}
          onDiscountTypeFilterChange={setDiscountTypeFilter}
        />

        {isError ? (
          <div className="grid place-items-center p-6 sm:p-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
              <Tag size={22} weight="bold" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">Could not load coupons</h3>
            <p className="mt-1 max-w-sm text-xs leading-5 text-(--muted)">
              {error?.message || "Try again in a moment."}
            </p>
            <div className="mt-4">
              <Button onClick={() => refetch()}>Retry</Button>
            </div>
          </div>
        ) : (
          <CouponsTable
            coupons={coupons}
            isLoading={isLoading}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            onEditCoupon={handleOpenEdit}
            onToggleStatus={handleToggleStatus}
            onCreateNew={handleOpenCreate}
            setNotice={setNotice}
          />
        )}
      </section>
    </main>
  );
}
