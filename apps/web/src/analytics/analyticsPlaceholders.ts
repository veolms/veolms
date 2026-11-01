import type { AnalyticsTabPlaceholderSpec } from "@veolms/analytics-ui/skeletons";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";
import { ShoppingCartIcon as ShoppingCart } from "@phosphor-icons/react/ShoppingCart";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { ArrowUUpLeftIcon as ArrowUUpLeft } from "@phosphor-icons/react/ArrowUUpLeft";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { ExamIcon as Exam } from "@phosphor-icons/react/Exam";

/**
 * The shape of each core tab before its data is in: the same tiles and
 * cards the tab draws, by title, so the page can show them at once. Keep
 * these in step with the tabs' own render order.
 */

export const OVERVIEW_PLACEHOLDER: AnalyticsTabPlaceholderSpec = {
  kpis: [
    { label: "Net Revenue", tone: "accent", Icon: CurrencyInr },
    { label: "Orders", tone: "blue", Icon: ShoppingCart },
    { label: "New Enrollments", tone: "emerald", Icon: Student },
    { label: "Total Students", tone: "violet", Icon: UsersThree },
    { label: "Refund Rate", tone: "rose", Icon: ArrowUUpLeft },
    { label: "Completion Rate", tone: "teal", Icon: CheckCircle },
  ],
  sections: [
    {
      title: "Performance Over Time",
      description: "Net revenue and paid orders per UTC day",
      kind: "chart",
    },
    {
      title: "Course Performance",
      description: "Top courses by enrollments in this period",
      kind: "table",
      size: 6,
    },
  ],
};

export const REVENUE_PLACEHOLDER: AnalyticsTabPlaceholderSpec = {
  kpis: [
    { label: "Gross Sales", tone: "accent", Icon: CurrencyInr },
    { label: "Net Revenue", tone: "blue", Icon: Wallet },
    { label: "Orders", tone: "teal", Icon: ShoppingCart },
    { label: "Unique Buyers", tone: "emerald", Icon: Users },
    { label: "Avg Order Value", tone: "amber", Icon: Receipt },
    { label: "Refund Rate", tone: "rose", Icon: ArrowUUpLeft },
  ],
  sections: [
    {
      title: "Revenue Over Time",
      description: "Gross sales and net revenue per UTC day",
      kind: "chart",
    },
    {
      title: "Revenue by Product",
      description: "Net revenue of each course, bundle or quiz sold",
      kind: "list",
      span: "half",
    },
    {
      title: "Revenue Sources",
      description: "How paid orders were priced",
      kind: "list",
      span: "half",
      size: 3,
    },
    {
      title: "Payment Methods",
      description: "Paid orders by the method that settled them",
      kind: "list",
      span: "half",
      size: 4,
    },
    {
      title: "Commerce Funnel",
      description: "Checkouts started and orders paid in this period",
      kind: "list",
      span: "half",
      size: 3,
    },
    {
      title: "Coupon Performance",
      description: "Orders and revenue by coupon code",
      kind: "table",
      span: "half",
    },
    {
      title: "Refund Trends",
      description: "Refunded amount against the day the order was placed",
      kind: "chart",
      span: "half",
      size: 200,
    },
    {
      title: "Top Revenue Courses",
      description: "Courses by gross sales of their order lines",
      kind: "table",
      size: 6,
    },
  ],
};

export const COURSES_PLACEHOLDER: AnalyticsTabPlaceholderSpec = {
  kpis: [
    { label: "Active Courses", tone: "blue", Icon: BookOpen },
    { label: "Enrollments", tone: "emerald", Icon: Student },
    { label: "Avg Completion", tone: "violet", Icon: CheckCircle },
    { label: "Lessons Published", tone: "accent", Icon: PlayCircle },
    { label: "Video Content", tone: "amber", Icon: Clock },
    { label: "Quiz Attempts", tone: "teal", Icon: Exam },
  ],
  sections: [
    {
      title: "Enrollments Over Time",
      description: "New enrollments per UTC day, every source",
      kind: "chart",
    },
    {
      title: "Top Courses",
      description: "By enrollments in this period",
      kind: "table",
      span: "half",
      size: 6,
    },
    {
      title: "Content Insights",
      description: "What the catalogue holds today",
      kind: "list",
      span: "half",
      size: 7,
    },
    {
      title: "Lesson Mix",
      description: "Published lessons by type",
      kind: "list",
      span: "half",
      size: 3,
    },
    {
      title: "Quiz Results",
      description: "Attempts started in this period",
      kind: "list",
      span: "half",
      size: 4,
    },
  ],
};
