import { dashboardTokens } from "../../theme/tokens";
import type { ProjectStatusKey } from "../../types/dashboard";

const statusMap: Record<ProjectStatusKey, { label: string; background: string }> = {
  completed: { label: "Concluido", background: dashboardTokens.color.success },
  awaitingResponse: { label: "Aguardando resposta", background: dashboardTokens.color.warning },
  closed: { label: "Projeto fechado", background: dashboardTokens.color.danger },
};

type ProjectStatusBadgeProps = {
  status: ProjectStatusKey;
};

export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps): JSX.Element {
  const config = statusMap[status];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 32,
        padding: "0 12px",
        borderRadius: dashboardTokens.radius.pill,
        background: config.background,
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {config.label}
    </span>
  );
}
