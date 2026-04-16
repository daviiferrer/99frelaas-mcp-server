import { HttpClient } from "../clients/httpClient";
import { readResponseText } from "../clients/responseText";
import { ProfileEditState, ProfileUpdateInput, PublicProfileDetail } from "../domain/models";
import { assertValidSkillIds } from "../domain/skillsCatalog";
import { parsePublicProfileHtml } from "../parsers/publicProfileParser";
import { safeJson } from "../parsers/responseParser";
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

const extractTextAfterLabel = (html: string, pattern: RegExp): string | undefined => {
  const match = html.match(pattern);
  return match?.[1] ? decodeHtml(match[1].replace(/<[^>]+>/g, "").trim()) : undefined;
};

const parseInterestCatalog = (html: string): Array<{ title: string; items: string[] }> =>
  Array.from(html.matchAll(/<h2 class="item-title">([\s\S]*?)<\/h2>\s*<div class="items"[\s\S]*?<\/div>/gi)).map((match) => {
    const title = decodeHtml(match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    const items = Array.from(match[0].matchAll(/<span>([\s\S]*?)<\/span>/gi))
      .map((item) => decodeHtml(item[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()))
      .filter((item) => item && item !== title);
    return { title, items: Array.from(new Set(items)) };
  });

export class ProfileAdapter {
  constructor(private readonly http: HttpClient) {}

  async getInterestCatalog(): Promise<Array<{ title: string; items: string[] }>> {
    const response = await this.http.request("/profile/edit");
    const html = await readResponseText(response);
    return parseInterestCatalog(html);
  }

  async getEditState(): Promise<ProfileEditState> {
    const response = await this.http.request("/profile/edit");
    const html = await readResponseText(response);

    const name = html.match(/id="nome"[^>]*value="([^"]*)"/i)?.[1];
    const nickname = html.match(/id="nickname"[^>]*value="([^"]*)"/i)?.[1];
    const professionalTitle = html.match(/id="titulo-profissional"[^>]*value="([^"]*)"/i)?.[1];
    const about = html.match(/id="descricao"[^>]*>([\s\S]*?)<\/textarea>/i)?.[1]?.trim();
    const professionalSummary = html.match(/id="resumo-experiencia-profissional"[^>]*>([\s\S]*?)<\/textarea>/i)?.[1]?.trim();
    const photoPresent = !/Clique ou arraste a sua foto aqui/i.test(html) ? true : /remover foto/i.test(html);
    const canChangeNickname = !/Voc(?:ê|Ãª)\s+s(?:ó|Ã³)\s+pode\s+alterar\s+o\s+nickname\s+uma\s+vez/i.test(html);

    const interestCatalog = parseInterestCatalog(html);
    const interestAreas = uniqById(
      Array.from(html.matchAll(/<input[^>]*id="chk(\d+)"[^>]*>/gi)).map((match) => {
        const id = Number(match[1]);
        const label =
          extractTextAfterLabel(html, new RegExp(`<label[^>]*for="chk${id}"[^>]*>([\\s\\S]*?)<\\/label>`, "i")) ??
          extractTextAfterLabel(html, new RegExp(`<label[^>]*>([\\s\\S]*?)<input[^>]*id="chk${id}"`, "i")) ??
          `Área ${id}`;
        return { id, label };
      }),
    );
    const interestAreaIds = interestAreas.map((item) => item.id);

    const skillOptions = uniqById(
      Array.from(html.matchAll(/<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/gi)).map((match) => ({
        id: Number(match[1]),
        label: decodeHtml(match[2].replace(/<[^>]+>/g, "").trim()),
      })),
    );
    const skillIds = skillOptions.map((item) => item.id);
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

    return {
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
  }

  async update(input: ProfileUpdateInput): Promise<{
    ok: boolean;
    redirectHint?: string;
    responseStatusId?: number;
    message?: string;
  }> {
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
    return {
      ok: response.ok,
      responseStatusId: normalizedStatus,
      redirectHint: response.url.includes("/dashboard") ? "/dashboard" : undefined,
      message: body?.message ?? body?.result?.message,
    };
  }

  async getPublicProfile(input: { username: string; profileUrl?: string }): Promise<PublicProfileDetail> {
    const username = input.username.replace(/^\/+/, "").replace(/^https?:\/\/www\.99freelas\.com\.br\/user\//i, "");
    const profileUrl = input.profileUrl ?? `https://www.99freelas.com.br/user/${username}`;
    const response = await this.http.request(`/user/${username}`);
    const html = await readResponseText(response);
    return parsePublicProfileHtml(html, profileUrl);
  }
}
