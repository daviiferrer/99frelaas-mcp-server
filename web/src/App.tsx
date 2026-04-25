import { useEffect, useState } from "react";
import { createDisconnectedDashboard, mapDashboardSummaryToViewModel } from "./data/mapDashboardSummary";
import { DashboardStage } from "./components/dashboard/DashboardStage";
import type { DashboardSummaryToolPayload, DashboardViewModel } from "./types/dashboard";

const DASHBOARD_PAYLOAD_EVENT_NAME = "99freelas-dashboard-payload";

declare global {
  interface Window {
    __99freelasDashboardPayload__?: DashboardSummaryToolPayload | null;
  }
}

export function App(): JSX.Element {
  const [model, setModel] = useState<DashboardViewModel>(() =>
    mapDashboardSummaryToViewModel(window.__99freelasDashboardPayload__ ?? createDisconnectedDashboardPayload()),
  );

  useEffect(() => {
    const syncPayload = (): void => {
      setModel(
        mapDashboardSummaryToViewModel(window.__99freelasDashboardPayload__ ?? createDisconnectedDashboardPayload()),
      );
    };

    window.addEventListener(DASHBOARD_PAYLOAD_EVENT_NAME, syncPayload);
    return () => {
      window.removeEventListener(DASHBOARD_PAYLOAD_EVENT_NAME, syncPayload);
    };
  }, []);

  return <DashboardStage model={model} />;
}

function createDisconnectedDashboardPayload(): DashboardSummaryToolPayload {
  return {
    isLoggedIn: false,
    dashboard: {
      recentProjects: [],
    },
  };
}
