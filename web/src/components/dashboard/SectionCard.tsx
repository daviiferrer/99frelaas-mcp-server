import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

import { dashboardTokens } from "../../theme/tokens";

type SectionCardProps = PropsWithChildren<{
  title: string;
  action?: ReactNode;
  bodyStyle?: CSSProperties;
}>;

export function SectionCard({
  title,
  action,
  children,
  bodyStyle,
}: SectionCardProps): JSX.Element {
  return (
    <section
      style={{
        background: dashboardTokens.color.cardBackground,
        border: `1px solid ${dashboardTokens.color.borderSubtle}`,
        borderRadius: dashboardTokens.radius.card,
        boxShadow: dashboardTokens.shadow.card,
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: dashboardTokens.spacing.sm,
          padding: `${dashboardTokens.spacing.sm}px ${dashboardTokens.spacing.md}px`,
          background: dashboardTokens.color.cardBackgroundMuted,
          borderBottom: `1px solid ${dashboardTokens.color.borderSubtle}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            lineHeight: 1.2,
            fontWeight: 500,
            color: dashboardTokens.color.textStrong,
          }}
        >
          {title}
        </h2>
        {action}
      </header>
      <div
        style={{
          padding: dashboardTokens.spacing.lg,
          minHeight: 0,
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </section>
  );
}
