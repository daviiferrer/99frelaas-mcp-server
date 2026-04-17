const test = require("node:test");
const assert = require("node:assert/strict");

test("request factory", async () => {
  const { buildFormUrlEncoded } = require("../dist/clients/requestFactory.js");
  const form = buildFormUrlEncoded({ a: 1, b: true, c: "x" });
  assert.match(form, /a=1/);
  assert.match(form, /b=true/);
  assert.match(form, /c=x/);
});

test("parsers", async () => {
  const { parseProjectListHtml } = require("../dist/parsers/projectListParser.js");
  const { parseProjectDetailHtml } = require("../dist/parsers/projectDetailParser.js");
  const {
    parseConnectionsFromDashboardHtml,
    parseSubscriptionFromDashboardHtml,
    parseSubscriptionStatusFromSubscriptionsHtml,
  } = require("../dist/parsers/dashboardParser.js");
  const { parsePublicProfileHtml } = require("../dist/parsers/publicProfileParser.js");
  const { safeJson } = require("../dist/parsers/responseParser.js");

  const listHtml = `
    <li class="result-item"><a href="/project/migrar-site-744895">Migrar</a></li>
    <p>Resumo <b>curto</b></p>
  `;
  const items = parseProjectListHtml(listHtml, "web-mobile-e-software", 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].projectSlug, "migrar-site-744895");
  assert.equal(items[0].projectId, 744895);

  const detailHtml = `
    <h2>DescriÃ§Ã£o do Projeto</h2><p>Desc principal</p><h2>Outro</h2>
    Valor MÃ­nimo: <b>R$ 50,00</b>
    Valor MÃ¡ximo: <b>R$ 100,00</b>
    Visibilidade: <b>Aberto</b>
    <li class="proposal-item"><a href="/user/joao">Joao</a> Submetido: 1 dia atrÃ¡s Premium</li>
    <div class="project-description">Desc <b>grande</b></div>
    <a href="/project/bid/migrar-site-744895">Bid</a>
    Custa 2 conexoes
    Oferta minima: R$ 50,00
    Assine um de nossos planos
    voce nao pode enviar proposta
    <h2>Cliente</h2>
    <a href="/user/joao">Joao Silva</a>
    (5.0 - 1 avaliação)
    Projetos concluídos: 1 | Recomendações: 2 | Registrado desde: 24/03/2026
  `;
  const detail = parseProjectDetailHtml(detailHtml, {
    projectId: 744895,
    title: "t",
    url: "u",
    tags: [],
  });
  assert.equal(detail.description, "Desc principal");
  assert.equal(detail.connectionsCost, 2);
  assert.equal(detail.minimumOfferCents, 5000);
  assert.equal(detail.requiresSubscriber, true);
  assert.equal(detail.userCanBid, false);
  assert.equal(detail.competitors[0].isPremium, true);
  assert.match(detail.bidUrl, /project\/bid\/migrar-site-744895/);
  assert.equal(detail.client.username, "joao");
  assert.equal(detail.client.profileUrl, "https://www.99freelas.com.br/user/joao");
  assert.equal(detail.clientSignals.projectsCompleted, 1);
  assert.equal(detail.clientSignals.recommendations, 2);

  const profileHtml = `
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
  `;
  const profile = parsePublicProfileHtml(profileHtml, "https://www.99freelas.com.br/user/Prkvit");
  assert.equal(profile.displayName, "Fábio p.");
  assert.equal(profile.rating, 5);
  assert.equal(profile.projectsCompleted, 1);
  assert.equal(profile.recommendations, 1);
  assert.equal(profile.history[0].title, "Clipador profissional para reels, TikTok e shorts com foco em viralização - Matheus B.");
  assert.equal(profile.openProjects[0].title, "Gestão de conteúdo e crescimento digital para empresa");

  const primaryDetail = parseProjectDetailHtml(
    `Descrição do Projeto</h3><section>Primaria</section><div class="project-info"></div>`,
    { projectId: 1, title: "t", url: "u", tags: [] },
  );
  assert.equal(primaryDetail.description, "Primaria");

  assert.equal(parseConnectionsFromDashboardHtml("Conexoes disponiveis: 1.234,5"), 1234.5);
  assert.equal(parseConnectionsFromDashboardHtml("disponiveis agora 11"), 11);
  assert.equal(parseConnectionsFromDashboardHtml("total de 12 referentes"), 12);
  assert.equal(parseConnectionsFromDashboardHtml("3 conexoes restantes e 4 conexoes nao expiraveis"), 7);
  assert.equal(parseConnectionsFromDashboardHtml("Saldo: 8 conexoes"), 8);
  assert.equal(parseConnectionsFromDashboardHtml("sem saldo"), undefined);
  assert.deepEqual(parseSubscriptionFromDashboardHtml("assinatura Premium"), { isSubscriber: true, planName: "Premium" });
  assert.deepEqual(parseSubscriptionFromDashboardHtml("assine um de nossos planos"), { isSubscriber: false, planName: undefined });
  assert.deepEqual(parseSubscriptionFromDashboardHtml("neutro"), { isSubscriber: undefined, planName: undefined });
  assert.deepEqual(parseSubscriptionStatusFromSubscriptionsHtml("Nenhuma assinatura encontrada."), {
    isLoggedIn: undefined,
    isSubscriber: false,
    planName: undefined,
    hasSubscription: false,
    hasActiveSubscription: false,
    emptyState: true,
    source: "subscriptions-page",
  });
  assert.deepEqual(parseSubscriptionStatusFromSubscriptionsHtml("Plano Premium ativo"), {
    isLoggedIn: undefined,
    isSubscriber: true,
    planName: "Premium",
    hasSubscription: true,
    hasActiveSubscription: true,
    emptyState: false,
    source: "subscriptions-page",
  });

  const encoder = new TextEncoder();
  const fakeResOk = {
    headers: { get: () => "application/json; charset=utf-8" },
    arrayBuffer: async () => encoder.encode(JSON.stringify({ ok: true })).buffer,
  };
  const fakeResBad = {
    headers: { get: () => "application/json; charset=utf-8" },
    arrayBuffer: async () => encoder.encode("not-json").buffer,
  };
  assert.deepEqual(await safeJson(fakeResOk), { ok: true });
  assert.equal(await safeJson(fakeResBad), undefined);
});

