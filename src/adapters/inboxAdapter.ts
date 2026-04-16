import { HttpClient } from "../clients/httpClient";
import { ConversationMessage, ConversationSummary } from "../domain/models";
import { safeJson } from "../parsers/responseParser";

type ConversationsPayload =
  | Array<Record<string, unknown>>
  | { conversas?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> };

type MessagesPayload =
  | Array<Record<string, unknown>>
  | { mensagens?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> };

type DirectoryCountPayload = Record<string, number | string>;

type InboxThread = {
  conversation: Record<string, unknown> | undefined;
  messages: ConversationMessage[];
  counts: DirectoryCountPayload;
};

export class InboxAdapter {
  constructor(private readonly http: HttpClient) {}

  async listConversations(): Promise<ConversationSummary[]> {
    const response = await this.http.request(
      `/services/user/carregarConversas?data=${encodeURIComponent(
        JSON.stringify({
          diretorio: "inbox",
          idTagPessoa: null,
          idProjeto: null,
          query: "",
          limit: 20,
          buscarQtd: true,
          apenasNaoLidas: null,
          idPessoa: null,
          start: 0,
          idConversa: null,
          dhCorte: 0,
        }),
      )}`,
    );
    const body = await safeJson<ConversationsPayload>(response);
    const items = Array.isArray(body)
      ? body
      : body?.conversas ??
        body?.items ??
        (body as { result?: { registros?: Array<Record<string, unknown>> } })?.result?.registros ??
        [];
    return items
      .map((item) => ({
        conversationId: Number(item.conversationId ?? item.id ?? item.idConversa),
        title: String(item.title ?? item.titulo ?? item.nomeProjeto ?? item.nome ?? "").trim() || undefined,
        unreadCount: Number(item.unreadCount ?? item.naoLidas ?? item.qtdNaoLidas ?? 0) || undefined,
        lastMessagePreview:
          String(
            item.lastMessagePreview ??
              (item.ultimaMensagem as Record<string, unknown> | undefined)?.descricaoCurta ??
              item.ultimaMensagem ??
              item.preview ??
              "",
          ).trim() || undefined,
      }))
      .filter((item) => Number.isFinite(item.conversationId));
  }

  async getMessages(input: { conversationId: number }): Promise<ConversationMessage[]> {
    const response = await this.http.request(
      `/services/consultas/listarMensagensConversa?data=${encodeURIComponent(
        JSON.stringify({
          idConversa: input.conversationId,
          reverse: true,
          visualizar: true,
          dhCorte: 0,
          start: 0,
          limit: 100,
        }),
      )}`,
    );
    const body = await safeJson<MessagesPayload>(response);
    const items = Array.isArray(body)
      ? body
      : body?.mensagens ??
        body?.items ??
        (body as { result?: { mensagensDaConversa?: Array<Record<string, unknown>> } })?.result?.mensagensDaConversa ??
        [];
    return items
      .map((item) => {
        const rawAuthorType = String(item.authorType ?? item.autorTipo ?? item.tipoAutor ?? "");
        const authorType: ConversationMessage["authorType"] =
          rawAuthorType === "user" || rawAuthorType === "client" || rawAuthorType === "system"
            ? rawAuthorType
            : undefined;
        return {
          messageId: Number(item.messageId ?? item.id ?? item.idMensagem) || undefined,
          authorType,
          text: String(item.text ?? item.texto ?? item.mensagem ?? item.message ?? "").trim(),
          sentAt: item.sentAt ?? item.enviadaEm ?? item.dataEnvio ?? item.dhCriacao
            ? String(item.sentAt ?? item.enviadaEm ?? item.dataEnvio ?? item.dhCriacao)
            : undefined,
        };
      })
      .filter((item) => item.text.length > 0);
  }

  async sendMessage(input: { conversationId: number; text: string }): Promise<{ ok: boolean }> {
    const response = await this.http.request("/services/user/enviarMensagemConversa", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams({
        data: encodeURIComponent(
          JSON.stringify({
            idConversa: input.conversationId,
            texto: input.text,
          }),
        ),
      }).toString(),
    });
    const body = await safeJson<any>(response);
    return {
      ok:
        response.ok &&
        (body?.status?.id === 1 ||
          body?.status?.id === 0 ||
          body?.ok === true ||
          body?.success === true ||
          body === undefined ||
          Object.keys(body).length === 0),
    };
  }

  async getDirectoryCounts(): Promise<DirectoryCountPayload> {
    const response = await this.http.request("/services/consultas/getQtdConversasPorDiretorio");
    const body = await safeJson<DirectoryCountPayload>(response);
    return body ?? {};
  }

  async getThread(input: { conversationId: number }): Promise<InboxThread> {
    const [messagesResponse, counts] = await Promise.all([
      this.http.request(
        `/services/consultas/listarMensagensConversa?data=${encodeURIComponent(
          JSON.stringify({
            idConversa: input.conversationId,
            reverse: true,
            visualizar: true,
            dhCorte: 0,
            start: 0,
            limit: 100,
          }),
        )}`,
      ),
      this.getDirectoryCounts(),
    ]);
    const body = await safeJson<any>(messagesResponse);
    const messagesBody = Array.isArray(body)
      ? body
      : body?.mensagensDaConversa ??
        body?.mensagens ??
        body?.items ??
        body?.result?.mensagensDaConversa ??
        [];
    const messages = messagesBody
      .map((item: Record<string, unknown>) => {
        const rawAuthorType = String(item.authorType ?? item.autorTipo ?? item.tipoAutor ?? "");
        const authorType: ConversationMessage["authorType"] =
          rawAuthorType === "user" || rawAuthorType === "client" || rawAuthorType === "system"
            ? rawAuthorType
            : undefined;
        return {
          messageId: Number(item.messageId ?? item.id ?? item.idMensagem) || undefined,
          authorType,
          text: String(item.text ?? item.texto ?? item.mensagem ?? item.message ?? "").trim(),
          sentAt: item.sentAt ?? item.enviadaEm ?? item.dataEnvio ?? item.dhCriacao
            ? String(item.sentAt ?? item.enviadaEm ?? item.dataEnvio ?? item.dhCriacao)
            : undefined,
        };
      })
      .filter((item: ConversationMessage) => item.text.length > 0);

    const conversation = body?.result?.conversa ?? body?.conversa ?? body?.result?.conversaPessoa ?? body?.conversaPessoa;
    return { conversation, messages, counts };
  }
}
