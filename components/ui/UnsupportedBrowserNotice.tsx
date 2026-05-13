/**
 * // Feature audio non supportee :
 * // <UnsupportedBrowserNotice
 * //   feature="Maïa écoute"
 * //   recommendedBrowsers={["Chrome", "Edge", "Safari"]}
 * //   onDismiss={() => setShowUnsupportedNotice(false)}
 * // />
 */
export type UnsupportedBrowserNoticeProps = {
  feature: string;
  recommendedBrowsers?: string[];
  onDismiss?: () => void;
};

export function UnsupportedBrowserNotice({
  feature,
  recommendedBrowsers = ["Chrome", "Edge", "Safari"],
  onDismiss,
}: UnsupportedBrowserNoticeProps) {
  return (
    <section
      className="w-full max-w-md rounded-2xl border border-amber-700/40 bg-gray-900 p-6 shadow-xl shadow-black/20"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-start gap-4">
        <span className="text-3xl leading-none text-amber-400" aria-hidden="true">
          ⚠️
        </span>

        <div>
          <h2 className="text-lg font-semibold text-white">
            {feature} n&apos;est pas disponible sur ce navigateur
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            Cette fonctionnalité utilise des capacités audio avancées qui ne sont pas encore supportées par ton
            navigateur actuel.
          </p>
        </div>

        <div className="w-full">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Navigateurs recommandés</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendedBrowsers.map((browser) => (
              <span key={browser} className="rounded-full bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300">
                {browser}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs leading-5 text-gray-500">
          Tu peux continuer à utiliser Maïa normalement, seule cette fonctionnalité est inactive.
        </p>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            OK, j&apos;ai compris
          </button>
        )}
      </div>
    </section>
  );
}

export default UnsupportedBrowserNotice;
