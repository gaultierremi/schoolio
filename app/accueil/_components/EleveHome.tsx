/**
 * Placeholder pour le dashboard élève sur `/accueil`.
 *
 * Le contenu réel (heatmap, plan Maïa du jour, classes) sera migré depuis
 * `/student/page.tsx` en Sprint 0 Task C1. Pour l'instant, on rend un état
 * neutre qui permet au middleware + dispatcher d'être testable.
 */
export default function EleveHome() {
  return (
    <div className="mx-auto max-w-md px-6 py-12 lg:max-w-6xl">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Bonjour
      </h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
        Ton tableau de bord arrive — migration en cours.
      </p>
    </div>
  );
}
