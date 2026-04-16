export type SessionState = {
  isAuthenticated: boolean;
  cookiesPresent: string[];
  userId?: string;
  username?: string;
  lastValidatedAt?: string;
  sessionId?: string;
};

export type ClientSummary = {
  name?: string;
  username?: string;
  score?: number;
  reviewsCount?: string;
  profileUrl?: string;
  ratingText?: string;
};

export type ProjectSummary = {
  projectId: number;
  projectSlug?: string;
  title: string;
  url: string;
  summary?: string;
  tags: string[];
  categoryName?: string;
  categorySlug?: string;
  experienceLevel?: string;
  proposalsCount?: number;
  interestedCount?: number;
  publishedText?: string;
  client?: ClientSummary;
  isExclusive?: boolean;
  isUrgent?: boolean;
  isFeatured?: boolean;
  exclusiveUnlockText?: string;
  exclusiveOpensInSeconds?: number;
  exclusiveOpensAt?: string;
  page?: number;
};

export type ProjectCategoryCatalogItem = {
  slug: string;
  label: string;
};

export type ProjectCompetitor = {
  name: string;
  username?: string;
  status?: string;
  submittedAt?: string;
  isPremium?: boolean;
};

export type ProjectDetail = ProjectSummary & {
  description: string;
  bidUrl?: string;
  connectionsCost?: number;
  minimumOfferCents?: number;
  userCanBid?: boolean;
  requiresSubscriber?: boolean;
  budgetMin?: string;
  budgetMax?: string;
  timeline?: string;
  visibility?: string;
  competitors?: ProjectCompetitor[];
  clientSignals?: Record<string, string | number | boolean | undefined>;
};

export type ProposalInput = {
  projectId: number;
  projectSlug?: string;
  offerCents: number;
  durationDays: number;
  proposalText: string;
  promote?: boolean;
  dryRun?: boolean;
};

export type ConversationSummary = {
  conversationId: number;
  title?: string;
  unreadCount?: number;
  lastMessagePreview?: string;
};

export type ConversationMessage = {
  messageId?: number;
  authorType?: "user" | "client" | "system";
  text: string;
  sentAt?: string;
};

export type ProfileEditState = {
  interestCatalog?: Array<{ title: string; items: string[] }>;
  interestAreas?: Array<{ id: number; label: string }>;
  skillOptions?: Array<{ id: number; label: string }>;
  name?: string;
  nickname?: string;
  professionalTitle?: string;
  about?: string;
  professionalSummary?: string;
  interestAreaIds: number[];
  skillIds: number[];
  photoPresent: boolean;
  canChangeNickname?: boolean;
  completenessScore?: number;
  missingFields?: string[];
};

export type ProfileUpdateInput = {
  name: string;
  nickname: string;
  professionalTitle: string;
  about: string;
  professionalSummary: string;
  interestAreaIds: number[];
  skillIds: number[];
  photoPresent?: boolean;
};

export type PublicProfileHistoryItem = {
  title: string;
  url?: string;
  reviewText?: string;
  ratingText?: string;
  periodText?: string;
  rating?: number;
};

export type PublicProfileProjectItem = {
  title: string;
  url?: string;
  category?: string;
  budgetText?: string;
  status?: string;
  publishedText?: string;
  proposalsCount?: number;
  summary?: string;
};

export type PublicProfileDetail = {
  profileUrl: string;
  username?: string;
  displayName?: string;
  role?: string;
  ratingText?: string;
  rating?: number;
  reviewsCount?: number;
  projectsCompleted?: number;
  recommendations?: number;
  registeredSince?: string;
  badges?: string[];
  description?: string;
  history?: PublicProfileHistoryItem[];
  openProjects?: PublicProfileProjectItem[];
};
