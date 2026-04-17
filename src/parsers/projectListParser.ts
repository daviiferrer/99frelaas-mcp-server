import { ProjectSummary } from "../domain/models";
import { cleanText, decodeHtmlEntities } from "../utils/text";

const parseDurationSeconds = (value?: string): number | undefined => {
  if (!value) return undefined;
  const hours = Number(value.match(/(\d+)\s*h/i)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)\s*m/i)?.[1] ?? 0);
  const seconds = Number(value.match(/(\d+)\s*s/i)?.[1] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : undefined;
};

export const parseProjectListHtml = (
  html: string,
  categorySlug?: string,
  page?: number,
): ProjectSummary[] => {
  const items: ProjectSummary[] = [];
  const itemRegex = /<li[^>]*class=['"][^'"]*result-item[^'"]*['"][\s\S]*?<\/li>/gi;
  const seen = new Set<number>();
  let match;

  while ((match = itemRegex.exec(html))) {
    const block = match[0];
    const blockText = decodeHtmlEntities(
      block
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|li|div|span|a|small|strong|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/\u00a0/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
    const idMatch = block.match(/data-id=['"](\d+)['"]/i);
    const nameMatch = block.match(/data-nome=['"]([^'"]+)['"]/i);
    const hrefMatch = block.match(/href=['"]((?:https?:\/\/www\.99freelas\.com\.br)?\/project\/([^"?\s'"]+))(?:\?[^'"]*)?['"]/i);
    const summaryMatch = block.match(/<p[^>]*class=['"][^'"]*item-text information[^'"]*['"][^>]*>([\s\S]*?)<\/p>/i);
    const fallbackHrefMatch = block.match(/<a[^>]+href=['"]((?:https?:\/\/www\.99freelas\.com\.br)?\/project\/([^"?\s'"]+))(?:\?[^'"]*)?['"][^>]*>([\s\S]*?)<\/a>/i);
    const exclusiveTitleMatch = block.match(/title=['"]([^'"]*Projeto\s+Exclusivo[^'"]*)['"]/i);
    if (!hrefMatch && !fallbackHrefMatch) continue;
    const rawSlug = hrefMatch?.[2] ?? fallbackHrefMatch?.[2];
    if (!rawSlug) continue;
    const idFromSlug = rawSlug.match(/-(\d+)$/);
    const projectId = Number(idMatch?.[1] ?? idFromSlug?.[1]);
    const titleFromAttr = nameMatch?.[1] ?? fallbackHrefMatch?.[3] ?? "";
    const slug = rawSlug;
    if (slug === "new") continue;
    if (!Number.isFinite(projectId) || seen.has(projectId)) continue;
    seen.add(projectId);
    const isExclusive = /projeto\s+exclusivo|flat_project_exclusive/i.test(block);
    const exclusiveUnlockText = exclusiveTitleMatch ? cleanText(exclusiveTitleMatch[1]) : undefined;
    const exclusiveOpensInSeconds = parseDurationSeconds(exclusiveUnlockText);
    const publishedText =
      blockText.match(/Publicado:\s*([^\n|]+)/i)?.[1]?.trim() ??
      blockText.match(/(\d+\s+(?:segundos?|minutos?|horas?|dias?|semanas?|meses?|anos?)\s+atr[aá]s)/i)?.[1]?.trim();
    const remainingText =
      blockText.match(/Tempo restante:\s*([^\n|]+)/i)?.[1]?.trim() ??
      blockText.match(/(\d+\s+dias?(?:\s+e\s+\d+\s+horas?)?)/i)?.[1]?.trim();
    const proposalsCount = Number(blockText.match(/Propostas:\s*(\d+)/i)?.[1]);
    const interestedCount = Number(blockText.match(/Interessados:\s*(\d+)/i)?.[1]);
    const experienceLevel =
      blockText.match(/N[ií]vel(?: de experi[eê]ncia)?:\s*([^\n|]+)/i)?.[1]?.trim() ??
      blockText.match(/\b(Iniciante|Intermedi[aá]rio|Especialista)\b/i)?.[1]?.trim();
    const subcategoryName = blockText.match(/Subcategoria:\s*([^\n|]+)/i)?.[1]?.trim();
    const clientMatch = block.match(/<a[^>]*href=['"]\/user\/([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);

    items.push({
      projectId,
      projectSlug: slug,
      title: cleanText(titleFromAttr),
      url: `https://www.99freelas.com.br/project/${slug}`,
      summary: cleanText(summaryMatch ? summaryMatch[1] : ""),
      tags: [],
      subcategoryName,
      categorySlug,
      experienceLevel,
      proposalsCount: Number.isFinite(proposalsCount) ? proposalsCount : undefined,
      interestedCount: Number.isFinite(interestedCount) ? interestedCount : undefined,
      publishedText,
      remainingText,
      client: clientMatch
        ? {
            username: clientMatch[1].split("?")[0],
            name: cleanText(clientMatch[2]),
            profileUrl: `https://www.99freelas.com.br/user/${clientMatch[1].split("?")[0]}`,
          }
        : undefined,
      isExclusive,
      isUrgent: /projeto\s+urgente|flag_project_urgent/i.test(block),
      isFeatured: /projeto\s+em\s+destaque|flag_project_destaque/i.test(block),
      exclusiveUnlockText,
      exclusiveOpensInSeconds,
      exclusiveOpensAt: exclusiveOpensInSeconds
        ? new Date(Date.now() + exclusiveOpensInSeconds * 1000).toISOString()
        : undefined,
      page,
    });
  }

  return items;
};
