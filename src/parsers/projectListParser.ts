import { ProjectSummary } from "../domain/models";
import { cleanText } from "../utils/text";

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

    items.push({
      projectId,
      projectSlug: slug,
      title: cleanText(titleFromAttr),
      url: `https://www.99freelas.com.br/project/${slug}`,
      summary: cleanText(summaryMatch ? summaryMatch[1] : ""),
      tags: [],
      categorySlug,
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
