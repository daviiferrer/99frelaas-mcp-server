export type MetricKey =
  | "earnings"
  | "sentProposals"
  | "acceptedProposals"
  | "profileViews";

export type ProjectFlagKey = "highlight" | "exclusive" | "urgent";

export type ProjectStatusKey = "completed" | "awaitingResponse" | "closed";

export type DashboardMetric = {
  key: MetricKey;
  label: string;
  value: string;
  iconSrc: string;
  accentColor: string;
};

export type ProfileSummary = {
  name: string;
  avatarSrc?: string;
  ratingText: string;
  reviewCountLabel: string;
  membershipLabel: string;
  membershipAccentLabel?: string;
  isVerified?: boolean;
  connectionsLabel?: string;
};

export type ProjectSummary = {
  id: string;
  title: string;
  categoryLine: string;
  dateLine: string;
  messagesLabel?: string;
  status: ProjectStatusKey;
  flags: ProjectFlagKey[];
};

export type DashboardConnectedState = {
  kind: "connected";
  metrics: DashboardMetric[];
  profile: ProfileSummary;
  projects: ProjectSummary[];
};

export type DashboardDisconnectedState = {
  kind: "disconnected";
  title: string;
  body: string;
  checklist: string[];
};

export type DashboardViewModel =
  | DashboardConnectedState
  | DashboardDisconnectedState;

export type DashboardSummaryToolPayload = {
  isLoggedIn: boolean;
  connections?: number;
  isSubscriber?: boolean;
  planName?: string;
  dashboard: {
    accountName?: string;
    accountType?: string;
    profileUrl?: string;
    photoUrl?: string;
    earningsText?: string;
    proposalsSent?: number;
    proposalsAccepted?: number;
    profileViews?: number;
    ratingText?: string;
    reviewsCount?: number;
    planName?: string;
    recentProjects: Array<{
      status?: string;
      title: string;
      url?: string;
      meta?: string;
      messagesCount?: number;
    }>;
  };
};
