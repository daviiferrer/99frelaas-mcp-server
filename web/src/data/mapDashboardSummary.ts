import { metricIcons } from "../assets/iconRegistry";
import { dashboardTokens } from "../theme/tokens";
import type {
  DashboardConnectedState,
  DashboardDisconnectedState,
  DashboardSummaryToolPayload,
  DashboardViewModel,
  ProjectFlagKey,
  ProjectStatusKey,
} from "../types/dashboard";

const completedStatusTokens = ["concluido", "concluído"];
const waitingStatusTokens = ["aguardando", "resposta"];
const closedStatusTokens = ["fechado", "cancelado"];

const normalizeText = (value: string | undefined): string => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const toProjectStatus = (status: string | undefined): ProjectStatusKey => {
  const normalized = normalizeText(status);
  if (completedStatusTokens.some((token) => normalized.includes(token))) return "completed";
  if (closedStatusTokens.some((token) => normalized.includes(token))) return "closed";
  if (waitingStatusTokens.some((token) => normalized.includes(token))) return "awaitingResponse";
  return "awaitingResponse";
};

const inferFlags = (title: string, meta: string | undefined): ProjectFlagKey[] => {
  const haystack = `${title} ${meta ?? ""}`.toLowerCase();
  const flags: ProjectFlagKey[] = [];
  if (haystack.includes("urgente")) flags.push("urgent");
  if (haystack.includes("exclusiv")) flags.push("exclusive");
  if (haystack.includes("destaque")) flags.push("highlight");
  return flags;
};

const splitProjectMeta = (meta: string | undefined): { categoryLine: string; dateLine: string } => {
  if (!meta) {
    return {
      categoryLine: "Projeto recente",
      dateLine: "Sem detalhes adicionais",
    };
  }

  const [categoryLine, ...detailParts] = meta
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    categoryLine: categoryLine || "Projeto recente",
    dateLine: detailParts.join(" | ") || meta,
  };
};

const sanitizeAccountName = (
  accountName: string | undefined,
  profileUrl: string | undefined,
): string => {
  const trimmedAccountName = accountName?.trim();
  if (trimmedAccountName && !/projetos|freelancers/i.test(trimmedAccountName)) {
    return trimmedAccountName;
  }

  const slug = profileUrl?.match(/\/user\/([^/?#]+)/i)?.[1];
  if (!slug) {
    return trimmedAccountName || "Conta conectada";
  }

  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

export const createDisconnectedDashboard = (): DashboardDisconnectedState => ({
  kind: "disconnected",
  title: "Conta nao conectada",
  body:
    "Para conectar esta conta, envie na conversa os cookies autenticados do 99Freelas. A LLM usa esse envio para chamar a tool de importacao e ativar a sessao do MCP para este accountId.",
  checklist: [
    "Envie os cookies exportados da sessao autenticada",
    "A LLM importa os cookies para o MCP",
    "Depois disso o dashboard carrega automaticamente",
  ],
});

export const mapDashboardSummaryToViewModel = (
  payload: DashboardSummaryToolPayload | null | undefined,
): DashboardViewModel => {
  if (!payload?.isLoggedIn) {
    return createDisconnectedDashboard();
  }

  const dashboard = payload.dashboard;
  const profileName = sanitizeAccountName(dashboard.accountName, dashboard.profileUrl);

  const connected: DashboardConnectedState = {
    kind: "connected",
    metrics: [
      {
        key: "earnings",
        label: "Seus ganhos",
        value: dashboard.earningsText ?? "R$ 0,00",
        iconSrc: metricIcons.earnings,
        accentColor: "#94C97F",
      },
      {
        key: "sentProposals",
        label: "Propostas enviadas",
        value: String(dashboard.proposalsSent ?? 0),
        iconSrc: metricIcons.sentProposals,
        accentColor: "#C08AE4",
      },
      {
        key: "acceptedProposals",
        label: "Propostas aceitas",
        value: String(dashboard.proposalsAccepted ?? 0),
        iconSrc: metricIcons.acceptedProposals,
        accentColor: dashboardTokens.color.teal,
      },
      {
        key: "profileViews",
        label: "Views no perfil",
        value: String(dashboard.profileViews ?? 0),
        iconSrc: metricIcons.profileViews,
        accentColor: dashboardTokens.color.orange,
      },
    ],
    profile: {
      name: profileName,
      avatarSrc: dashboard.photoUrl,
      ratingText: dashboard.ratingText ?? "0.0",
      reviewCountLabel: `(${dashboard.reviewsCount ?? 0} avaliacoes)`,
      membershipLabel: payload.isSubscriber ? "Membro Pro" : dashboard.accountType ?? "Freelancer",
      membershipAccentLabel: payload.planName ?? dashboard.planName,
      isVerified: true,
      connectionsLabel: typeof payload.connections === "number" ? `${payload.connections} conexoes disponiveis` : undefined,
    },
    projects: dashboard.recentProjects.map((project, index) => {
      const { categoryLine, dateLine } = splitProjectMeta(project.meta);

      return {
        id: project.url ?? `project-${index}`,
        title: project.title,
        categoryLine,
        dateLine,
        messagesLabel:
          typeof project.messagesCount === "number" ? `Mensagens (${project.messagesCount})` : undefined,
        status: toProjectStatus(project.status),
        flags: inferFlags(project.title, project.meta),
      };
    }),
  };

  return connected;
};
