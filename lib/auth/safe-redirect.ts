/**
 * Audit hard review 2026-05-25 P1 — Open redirect protection.
 *
 * Le pattern initial `typeof x === "string" && x.startsWith("/")` accepte
 * `//evil.com` (protocol-relative URL) que les navigateurs interprètent comme
 * `https://evil.com`. Risque phishing post-auth.
 *
 * `safeNextPath` valide qu'un `next` param est :
 * - Une string non vide
 * - Un path-absolu strict : commence par "/" mais PAS "//" ni "/\\"
 * - Pas un schéma déguisé (`javascript:`, `data:`, etc.)
 * - Pas un retour à la ligne / null byte (anti-injection header)
 *
 * Sinon fallback sur `defaultPath`.
 *
 * Volontairement simple : on n'autorise que les paths internes. Pour les
 * redirects externes (rare), passer par une whitelist explicite.
 */
export function safeNextPath(input: unknown, defaultPath = "/accueil"): string {
  if (typeof input !== "string") return defaultPath;
  if (input.length === 0 || input.length > 512) return defaultPath;

  // Refuse les caractères de contrôle (anti CRLF injection)
  if (/[\x00-\x1f\x7f]/.test(input)) return defaultPath;

  // Refuse les schémas (http:, https:, javascript:, data:, etc.) — un ":"
  // dans la PREMIÈRE partie avant le premier "/" est suspect.
  // Note : "/foo:bar" est OK (le ":" est dans le path), donc on regarde
  // seulement avant le premier "/".
  const firstSlash = input.indexOf("/");
  if (firstSlash !== 0) return defaultPath;

  // Refuse "//evil.com" et "/\\evil.com" (protocol-relative ou Windows-style)
  if (input.length > 1) {
    const second = input.charAt(1);
    if (second === "/" || second === "\\") return defaultPath;
  }

  // OK : path-absolu strict commençant par "/"
  return input;
}
