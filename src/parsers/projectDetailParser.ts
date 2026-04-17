import { ProjectCompetitor, ProjectDetail } from "../domain/models";
import { cleanText, decodeHtmlEntities } from "../utils/text";

const parseCurrencyCents = (value?: string): number | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
};

const htmlToText = (value: string): string =>
  decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|section|h[1-6]|span|small)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

const extractClientSection = (html: string): string => {
  const sectionMatch =
    html.match(/<h[1-6][^>]*>\s*Cliente\s*<\/h[1-6]>([\s\S]*?)<h[1-6][^>]*>\s*Gerenciamento do projeto\s*<\/h[1-6]>/i) ??
    html.match(/<h[1-6][^>]*>\s*Cliente\s*<\/h[1-6]>([\s\S]*?)<h[1-6][^>]*>\s*Propostas\s*\(/i) ??
    html.match(/<h[1-6][^>]*>\s*Cliente\s*<\/h[1-6]>([\s\S]*?)(?:<h[1-6][^>]*>|$)/i);
  return sectionMatch?.[1] ?? "";
};

const extractDescriptionSection = (html: string): { description: string; descriptionHtml: string } => {
  const descMatch =
    html.match(/Descri(?:ÃƒÂ§ÃƒÂ£o|ção) do Projeto[\s\S]*?<\/h[1-6]>([\s\S]*?)(?:<h[1-6]|<div[^>]*class="[^"]*project-info[^"]*")/i) ??
    html.match(/Descri(?:ÃƒÂ§ÃƒÂ£o|ção) do Projeto[\s\S]*?<\/h[1-6]>([\s\S]*?)(?:<h[1-6]|$)/i);
  if (descMatch) {
    return {
      description: cleanText(descMatch[1]),
      descriptionHtml: descMatch[1],
    };
  }

  const altDesc =
    html.match(/<section[^>]*>([\s\S]*?)<\/section>/i) ??
    html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!altDesc) return { description: "", descriptionHtml: "" };
  return {
    description: cleanText(altDesc[1]),
    descriptionHtml: altDesc[1],
  };
};

