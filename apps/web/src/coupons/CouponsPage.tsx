import { useEffect, useState } from "react";
import type { Coupon } from "@veolms/contracts";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { Button } from "../components/Button";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import { useCurrentUser } from "../services/auth";
import { hasAdminRole, getUserRoles } from "../shell/workspaceRole";
import type { NavigateTo } from "../routing/navigation";
import { useDeleteCoupon, useUpdateCoupon } from "../services/coupons";
import { getApiError } from "../lib/api-error";
import { CouponSummaryCards } from "./CouponSummaryCards";
import { CouponFiltersBar } from "./CouponFiltersBar";
import { CouponsTable } from "./CouponsTable";
import { useCouponsFilter } from "./useCouponsFilter";
import { surfaceClass } from "./couponHelpers";

export interface CouponsPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

export function CouponsPage({ onNavigatePage, setNotice }: CouponsPageProps) {
  const { data: user } = useCurrentUser();
  const userRoles = getUserRoles(user);
  const isAdmin = hasAdminRole(userRoles);
  const isAuthorized =
    !user ||
    isAdmin ||
    Boolean(
      userRoles?.some((role) =>
        ["admin", "creator", "instructor"].includes(role.toLowerCase()),
      ),
    );

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
  } = useCouponsFilter();

  const updateMutation = useUpdateCoupon();
  const deleteMutation = useDeleteCoupon();
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);

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

  const handleDeleteConfirm = async () => {
    if (!deletingCoupon) return;
    try {
      await deleteMutation.mutateAsync(deletingCoupon.id);
      setNotice?.(`${deletingCoupon.code} deleted.`);
      setDeletingCoupon(null);
    } catch (err) {
      setNotice?.(getApiError(err).message);
    }
  };

  if (user && !isAuthorized) {
    return (
      <main data-coupon-surface="" className="mx-auto grid w-full max-w-[1320px] gap-3.5 sm:gap-6">
        <div className={`${surfaceClass} grid place-items-center p-10 text-center`}>
          <span className="flex size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
            <ShieldWarning size={24} weight="bold" />
          </span>
          <h2 className="mt-3 text-lg font-semibold">Access denied</h2>
          <p className="mt-1 max-w-md text-sm text-(--muted)">
            Coupon management is available to academy administrators and
            instructors.
          </p>
          <div className="mt-4">
            <Button onClick={() => onNavigatePage?.("/courses")}>
              Return to courses
            </Button>
          </div>
        </div>
      </main>
    );
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

      <CouponSummaryCards metrics={summaryMetrics} onFilterTab={setActiveTab} />

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
            canDelete={isAdmin}
            onEditCoupon={handleOpenEdit}
            onDeleteCoupon={setDeletingCoupon}
            onToggleStatus={handleToggleStatus}
            onCreateNew={handleOpenCreate}
            setNotice={setNotice}
          />
        )}
      </section>

      <ConfirmActionModal
        id="delete-coupon"
        isOpen={Boolean(deletingCoupon)}
        isPending={deleteMutation.isPending}
        onClose={() => setDeletingCoupon(null)}
        onConfirm={handleDeleteConfirm}
        icon={Trash}
        title="Delete coupon?"
        description={
          deletingCoupon
            ? `Learners will no longer be able to use ${deletingCoupon.code}. Coupons that already have redemptions cannot be deleted.`
            : ""
        }
        cancelLabel="Cancel"
        confirmLabel="Delete coupon"
        pendingLabel="Deleting..."
        tone="danger"
      />
    </main>
  );
}
