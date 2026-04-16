import { decodeHtmlEntities, cleanText } from "../utils/text";
import { PublicProfileDetail, PublicProfileHistoryItem, PublicProfileProjectItem } from "../domain/models";

const toText = (html: string): string =>
  decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|section|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const parseCount = (text: string, pattern: RegExp): number | undefined => {
  const match = text.match(pattern);
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeUrl = (href: string): string => {
  if (/^https?:\/\//i.test(href)) return href;
  return `https://www.99freelas.com.br${href.startsWith("/") ? href : `/${href}`}`;
};

const parseHistory = (html: string): PublicProfileHistoryItem[] => {
  const sectionMatch = html.match(/<h[1-6][^>]*>\s*Hist(?:o|\u00f3|Ã³)rico de projetos & Avalia(?:c|\u00e7|Ã§)(?:o|\u00f5|Ãµ)es:\s*<\/h[1-6]>\s*([\s\S]*?)(?=<h[1-6][^>]*>\s*Projetos \(Aguardando Propostas\):|$)/i);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];
  const itemRegex = /<a[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
  const items: PublicProfileHistoryItem[] = [];
  const matches = Array.from(section.matchAll(itemRegex));
  matches.forEach((match, index) => {
    if (!/\/project\//i.test(match[1])) return;
    const nextMatch = matches[index + 1];
    const blockEnd = nextMatch?.index ?? section.length;
    const block = section.slice(match.index, blockEnd);
    const reviewText = block.match(/["“]([^"”]+)["”]/)?.[1];
    const ratingText = block.match(/(?:^|\n)\s*(\d+(?:[.,]\d+)?)\s*(?:\n|$)/)?.[1];
    const periodText = block.match(/([A-Za-zÀ-ÿ.]{3,}\.?\s+\d{4}\s*-\s*[A-Za-zÀ-ÿ.]{3,}\.?\s+\d{4})/i)?.[1];
    items.push({
      title: cleanText(match[2]),
      url: normalizeUrl(match[1]),
      reviewText: reviewText ? cleanText(reviewText) : undefined,
      ratingText,
      periodText: periodText ? cleanText(periodText) : undefined,
      rating: ratingText ? Number(ratingText.replace(",", ".")) : undefined,
    });
  });
  return items;
};

const parseOpenProjects = (html: string): PublicProfileProjectItem[] => {
  const sectionMatch = html.match(/<h[1-6][^>]*>\s*Projetos \(Aguardando Propostas\):\s*<\/h[1-6]>\s*([\s\S]*?)(?=<h[1-6][^>]*>\s*Perguntas Frequentes|$)/i);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];
  const itemRegex = /<a[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>[\s\S]*?<p>([\s\S]*?)<\/p>/gi;
  const items: PublicProfileProjectItem[] = [];
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(section))) {
    if (!/\/project\//i.test(match[1])) continue;
    const info = cleanText(match[3]);
    const category = info.match(/^(.+?)\s+\|\s+Or(?:c|\u00e7|Ã§)amento:/i)?.[1]?.trim();
    const status = info.match(/\|\s+Or(?:c|\u00e7|Ã§)amento:\s*([^|]+)/i)?.[1]?.trim();
    const publishedText = info.match(/\|\s+Publicado:\s*([^|]+)/i)?.[1]?.trim();
    const proposalsText = info.match(/\|\s+Propostas:\s*(\d+)/i)?.[1];
    items.push({
      title: cleanText(match[2]),
      url: normalizeUrl(match[1]),
      category,
      status,
      publishedText,
      proposalsCount: proposalsText ? Number(proposalsText) : undefined,
      summary: info,
    });
  }
  return items;
};

export const parsePublicProfileHtml = (html: string, profileUrl: string): PublicProfileDetail => {
  const text = toText(html);
  const headingMatch = text.match(/^(.+?)\s*\|\s*Contratante\s*\|\s*99Freelas/i)
    ?? text.match(/^(.+?)\s*\|\s*Freelancer\s*\|\s*99Freelas/i);
  const displayName = headingMatch?.[1]?.trim();
  const role = text.match(/\((Contratante|Freelancer)\)/i)?.[1];
  const ratingMatch = text.match(/\((\d+(?:[.,]\d+)?)\s*-\s*(\d+)\s+avalia/i);
  const projectsCompleted = parseCount(text, /Projetos conclu(?:i|\u00ed|Ã­)dos:\s*(\d+)/i);
  const recommendations = parseCount(text, /Recomenda(?:c|\u00e7|Ã§)(?:o|\u00f5|Ãµ)es:\s*(\d+)/i);
  const registeredSince = text.match(/Registrado desde:\s*([0-9/]+)/i)?.[1];
  const badges = Array.from(new Set(Array.from(html.matchAll(/description="([^"]+)"/gi)).map((match) => decodeHtmlEntities(match[1])))).filter(Boolean);

  return {
    profileUrl,
    displayName,
    role,
    ratingText: ratingMatch ? `${ratingMatch[1]} - ${ratingMatch[2]} avaliações` : undefined,
    rating: ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : undefined,
    reviewsCount: ratingMatch ? Number(ratingMatch[2]) : undefined,
    projectsCompleted,
    recommendations,
    registeredSince,
    badges: badges.length > 0 ? badges : undefined,
    description: badges.length > 0 ? badges.join(" | ") : undefined,
    history: parseHistory(html),
    openProjects: parseOpenProjects(html),
  };
};
