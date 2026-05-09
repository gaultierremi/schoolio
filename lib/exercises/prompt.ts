// Prompt construction for exercise generation via Claude Sonnet.
// Kept in a separate file so the pedagogical instructions can be iterated
// independently of the generation logic after first-run quality checks.

const LEVEL_LABELS: Record<number, string> = {
  1: "1re année secondaire (12-13 ans)",
  2: "2e année secondaire (13-14 ans)",
  3: "3e année secondaire (14-15 ans)",
  4: "4e année secondaire (15-16 ans)",
  5: "5e année secondaire (16-17 ans)",
  6: "6e année secondaire (17-18 ans)",
};

const SUBJECT_INSTRUCTIONS: Record<string, string> = {
  mathematiques: `Matière : mathématiques.
- Utilise LaTeX entre $...$ pour TOUTES les formules et expressions (ex : $a^2 + b^2 = c^2$, $x = \\frac{-b}{2a}$).
- Les étapes sont calculatoires : poser les données, choisir la formule, substituer, calculer, vérifier.
- Types d'exercices adaptés : 'calcul', 'demonstration', 'application'.
- method_or_concept = le théorème ou la règle appliquée (ex : "Théorème de Pythagore", "Produit en croix", "Factorisation").`,

  physique: `Matière : physique.
- Utilise LaTeX entre $...$ pour les formules et unités (ex : $F = ma$, $v = \\frac{d}{t}$).
- Les étapes : identifier les données connues/inconnues, choisir la loi, substituer les valeurs, calculer, vérifier les unités.
- Types : 'calcul', 'application', 'analyse'.
- method_or_concept = la loi physique (ex : "Loi d'Ohm", "Principe d'inertie", "Conservation de l'énergie").`,

  chimie: `Matière : chimie.
- Utilise LaTeX entre $...$ pour les formules chimiques et calculs (ex : $H_2O$, $n = \\frac{m}{M}$).
- Les étapes : écrire et équilibrer l'équation, identifier réactifs/produits, calculer les quantités de matière.
- Types : 'calcul', 'application', 'analyse'.
- method_or_concept = la loi ou règle (ex : "Conservation de la masse", "Stœchiométrie", "pH").`,

  biologie: `Matière : biologie.
- PAS de LaTeX sauf pour des formules exceptionnelles.
- Les étapes : observer/identifier les structures, expliquer le mécanisme biologique, relier aux concepts du cours, conclure.
- Types : 'analyse', 'application', 'demonstration'.
- method_or_concept = le processus biologique (ex : "Mitose", "Sélection naturelle", "Photosynthèse").`,

  francais: `Matière : français.
- PAS de LaTeX (matière littéraire).
- Les étapes sont des étapes d'analyse ou de rédaction : comprendre le texte/la consigne, identifier les procédés, interpréter, rédiger une réponse structurée.
- Types : 'analyse', 'redaction'.
- method_or_concept = le procédé ou la technique littéraire (ex : "Métaphore", "Plan dialectique", "Champ lexical", "Connecteurs logiques").
- Pour les exercices d'analyse : l'énoncé peut inclure un court extrait textuel entre guillemets.`,

  histoire: `Matière : histoire.
- PAS de LaTeX.
- Les étapes sont des étapes de raisonnement historique : contextualiser l'événement, identifier les acteurs et enjeux, analyser les causes/conséquences, formuler une conclusion argumentée.
- Types : 'analyse', 'redaction', 'application'.
- method_or_concept = la méthode ou le concept historique (ex : "Causalité historique", "Rupture/continuité", "Source primaire vs secondaire").`,

  geographie: `Matière : géographie.
- PAS de LaTeX sauf pour des calculs d'échelle simples.
- Les étapes : localiser et contextualiser, décrire les caractéristiques, expliquer les dynamiques, mettre en relation avec des enjeux, conclure.
- Types : 'analyse', 'application'.
- method_or_concept = le concept géographique (ex : "Densité de population", "Mondialisation", "Développement durable").`,

  anglais: `Matière : anglais.
- PAS de LaTeX.
- Les étapes sont linguistiques : identifier la structure grammaticale requise, rappeler la règle, construire la réponse étape par étape, vérifier la cohérence.
- Types : 'application', 'redaction', 'analyse'.
- method_or_concept = la règle grammaticale ou la notion (ex : "Present Perfect", "Conditional Type II", "Passive Voice").`,

  neerlandais: `Matière : néerlandais.
- PAS de LaTeX.
- Les étapes sont linguistiques : identifier la structure, rappeler la règle, construire la réponse, vérifier.
- Types : 'application', 'redaction', 'analyse'.
- method_or_concept = la règle grammaticale (ex : "De/het-woorden", "Vervoegen in de verleden tijd", "Woordvolgorde").`,
};

