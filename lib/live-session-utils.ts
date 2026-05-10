const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const SESSION_MAX_DURATION_MS = 4 * 60 * 60 * 1000;

export function generateSessionCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return code;
}

export function isSessionExpired(startedAt: string): boolean {
  return Date.now() - new Date(startedAt).getTime() > SESSION_MAX_DURATION_MS;
}
