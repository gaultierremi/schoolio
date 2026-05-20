import type { LucideIcon } from "lucide-react";

/**
 * Sprint 6 — Composant header de page unifié pour TOUTES les routes
 * `/accueil/*`, `/onboarding/*`, `/legal/*` (= app interne).
 *
 * Pourquoi : avant ce composant, 3 familles de H1 coexistaient dans le repo :
 * - "Schoolio legacy" : `serif text-2xl/3xl font-black text-[rgb(var(--ink))]`
 *   + émojis 🏫📋🔗 (viole mémoire `feedback_lucide_icons_except_tutor`)
 * - "Maïa new look" : `text-3xl font-semibold tracking-tight text-slate-900`
 * - Variantes locales : `text-2xl`, `font-bold`, couleurs mixtes
 *
 * Décision design unifiée :
 * - H1 : `text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100`
 * - Icône Lucide dans carré indigo 600 (si fournie)
 * - Eyebrow : texte tag indigo au-dessus du H1 (catégorisation page)
 * - Subtitle : description courte sous le H1
 * - Actions : zone optionnelle à droite (boutons CTA)
 *
 * Pages marketing (`/`, `/pilotes`) gardent leur look serif distinct.
 *
 * Mémoires respectées :
 * - `feedback_lucide_icons_except_tutor` : Lucide partout, pas d'émojis
 * - `feedback_landing_tone_adult_kind` : titres adultes, pas infantilisants
 * - WCAG 2.2 AA : focus-visible, motion-reduce, contraste suffisant
 */
export type PageHeaderProps = {
  /** Titre principal H1 (obligatoire) */
  title: string;
  /** Texte tag indigo au-dessus du H1 (ex: "Plan Maïa", "Bilan", "Détail élève") */
  eyebrow?: string;
  /** Description courte sous le H1 (1-2 phrases max) */
  subtitle?: string;
  /** Icône Lucide affichée dans un carré indigo à gauche du H1 */
  Icon?: LucideIcon;
  /** Badge optionnel à côté du H1 (ex: status "A quitté la classe") */
  badge?: React.ReactNode;
  /** Zone d'actions à droite du header (boutons CTA) */
  actions?: React.ReactNode;
  /** className supplémentaire sur le <header> wrapper */
  className?: string;
};

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  Icon,
  badge,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`mb-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {Icon ? (
            <div
              aria-hidden="true"
              className="
                flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                bg-indigo-600 text-white
              "
            >
              <Icon size={18} strokeWidth={2} />
            </div>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
                {eyebrow}
              </p>
            ) : null}
            <div className={`${eyebrow ? "mt-1" : ""} flex flex-wrap items-baseline gap-3`}>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </h1>
              {badge}
            </div>
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}

export default PageHeader;
