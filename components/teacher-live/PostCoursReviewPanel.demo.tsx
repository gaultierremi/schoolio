"use client";

import { useState } from "react";
import PostCoursReviewPanel from "@/components/teacher-live/PostCoursReviewPanel";

const initialSummary = `## Réactions chimiques — 4e sciences

- Nous avons distingué transformation physique et transformation chimique.
- Une réaction chimique transforme des réactifs en produits.
- Les indices observables sont notamment le dégagement de gaz, le changement de couleur et la production de chaleur.
- L'équation chimique sert à représenter la conservation des atomes.
- Les élèves doivent encore s'entraîner à identifier les réactifs et les produits dans une situation expérimentale.`;

const initialQuiz = [
  {
    question: "Quelle différence fais-tu entre une transformation physique et une transformation chimique ?",
    expected_answer:
      "Une transformation physique change l'état ou l'aspect sans créer de nouvelle substance, alors qu'une transformation chimique produit de nouvelles substances.",
  },
  {
    question: "Dans l'expérience vinaigre + bicarbonate, quels indices montrent qu'une réaction a lieu ?",
    expected_answer:
      "Le dégagement de gaz, la formation de bulles et parfois une variation de température indiquent une réaction chimique.",
  },
  {
    question: "Pourquoi doit-on équilibrer une équation chimique ?",
    expected_answer:
      "Pour respecter la conservation des atomes : chaque type d'atome doit être présent en même nombre avant et après la réaction.",
  },
];

const initialFlashcards = [
  {
    concept: "Réactif",
    definition: "Substance présente au départ et consommée pendant une réaction chimique.",
  },
  {
    concept: "Produit",
    definition: "Nouvelle substance formée à la fin d'une réaction chimique.",
  },
  {
    concept: "Transformation chimique",
    definition: "Transformation au cours de laquelle de nouvelles substances apparaissent.",
  },
  {
    concept: "Conservation des atomes",
    definition: "Principe selon lequel les atomes ne disparaissent pas et ne sont pas créés pendant une réaction.",
  },
  {
    concept: "Équation chimique",
    definition: "Représentation symbolique des réactifs, des produits et de leurs proportions.",
  },
];

export default function PostCoursReviewPanelDemo() {
  const [summary, setSummary] = useState(initialSummary);
  const [quiz, setQuiz] = useState(initialQuiz);
  const [flashcards, setFlashcards] = useState(initialFlashcards);

  return (
    <PostCoursReviewPanel
      summary={summary}
      quiz={quiz}
      flashcards={flashcards}
      onSummaryChange={setSummary}
      onQuizChange={(index, updated) => {
        setQuiz((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? updated : item)),
        );
      }}
      onFlashcardChange={(index, updated) => {
        setFlashcards((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? updated : item)),
        );
      }}
      onFlashcardAdd={() => {
        setFlashcards((current) => [
          ...current,
          { concept: "Nouveau concept", definition: "Définition à compléter." },
        ]);
      }}
      onFlashcardRemove={(index) => {
        setFlashcards((current) => current.filter((_, itemIndex) => itemIndex !== index));
      }}
      onValidate={() => {
        console.log({ summary, quiz, flashcards });
      }}
      onCancel={() => {
        console.log("Post-cours review cancelled");
      }}
    />
  );
}
