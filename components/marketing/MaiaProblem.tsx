export default function MaiaProblem() {
  return (
    <section className="surface-2-bg py-20">
      <div className="mx-auto max-w-[900px] px-6 text-center">
        <span
          className="eyebrow"
          style={{
            background: "rgb(var(--red) / 0.10)",
            color: "rgb(var(--red))",
          }}
        >
          Le constat
        </span>

        <h2 className="serif mt-6 text-3xl font-semibold ink sm:text-4xl">
          Un élève qui décroche, c&apos;est presque toujours sur une{" "}
          <em className="not-italic">base</em> qu&apos;il n&apos;a jamais maîtrisée.
        </h2>

        <p className="mt-5 text-lg leading-relaxed ink2">
          Le prof corrige 25 copies, met une note. L&apos;élève voit &quot;12/20&quot; sans
          savoir <strong className="ink">où</strong> il a perdu ses points. La fois
          suivante, même chapitre, même erreur. Et après 3 chapitres, la lacune devient
          un trou. L&apos;élève finit par croire qu&apos;il{" "}
          <em>n&apos;est pas fait</em> pour la matière.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          <div>
            <p className="serif text-4xl font-semibold accent-text">87%</p>
            <p className="ink2 mt-2 text-sm leading-snug">
              des profs disent que la remédiation par élève est
              <br />
              leur plus grosse difficulté
            </p>
          </div>
          <div>
            <p className="serif text-4xl font-semibold accent-text">3 sur 10</p>
            <p className="ink2 mt-2 text-sm leading-snug">
              élèves de 4ème secondaire en Belgique sont en
              <br />
              difficulté en mathématiques et sciences (PISA)
            </p>
          </div>
          <div>
            <p className="serif text-4xl font-semibold accent-text">0 min</p>
            <p className="ink2 mt-2 text-sm leading-snug">
              temps moyen consacré aux lacunes individuelles
              <br />
              dans un cours collectif standard
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
