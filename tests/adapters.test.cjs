const test = require("node:test");
const assert = require("node:assert/strict");

class FakeHttpClient {
  constructor(responses) {
    this.responses = responses;
    this.calls = [];
  }
  async request(path, init = {}) {
    this.calls.push({ path, init });
    const next = this.responses.shift();
    if (!next) throw new Error("No response queued");
    if (typeof next.arrayBuffer === "function") {
      return next;
    }
    const text = typeof next.text === "function" ? await next.text() : "";
    const encoder = new TextEncoder();
    return {
      ...next,
      headers: next.headers ?? { get: () => null },
      arrayBuffer: async () => encoder.encode(text).buffer,
    };
  }
}

const htmlResponse = (html, url = "https://www.99freelas.com.br/x", ok = true) => ({
  ok,
  url,
  text: async () => html,
  headers: { get: () => null },
});

test("projects adapter", async () => {
  const { ProjectsAdapter } = require("../dist/adapters/projectsAdapter.js");
  const http = new FakeHttpClient([
    htmlResponse(`
      <li class="result-item" data-id="10" data-nome="Title">
        <h1 class="title"><a href="/project/abc-10?fs=t">Title</a></h1>
        <p class="item-text information">Resumo</p>
      </li>
      <li class="result-item" data-id="11" data-nome="Exclusive">
        <div class="flags"><img src="/img/flat_project_exclusive.png" alt="Projeto exclusivo" title="Projeto Exclusivo. Ficará disponível para todos os profissionais em 2h13m44s." /></div>
        <h1 class="title"><a href="/project/exclusive-11?fs=t">Exclusive</a></h1>
        <p class="item-text information">Resumo VIP</p>
      </li>
    `),
    htmlResponse(`<div class="project-description">Desc</div><a href="/project/bid/abc-10">Bid</a>1 conexoes<h2>Cliente</h2><a href="/user/joao">Joao Silva</a>(5.0 - 1 avaliação)Projetos concluídos: 1 | Recomendações: 2 | Registrado desde: 24/03/2026`),
    htmlResponse(`promover proposta 3 conexoes Oferta minima: R$ 50,00`),
    htmlResponse(`
      <li class="result-item" data-id="12" data-nome="Open">
        <div class="flags"><img src="/img/flag_project_urgent.png" alt="Projeto urgente" /></div>
        <h1 class="title"><a href="/project/open-12?fs=t">Open</a></h1>
      </li>
      <li class="result-item" data-id="13" data-nome="Exclusive B">
        <div class="flags"><img src="/img/flat_project_exclusive.png" alt="Projeto exclusivo" title="Projeto Exclusivo. Ficará disponível para todos os profissionais em 1h01m01s." /></div>
        <h1 class="title"><a href="/project/exclusive-b-13?fs=t">Exclusive B</a></h1>
      </li>
    `),
    htmlResponse(""),
  ]);
  const adapter = new ProjectsAdapter(http);
  const categories = adapter.listCategories();
  assert.equal(categories[0].slug, "administracao-e-contabilidade");
  const list = await adapter.list({ categorySlug: "web-mobile-e-software", page: 1, sort: "newest", timeframe: "24h" });
  assert.equal(list.page, 1);
  assert.equal(Array.isArray(list.items), true);
  assert.equal(list.items[0].projectSlug, "abc-10");
  assert.equal(list.items[1].isExclusive, true);
  assert.equal(list.items[1].exclusiveOpensInSeconds, 8024);
  assert.match(http.calls[0].path, /\/projects\?categoria=web-mobile-e-software&page=1&sort=newest&timeframe=24h/);
  const detail = await adapter.get({ projectId: 10, projectSlug: "abc" });
  assert.equal(detail.projectId, 10);
  assert.equal(detail.client.username, "joao");
  assert.equal(detail.client.profileUrl, "https://www.99freelas.com.br/user/joao");
  assert.equal(detail.clientSignals.projectsCompleted, 1);
  const bid = await adapter.getBidContext({ projectId: 10, projectSlug: "abc" });
  assert.equal(bid.projectId, 10);
  assert.equal(bid.flags.supportsPromote, true);
  const availability = await adapter.listByAvailability({ categorySlug: "web-mobile-e-software", page: 1, maxPages: 2, delayMs: 1000 });
  assert.equal(availability.openItems[0].projectId, 12);
  assert.equal(availability.exclusiveItems[0].projectId, 13);
  assert.equal(availability.pagesScanned, 2);
  assert.equal(http.calls[1].path, "/project/abc-10");
  assert.equal(http.calls[2].path, "/project/bid/abc-10");
  assert.match(http.calls[3].path, /\/projects\?categoria=web-mobile-e-software&page=1/);
});

