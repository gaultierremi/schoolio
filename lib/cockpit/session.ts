import { randomBytes } from "crypto";
import type { DemoPdfKey } from "@/types/post-course";

const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

// crypto.randomBytes — pas Math.random() (CLAUDE.md rule 9)
export function generateSessionCode(): string {
  const buf = randomBytes(CODE_LENGTH);
  return Array.from(buf)
    .map((b) => CHARSET[b % CHARSET.length])
    .join("");
}

export type DemoPdf = {
  key: DemoPdfKey;
  title: string;
  subject: string;
  description: string;
};

export const DEMO_PDFS: DemoPdf[] = [
  {
    key: "demo-1",
    title: "Chimie Organique",
    subject: "Mécanismes réactionnels",
    description: "Substitutions, éliminations, additions — cours L2",
  },
  {
    key: "demo-2",
    title: "Mécanique Newtonienne",
    subject: "Dynamique et forces",
    description: "Lois de Newton, travail-énergie, quantité de mouvement",
  },
  {
    key: "demo-3",
    title: "Thermodynamique",
    subject: "Systèmes et transferts",
    description: "Lois fondamentales, cycles, entropie",
  },
];

// Fallback whispers hardcodés par PDF — utilisés si transcript < 50 chars
export const WHISPER_FALLBACKS: Record<DemoPdfKey, string[]> = {
  "demo-1": [
    "La différence SN1 vs SN2, c'est le nombre d'étapes ou la stéréochimie ?",
    "Pourquoi l'eau est un bon nucléophile mais un mauvais leaving group ?",
    "Est-ce qu'on doit connaître tous les mécanismes par cœur pour l'examen ?",
  ],
  "demo-2": [
    "Dans la 2ème loi, la masse c'est toujours la masse totale du système ?",
    "Quand on dit 'forces équilibrées', ça veut dire vitesse nulle ou constante ?",
    "La force centripète, elle apparaît dans quel référentiel exactement ?",
  ],
  "demo-3": [
    "Le cycle de Carnot, c'est réalisable en pratique ou juste théorique ?",
    "Delta S positif ça veut dire quoi concrètement pour une réaction ?",
    "Pourquoi la chaleur ne peut pas passer du froid vers le chaud spontanément ?",
  ],
};
