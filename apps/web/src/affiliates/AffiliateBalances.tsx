import { useAffiliateStats } from "../services/affiliates";
import { AdminSummaryTiles } from "./admin/AdminListBits";
import { formatAffiliateMoney } from "./affiliateFormat";

const number = new Intl.NumberFormat("en-IN");

/**
 * How sharing went in the chosen range: clicks on the link, sales, how
 * many clicks became a sale, and what was earned. The money owed lives in
 * the money card under it.
 */
export function AffiliateBalances({
  range,
}: {
  range: { from?: string; to?: string };
}) {
  const stats = useAffiliateStats(range);
  const data = stats.data;
  const top = data?.byProduct[0];
  const tiles = data
    ? [
        {
          id: "clicks",
          title: "Clicks",
          value: number.format(data.clicks),
          note: "on your link",
        },
        {
          id: "sales",
          title: "Sales",
          value: number.format(data.sales),
          note: top ? `most: ${top.title}` : "through your link or code",
        },
        {
          id: "conversion",
          title: "Conversion",
          value:
            data.conversionRate === null
              ? "–"
              : `${(Math.min(1, data.conversionRate) * 100).toFixed(1)}%`,
          note: "of clicks became a sale",
        },
        {
          id: "earned",
          title: "Earned",
          value: formatAffiliateMoney(data.earned),
          note: "in this period",
        },
      ]
    : null;
  return (
    <div
      className={
        stats.isFetching && data ? "opacity-70 transition-opacity" : ""
      }
    >
      <AdminSummaryTiles
        label="How sharing went"
        tiles={tiles}
        count={4}
        isLoading={stats.isPending}
      />
    </div>
  );
}
