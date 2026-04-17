export const extractAuthenticatedUsernameFromHtml = (html: string): string | undefined => {
  const normalized = html.replace(/\s+/g, " ");
  const linkMatches = [
    ...normalized.matchAll(/<a[^>]+href="\/user\/([^"?/#\s]+)[^"]*"[^>]*>\s*Meu perfil\s*<\/a>/gi),
    ...normalized.matchAll(/<a[^>]+href="\/user\/([^"?/#\s]+)[^"]*"[^>]*>.*?Meu perfil.*?<\/a>/gi),
  ];
  for (const match of linkMatches) {
    const username = match[1]?.trim();
    if (username) return username;
  }

  const plainTextMatch = normalized.match(/Meu perfil[^<]{0,120}\/user\/([^"?#\s]+)/i);
  if (plainTextMatch?.[1]) {
    return plainTextMatch[1].trim();
  }

  const hrefOnlyMatch = normalized.match(/href="\/user\/([^"?/#\s]+)[^"]*"/i);
  return hrefOnlyMatch?.[1]?.trim();
};