test("http client cookie handling", async () => {
  const { HttpClient } = require("../dist/clients/httpClient.js");
  const { readResponseText } = require("../dist/clients/responseText.js");
  const originalFetch = global.fetch;
  let cookieHeader = "";
  global.fetch = async (url, init) => {
    cookieHeader = (init && init.headers && init.headers.cookie) || "";
    return {
      ok: true,
      url: String(url),
      headers: {
        get: (name) => (name.toLowerCase() === "set-cookie" ? "a=1; Path=/" : null),
      },
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };

  try {
    const client = new HttpClient("https://www.99freelas.com.br");
    client.setCookies([{ name: "x", value: "y", domain: ".99freelas.com.br" }]);
    await client.request("/dashboard");
    assert.match(cookieHeader, /x=y/);
    const cookies = client.getCookies();
    assert.ok(cookies.find((c) => c.name === "a"));
    const child = client.createChildWithCookies([{ name: "child", value: "1", domain: ".99freelas.com.br" }]);
    assert.equal(client.getCookies().some((c) => c.name === "child"), false);
    assert.equal(child.getCookies().some((c) => c.name === "child"), true);
    const latin1Bytes = Uint8Array.from([0x54, 0x72, 0x61, 0x64, 0x75, 0xe7, 0xe3, 0x6f]);
    const decoded = await readResponseText({
      headers: { get: () => "text/html; charset=iso-8859-1" },
      arrayBuffer: async () => latin1Bytes.buffer,
    });
    assert.equal(decoded, "Tradução");
  } finally {
    global.fetch = originalFetch;
  }
});

test("browser client wrapper", async () => {
  const { openBrowserForDebugWith } = require("../dist/clients/browserClient.js");
  let navigated = "";
  await openBrowserForDebugWith("https://example.com", {
    chromium: {
      launch: async () => ({
        newPage: async () => ({
          goto: async (url) => {
            navigated = url;
          },
        }),
      }),
    },
  });
  assert.equal(navigated, "https://example.com");
});