test("proposals adapter", async () => {
  const { ProposalsAdapter } = require("../dist/adapters/proposalsAdapter.js");
  const http = new FakeHttpClient([
    {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ status: { id: 1 }, directResult: false }),
    },
  ]);
  const adapter = new ProposalsAdapter(http);
  const dry = await adapter.send({
    projectId: 1,
    projectSlug: "abc",
    offerCents: 10000,
    durationDays: 5,
    proposalText: "texto suficiente para proposta",
    dryRun: true,
  });
  assert.equal(dry.ok, true);
  const sent = await adapter.send({
    projectId: 1,
    projectSlug: "abc",
    offerCents: 10000,
    durationDays: 5,
    proposalText: "texto suficiente para proposta",
    dryRun: false,
  });
  assert.equal(sent.responseStatusId, 1);
  assert.equal(http.calls[0].path, "/services/project/enviarProposta");
  assert.equal(http.calls[0].init.headers["content-type"], "application/json");
});

test("proposals adapter classifies backend validation failures", async () => {
  const { ProposalsAdapter } = require("../dist/adapters/proposalsAdapter.js");
  const messages = [
    "O valor minimo para propostas deste projeto e de R$ 50,00.",
    "Voce nao possui convites ou pontos restantes.",
    "Projeto exclusivo para assinante premium.",
    "Validacao generica.",
    undefined,
  ];
  const http = new FakeHttpClient(messages.map((message) => ({
    ok: true,
    headers: { get: () => null },
    text: async () => JSON.stringify({ status: { id: 0 }, message }),
  })));
  const adapter = new ProposalsAdapter(http);
  const base = {
    projectId: 1,
    offerCents: 1000,
    durationDays: 1,
    proposalText: "texto suficiente para proposta",
  };
  assert.equal((await adapter.send(base)).minimumOfferCents, 5000);
  assert.equal((await adapter.send(base)).blockedReason, "INVITE_POINTS_REQUIRED");
  assert.equal((await adapter.send(base)).blockedReason, "SUBSCRIBER_REQUIRED");
  assert.equal((await adapter.send(base)).blockedReason, "BACKEND_VALIDATION");
  assert.equal((await adapter.send(base)).blockedReason, undefined);
});

test("inbox adapter", async () => {
  const { InboxAdapter } = require("../dist/adapters/inboxAdapter.js");
  const http = new FakeHttpClient([
    {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify([{ idConversa: 11, titulo: "Chat A", qtdNaoLidas: 2 }]),
    },
    {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify([{ idMensagem: 99, mensagem: "OlA time", tipoAutor: "client" }]),
    },
    { ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ status: { id: 1 } }) },
    { ok: true, headers: { get: () => null }, text: async () => JSON.stringify({}) },
    { ok: false, headers: { get: () => null }, text: async () => JSON.stringify({ ok: false }) },
    {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ result: { mensagensDaConversa: [{ idMensagem: 5, mensagem: "thread", tipoAutor: "system" }], conversa: { idConversa: 11 } } }),
    },
    { ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ inbox: "1" }) },
  ]);
  const adapter = new InboxAdapter(http);
  const conv = await adapter.listConversations();
  assert.equal(conv.items[0].conversationId, 11);
  assert.equal(conv.items[0].unreadCount, 2);
  assert.equal(conv.start, 0);
  assert.equal(conv.limit, 20);
  const msgs = await adapter.getMessages({ conversationId: 11 });
  assert.equal(msgs[0].text, "OlA time");
  const sent = await adapter.sendMessage({ conversationId: 11, text: "oi" });
  assert.equal(sent.ok, true);
  const emptyBodyOk = await adapter.sendMessage({ conversationId: 11, text: "ok vazio" });
  assert.equal(emptyBodyOk.ok, true);
  const failed = await adapter.sendMessage({ conversationId: 11, text: "falha" });
  assert.equal(failed.ok, false);
  const thread = await adapter.getThread({ conversationId: 11 });
  assert.equal(thread.messages[0].text, "thread");
  assert.equal(thread.counts.inbox, "1");
  assert.equal(http.calls[0].path.includes("/services/user/carregarConversas?data="), true);
  assert.equal(http.calls[1].path.includes("/services/consultas/listarMensagensConversa?data="), true);
  assert.equal(http.calls[2].path, "/services/user/enviarMensagemConversa");
  assert.equal(http.calls[2].init.headers["content-type"], "application/x-www-form-urlencoded; charset=UTF-8");
});