const extractListItems = (sectionHtml: string): string[] =>
  Array.from(sectionHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

const parseIntValue = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseProjectDetailHtml = (
  html: string,
  fallback: Pick<ProjectDetail, "projectId" | "projectSlug" | "title" | "url" | "tags">,
): ProjectDetail => {
  const text = htmlToText(html);
  const { description, descriptionHtml } = extractDescriptionSection(html);

  const titleMatch =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    html.match(/<title>([\s\S]*?)\s*\|\s*99Freelas<\/title>/i);
  const budgetMinMatch =
    html.match(/Valor M(?:ÃƒÂ­nimo|ínimo)[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>|Valor M(?:ÃƒÂ­nimo|ínimo):[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>/i);
  const budgetMaxMatch =
    html.match(/Valor M(?:ÃƒÂ¡ximo|áximo)[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>|Valor M(?:ÃƒÂ¡ximo|áximo):[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>/i);
  const visibilityMatch = html.match(/Visibilidade[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>|Visibilidade:[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>/i);

  const budgetText = text.match(/Or(?:ÃƒÂ§|ç|c)amento:\s*([^\n|]+)/i)?.[1]?.trim();
  const publishedText =
    text.match(/Publicado:\s*([^\n|]+)/i)?.[1]?.trim() ??
    text.match(/(ontem\s+[0-9:]+|\d+\s+(?:segundos?|minutos?|horas?|dias?|semanas?|meses?|anos?)\s+atr[aá]s)/i)?.[1]?.trim();
  const remainingText =
    text.match(/Tempo restante:\s*([^\n|]+)/i)?.[1]?.trim() ??
    text.match(/(\d+\s+dias?(?:\s+e\s+\d+\s+horas?)?)/i)?.[1]?.trim();
  const proposalsCount = parseIntValue(text.match(/Propostas:\s*(\d+)/i)?.[1]);
  const interestedCount = parseIntValue(text.match(/Interessados:\s*(\d+)/i)?.[1]);
  const categoryName = text.match(/Categoria:\s*([^\n|]+)/i)?.[1]?.trim();
  const subcategoryName = text.match(/Subcategoria:\s*([^\n|]+)/i)?.[1]?.trim();
  const experienceLevel =
    text.match(/N[ií]vel(?: de experi[eê]ncia)?:\s*([^\n|]+)/i)?.[1]?.trim() ??
    text.match(/\b(Iniciante|Intermedi[aá]rio|Especialista)\b/i)?.[1]?.trim();
  const featureList = extractListItems(descriptionHtml);
  const fallbackFeatureList = featureList.length > 0
    ? featureList
    : extractListItems(html.match(/<div[^>]*class="[^"]*project-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
  const preferredTechnologies = Array.from(
    new Set(
      Array.from(text.matchAll(/\b(React|Next\.js|Node\.js|Python|PostgreSQL|MySQL|Flutter|Supabase|Vercel)\b/gi)).map(
        (match) => match[0],
      ),
    ),
  );

  const competitors: ProjectCompetitor[] = [];
  const proposerRegex =
    /<li[^>]*class=['"][^'"]*proposal-item[^'"]*['"][^>]*>([\s\S]*?)<\/li>|<div[^>]*class=['"][^'"]*freelancer[^'"]*['"][^>]*>([\s\S]*?)<\/div>/gi;
  let compMatch: RegExpExecArray | null;
  while ((compMatch = proposerRegex.exec(html))) {
    const block = compMatch[1] || compMatch[2];
    const nameMatch = block.match(/<a[^>]*href=['"]\/user\/([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
    const timeMatch = block.match(/Submetido:[\s\S]*?((?:\d+ \w+ atr(?:ÃƒÂ¡|á)s)|(?:[0-9/:\s]+))/i);
    const premiumMatch = block.match(/Premium|Freelancer Pro|Top Freelancer/i);

    if (nameMatch) {
      const username = nameMatch[1].split("?")[0];
      competitors.push({
        name: cleanText(nameMatch[2]),
        username,
        profileUrl: `https://www.99freelas.com.br/user/${username}`,
        status: premiumMatch ? cleanText(premiumMatch[0]) : undefined,
        submittedAt: timeMatch ? cleanText(timeMatch[1]) : undefined,
        isPremium: !!premiumMatch,
      });
    }
  }

  const bidPathMatch = html.match(/href=['"](\/project\/bid\/[^'"]+)['"]/i);
  const connectionsMatch = html.match(/(\d+)\s*conex(?:ÃƒÂµ|õ|o)es/i);
  const minimumOfferMatch =
    html.match(/Oferta\s+m(?:ÃƒÂ­nima|ínima|inima):?\s*R\$\s*([\d.,]+)/i) ??
    html.match(/valor\s+m(?:ÃƒÂ­nimo|ínimo|inimo)[^\d]{0,40}([\d.,]+)/i);
  const requiresSubscriber = /assine\s+um\s+de\s+nossos\s+planos|freelancer-premium|projeto\s+exclusivo/i.test(html);
  const userCanBid = !/voc(?:ÃƒÂª|ê)?\s+n(?:ÃƒÂ£|ã)o\s+pode\s+enviar\s+proposta|voce\s+nao\s+pode\s+enviar\s+proposta|dispon(?:ÃƒÂ­|í)vel\s+para\s+assinantes|disponivel\s+para\s+assinantes/i.test(
    html,
  );

  const clientSection = extractClientSection(html);
  const clientLinkMatch = clientSection.match(/href=['"]\/user\/([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
  const clientRatingMatch = clientSection.match(/\((\d+(?:[.,]\d+)?)\s*-\s*(\d+)\s+avalia/i);
  const clientProjectsCompletedMatch = clientSection.match(/Projetos\s+conclu\S*dos:\s*(\d+)/i);
  const clientRecommendationsMatch = clientSection.match(/Recomenda\S*es:\s*(\d+)/i);
  const clientRegisteredSinceMatch = clientSection.match(/Registrado desde:\s*([0-9/]+)/i);

  return {
    ...fallback,
    title: titleMatch ? cleanText(titleMatch[1]) : fallback.title,
    description,
    categoryName,
    subcategoryName,
    experienceLevel,
    proposalsCount,
    interestedCount,
    publishedText,
    remainingText,
    budgetText,
    budgetMin: budgetMinMatch ? cleanText(budgetMinMatch[1] || budgetMinMatch[2]) : undefined,
    budgetMax: budgetMaxMatch ? cleanText(budgetMaxMatch[1] || budgetMaxMatch[2]) : undefined,
    visibility: visibilityMatch ? cleanText(visibilityMatch[1] || visibilityMatch[2]) : undefined,
    preferredTechnologies: preferredTechnologies.length > 0 ? preferredTechnologies : undefined,
    featureList: fallbackFeatureList.length > 0 ? fallbackFeatureList : undefined,
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
