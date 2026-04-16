import { ProjectCompetitor, ProjectDetail } from "../domain/models";
import { cleanText } from "../utils/text";

const parseCurrencyCents = (value?: string): number | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
};

const extractClientSection = (html: string): string => {
  const sectionMatch =
    html.match(/<h[1-6][^>]*>\s*Cliente\s*<\/h[1-6]>([\s\S]*?)<h[1-6][^>]*>\s*Gerenciamento do projeto\s*<\/h[1-6]>/i) ??
    html.match(/<h[1-6][^>]*>\s*Cliente\s*<\/h[1-6]>([\s\S]*?)<h[1-6][^>]*>\s*Propostas\s*\(/i) ??
    html.match(/<h[1-6][^>]*>\s*Cliente\s*<\/h[1-6]>([\s\S]*?)(?:<h[1-6][^>]*>|$)/i);
  return sectionMatch?.[1] ?? "";
};

export const parseProjectDetailHtml = (
  html: string,
  fallback: Pick<ProjectDetail, "projectId" | "projectSlug" | "title" | "url" | "tags">,
): ProjectDetail => {
  let description = "";
  const descMatch = html.match(/DescriÃ§Ã£o do Projeto[\s\S]*?<\/h[1-6]>([\s\S]*?)(?:<h[1-6]|<div[^>]*class="[^"]*project-info[^"]*")/i);
  if (descMatch) {
    description = cleanText(descMatch[1]);
  } else {
    const altDesc = html.match(/<section[^>]*>([\s\S]*?)<\/section>/i)
      ?? html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (altDesc) description = cleanText(altDesc[1]);
  }

  const budgetMinMatch = html.match(/Valor MÃ­nimo[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>|Valor MÃ­nimo:[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>/i);
  const budgetMaxMatch = html.match(/Valor MÃ¡ximo[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>|Valor MÃ¡ximo:[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>/i);
  const visibilityMatch = html.match(/Visibilidade[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>|Visibilidade:[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>/i);

  const competitors: ProjectCompetitor[] = [];
  const proposerRegex = /<li[^>]*class=['"][^'"]*proposal-item[^'"]*['"][^>]*>([\s\S]*?)<\/li>|<div[^>]*class=['"][^'"]*freelancer[^'"]*['"][^>]*>([\s\S]*?)<\/div>/gi;
  let compMatch;
  while ((compMatch = proposerRegex.exec(html))) {
    const block = compMatch[1] || compMatch[2];
    const nameMatch = block.match(/<a[^>]*href=['"]\/user\/([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
    const timeMatch = block.match(/Submetido:[\s\S]*?((?:\d+ \w+ atrÃ¡s)|(?:[0-9/:\s]+))/i);
    const premiumMatch = block.match(/Premium|Freelancer Pro|Top Freelancer/i);

    if (nameMatch) {
      competitors.push({
        name: cleanText(nameMatch[2]),
        username: nameMatch[1].split("?")[0],
        submittedAt: timeMatch ? cleanText(timeMatch[1]) : undefined,
        isPremium: !!premiumMatch,
      });
    }
  }

  const bidPathMatch = html.match(/href=['"](\/project\/bid\/[^'"]+)['"]/i);
  const connectionsMatch = html.match(/(\d+)\s*conex(Ãµes|oes)/i);
  const minimumOfferMatch =
    html.match(/Oferta\s+m(?:Ã­nima|inima):?\s*R\$\s*([\d.,]+)/i) ?? html.match(/valor\s+m(?:Ã­nimo|inimo)[^\d]{0,40}([\d.,]+)/i);
  const requiresSubscriber = /assine\s+um\s+de\s+nossos\s+planos|freelancer-premium|projeto\s+exclusivo/i.test(html);
  const userCanBid = !/vocÃª\s+nÃ£o\s+pode\s+enviar\s+proposta|voce\s+nao\s+pode\s+enviar\s+proposta|disponÃ­vel\s+para\s+assinantes|disponivel\s+para\s+assinantes/i.test(html);

  const clientSection = extractClientSection(html);
  const clientLinkMatch = clientSection.match(/href=['"]\/user\/([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
  const clientRatingMatch = clientSection.match(/\((\d+(?:[.,]\d+)?)\s*-\s*(\d+)\s+avalia/i);
  const clientProjectsCompletedMatch = clientSection.match(/Projetos concluídos:\s*(\d+)/i);
  const clientRecommendationsMatch = clientSection.match(/Recomendações:\s*(\d+)/i);
  const clientRegisteredSinceMatch = clientSection.match(/Registrado desde:\s*([0-9/]+)/i);

  return {
    ...fallback,
    description,
    budgetMin: budgetMinMatch ? cleanText(budgetMinMatch[1] || budgetMinMatch[2]) : undefined,
    budgetMax: budgetMaxMatch ? cleanText(budgetMaxMatch[1] || budgetMaxMatch[2]) : undefined,
    visibility: visibilityMatch ? cleanText(visibilityMatch[1] || visibilityMatch[2]) : undefined,
    competitors: competitors.length > 0 ? competitors : undefined,
    bidUrl: bidPathMatch ? `https://www.99freelas.com.br${bidPathMatch[1]}` : undefined,
    connectionsCost: connectionsMatch ? Number(connectionsMatch[1]) : undefined,
    minimumOfferCents: parseCurrencyCents(minimumOfferMatch?.[1]),
    requiresSubscriber,
    userCanBid,
    client: clientLinkMatch
      ? {
          name: cleanText(clientLinkMatch[2]),
          username: clientLinkMatch[1].split("?")[0],
          profileUrl: `https://www.99freelas.com.br/user/${clientLinkMatch[1].split("?")[0]}`,
          score: clientRatingMatch ? Number(clientRatingMatch[1].replace(",", ".")) : undefined,
          reviewsCount: clientRatingMatch ? `${clientRatingMatch[2]} avaliação${clientRatingMatch[2] === "1" ? "" : "ões"}` : undefined,
          ratingText: clientRatingMatch ? `${clientRatingMatch[1]} - ${clientRatingMatch[2]} avaliações` : undefined,
        }
      : undefined,
    clientSignals: clientLinkMatch
      ? {
          projectsCompleted: clientProjectsCompletedMatch ? Number(clientProjectsCompletedMatch[1]) : undefined,
          recommendations: clientRecommendationsMatch ? Number(clientRecommendationsMatch[1]) : undefined,
          registeredSince: clientRegisteredSinceMatch?.[1],
        }
      : undefined,
  };
};