test("inbox adapter supports thread payload fallback arrays", async () => {
  const { InboxAdapter } = require("../dist/adapters/inboxAdapter.js");
  const http = new FakeHttpClient([
    {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify([{ id: 1, message: "array msg", authorType: "client", sentAt: "hoje" }, { id: 2, message: "" }]),
    },
    { ok: true, headers: { get: () => null }, text: async () => JSON.stringify({}) },
    {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ mensagens: [{ id: 3, texto: "mensagens msg", autorTipo: "user" }], conversaPessoa: { id: 3 } }),
    },
    { ok: true, headers: { get: () => null }, text: async () => JSON.stringify({}) },
    {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ items: [{ id: 4, texto: "items msg", tipoAutor: "invalid" }] }),
    },
    { ok: true, headers: { get: () => null }, text: async () => JSON.stringify({}) },
  ]);
  const adapter = new InboxAdapter(http);
  assert.equal((await adapter.getThread({ conversationId: 1 })).messages[0].authorType, "client");
  assert.equal((await adapter.getThread({ conversationId: 2 })).conversation.id, 3);
  assert.equal((await adapter.getThread({ conversationId: 3 })).messages[0].authorType, undefined);
});

test("inbox adapter supports wrapped payloads", async () => {
  const { InboxAdapter } = require("../dist/adapters/inboxAdapter.js");
  const http = new FakeHttpClient([
    {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ conversas: [{ conversationId: 21, title: "Chat B", preview: "ultima" }] }),
    },
    {
      ok: true,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          mensagens: [
            { id: 1, message: "primeira", authorType: "invalid" },
            { id: 2, message: "segunda", authorType: "user", sentAt: "2026-04-15T10:00:00Z" },
          ],
        }),
    },
  ]);
  const adapter = new InboxAdapter(http);
  const conversations = await adapter.listConversations();
  assert.equal(conversations.items[0].conversationId, 21);
  assert.equal(conversations.items[0].lastMessagePreview, "ultima");
  const messages = await adapter.getMessages({ conversationId: 21 });
  assert.equal(messages[0].authorType, undefined);
  assert.equal(messages[1].authorType, "user");
  assert.equal(messages[1].sentAt, "2026-04-15T10:00:00Z");
});

