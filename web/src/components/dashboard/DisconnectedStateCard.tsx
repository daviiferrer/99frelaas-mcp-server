import { statusIcons } from "../../assets/iconRegistry";
import { dashboardTokens } from "../../theme/tokens";
import type { DashboardDisconnectedState } from "../../types/dashboard";

type DisconnectedStateCardProps = {
  state: DashboardDisconnectedState;
};

export function DisconnectedStateCard({ state }: DisconnectedStateCardProps): JSX.Element {
  return (
    <section
      style={{
        width: "100%",
        minHeight: "100%",
        background: dashboardTokens.color.cardBackground,
        border: `1px solid ${dashboardTokens.color.borderSubtle}`,
        borderRadius: dashboardTokens.radius.card,
        boxShadow: dashboardTokens.shadow.card,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "clamp(16px, 3vw, 28px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: 56,
          height: 48,
          borderRadius: dashboardTokens.radius.round,
          background: "rgba(235, 68, 90, 0.10)",
          display: "grid",
          placeItems: "center",
          marginBottom: dashboardTokens.spacing.md,
        }}
      >
        <img src={statusIcons.warning} alt="" style={{ width: 24, height: 24 }} />
      </div>
      <h1
        style={{
          margin: 0,
          maxWidth: 620,
          fontSize: "clamp(21px, 3vw, 28px)",
          lineHeight: 1.15,
          fontWeight: 700,
          color: dashboardTokens.color.textStrong,
        }}
      >
        {state.title}
      </h1>
      <p
        style={{
          margin: `${dashboardTokens.spacing.md}px 0 0`,
          maxWidth: 760,
          fontSize: 15,
          lineHeight: 1.4,
          color: dashboardTokens.color.textPrimary,
        }}
      >
        {state.body}
      </p>
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          marginTop: dashboardTokens.spacing.lg,
          padding: `${dashboardTokens.spacing.md}px ${dashboardTokens.spacing.lg}px`,
          borderRadius: dashboardTokens.radius.card,
          background: dashboardTokens.color.cardBackgroundMuted,
          border: `1px solid ${dashboardTokens.color.borderSubtle}`,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: dashboardTokens.color.textMuted,
          }}
        >
          Como conectar
        </div>
        <ul
          style={{
            margin: `${dashboardTokens.spacing.md}px 0 0`,
            paddingLeft: 20,
            textAlign: "left",
            color: dashboardTokens.color.textPrimary,
            lineHeight: 1.5,
            fontSize: 14,
          }}
        >
          {state.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
