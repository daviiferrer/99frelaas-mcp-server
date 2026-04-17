import { HttpClient } from "../clients/httpClient";
import { readResponseText } from "../clients/responseText";
import { ProfileEditState, ProfileUpdateInput, PublicProfileDetail } from "../domain/models";
import { assertValidSkillIds } from "../domain/skillsCatalog";
import { parsePublicProfileHtml } from "../parsers/publicProfileParser";
import { safeJson } from "../parsers/responseParser";
import { elapsedMs, logger } from "../security/logger";
import { decodeHtmlEntities } from "../utils/text";

type ProfileEditPayload = {
  status?: { id?: number };
  message?: string;
  result?: { status?: { id?: number }; message?: string };
};

function decodeHtml(value: string): string {
  return decodeHtmlEntities(value);
}

const uniqById = <T extends { id: number }>(values: T[]): T[] => {
  const seen = new Set<number>();
  return values.filter((value) => {
    if (!Number.isFinite(value.id) || seen.has(value.id)) {
      return false;
    }
    seen.add(value.id);
    return true;
  });
};

const uniqNumberIds = (values: number[]): number[] => {
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const value of values) {
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
};

const extractTextAfterLabel = (html: string, pattern: RegExp): string | undefined => {
  const match = html.match(pattern);
  return match?.[1] ? decodeHtml(match[1].replace(/<[^>]+>/g, "").trim()) : undefined;
};

const parseScriptedNumericPushes = (html: string, pattern: RegExp): number[] =>
  uniqNumberIds(
    Array.from(html.matchAll(pattern)).map((match) => Number(match[1])),
  );

