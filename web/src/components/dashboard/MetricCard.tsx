import type { DashboardMetric } from "../../types/dashboard";
import { dashboardTokens } from "../../theme/tokens";

type MetricCardProps = {
  metric: DashboardMetric;
  compact?: boolean;
};

export function MetricCard({ metric, compact = false }: MetricCardProps): JSX.Element {
  return (
    <article
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? dashboardTokens.spacing.sm : dashboardTokens.spacing.md,
        background: dashboardTokens.color.cardBackground,
        border: `1px solid ${dashboardTokens.color.borderSubtle}`,
        borderRadius: dashboardTokens.radius.card,
        boxShadow: dashboardTokens.shadow.card,
        padding: compact
          ? `${dashboardTokens.spacing.sm}px ${dashboardTokens.spacing.md}px`
          : `${dashboardTokens.spacing.md}px ${dashboardTokens.spacing.lg}px`,
        minHeight: compact ? 78 : 96,
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <img
        src={metric.iconSrc}
        alt=""
        style={{
          width: 60,
          height: 60,
          flexShrink: 0,
          display: "block",
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: compact ? "clamp(19px, 3.1vw, 20px)" : 20,
            lineHeight: 1.1,
            fontWeight: 500,
            color: dashboardTokens.color.textStrong,
            whiteSpace: "nowrap",
          }}
        >
          {metric.value}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: compact ? "clamp(13px, 2.2vw, 15px)" : 16,
            lineHeight: 1.2,
            color: dashboardTokens.color.textPrimary,
            overflowWrap: "normal",
            wordBreak: "normal",
            textWrap: "balance",
          }}
        >
          {metric.label}
        </div>
      </div>
    </article>
  );
}
