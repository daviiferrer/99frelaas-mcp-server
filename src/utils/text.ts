import { createHash } from "crypto";

export const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const decodeHtmlEntities = (text: string): string => {
  if (!text) return "";

  let decoded = text
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&agrave;/gi, "à")
    .replace(/&egrave;/gi, "è")
    .replace(/&igrave;/gi, "ì")
    .replace(/&ograve;/gi, "ò")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&Atilde;/g, "Ã")
    .replace(/&Otilde;/g, "Õ")
    .replace(/&Ecirc;/g, "Ê")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ");

  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  decoded = decoded.replace(/&#x([a-f0-9]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  return decoded;
};

export const cleanText = (text?: string): string => {
  if (!text) return "";
  let cleaned = text.replace(/<[^>]+>/g, " ");
  cleaned = decodeHtmlEntities(cleaned);
  cleaned = cleaned.replace(/Visualizar Projeto|Expandir|Esconder|Ver detalhes|Publicado:/gi, "");
  return cleaned.replace(/\s+/g, " ").trim();
};