const parseInterestCatalog = (html: string): Array<{ title: string; items: string[] }> =>
  Array.from(html.matchAll(/<h2 class="item-title">([\s\S]*?)<\/h2>\s*<div class="items"[\s\S]*?<\/div>/gi)).map((match) => {
    const title = decodeHtml(match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    const items = Array.from(match[0].matchAll(/<span>([\s\S]*?)<\/span>/gi))
      .map((item) => decodeHtml(item[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()))
      .filter((item) => item && item !== title);
    return { title, items: Array.from(new Set(items)) };
  });

const normalizeForAccentInsensitiveSearch = (value: string): string =>
  decodeHtml(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export class ProfileAdapter {
  constructor(private readonly http: HttpClient) {}

  async getInterestCatalog(): Promise<Array<{ title: string; items: string[] }>> {
    const startedAt = Date.now();
    logger.info("profile.get_interest_catalog.start");
    const response = await this.http.request("/profile/edit");
    const html = await readResponseText(response);
    const catalog = parseInterestCatalog(html);
    logger.info("profile.get_interest_catalog.ok", { groupCount: catalog.length, durationMs: elapsedMs(startedAt) });
    return catalog;
  }

  async getEditState(): Promise<ProfileEditState> {
    const startedAt = Date.now();
    logger.info("profile.get_edit_state.start");
    const response = await this.http.request("/profile/edit");
    const html = await readResponseText(response);

    const name = html.match(/id="nome"[^>]*value="([^"]*)"/i)?.[1];
    const nickname = html.match(/id="nickname"[^>]*value="([^"]*)"/i)?.[1];
    const professionalTitle = html.match(/id="titulo-profissional"[^>]*value="([^"]*)"/i)?.[1];
    const about = html.match(/id="descricao"[^>]*>([\s\S]*?)<\/textarea>/i)?.[1]?.trim();
    const professionalSummary = html.match(/id="resumo-experiencia-profissional"[^>]*>([\s\S]*?)<\/textarea>/i)?.[1]?.trim();
    const photoPresent = !/Clique ou arraste a sua foto aqui/i.test(html) ? true : /remover foto/i.test(html);
    const normalizedHtml = normalizeForAccentInsensitiveSearch(html);
    const nicknameLockedByText =
      /voce\s+so\s+pode\s+alterar\s+o\s+nickname\s+uma\s+vez/i.test(normalizedHtml) ||
      /Voc(?:Ãª|ÃƒÂª)\s+s(?:Ã³|ÃƒÂ³)\s+pode\s+alterar\s+o\s+nickname\s+uma\s+vez/i.test(html);
    const canChangeNickname = !nicknameLockedByText;

    const interestCatalog = parseInterestCatalog(html);
    const interestInputMatches = Array.from(html.matchAll(/<input[^>]*id="chk(\d+)"[^>]*>/gi)).map((match) => ({
      id: Number(match[1]),
      isChecked: /\bchecked\b/i.test(match[0]),
    }));
    const interestAreas = uniqById(
      interestInputMatches.map((match) => {
        const id = Number(match.id);
        const label =
          extractTextAfterLabel(html, new RegExp(`<label[^>]*for="chk${id}"[^>]*>([\\s\\S]*?)<\\/label>`, "i")) ??
          extractTextAfterLabel(html, new RegExp(`<label[^>]*>([\\s\\S]*?)<input[^>]*id="chk${id}"`, "i")) ??
          `Area ${id}`;
        return { id, label };
      }),
    );
    const checkedInterestAreaIds = uniqNumberIds(
      interestInputMatches
        .filter((match) => match.isChecked)
        .map((match) => match.id),
    );
    const scriptedInterestAreaIds = parseScriptedNumericPushes(
      html,
      /NineNineFreelas\.infoUsuario\.areasInteresse\.push\(\s*parseInt\('(\d+)'\)\s*\)/gi,
    );
    const selectedInterestAreaIds = uniqNumberIds([...checkedInterestAreaIds, ...scriptedInterestAreaIds]);
    const interestAreaIds =
      selectedInterestAreaIds.length > 0
        ? selectedInterestAreaIds
        : interestAreas.map((area) => area.id);

    const skillOptionMatches = Array.from(html.matchAll(/<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/gi));
    const skillOptions = uniqById(
      skillOptionMatches.map((match) => ({
        id: Number(match[1]),
        label: decodeHtml(match[2].replace(/<[^>]+>/g, "").trim()),
      })),
    );
    const selectedSkillIds = uniqNumberIds(
      skillOptionMatches
        .filter((match) => /\bselected\b/i.test(match[0]))
        .map((match) => Number(match[1])),
    );
    const scriptedSkillIds = parseScriptedNumericPushes(
      html,
      /habilidadesDoFreelancer\.push\(\s*parseInt\('(\d+)'\)\s*\)/gi,
    );
    const selectedSkillIdsNormalized = uniqNumberIds([...selectedSkillIds, ...scriptedSkillIds]);
    const skillIds =
      selectedSkillIdsNormalized.length > 0
        ? selectedSkillIdsNormalized
        : skillOptions.map((skill) => skill.id);

    const missingFields: string[] = [];
    if (!name) missingFields.push("name");
    if (!nickname) missingFields.push("nickname");
    if (!professionalTitle) missingFields.push("professionalTitle");
    if (!about) missingFields.push("about");
    if (!professionalSummary) missingFields.push("professionalSummary");
    if (!photoPresent) missingFields.push("photo");
    if (interestAreaIds.length === 0) missingFields.push("interestAreas");
    if (skillIds.length === 0) missingFields.push("skills");
    const completenessScore = Math.max(0, Math.round((1 - missingFields.length / 8) * 100));

    const result = {
      name: name ? decodeHtml(name) : name,
      nickname: nickname ? decodeHtml(nickname) : nickname,
      professionalTitle: professionalTitle ? decodeHtml(professionalTitle) : professionalTitle,
      about: about ? decodeHtml(about) : about,
      professionalSummary: professionalSummary ? decodeHtml(professionalSummary) : professionalSummary,
      interestCatalog,
      interestAreas,
      interestAreaIds,
      skillOptions,
      skillIds,
      photoPresent,
      canChangeNickname,
      completenessScore,
      missingFields,
    };
    logger.info("profile.get_edit_state.ok", {
      completenessScore: result.completenessScore,
      interestAreaCount: result.interestAreaIds.length,
      skillCount: result.skillIds.length,
      durationMs: elapsedMs(startedAt),
    });
    return result;
  }

  async update(input: ProfileUpdateInput): Promise<{
    ok: boolean;
    redirectHint?: string;
    responseStatusId?: number;
    message?: string;
  }> {
    const startedAt = Date.now();
    logger.info("profile.update.start", {
      nickname: input.nickname,
      titleLength: input.professionalTitle.length,
      interestAreaCount: input.interestAreaIds.length,
      skillCount: input.skillIds.length,
    });
    const skillIds = assertValidSkillIds(input.skillIds);
    const response = await this.http.request("/services/user/editarPerfil", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        editarComoModerador: false,
        tipoUsuario: { id: 2 },
        nome: input.name,
        nome_htmlid: "nome",
        nickname: input.nickname,
        nickname_htmlid: "nickname",
        sobreMim: input.about,
        sobreMim_htmlid: "descricao",
        resumoExperienciaProfissional: input.professionalSummary,
        resumoExperienciaProfissional_htmlid: "resumo-experiencia-profissional",
        tituloProfissional: input.professionalTitle,
        tituloProfissional_htmlid: "titulo-profissional",
        areasDeInteresse: input.interestAreaIds,
        areasDeInteresse_htmlid: "areas-interesse",
        habilidades: skillIds,
        habilidades_htmlid: "habilidades",
        foto: input.photoPresent ? true : null,
      }),
    });
    const body = await safeJson<ProfileEditPayload>(response);
    const normalizedStatus = body?.status?.id ?? body?.result?.status?.id;
    const result = {
      ok: response.ok,
      responseStatusId: normalizedStatus,
      redirectHint: response.url.includes("/dashboard") ? "/dashboard" : undefined,
      message: body?.message ?? body?.result?.message,
    };
    logger.info("profile.update.ok", {
      nickname: input.nickname,
      ok: result.ok,
      responseStatusId: result.responseStatusId,
      durationMs: elapsedMs(startedAt),
    });
    return result;
  }

  async getPublicProfile(input: { username: string; profileUrl?: string }): Promise<PublicProfileDetail> {
    const startedAt = Date.now();
    logger.info("profile.get_public.start", { username: input.username, hasProfileUrl: Boolean(input.profileUrl) });
    const username = input.username.replace(/^\/+/, "").replace(/^https?:\/\/www\.99freelas\.com\.br\/user\//i, "");
    const profileUrl = input.profileUrl ?? `https://www.99freelas.com.br/user/${username}`;
    const response = await this.http.request(`/user/${username}`);
    const html = await readResponseText(response);
    const detail = parsePublicProfileHtml(html, profileUrl);
    logger.info("profile.get_public.ok", {
      username,
      openProjectsCount: detail.openProjects?.length ?? 0,
      durationMs: elapsedMs(startedAt),
    });
    return detail;
  }
}
