import { HttpClient } from "../clients/httpClient";
import { ConversationMessage, ConversationSummary, NotificationItem } from "../domain/models";
import { safeJson } from "../parsers/responseParser";
import { cleanText, decodeHtmlEntities } from "../utils/text";
import { elapsedMs, logger } from "../security/logger";

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

type NotificationsPayload = {
  items?: Array<Record<string, unknown>>;
};

export class InboxAdapter {
  constructor(private readonly http: HttpClient) {}

  async listConversations(input?: { start?: number; limit?: number }): Promise<{
    items: ConversationSummary[];
    start: number;
    limit: number;
    hasMore: boolean;
  }> {
    const startedAt = Date.now();
    const start = Math.max(input?.start ?? 0, 0);
    const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
    logger.info("inbox.list_conversations.start", { start, limit });
    const response = await this.http.request(
      `/services/user/carregarConversas?data=${encodeURIComponent(
        JSON.stringify({
          diretorio: "inbox",
          idTagPessoa: null,
          idProjeto: null,
          query: "",
          limit,
          buscarQtd: true,
          apenasNaoLidas: null,
          idPessoa: null,
          start,
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
    const conversations = items
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
    const hasMore = conversations.length >= limit;
    logger.info("inbox.list_conversations.ok", {
      count: conversations.length,
      start,
      limit,
      hasMore,
      durationMs: elapsedMs(startedAt),
    });
    return {
      items: conversations,
      start,
      limit,
      hasMore,
    };
  }

  async getMessages(input: { conversationId: number }): Promise<ConversationMessage[]> {
    const startedAt = Date.now();
    logger.info("inbox.get_messages.start", input);
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
    const messages = items
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
    logger.info("inbox.get_messages.ok", {
      conversationId: input.conversationId,
      count: messages.length,
      durationMs: elapsedMs(startedAt),
    });
    return messages;
  }

  async sendMessage(input: { conversationId: number; text: string }): Promise<{ ok: boolean }> {
    const startedAt = Date.now();
    logger.info("inbox.send_message.start", { conversationId: input.conversationId, textLength: input.text.length });
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
    const result = {
      ok:
        response.ok &&
        (body?.status?.id === 1 ||
          body?.status?.id === 0 ||
          body?.ok === true ||
          body?.success === true ||
          body === undefined ||
          Object.keys(body).length === 0),
    };
    logger.info("inbox.send_message.ok", {
      conversationId: input.conversationId,
      ok: result.ok,
      durationMs: elapsedMs(startedAt),
    });
    return result;
  }

  async getDirectoryCounts(): Promise<DirectoryCountPayload> {
    const startedAt = Date.now();
    logger.info("inbox.directory_counts.start");
    const response = await this.http.request("/services/consultas/getQtdConversasPorDiretorio");
    const body = await safeJson<DirectoryCountPayload>(response);
    const counts = body ?? {};
    logger.info("inbox.directory_counts.ok", { keys: Object.keys(counts), durationMs: elapsedMs(startedAt) });
    return counts;
  }

  async getThread(input: { conversationId: number }): Promise<InboxThread> {
    const startedAt = Date.now();
    logger.info("inbox.get_thread.start", input);
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
    const result = { conversation, messages, counts };
    logger.info("inbox.get_thread.ok", {
      conversationId: input.conversationId,
      messageCount: messages.length,
      hasConversation: Boolean(conversation),
      durationMs: elapsedMs(startedAt),
    });
    return result;
  }

  async listNotifications(input?: { limit?: number; markViewed?: boolean }): Promise<{
    items: NotificationItem[];
    limit: number;
    markViewed: boolean;
    viewed: boolean;
  }> {
    const startedAt = Date.now();
    const limit = Math.min(Math.max(input?.limit ?? 10, 1), 500);
    const markViewed = input?.markViewed ?? true;
    logger.info("notifications.list.start", { limit, markViewed });

    const response = await this.http.request(`/notifications/view?limit=${encodeURIComponent(String(limit))}`);
    const html = await response.text();
    const items: NotificationItem[] = [];
    const itemRegex = /<li[^>]*class=['"][^'"]*(?:notificacoes-list-item|notificacao-item)[^'"]*['"][^>]*>([\s\S]*?)<\/li>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(html))) {
      const block = match[1];
      const messageNode = block.match(/<p[^>]*class=['"][^'"]*notification-message[^'"]*['"][^>]*>([\s\S]*?)<\/p>/i);
      const message = cleanText(
        decodeHtmlEntities(
          (messageNode?.[1] ?? block)
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(p|div|span|a|small|strong|h[1-6])>/gi, "\n")
            .replace(/<[^>]+>/g, " "),
        ),
      );
      if (!message) continue;
      const linkMatch = block.match(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
      const timeMatch = cleanText(block.match(/(\d+\s+(?:minutos?|horas?|dias?)\s+atr[aÃ¡]s)/i)?.[1]);
      items.push({
        message,
        url: linkMatch?.[1] ? new URL(linkMatch[1], "https://www.99freelas.com.br").toString() : undefined,
        title: linkMatch?.[2] ? cleanText(linkMatch[2]) : undefined,
        createdAt: timeMatch || undefined,
      });
    }

    let viewed = false;
    if (markViewed && items.length > 0) {
      const markResponse = await this.http.request("/services/user/marcarTodasAsNotificacoesComoVisualizadas?visualizada=true", {
        method: "POST",
      });
      viewed = markResponse.ok;
    }

    logger.info("notifications.list.ok", {
      count: items.length,
      limit,
      markViewed,
      viewed,
      durationMs: elapsedMs(startedAt),
    });

    return { items, limit, markViewed, viewed };
  }
}
