const normalizeNumber = (value: string): number => Number(value.replace(/\./g, "").replace(",", "."));

export type DashboardProjectSummary = {
  status?: string;
  title: string;
  url?: string;
  meta?: string;
  messagesCount?: number;
};

export type DashboardProposalSummary = {
  status?: string;
  title: string;
  url?: string;
  sentAt?: string;
  offerText?: string;
  finalOfferText?: string;
  estimatedDuration?: string;
  messagesCount?: number;
  preview?: string;
};

export type DashboardSummary = {
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
  profileCompletenessPercent?: number;
  connections?: number;
  expiringConnections?: number;
  totalPlanConnections?: number;
  nonExpiringConnections?: number;
  connectionsRenewAt?: string;
  goalsCompletedPercent?: number;
  recentProjects: DashboardProjectSummary[];
  recentProposals: DashboardProposalSummary[];
};

const decodeHtml = (value: string): string =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ccedil;/gi, "ç");

const stripTags = (value: string): string =>
  decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const normalizeHtmlText = (html: string): string => stripTags(html);

const absoluteUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://www.99freelas.com.br${url}`;
  return undefined;
};

const parseFirstNumber = (text: string, pattern: RegExp): number | undefined => {
  const match = text.match(pattern);
  return match?.[1] ? normalizeNumber(match[1]) : undefined;
};

const parseMessagesCount = (text: string): number | undefined => {
  const match = text.match(/Mensagens\s*\((\d+)\)/i);
  return match?.[1] ? Number(match[1]) : undefined;
};

const parseProfilePhotoUrl = (html: string): string | undefined => {
  const imgMatches = [...html.matchAll(/<img\b[^>]*>/gi)];
  for (const [tag] of imgMatches) {
    if (!/fotoUsuario|min|profile\/66x66/i.test(tag)) continue;
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const resolved = absoluteUrl(src);
    if (resolved && !/default\.jpg/i.test(resolved)) return resolved;
  }
  return undefined;
};

const parseProfileUrl = (html: string, accountName?: string): string | undefined => {
  const matches = [...html.matchAll(/href=["'](\/user\/[^"']+)["'][^>]*>\s*([^<]+)\s*<\/a>/gi)];
  if (accountName) {
    const exact = matches.find((match) => stripTags(match[2] ?? "").toLowerCase() === accountName.toLowerCase());
    if (exact) return absoluteUrl(exact[1]);
  }
  const ownProfile = matches.find((match) => !/default|philipe|rafael|suelen|douglas|felipe/i.test(match[1] ?? ""));
  return absoluteUrl(ownProfile?.[1] ?? matches[0]?.[1]);
};

const parseRecentProjects = (text: string): DashboardProjectSummary[] => {
  const section = text.match(/Meus projetos\s+Todos[\s\S]*?(?=Minhas propostas|$)/i)?.[0] ?? "";
  const statusNoise = /^(Aguardando aprovação|Aguardando pagamento|Concluído Parcialmente|Em andamento|Em disputa|Cancelado|Concluído|\s)+$/i;
  const itemPattern = /(Aguardando aprovação|Aguardando pagamento|Concluído Parcialmente|Em andamento|Em disputa|Cancelado|Concluído)\s+(.+?)(?=\s+(?:Aguardando aprovação|Aguardando pagamento|Concluído Parcialmente|Em andamento|Em disputa|Cancelado|Concluído)\s+|\s+\+\s*\d+\s+projetos|$)/gi;
  return [...section.matchAll(itemPattern)].slice(0, 5).map((match) => {
    const raw = (match[2]?.trim() ?? "").replace(/^(Aguardando aprovação|Aguardando pagamento|Concluído Parcialmente|Em andamento|Em disputa|Cancelado|Concluído)\s+/i, "");
    const title = raw.split(/\s+(?:Outra - |Cloud Computing|Desenvolvimento Web|Web, Mobile|Design|Marketing|Escrita|Suporte|Tradução|Vendas)/i)[0]?.trim() || raw;
    return {
      status: match[1],
      title,
      meta: raw.replace(title, "").trim() || undefined,
      messagesCount: parseMessagesCount(raw),
    };
  }).filter((item) => item.title.length > 0 && !statusNoise.test(item.title) && Boolean(item.meta || item.messagesCount));
};

