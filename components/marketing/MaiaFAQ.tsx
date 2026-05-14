import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "Mes profs doivent-ils créer leurs propres questions ?",
    answer:
      "Non. Maïa génère les questions à partir de votre syllabus PDF. Le prof relit, ajuste, valide — typiquement 5 minutes par devoir. Vous gardez le contrôle pédagogique, sans la charge.",
  },
  {
    question: "Combien de temps pour déployer dans mon école ?",
    answer:
      "30 minutes pour la config SSO côté IT. 1 heure de formation par prof. Vos élèves se connectent dès le premier jour avec leurs comptes Microsoft 365 ou Google habituels — pas de nouveau mot de passe à gérer.",
  },
  {
    question: "Et la RGPD pour les mineurs ?",
    answer:
      "On fournit un DPA complet et un DPIA. L'école reste responsable de traitement, Maïa est sous-traitant. Consentement parental géré par l'école (pas par nous). Hébergement en Belgique et France. Audit log immuable pour traçabilité.",
  },
  {
    question: "Ça remplace mes cours ?",
    answer:
      "Surtout pas. Maïa fait la pratique répétée que vous n'avez pas le temps de faire en cours collectif. Vous gardez votre pédagogie, vos exposés, vos manipulations. Maïa s'occupe du suivi individuel hors-temps de classe.",
  },
  {
    question: "Pricing après le pilote ?",
    answer:
      "Tarif transparent : par classe / par mois, dégressif au volume. On confirme avec vous pendant le pilote, sans surprise. Budget approximatif pour une école secondaire de 300 élèves : équivalent à 2-3 manuels scolaires par élève / an.",
  },
  {
    question: "Quelles matières sont couvertes ?",
    answer:
      "Chimie, physique, mathématiques, biologie, histoire en couverture complète FW-B 3e à 6e secondaire. Français en bêta. Programme français (Éducation Nationale) prévu en 2027. Si votre cas d'usage est spécifique, on en parle.",
  },
];

export default function MaiaFAQ() {
  return (
    <section id="faq" className="surface-2-bg py-24">
      <div className="mx-auto max-w-[800px] px-6">
        <div className="text-center">
          <span className="eyebrow">FAQ</span>
          <h2 className="serif mt-6 text-3xl font-semibold ink sm:text-4xl">
            Questions fréquentes.
          </h2>
        </div>

        <div className="mt-10 space-y-3">
          {faqs.map((faq, i) => (
            <details key={i} className="card p-5 group">
              <summary className="flex items-center justify-between">
                <span className="serif text-lg font-medium ink">{faq.question}</span>
                <ChevronDown className="h-5 w-5 ink3 chevron" />
              </summary>
              <p className="ink2 mt-3 text-sm leading-relaxed">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
