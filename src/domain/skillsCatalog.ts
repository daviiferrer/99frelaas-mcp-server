import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodeHtmlEntities } from "../utils/text";
import { AdapterError } from "./errors";

export type SkillCatalogEntry = {
  value: number;
  text: string;
  selected?: boolean;
};

export type CuratedSkillStack = {
  key: string;
  title: string;
  description: string;
  recommendedFor: string[];
  skillIds: number[];
  skills: Array<{
    value: number;
    text: string;
  }>;
  missingSkillIds: number[];
};

const catalogCache = new Map<string, SkillCatalogEntry[]>();
const MAX_PAGE_SIZE = 100;

const curatedStackDefinitions: Array<{
  key: string;
  title: string;
  description: string;
  recommendedFor: string[];
  skillIds: number[];
}> = [
  {
    key: "frontend-ui",
    title: "Frontend e UI",
    description: "Stack para posicionar o perfil em interfaces, landing pages, produto e aplicações web modernas.",
    recommendedFor: ["frontend", "ui", "ux", "web", "produto"],
    skillIds: [1282, 7, 71, 695, 1002, 1003, 998, 618, 2127, 2062, 322, 370, 1286, 1284, 2057, 2125],
  },
  {
    key: "backend-api",
    title: "Backend e APIs",
    description: "Stack para integração, serviços, automações e entrega técnica com foco em backend.",
    recommendedFor: ["backend", "api", "automacao", "integração", "servicos"],
    skillIds: [960, 1910, 725, 54, 1686, 587, 280, 1319, 22, 72, 294, 257, 196, 276, 711, 241],
  },
  {
    key: "qa-automation",
    title: "QA e Automação",
    description: "Stack para teste de software, automação de testes e qualidade de entrega.",
    recommendedFor: ["qa", "quality", "teste", "testes", "automacao"],
    skillIds: [53, 186, 363, 1851, 1978, 1979, 1980, 1983, 398, 1140],
  },
  {
    key: "data-ai",
    title: "Dados e IA",
    description: "Stack para análise de dados, machine learning, scripts e processamento de informação.",
    recommendedFor: ["dados", "ia", "machine learning", "data", "ml"],
    skillIds: [11, 1153, 1199, 1097, 1098, 1850, 2029, 1686, 587, 54, 1863, 2128, 1250, 811],
  },
  {
    key: "mobile-apps",
    title: "Mobile e Apps",
    description: "Stack para apps mobile, interfaces responsivas e desenvolvimento multiplataforma.",
    recommendedFor: ["mobile", "app", "android", "ios"],
    skillIds: [1003, 262, 1600, 1946, 2164, 1891, 1286, 2062],
  },
  {
    key: "devops-cloud",
    title: "DevOps e Cloud",
    description: "Stack para infraestrutura, deploy, observabilidade, containers e serviços em nuvem.",
    recommendedFor: ["devops", "infra", "cloud", "docker", "kubernetes"],
    skillIds: [1319, 72, 22, 294, 257, 1601, 1834, 1858, 1893, 587, 280, 1203, 1583, 2050, 1848, 196, 276, 711],
  },
  {
    key: "marketing-growth",
    title: "Marketing e Growth",
    description: "Stack para projetos de aquisição, conteúdo, posicionamento e performance comercial.",
    recommendedFor: ["marketing", "growth", "conteudo", "seo", "social"],
    skillIds: [1648, 929, 147, 679, 1878, 80, 867, 272, 1900, 738, 52, 1903, 51, 1237, 2078, 2092],
  },
];

const catalogPaths = [
  join(process.cwd(), "data", "99freelas-skills-catalog.json"),
  resolve(__dirname, "..", "..", "data", "99freelas-skills-catalog.json"),
];

const stripBom = (value: string): string => value.replace(/^\uFEFF/, "");

const normalizeForSearch = (value: string): string =>
  decodeHtmlEntities(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const clampPageSize = (value: number): number => Math.max(1, Math.min(MAX_PAGE_SIZE, value));

export const loadSkillCatalog = (paths: string[] = catalogPaths): SkillCatalogEntry[] => {
  for (const catalogPath of paths) {
    if (catalogCache.has(catalogPath)) {
      return catalogCache.get(catalogPath) ?? [];
    }
    try {
      const raw = stripBom(readFileSync(catalogPath, "utf8"));
      const parsed = JSON.parse(raw) as Array<Partial<SkillCatalogEntry>>;
      const normalized: SkillCatalogEntry[] = parsed
        .map((entry) => ({
          value: Number(entry.value),
          text: typeof entry.text === "string" ? entry.text : "",
          selected: entry.selected,
        }))
        .filter((entry) => Number.isFinite(entry.value) && entry.text.length > 0);
      catalogCache.set(catalogPath, normalized);
      return normalized;
    } catch {
      /* ignore and try next path */
    }
  }
  throw new AdapterError("Skill catalog file not found. Expected data/99freelas-skills-catalog.json.", "SKILL_CATALOG_MISSING");
};

export const getSkillById = (skillId: number): SkillCatalogEntry | undefined =>
  loadSkillCatalog().find((entry) => entry.value === skillId);

export const getSkillCatalogPage = (input?: {
  query?: string;
  offset?: number;
  limit?: number;
}): {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset?: number;
  query?: string;
  items: SkillCatalogEntry[];
} => {
  const catalog = loadSkillCatalog();
  const query = input?.query?.trim();
  const offset = Math.max(0, input?.offset ?? 0);
  const limit = clampPageSize(input?.limit ?? 50);

  const filtered = query
    ? catalog.filter((entry) => {
        const needle = normalizeForSearch(query);
        const haystack = normalizeForSearch(entry.text);
        if (!needle) return true;
        if (haystack === needle) return true;
        if (haystack.startsWith(needle)) return true;
        return haystack.includes(needle);
      })
    : catalog;

  const items = filtered.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    total: filtered.length,
    offset,
    limit,
    hasMore: nextOffset < filtered.length,
    nextOffset: nextOffset < filtered.length ? nextOffset : undefined,
    query: query || undefined,
    items,
  };
};