test("profile adapter", async () => {
  const { ProfileAdapter } = require("../dist/adapters/profileAdapter.js");
  const http = new FakeHttpClient([
    htmlResponse(`
      <h2 class="item-title">Administração &amp; Contabilidade <img src="x"></h2>
      <div class="items">
        <div><label for="chk101"><input id="chk101" type="checkbox" /><span>Análise de Dados &amp; Estatística</span></label></div>
        <div><label for="chk103"><input id="chk103" type="checkbox" /><span>Contabilidade</span></label></div>
        <div><label for="chk101"><input id="chk101" type="checkbox" /><span>Duplicado</span></label></div>
      </div>
      <h2 class="item-title">Vendas &amp; Marketing <img src="x"></h2>
      <div class="items">
        <div><label for="chk41"><input id="chk41" type="checkbox" checked /><span>Marketing Digital</span></label></div>
      </div>
      <input id="nome" value="&lt;Carlos Vieira&gt;" />
      <input id="nickname" value="carlos-vieira-mkt" />
      <input id="titulo-profissional" value="Freelancer de Marketing" />
      <textarea id="descricao">Sobre &#39;&lt;mim&gt;</textarea>
      <textarea id="resumo-experiencia-profissional">Experiência</textarea>
      <select id="habilidades">
        <option value="1648">Marketing Digital</option>
        <option value="1237">Copywriting</option>
        <option value="1648">Marketing Digital</option>
      </select>
      <button>Remover foto</button>
    `),
    htmlResponse(`
      <h2 class="item-title">AdministraÃ§Ã£o &amp; Contabilidade <img src="x"></h2>
      <div class="items">
        <div><label for="chk101"><input id="chk101" type="checkbox" /><span>AnÃ¡lise de Dados &amp; EstatÃ­stica</span></label></div>
      </div>
      <input id="nome" value="&lt;Carlos Vieira&gt;" />
      <input id="nickname" value="carlos-vieira-mkt" />
      <input id="titulo-profissional" value="Freelancer de Marketing" />
      <textarea id="descricao">Sobre &#39;&lt;mim&gt;</textarea>
      <textarea id="resumo-experiencia-profissional">ExperiÃªncia</textarea>
      <select id="habilidades"><option value="1648">Marketing Digital</option><option value="1648">Marketing Digital</option></select>
      <button>Remover foto</button>
    `),
    {
      ok: true,
      url: "https://www.99freelas.com.br/dashboard",
      headers: { get: () => null },
      text: async () => JSON.stringify({ status: { id: 1 } }),
    },
  ]);
  const adapter = new ProfileAdapter(http);
  const catalog = await adapter.getInterestCatalog();
  assert.equal(catalog[0].items[0], "Análise de Dados & Estatística");
  const state = await adapter.getEditState();
  assert.equal(state.interestCatalog[0].title, "AdministraÃ§Ã£o & Contabilidade");
  assert.equal(state.nickname, "carlos-vieira-mkt");
  assert.equal(state.photoPresent, true);
  assert.equal(state.interestAreaIds.includes(101), true);
  assert.equal(state.interestAreas[0].label, "AnÃ¡lise de Dados & EstatÃ­stica");
  assert.equal(state.skillIds.includes(1648), true);
  assert.equal(state.skillOptions[0].label, "Marketing Digital");
  assert.equal(typeof state.completenessScore, "number");
  assert.equal(Array.isArray(state.missingFields), true);
  const result = await adapter.update({
    name: "Carlos Vieira",
    nickname: "carlos-vieira-mkt",
    professionalTitle: "Freelancer de Marketing",
    about: "Sobre mim",
    professionalSummary: "Experiência",
    interestAreaIds: [101, 155],
    skillIds: [1648, 1237],
  });
  assert.equal(result.ok, true);
  assert.equal(http.calls[0].path, "/profile/edit");
  assert.equal(http.calls[2].path, "/services/user/editarPerfil");
  assert.equal(http.calls[2].init.headers["content-type"], "application/json; charset=UTF-8");
  const payload = JSON.parse(http.calls[2].init.body);
  assert.equal(payload.nome_htmlid, "nome");
  assert.equal(payload.areasDeInteresse_htmlid, "areas-interesse");
  assert.equal(payload.habilidades_htmlid, "habilidades");
  assert.deepEqual(payload.habilidades, [1648, 1237]);
});

test("profile adapter prioritizes selected ids over full option catalogs", async () => {
  const { ProfileAdapter } = require("../dist/adapters/profileAdapter.js");
  const http = new FakeHttpClient([
    htmlResponse(`
      <input id="nome" value="A" />
      <input id="nickname" value="b" />
      <input id="titulo-profissional" value="c" />
      <textarea id="descricao">d</textarea>
      <textarea id="resumo-experiencia-profissional">e</textarea>

      <label for="chk10"><input id="chk10" type="checkbox" /></label>
      <label for="chk20"><input id="chk20" type="checkbox" checked /></label>

      <select id="habilidades">
        <option value="1">Skill One</option>
        <option value="2">Skill Two</option>
      </select>
      <script>
        var habilidadesDoFreelancer = [];
        habilidadesDoFreelancer.push(parseInt('2'));
      </script>
    `),
  ]);
  const adapter = new ProfileAdapter(http);
  const state = await adapter.getEditState();
  assert.deepEqual(state.interestAreaIds, [20]);
  assert.deepEqual(state.skillIds, [2]);
  assert.equal(state.skillOptions.length, 2);
});

test("profile adapter rejects invalid skill ids", async () => {
  const { ProfileAdapter } = require("../dist/adapters/profileAdapter.js");
  const http = new FakeHttpClient([]);
  const adapter = new ProfileAdapter(http);
  await assert.rejects(
    () =>
      adapter.update({
        name: "Carlos Vieira",
        nickname: "carlos-vieira-mkt",
        professionalTitle: "Freelancer",
        about: "Sobre mim",
        professionalSummary: "Resumo",
        interestAreaIds: [],
        skillIds: [999999],
      }),
    /Invalid skillIds/,
  );
  assert.equal(http.calls.length, 0);
});

