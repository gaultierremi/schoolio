import type { TemplateContext } from "./types";
export type { TemplateContext };

/**
 * Render a Socratic-hint template by substituting {slot} placeholders.
 *
 * - `{key}` → context[key] (if defined; numbers are coerced to strings)
 * - `{unknown}` → `{{unknown}}` — doubled braces flag the missing slot at the
 *   call site without crashing the tutor UI mid-session.
 * - `\{literal\}` → `{literal}` — backslash escapes a literal brace pair
 *   so authors can include `{...}` in hint text without triggering substitution.
 *
 * Used by the Banks Socratiques runtime (per spec §4.3) to fill teacher-written
 * hint templates with student-submitted slot values at quiz time.
 */
export function renderTemplate(
  template: string,
  context: TemplateContext
): string {
  // Sentinels for escaped braces: characters that cannot appear in hint
  // templates (unit separator / record separator from ASCII control range).
  const ESCAPED_OPEN = " ESC_OPEN ";
  const ESCAPED_CLOSE = " ESC_CLOSE ";

  let result = template
    .replace(/\\\{/g, ESCAPED_OPEN)
    .replace(/\\\}/g, ESCAPED_CLOSE);

  result = result.replace(/\{(\w+)\}/g, (_match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return String(context[key]);
    }
    return `{{${key}}}`;
  });

  result = result
    .replaceAll(ESCAPED_OPEN, "{")
    .replaceAll(ESCAPED_CLOSE, "}");

  return result;
}
