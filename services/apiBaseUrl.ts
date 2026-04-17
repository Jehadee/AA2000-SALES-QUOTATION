/**
 * SERVER_API_URL without trailing slashes.
 * Backward-compatible fallback: VITE_API_BASE_URL.
 * Bare hostnames (no `http://` / `https://`) are turned into absolute origins so
 * `fetch` does not resolve them as paths on the dev server (e.g. localhost:3000).
 */
export function getNormalizedApiBaseUrl(): string {
  const env = (import.meta as any).env ?? {};
  const raw = ((env.SERVER_API_URL as string | undefined) ?? (env.VITE_API_BASE_URL as string | undefined) ?? '');
  let s = raw.trim();
  if (!s) return '';
  s = s.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return s;
  const useHttp =
    /^localhost(?::|$)/i.test(s) ||
    /^127\.0\.0\.1(?::|$)/i.test(s) ||
    /^\[::1\](?::|$)/i.test(s);
  const scheme = useHttp ? 'http://' : 'https://';
  return `${scheme}${s.replace(/^\/+/, '')}`;
}