const parseRecentProposals = (text: string): DashboardProposalSummary[] => {
  const section = text.match(/Minhas propostas\s+Todas[\s\S]*?(@2014-|$)/i)?.[0] ?? "";
  const itemPattern = /(Aguardando resposta|Rejeitada|Projeto Fechado|Projeto Cancelado)\s+(.+?)(?=\s+(?:Aguardando resposta|Rejeitada|Projeto Fechado|Projeto Cancelado)\s+|\s+\+\s*\d+\s+propostas|@2014-|$)/gi;
  return [...section.matchAll(itemPattern)].slice(0, 5).map((match) => {
    const raw = match[2]?.trim() ?? "";
    const title = raw.split(/\s+Enviada:\s+/i)[0]?.trim() || raw;
    return {
      status: match[1],
      title,
      sentAt: raw.match(/Enviada:\s*([^|]+?)\s*(?:\||$)/i)?.[1]?.trim(),
      offerText: raw.match(/Oferta:\s*(R\$\s*[\d.,]+)/i)?.[1]?.trim(),
      finalOfferText: raw.match(/Oferta Final:\s*(R\$\s*[\d.,]+)/i)?.[1]?.trim(),
      estimatedDuration: raw.match(/Duração estimada:\s*([^|]+?)\s*(?:\||$)/i)?.[1]?.trim(),
      messagesCount: parseMessagesCount(raw),
      preview: raw.split(/Mensagens\s*\(\d+\)/i)[1]?.replace(/Expandir.*/i, "").trim() || undefined,
    };
  }).filter((item) => item.title.length > 0 && Boolean(item.sentAt || item.offerText || item.finalOfferText || item.messagesCount));
};

export const parseConnectionsFromDashboardHtml = (html: string): number | undefined => {
  const normalizedHtml = html.replace(/&otilde;/gi, "õ").replace(/&aacute;/gi, "á").replace(/&ccedil;/gi, "ç");

  const availableMatch = normalizedHtml.match(/Conex(?:Ãµes|oes|ões)\s+dispon(?:Ã­|i|í)veis:?\s*([\d.,]+)/i);
  if (availableMatch) {
    return normalizeNumber(availableMatch[1]);
  }

  const availableLooseMatch = normalizedHtml.match(/dispon(?:Ã­|i|í)veis[^\d]{0,40}([\d.,]+)/i);
  if (availableLooseMatch) {
    return normalizeNumber(availableLooseMatch[1]);
  }

  const totalMatch = normalizedHtml.match(/total\s+de\s+([\d.,]+)\s+referentes/i);
  if (totalMatch) {
    return normalizeNumber(totalMatch[1]);
  }

  const remainingMatch = normalizedHtml.match(/([\d.,]+)\s*conex(?:Ãµes|oes|ões)\s+restantes/i);
  const nonExpirableMatch = normalizedHtml.match(/([\d.,]+)\s*conex(?:Ãµes|oes|ões)\s+n(?:Ã£|a|ã)o\s+expir(?:Ã¡|a|á)veis/i);
  if (remainingMatch || nonExpirableMatch) {
    const remaining = remainingMatch ? normalizeNumber(remainingMatch[1]) : 0;
    const nonExpirable = nonExpirableMatch ? normalizeNumber(nonExpirableMatch[1]) : 0;
    return remaining + nonExpirable;
  }

  const match = normalizedHtml.match(/(\d+)\s*conex(?:Ãµes|oes|ões)/i);
  return match ? Number(match[1]) : undefined;
};

export const parseSubscriptionFromDashboardHtml = (html: string): {
  isSubscriber?: boolean;
  planName?: string;
} => {
  const normalizedHtml = html
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&aacute;/gi, "á")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&nbsp;/gi, " ");

  const planMatch = normalizedHtml.match(/(?:plano|assinatura)[^<]{0,80}(Premium|Pro|Basic|Plus|Freelancer Pro)/i)
    ?? normalizedHtml.match(/(Freelancer Pro|Premium|Plano Pro)/i);
  const upsellMatch = normalizedHtml.match(/assine\s+um\s+de\s+nossos\s+planos|freelancer-premium|seja\s+premium/i);

  return {
    isSubscriber: planMatch ? true : upsellMatch ? false : undefined,
    planName: planMatch ? planMatch[1] : undefined,
  };
};

