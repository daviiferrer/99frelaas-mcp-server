import { HttpClient } from "../clients/httpClient";
import { readResponseText } from "../clients/responseText";
import { ProjectCategoryCatalogItem, ProjectDetail, ProjectSummary } from "../domain/models";
import { parseProjectDetailHtml } from "../parsers/projectDetailParser";
import { parseProjectListHtml } from "../parsers/projectListParser";

const CATEGORY_CATALOG: ProjectCategoryCatalogItem[] = [
  { slug: "administracao-e-contabilidade", label: "Administração & Contabilidade" },
  { slug: "advogados-e-leis", label: "Advogados & Leis" },
  { slug: "atendimento-ao-consumidor", label: "Atendimento ao Consumidor" },
  { slug: "design-e-criacao", label: "Design & Criação" },
  { slug: "educacao-e-consultoria", label: "Educação & Consultoria" },
  { slug: "engenharia-e-arquitetura", label: "Engenharia & Arquitetura" },
  { slug: "escrita", label: "Escrita" },
  { slug: "fotografia-e-audiovisual", label: "Fotografia & AudioVisual" },
  { slug: "suporte-administrativo", label: "Suporte Administrativo" },
  { slug: "traducao", label: "Tradução" },
  { slug: "vendas-e-marketing", label: "Vendas & Marketing" },
  { slug: "web-mobile-e-software", label: "Web, Mobile & Software" },
];

const projectSlugWithId = (projectSlug: string | undefined, projectId: number): string =>
  !projectSlug ? String(projectId) : projectSlug.endsWith(`-${projectId}`) ? projectSlug : `${projectSlug}-${projectId}`;

const parseCurrencyCents = (value?: string): number | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ProjectsAdapter {
  constructor(private readonly http: HttpClient) {}

  listCategories(): ProjectCategoryCatalogItem[] {
    return CATEGORY_CATALOG;
  }

  async list(input: {
    categorySlug: string;
    page: number;
    sort?: string;
    timeframe?: string;
  }): Promise<{ items: ProjectSummary[]; page: number; hasMore: boolean }> {
    const params = new URLSearchParams({
      categoria: input.categorySlug,
      page: String(input.page),
    });
    if (input.sort) params.set("sort", input.sort);
    if (input.timeframe) params.set("timeframe", input.timeframe);
    const response = await this.http.request(
      `/projects?${params.toString()}`,
    );
    const html = await readResponseText(response);
    const items = parseProjectListHtml(html, input.categorySlug, input.page);
    return {
      items,
      page: input.page,
      hasMore: items.length > 0,
    };
  }

  async listByAvailability(input: {
    categorySlug: string;
    page: number;
    maxPages?: number;
    sort?: string;
    timeframe?: string;
    delayMs?: number;
  }): Promise<{
    openItems: ProjectSummary[];
    exclusiveItems: ProjectSummary[];
    pagesScanned: number;
    nextExclusiveOpensAt?: string;
    rateLimitNote: string;
  }> {
    const maxPages = Math.min(Math.max(input.maxPages ?? 1, 1), 5);
    const delayMs = Math.max(input.delayMs ?? 1500, 1000);
    const openItems: ProjectSummary[] = [];
    const exclusiveItems: ProjectSummary[] = [];
    let pagesScanned = 0;

    for (let offset = 0; offset < maxPages; offset += 1) {
      if (offset > 0) await sleep(delayMs);
      const pageResult = await this.list({
        categorySlug: input.categorySlug,
        page: input.page + offset,
        sort: input.sort,
        timeframe: input.timeframe,
      });
      pagesScanned += 1;
      for (const item of pageResult.items) {
        if (item.isExclusive) exclusiveItems.push(item);
        else openItems.push(item);
      }
      if (!pageResult.hasMore) break;
    }

    const nextExclusiveOpensAt = exclusiveItems
      .map((item) => item.exclusiveOpensAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0];

    return {
      openItems,
      exclusiveItems,
      pagesScanned,
      nextExclusiveOpensAt,
      rateLimitNote: `Scans are capped at ${maxPages} page(s) and wait at least ${delayMs}ms between page requests.`,
    };
  }

  async get(input: { projectId: number; projectSlug: string }): Promise<ProjectDetail> {
    const slug = projectSlugWithId(input.projectSlug, input.projectId);
    const projectPath = `/project/${slug}`;
    const response = await this.http.request(projectPath);
    const html = await readResponseText(response);
    return parseProjectDetailHtml(html, {
      projectId: input.projectId,
      projectSlug: slug,
      title: `Project ${input.projectId}`,
      url: `https://www.99freelas.com.br${projectPath}`,
      tags: [],
    });
  }

  async getBidContext(input: { projectId: number; projectSlug: string }): Promise<{
    projectId: number;
    bidUrl: string;
    connectionsCost?: number;
    minimumOfferCents?: number;
    userCanBid: boolean;
    requiresSubscriber: boolean;
    flags: Record<string, boolean>;
  }> {
    const slug = projectSlugWithId(input.projectSlug, input.projectId);
    const bidPath = `/project/bid/${slug}`;
    const response = await this.http.request(bidPath);
    const html = await readResponseText(response);
    const hasPromote = /promov(er|ido)|destacar proposta/i.test(html);
    const connectionsMatch = html.match(/(\d+)\s*conex(ões|oes)/i);
    const minimumOfferMatch = html.match(/Oferta\s+m(?:ínima|inima):?\s*R\$\s*([\d.,]+)/i)
      ?? html.match(/valor\s+m(?:ínimo|inimo)[^\d]{0,40}([\d.,]+)/i);
    const requiresSubscriber = /assine\s+um\s+de\s+nossos\s+planos|freelancer-premium|projeto\s+exclusivo/i.test(html);
    const blocked = /você\s+não\s+pode\s+enviar\s+proposta|voce\s+nao\s+pode\s+enviar\s+proposta|disponível\s+para\s+assinantes|disponivel\s+para\s+assinantes/i.test(html);
    return {
      projectId: input.projectId,
      bidUrl: `https://www.99freelas.com.br${bidPath}`,
      connectionsCost: connectionsMatch ? Number(connectionsMatch[1]) : undefined,
      minimumOfferCents: parseCurrencyCents(minimumOfferMatch?.[1]),
      userCanBid: !blocked,
      requiresSubscriber,
      flags: {
        supportsPromote: hasPromote,
        isAlreadyProposed: /melhorar proposta/i.test(html),
        requiresSubscriber,
      },
    };
  }
}