export const normalizeSkillIds = (skillIds: number[]): number[] => {
  const seen = new Set<number>();
  return skillIds.filter((skillId) => {
    if (!Number.isInteger(skillId) || skillId <= 0 || seen.has(skillId)) {
      return false;
    }
    seen.add(skillId);
    return true;
  });
};

export const validateSkillIds = (skillIds: number[]): { normalized: number[]; invalidSkillIds: number[] } => {
  const normalized = normalizeSkillIds(skillIds);
  const catalog = loadSkillCatalog();
  const allowed = new Set(catalog.map((entry) => entry.value));
  const invalidSkillIds = normalized.filter((skillId) => !allowed.has(skillId));
  return { normalized, invalidSkillIds };
};

export const assertValidSkillIds = (skillIds: number[]): number[] => {
  const { normalized, invalidSkillIds } = validateSkillIds(skillIds);
  if (invalidSkillIds.length > 0) {
    throw new AdapterError(
      `Invalid skillIds: ${invalidSkillIds.join(", ")}. Use the curated skill catalog resource before calling profile_update.`,
      "INVALID_SKILL_IDS",
    );
  }
  return normalized;
};

export const getCuratedSkillStacks = (): CuratedSkillStack[] => {
  const catalog = loadSkillCatalog();
  const byId = new Map(catalog.map((entry) => [entry.value, entry]));

  return curatedStackDefinitions.map((stack) => {
    const skills = stack.skillIds
      .map((skillId) => byId.get(skillId))
      .filter((entry): entry is SkillCatalogEntry => Boolean(entry))
      .map((entry) => ({ value: entry.value, text: entry.text }));
    const missingSkillIds = stack.skillIds.filter((skillId) => !byId.has(skillId));

    return {
      ...stack,
      skills,
      missingSkillIds,
    };
  });
};

export const getSkillCatalogIndexResourceJson = (): string =>
  JSON.stringify(
    {
      total: loadSkillCatalog().length,
      curatedStacks: getCuratedSkillStacks().map((stack) => ({
        key: stack.key,
        title: stack.title,
        description: stack.description,
        recommendedFor: stack.recommendedFor,
        skillCount: stack.skills.length,
      })),
      usage: {
        defaultPath: "Use skills_getStacks first, then skills_getCatalog with query/offset/limit for targeted lookup.",
        validationRule: "skillIds must exist in the catalog and be unique integers.",
      },
    },
    null,
    2,
  );

export const getSkillCatalogPageResourceJson = (input?: {
  query?: string;
  offset?: number;
  limit?: number;
}): string =>
  JSON.stringify(
    {
      ...getSkillCatalogPage(input),
      note: "Compact page of the 99Freelas skill catalog. Use targeted queries to avoid loading the full catalog.",
    },
    null,
    2,
  );

export const getSkillStacksResourceMarkdown = (): string => {
  const stacks = getCuratedSkillStacks();
  const lines = [
    "# Curated Skill Stacks",
    "",
    "Use these as starting points when choosing `skillIds` for `profile_update`.",
    "",
  ];

  for (const stack of stacks) {
    lines.push(`## ${stack.title}`);
    lines.push(stack.description);
    if (stack.recommendedFor.length > 0) {
      lines.push(`Recommended for: ${stack.recommendedFor.join(", ")}`);
    }
    lines.push(`Skill IDs: ${stack.skills.map((skill) => `${skill.value} (${skill.text})`).join(", ")}`);
    lines.push(
      `Missing IDs in current catalog: ${stack.missingSkillIds.length > 0 ? stack.missingSkillIds.join(", ") : "none"}`,
    );
    lines.push("");
  }

  return lines.join("\n");
};

export const getSkillSelectionGuideMarkdown = (): string => {
  const lines = [
    "# Skill Selection Guide",
    "",
    "1. Start from a curated stack that matches the role you want to sell.",
    "2. Keep the profile focused: 5 to 8 skills is usually enough.",
    "3. Only send `skillIds` that exist in the catalog.",
    "4. If you need multiple stacks, keep one dominant stack and add only a few supporting skills.",
    "5. For dev profiles, prefer backend/api, frontend/ui, qa/automation, data/ai, mobile, or devops/cloud stacks.",
  ];

  return lines.join("\n");
};
