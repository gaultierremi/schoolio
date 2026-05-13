export default function MaiaQuote() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[900px] px-6 text-center">
        <p className="quote serif text-2xl leading-relaxed ink sm:text-3xl">
          L&apos;apprentissage, c&apos;est rendre simple ce qui était difficile — pas
          ajouter de la difficulté.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{
              background: "rgb(var(--accent) / 0.15)",
              color: "rgb(var(--accent))",
            }}
          >
            <span className="text-sm font-semibold">GP</span>
          </div>
          <div className="text-left">
            <p className="ink text-sm font-medium">Gaultier P.</p>
            <p className="ink3 text-xs">Fondateur · Maïa</p>
          </div>
        </div>
      </div>
    </section>
  );
}