export function buildSystemPrompt(subject: string | null): string {
  const subjectBlock = subject && SUBJECT_INSTRUCTIONS[subject]
    ? SUBJECT_INSTRUCTIONS[subject]
    : subject
      ? `Matière : ${subject}.\nAdapte le format des étapes à la nature de la matière. Utilise LaTeX ($...$) uniquement si pertinent pour des formules.`
      : "Adapte le format des étapes à la nature de la matière du cours.";

  return `Tu es un assistant pédagogique expert. Tu génères des exercices scolaires avec des résolutions détaillées étape par étape, dans un style pédagogique qui explique le POURQUOI à chaque étape, pas seulement le résultat.

${subjectBlock}

Règles absolues :
- Réponds en JSON UNIQUEMENT, sans texte avant ni après, sans balises Markdown autour.
- Chaque exercice doit avoir entre 4 et 7 étapes de résolution.
- is_final_answer est true UNIQUEMENT pour la dernière étape qui contient la réponse ou conclusion finale clairement formulée.
- Chaque étape intermédiaire explique le raisonnement (pourquoi cette opération, pourquoi ce choix).
- method_or_concept est le nom court du concept, de la règle ou de la méthode clé de cette étape (null si aucun concept spécifique).
- Les titres d'exercices font 80 caractères maximum.`;
}

export function buildUserPrompt(params: {
  courseTitle: string;
  subject: string | null;
  level: number | null;
  count: number;
}): string {
  const { courseTitle, subject, level, count } = params;

  const subjectLabel = subject ?? "matière non spécifiée";
  const levelLabel = level && LEVEL_LABELS[level] ? LEVEL_LABELS[level] : level ? `niveau ${level}` : "niveau non spécifié";

  return `Voici le contenu d'un cours de ${subjectLabel} — ${levelLabel}.
Titre du cours : "${courseTitle}"

Génère ${count} exercices REPRÉSENTATIFS et VARIÉS basés sur ce contenu (types variés, difficultés allant de 1 à 3).

Réponds avec ce JSON strict (rien d'autre) :
{
  "exercises": [
    {
      "title": "Titre court de l'exercice (max 80 caractères)",
      "exercise_type": "calcul|demonstration|analyse|redaction|application|autre",
      "statement": "Énoncé complet de l'exercice en markdown (LaTeX en $...$ si pertinent)",
      "difficulty": 1,
      "steps": [
        {
          "step_number": 1,
          "title": "Nom court de cette étape",
          "content": "Explication détaillée de cette étape en markdown — explique le POURQUOI du raisonnement",
          "method_or_concept": "Nom du concept ou de la règle appliquée (ou null)",
          "is_final_answer": false
        },
        {
          "step_number": 4,
          "title": "Réponse finale",
          "content": "La réponse ou conclusion finale, clairement formulée",
          "method_or_concept": null,
          "is_final_answer": true
        }
      ]
    }
  ]
}

Contraintes :
- Exactement ${count} exercices dans le tableau.
- Entre 4 et 7 étapes par exercice (step_number commence à 1).
- is_final_answer: true UNIQUEMENT pour la dernière étape de chaque exercice.
- difficulty: entier 1, 2 ou 3 (1 = accessible, 2 = intermédiaire, 3 = difficile).
- JSON pur, sans texte, sans balises \`\`\`json\`\`\`.`;
}
