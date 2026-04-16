const normalizeNumber = (value: string): number => Number(value.replace(/\./g, "").replace(",", "."));

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