export const parseDashboardSummaryFromHtml = (html: string): DashboardSummary => {
  const text = normalizeHtmlText(html);
  const accountMatch = text.match(/Projetos\s+(.+?)\s+\((Freelancer|Cliente|Contratante)\)\s*▼/i);
  const accountName = accountMatch?.[1]?.trim();
  const ratingMatch = text.match(/\(([\d.,]+)\s+avaliações?\)/i);
  const planMatch = text.match(/Membro\s+([^()\s]+)|plano\s+\(([^)]+)\)/i);

  return {
    accountName,
    accountType: accountMatch?.[2]?.trim(),
    profileUrl: parseProfileUrl(html, accountName),
    photoUrl: parseProfilePhotoUrl(html),
    earningsText: text.match(/(R\$\s*[\d.,]+)\s+Seus ganhos/i)?.[1]?.trim(),
    proposalsSent: parseFirstNumber(text, /(\d+)\s+Propostas enviadas/i),
    proposalsAccepted: parseFirstNumber(text, /(\d+)\s+Propostas aceitas/i),
    profileViews: parseFirstNumber(text, /(\d+)\s+Views no perfil/i),
    ratingText: ratingMatch?.[1],
    reviewsCount: parseFirstNumber(text, /\((\d+)\s+avaliações?\)/i),
    planName: planMatch?.[1] ?? planMatch?.[2],
    profileCompletenessPercent: parseFirstNumber(text, /Perfil preenchido\s*\((\d+)%\)/i),
    connections: parseConnectionsFromDashboardHtml(html),
    expiringConnections: parseFirstNumber(text, /(\d+)\s+conexões\s+restantes/i),
    totalPlanConnections: parseFirstNumber(text, /total\s+de\s+(\d+)\s+referentes/i),
    nonExpiringConnections: parseFirstNumber(text, /(\d+)\s+conexões\s+não expiráveis/i),
    connectionsRenewAt: text.match(/renovadas no dia\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1],
    goalsCompletedPercent: parseFirstNumber(text, /Metas concluídas\s*\((\d+)%\)/i),
    recentProjects: parseRecentProjects(text),
    recentProposals: parseRecentProposals(text),
  };
};

export const parseSubscriptionStatusFromSubscriptionsHtml = (html: string): {
  isLoggedIn?: boolean;
  isSubscriber?: boolean;
  planName?: string;
  hasSubscription?: boolean;
  hasActiveSubscription?: boolean;
  emptyState?: boolean;
  source: "subscriptions-page";
} => {
  const normalizedHtml = html
    .replace(/&atilde;/gi, "Ã£")
    .replace(/&otilde;/gi, "Ãµ")
    .replace(/&aacute;/gi, "Ã¡")
    .replace(/&ccedil;/gi, "Ã§")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const emptyState = /nenhuma\s+assinatura\s+encontrada/i.test(normalizedHtml);
  const planMatch = normalizedHtml.match(/(?:plano|assinatura)[^<]{0,120}(Premium|Pro|Basic|Plus|Freelancer Pro)/i)
    ?? normalizedHtml.match(/(Freelancer Pro|Premium|Plano Pro|Plano Basic|Plano Plus)/i);
  const activeSubscriptionMatch = /assinatura\s+(ativa|vigente|renovada)|plano\s+(ativo|vigente)/i.test(normalizedHtml);

  const isSubscriber = emptyState ? false : planMatch || activeSubscriptionMatch ? true : undefined;

  return {
    isLoggedIn: undefined,
    isSubscriber,
    planName: planMatch ? planMatch[1] : undefined,
    hasSubscription: emptyState ? false : planMatch || activeSubscriptionMatch ? true : undefined,
    hasActiveSubscription: emptyState ? false : activeSubscriptionMatch || Boolean(planMatch) ? true : undefined,
    emptyState,
    source: "subscriptions-page",
  };
};
