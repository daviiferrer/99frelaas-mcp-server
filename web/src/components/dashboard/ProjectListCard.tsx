import { dashboardTokens } from "../../theme/tokens";
import type { ProjectSummary } from "../../types/dashboard";
import { ProjectFlag } from "./ProjectFlag";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { SectionCard } from "./SectionCard";

type ProjectListCardProps = {
  projects: ProjectSummary[];
};

export function ProjectListCard({ projects }: ProjectListCardProps): JSX.Element {
  const recentProjects = projects.slice(0, 3);
  const recentCount = recentProjects.length;

  return (
    <SectionCard title="Meus projetos">
      <div
        style={{
          marginBottom: dashboardTokens.spacing.md,
          padding: `${dashboardTokens.spacing.sm}px ${dashboardTokens.spacing.md}px`,
          borderRadius: dashboardTokens.radius.card,
          background: dashboardTokens.color.cardBackgroundMuted,
          color: dashboardTokens.color.textPrimary,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {recentCount > 0
          ? `Mostrando os ${recentCount} projetos mais recentes do dashboard.`
          : "Sem projetos recentes disponiveis no dashboard."}
      </div>

      <div style={{ display: "grid", gap: dashboardTokens.spacing.md, minHeight: 0 }}>
        {recentProjects.length === 0 ? (
          <div
            style={{
              padding: `${dashboardTokens.spacing.sm}px 0`,
              fontSize: 14,
              lineHeight: 1.5,
              color: dashboardTokens.color.textMuted,
            }}
          >
            Nenhum projeto recente encontrado.
          </div>
        ) : null}
        {recentProjects.map((project, index) => (
          <article
            key={project.id}
            style={{
              paddingBottom: index < recentProjects.length - 1 ? dashboardTokens.spacing.md : 0,
              borderBottom:
                index < recentProjects.length - 1
                  ? `1px solid ${dashboardTokens.color.borderSubtle}`
                  : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: dashboardTokens.spacing.sm,
                flexWrap: "wrap",
              }}
            >
              <ProjectStatusBadge status={project.status} />
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {project.flags.map((flag) => (
                  <ProjectFlag key={`${project.id}-${flag}`} flag={flag} />
                ))}
              </div>
              <div
                style={{
                  color: dashboardTokens.color.brandBlue,
                  fontSize: 16,
                  fontWeight: 500,
                  lineHeight: 1.3,
                }}
              >
                {project.title}
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 14,
                lineHeight: 1.35,
                color: dashboardTokens.color.textPrimary,
              }}
            >
              {project.categoryLine} | {project.dateLine}
              {project.messagesLabel ? (
                <>
                  {" "}
                  |{" "}
                  <span style={{ color: dashboardTokens.color.textStrong, fontWeight: 700 }}>
                    {project.messagesLabel}
                  </span>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