test("profile adapter handles missing fields and html entity branches", async () => {
  const { ProfileAdapter } = require("../dist/adapters/profileAdapter.js");
  const http = new FakeHttpClient([
    htmlResponse(`
      Clique ou arraste a sua foto aqui
      VocÃª sÃ³ pode alterar o nickname uma vez
      <h2 class="item-title">&lt;Marketing&gt;</h2><div class="items"><label><span>&quot;SEO&#39;s&quot;</span></label></div>
      <label><span>Sem for</span><input id="chk201" type="checkbox" /></label>
    `),
    {
      ok: true,
      url: "https://www.99freelas.com.br/profile/edit",
      headers: { get: () => null },
      text: async () => JSON.stringify({ result: { status: { id: 2 }, message: "ok result" } }),
    },
  ]);
  const adapter = new ProfileAdapter(http);
  const state = await adapter.getEditState();
  assert.equal(state.photoPresent, false);
  assert.equal(state.canChangeNickname, false);
  assert.match(state.interestAreas[0].label, /Sem for/);
  assert.ok(state.missingFields.includes("name"));
  const updated = await adapter.update({
    name: "A",
    nickname: "b",
    professionalTitle: "c",
    about: "d",
    professionalSummary: "e",
    interestAreaIds: [],
    skillIds: [],
    photoPresent: false,
  });
  assert.equal(updated.responseStatusId, 2);
  assert.equal(updated.redirectHint, undefined);
  assert.equal(updated.message, "ok result");
});

test("profile adapter public profile", async () => {
  const { ProfileAdapter } = require("../dist/adapters/profileAdapter.js");
  const http = new FakeHttpClient([
    htmlResponse(`
      <h1>Fábio p. | Contratante | 99Freelas</h1>
      <p>(5.0 - 1 avaliação)</p>
      <p>Projetos concluídos: 1 | Recomendações: 1 | Registrado desde: 24/03/2026</p>
      <h2>Histórico de projetos & Avaliações:</h2>
      <a href="/project/clipador-profissional-para-reels-tiktok-e-shorts-com-foco-em-viralizacao-matheus-b-739916">Clipador profissional para reels, TikTok e shorts com foco em viralização - Matheus B.</a>
      <p>"Ótimo cliente! Foi claro em todas as informações!"</p>
      <p>5.0</p>
      <p>mar. 2026 - mar. 2026</p>
      <h2>Projetos (Aguardando Propostas):</h2>
      <a href="/project/gestao-de-conteudo-e-crescimento-digital-para-empresa-744497">Gestão de conteúdo e crescimento digital para empresa</a>
      <p>Gestão de Mídias Sociais | Orçamento: Aberto | Publicado: 2 dias atrás | Propostas: 51</p>
    `),
  ]);
  const adapter = new ProfileAdapter(http);
  const profile = await adapter.getPublicProfile({ username: "Prkvit" });
  assert.equal(profile.displayName, "Fábio p.");
  assert.equal(profile.history[0].title, "Clipador profissional para reels, TikTok e shorts com foco em viralização - Matheus B.");
  assert.equal(profile.openProjects[0].title, "Gestão de conteúdo e crescimento digital para empresa");
});

test("account adapter", async () => {
  const { AccountAdapter } = require("../dist/adapters/accountAdapter.js");
  const http = new FakeHttpClient([
    htmlResponse(`saldo: 7 conexoes`),
    htmlResponse(`saldo: 6 conexoes`, "https://www.99freelas.com.br/dashboard", true),
    htmlResponse(`Nenhuma assinatura encontrada.`, "https://www.99freelas.com.br/subscriptions", true),
    htmlResponse(`Nenhuma assinatura encontrada.`, "https://www.99freelas.com.br/subscriptions", true),
  ]);
  const adapter = new AccountAdapter(http);
  const c = await adapter.getConnections();
  assert.equal(c.connections, 7);
  const summary = await adapter.getDashboardSummary();
  assert.equal(summary.isLoggedIn, true);
  assert.equal(summary.connections, 6);
  assert.equal(summary.isSubscriber, false);
  assert.equal(summary.planName, undefined);
  const subscription = await adapter.getSubscriptionStatus();
  assert.equal(subscription.isSubscriber, false);
  assert.equal(subscription.emptyState, true);
});
