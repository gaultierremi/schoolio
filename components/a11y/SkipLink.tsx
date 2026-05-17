/**
 * Skip link a11y (Sprint 1.5 polish — WCAG 2.4.1 Bypass Blocks).
 *
 * Permet aux utilisateurs clavier / screen readers de sauter directement
 * au contenu principal sans passer par la nav. Premier élément focusable du
 * document — apparaît visuellement seulement quand il est focus.
 *
 * Cible : `<main id="main-content">` (défini dans app/accueil/layout.tsx
 * + autres pages avec un main).
 *
 * Pourquoi un composant et pas inline dans le layout :
 * - Server component compatible (pas de "use client")
 * - Réutilisable si on a d'autres root layouts (ex: futur /admin)
 * - Style hidden→visible via Tailwind sr-only + focus:not-sr-only
 */
export function SkipLink({ target = "#main-content" }: { target?: string }) {
  return (
    <a
      href={target}
      className="
        sr-only
        focus:not-sr-only
        focus:fixed focus:top-2 focus:left-2 focus:z-[100]
        focus:rounded-md focus:bg-white focus:px-4 focus:py-2
        focus:text-sm focus:font-semibold focus:text-indigo-700
        focus:shadow-lg focus:outline-none focus:ring-2
        focus:ring-indigo-500 focus:ring-offset-2
        dark:focus:bg-slate-900 dark:focus:text-indigo-300
      "
    >
      Aller au contenu principal
    </a>
  );
}

export default SkipLink;
