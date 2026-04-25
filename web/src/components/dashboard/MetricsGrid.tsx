import { MetricCard } from "./MetricCard";
import type { DashboardMetric } from "../../types/dashboard";
import { dashboardTokens } from "../../theme/tokens";

type MetricsGridProps = {
  metrics: DashboardMetric[];
  forceSingleColumn?: boolean;
};

export function MetricsGrid({
  metrics,
  forceSingleColumn = false,
}: MetricsGridProps): JSX.Element {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: forceSingleColumn
          ? "1fr"
          : "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
        gap: dashboardTokens.spacing.md,
        minHeight: 0,
      }}
    >
      {metrics.map((metric) => (
        <MetricCard key={metric.key} metric={metric} compact />
      ))}
    </section>
  );
}
