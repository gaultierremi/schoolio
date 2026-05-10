// Admin allowlists are read from environment variables (comma-separated emails).
// The lists are NOT hardcoded in the repo because this file lives in a public
// GitHub repo and the previous values exposed real personal data of the team.
//
// Set in Vercel (Production + Preview):
//   ADMIN_EMAILS         = "alex@..., remi@..., ..."
//   SUPER_ADMIN_EMAILS   = "alex@..., remi@..."
//   VALIDATOR_EMAILS     = "kenza@..., christophe@..., ..."
//
// Each entry is lowercased and trimmed. Unset env vars yield an empty list
// (no one matches), so the application is fail-safe: if you forget to set
// these, /admin/* and the validator queue refuse all access rather than
// granting it.

function parseEmailList(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Accès aux pages /admin/* et aux routes board */
export const ADMIN_EMAILS: readonly string[] = parseEmailList(
  process.env.ADMIN_EMAILS,
);

/** Opérations sensibles : inviter des profs, vider le cache IA */
export const SUPER_ADMIN_EMAILS: readonly string[] = parseEmailList(
  process.env.SUPER_ADMIN_EMAILS,
);

export const VALIDATOR_EMAILS: readonly string[] = parseEmailList(
  process.env.VALIDATOR_EMAILS,
);
