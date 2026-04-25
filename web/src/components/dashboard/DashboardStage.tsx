import { useEffect, useState } from "react";
import { dashboardTokens } from "../../theme/tokens";
import type { DashboardMetric, DashboardViewModel, ProfileSummary } from "../../types/dashboard";
import { DashboardShell } from "./DashboardShell";
import { DisconnectedStateCard } from "./DisconnectedStateCard";
import { MetricsGrid } from "./MetricsGrid";
import { MetricCard } from "./MetricCard";
import { ProfileCard } from "./ProfileCard";

type DashboardStageProps = {
  model: DashboardViewModel;
};

export function DashboardStage({ model }: DashboardStageProps): JSX.Element {
  const layout = useDashboardLayout();

  if (model.kind === "disconnected") {
    return (
      <DashboardShell>
        <DisconnectedStateCard state={model} />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div
        style={{
          display: "grid",
          gap: dashboardTokens.spacing.lg,
          minHeight: 0,
        }}
      >
        {layout.isSingleColumn ? (
          <>
            <MetricsGrid
              metrics={model.metrics}
              forceSingleColumn={layout.isMobileHost}
            />
            <ProfileCard profile={model.profile} />
          </>
        ) : (
          <DesktopDashboardBoard metrics={model.metrics} profile={model.profile} />
        )}
      </div>
    </DashboardShell>
  );
}

function DesktopDashboardBoard({
  metrics,
  profile,
}: {
  metrics: DashboardMetric[];
  profile: ProfileSummary;
}): JSX.Element {
  const [earnings, proposalsSent, proposalsAccepted, profileViews] = metrics;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gridTemplateAreas: `
          "earnings proposalsSent proposalsAccepted"
          "profileViews profile profile"
        `,
        gap: dashboardTokens.spacing.md,
        alignItems: "start",
        minHeight: 0,
      }}
    >
      {earnings ? <div style={{ gridArea: "earnings" }}><MetricCard metric={earnings} compact /></div> : null}
      {proposalsSent ? <div style={{ gridArea: "proposalsSent" }}><MetricCard metric={proposalsSent} compact /></div> : null}
      {proposalsAccepted ? <div style={{ gridArea: "proposalsAccepted" }}><MetricCard metric={proposalsAccepted} compact /></div> : null}
      <div style={{ gridArea: "profileViews" }}>
        {profileViews ? <MetricCard metric={profileViews} compact /> : null}
      </div>
      <div
        style={{
          gridArea: "profile",
          minWidth: 0,
        }}
      >
        <ProfileCard profile={profile} />
      </div>
    </div>
  );
}

type DashboardLayout = {
  isMobileHost: boolean;
  isSingleColumn: boolean;
};

function detectDashboardLayout(): DashboardLayout {
  if (typeof window === "undefined") {
    return { isMobileHost: false, isSingleColumn: false };
  }

  const openaiUserAgent =
    (window as unknown as { openai?: { userAgent?: string } }).openai
      ?.userAgent ?? "";
  const userAgent = `${openaiUserAgent} ${window.navigator.userAgent}`;
  const isMobileHost = /android|iphone|ipad|ipod|mobile/i.test(userAgent);

  return {
    isMobileHost,
    isSingleColumn: isMobileHost || window.innerWidth < 700,
  };
}

function useDashboardLayout(): DashboardLayout {
  const [layout, setLayout] = useState<DashboardLayout>(() => {
    if (typeof window === "undefined") {
      return { isMobileHost: false, isSingleColumn: false };
    }

    return detectDashboardLayout();
  });

  useEffect(() => {
    const syncLayout = (): void => {
      setLayout(detectDashboardLayout());
    };

    syncLayout();
    window.addEventListener("resize", syncLayout, { passive: true });
    return () => {
      window.removeEventListener("resize", syncLayout);
    };
  }, []);

  return layout;
}
