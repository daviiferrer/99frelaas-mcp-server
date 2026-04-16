import { HttpClient } from "../clients/httpClient";
import { ProposalInput } from "../domain/models";
import { safeJson } from "../parsers/responseParser";

type ProposalResponse = {
  status?: { id?: number };
  directResult?: boolean;
  message?: string;
};

const parseCurrencyCentsFromMessage = (message?: string): number | undefined => {
  if (!message) return undefined;
  const match = message.match(/R\$\s*([\d.,]+)/i);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
};

const classifyProposalFailure = (message?: string): string | undefined => {
  if (!message) return undefined;
  if (/valor\s+m(?:í|i)nimo/i.test(message)) return "MINIMUM_OFFER";
  if (/convites?|pontos\s+restantes/i.test(message)) return "INVITE_POINTS_REQUIRED";
  if (/assinante|premium|exclusivo/i.test(message)) return "SUBSCRIBER_REQUIRED";
  return "BACKEND_VALIDATION";
};

export class ProposalsAdapter {
  constructor(private readonly http: HttpClient) {}

  async send(input: ProposalInput): Promise<{
    ok: boolean;
    projectId: number;
    responseStatusId?: number;
    directResult?: boolean;
    message?: string;
    minimumOfferCents?: number;
    blockedReason?: string;
    nextAction?: string;
    redirectHint?: string;
  }> {
    if (input.dryRun) {
      return {
        ok: true,
        projectId: input.projectId,
        responseStatusId: 0,
        redirectHint: "/minhas-propostas",
      };
    }

    const response = await this.http.request("/services/project/enviarProposta", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idProjeto: input.projectId,
        isAdmin: false,
        oferta: input.offerCents / 100,
        oferta_htmlid: "oferta",
        duracaoEstimada: input.durationDays,
        duracaoEstimada_htmlid: "duracao-estimada",
        proposta: input.proposalText,
        proposta_htmlid: "proposta",
        promover: Boolean(input.promote),
        promover_htmlid: "highlight-bid",
        confirmarAcao: true,
        confirmarAcao_htmlid: "confirmar-envio-proposta",
        novaProposta: true,
        valorMinimoCents: input.offerCents,
      }),
    });

    const body = await safeJson<ProposalResponse>(response);
    const minimumOfferCents = parseCurrencyCentsFromMessage(body?.message);
    const blockedReason = classifyProposalFailure(body?.message);
    return {
      ok: response.ok && body?.status?.id === 1,
      projectId: input.projectId,
      responseStatusId: body?.status?.id,
      directResult: body?.directResult,
      message: body?.message,
      minimumOfferCents,
      blockedReason,
      nextAction: minimumOfferCents
        ? `Retry with offerCents >= ${minimumOfferCents}`
        : blockedReason === "INVITE_POINTS_REQUIRED"
          ? "Choose a non-exclusive/open project or verify account plan/points before retrying"
          : blockedReason === "SUBSCRIBER_REQUIRED"
            ? "Verify account subscription before retrying this project"
            : undefined,
    };
  }
}
