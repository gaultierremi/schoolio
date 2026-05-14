"use client";

import { useState } from "react";
import {
  PostCoursReviewPanel,
  type PostCoursHomeworkItem,
} from "@/app/feat/cockpit/_components/PostCoursReviewPanel";

const initialSummary = `## Cours de sciences - stoechiometrie

Aujourd'hui, la classe a travaillé sur le lien entre une équation chimique équilibrée et les quantités de réactifs consommées.

- Une équation équilibrée conserve le nombre d'atomes de chaque élément.
- Les coefficients indiquent des proportions entre molécules ou moles.
- Le réactif limitant est celui qui est entièrement consommé en premier.

Point d'attention pour la prochaine séance : consolider le passage entre lecture qualitative et calcul quantitatif.`;

const initialQuiz = [
  {
    question:
      "Dans l'équation 2 H2 + O2 -> 2 H2O, que signifie le coefficient 2 devant H2 ?",
    expected_answer:
      "Il indique que deux molécules, ou deux moles, de dihydrogène réagissent proportionnellement avec une mole de dioxygène.",
  },
  {
    question:
      "Pourquoi faut-il équilibrer une équation chimique avant de faire un calcul de quantité ?",
    expected_answer:
      "Parce que les coefficients équilibrés donnent les proportions correctes entre réactifs et produits.",
  },
  {
    question:
      "Comment reconnaît-on le réactif limitant dans un exercice simple ?",
    expected_answer:
      "On compare les quantités disponibles aux proportions de l'équation ; celui qui manque en premier limite la réaction.",
  },
];

const initialFlashcards = [
  {
    concept: "Stoechiometrie",
    definition:
      "Étude des proportions entre réactifs et produits dans une réaction chimique.",
  },
  {
    concept: "Coefficient stoechiometrique",
    definition:
      "Nombre placé devant une formule chimique pour équilibrer une équation.",
  },
  {
    concept: "Réactif limitant",
    definition:
      "Réactif entièrement consommé qui détermine la quantité maximale de produit formé.",
  },
  {
    concept: "Mole",
    definition:
      "Unité de quantité de matière utilisée pour compter un très grand nombre d'entités chimiques.",
  },
  {
    concept: "Conservation des atomes",
    definition:
      "Principe selon lequel les atomes présents avant la réaction se retrouvent après la réaction.",
  },
];

const initialHomework: PostCoursHomeworkItem[] = [
  {
    title: "Équilibrer trois réactions",
    instructions:
      "Équilibre les équations données dans le cahier et indique les coefficients utilisés.",
    dueLabel: "Pour le prochain cours",
    estimatedMinutes: 15,
  },
  {
    title: "Identifier le réactif limitant",
    instructions:
      "Résous l'exercice 4 en détaillant la comparaison des proportions.",
    dueLabel: "Vendredi",
    estimatedMinutes: 20,
  },
  {
    title: "Phrase de synthèse",
    instructions:
      "Rédige en cinq lignes ce que les coefficients d'une équation équilibrée permettent de prévoir.",
    dueLabel: "Cette semaine",
    estimatedMinutes: 10,
  },
];

export default function PostCoursReviewDemo() {
  const [summary, setSummary] = useState(initialSummary);
  const [quiz, setQuiz] = useState(initialQuiz);
  const [flashcards, setFlashcards] = useState(initialFlashcards);
  const [homework, setHomework] = useState(initialHomework);

  return (
    <PostCoursReviewPanel
      summary={summary}
      quiz={quiz}
      flashcards={flashcards}
      homework={homework}
      onSummaryChange={setSummary}
      onQuizChange={(index, updated) =>
        setQuiz((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? updated : item)),
        )
      }
      onFlashcardChange={(index, updated) =>
        setFlashcards((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? updated : item)),
        )
      }
      onFlashcardAdd={() =>
        setFlashcards((current) => [
          ...current,
          { concept: "Nouveau concept", definition: "Définition à compléter." },
        ])
      }
      onFlashcardRemove={(index) =>
        setFlashcards((current) =>
          current.filter((_, itemIndex) => itemIndex !== index),
        )
      }
      onHomeworkChange={(index, updated) =>
        setHomework((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? updated : item)),
        )
      }
      onValidate={() => {
        console.log({ summary, quiz, flashcards, homework });
      }}
      onCancel={() => {
        console.log("Post-cours review cancelled");
      }}
    />
  );
}
