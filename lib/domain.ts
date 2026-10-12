/**
 * Normalise anything that looks like a website into a bare lowercase domain.
 *  "https://www.Example.com/blog/?x=1" -> "example.com"
 * Returns null when the input is not a plausible domain.
 */
export function normalizeDomain(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // http://, https://, ftp://
  s = s.replace(/^\/\//, '');
  s = s.split(/[\/?#]/)[0]; // drop path, query, hash (also removes trailing slash)
  s = s.replace(/^[^@]*@/, ''); // user:pass@
  s = s.replace(/:\d+$/, ''); // :8080
  s = s.replace(/^www\./, '');
  s = s.replace(/\.+$/, '');
  if (!/^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u.test(s)) return null;
  return s;
}

/** Make a full https URL from a cell value (adds https:// when missing). */
export function cleanUrl(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/\//, '')}`;
  return normalizeDomain(url) ? url : null;
}

/** Split pasted text (new lines, commas, spaces) into unique normalised domains. */
export function parseDomainList(text: string): { domains: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const domains: string[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    if (!token) continue;
    const d = normalizeDomain(token);
    if (!d) {
      invalid.push(token);
      continue;
    }
    if (!seen.has(d)) {
      seen.add(d);
      domains.push(d);
    }
  }
  return { domains, invalid };
}
