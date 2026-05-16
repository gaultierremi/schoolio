// Matrice de compatibilite vision_type ↔ subject_enum + threshold dynamique.
//
// Probleme observe 2026-05-15 : Vision Haiku classifie une image avec confidence
// 0.95 comme "monument_architectural" alors que le PDF est un cours de math sur
// le cone (l'image est juste une tour avec toit conique). Sonnet genere alors
// une question sur le vocabulaire architectural ("bretèches en encorbellement")
// totalement hors-sujet, mais needs_review n'a pas fire car confidence > 0.8.
//
// Fix : on definit ce qui est "in-domain" pour chaque matiere. Si vision_type
// est hors-domaine pour la matiere du cours :
//   - threshold confidence monte a 0.95 (au lieu de 0.80)
//   - needs_review force a true quelle que soit la confidence si confidence < 0.95
// Cette dual-policy laisse passer les images legitimement liees (ex: tour
// medievale aux fins d'illustration du cone) avec needs_review mais bloque les
// confidence elevees douteuses.

import type { ImageType } from "./image-types";

export const REVIEW_CONFIDENCE_THRESHOLD_IN_DOMAIN = 0.8;
export const REVIEW_CONFIDENCE_THRESHOLD_OUT_OF_DOMAIN = 0.95;

/**
 * In-domain vision_types pour chaque matiere.
 * Source-of-truth : ce qu'on s'attend a voir dans un syllabus de la matiere.
 * Si un vision_type n'est dans AUCUNE matiere, il est in-domain pour tous
 * (ex: table_data, statistical_graph, photo_*).
 */
const SUBJECT_AFFINITY: Record<string, ReadonlySet<ImageType>> = {
  mathematiques: new Set<ImageType>([
    "formula_math", "graph_function", "geometric_figure",
    "table_data", "statistical_graph", "venn_diagram",
    "tree_diagram", "pyramid_diagram", "flowchart", "concept_map",
  ]),
  chimie: new Set<ImageType>([
    "formula_chemical_equation", "molecule_organic", "molecule_inorganic",
    "lewis_structure", "periodic_table_excerpt", "lab_apparatus",
    "formula_math", "table_data", "graph_function", "statistical_graph",
    "flowchart",
  ]),
  physique: new Set<ImageType>([
    "formula_physics_electric", "circuit_diagram", "wave_graph",
    "optics_diagram", "thermodynamic_diagram",
    "formula_math", "graph_function", "geometric_figure",
    "table_data", "lab_apparatus", "statistical_graph",
  ]),
  biologie: new Set<ImageType>([
    "cell_diagram", "anatomy_human", "anatomy_animal", "anatomy_plant",
    "chromosome_diagram", "family_tree_genetic", "ecosystem_diagram",
    "food_chain", "microscopic_image",
    "photo_animal", "photo_plant", "photo_mineral",
    "table_data", "graph_function", "statistical_graph", "concept_map",
  ]),
  histoire: new Set<ImageType>([
    "scene_historical_painting", "scene_historical_photo", "portrait_historical",
    "battle_scene", "daily_life_scene", "monument_architectural",
    "archaeological_artifact", "document_historical", "timeline_historical",
    "map_historical", "map_political", "religious_painting", "religious_icon",
    "biblical_scene", "religious_symbol", "philosophical_portrait",
    "concept_map",
  ]),
  geographie: new Set<ImageType>([
    "map_political", "map_physical", "map_climate", "map_demographic",
    "map_economic", "map_topographic", "map_hydrographic", "map_historical",
    "map_world", "satellite_image", "geological_section",
    "weather_diagram", "urban_diagram",
    "photo_mineral", "photo_plant", "photo_animal",
    "statistical_graph", "graph_function", "table_data", "concept_map",
  ]),
  religion: new Set<ImageType>([
    "religious_painting", "religious_icon", "biblical_scene",
    "religious_symbol", "sacred_text_excerpt", "philosophical_portrait",
    "monument_architectural", "art_painting", "art_sculpture",
    "scene_historical_painting", "document_historical",
  ]),
  francais: new Set<ImageType>([
    "linguistic_table", "literary_excerpt", "author_portrait",
    "etymology_diagram", "concept_map", "tree_diagram",
    "art_painting", "scene_historical_painting", "scene_historical_photo",
  ]),
  neerlandais: new Set<ImageType>([
    "linguistic_table", "literary_excerpt", "author_portrait",
    "etymology_diagram",
  ]),
  anglais: new Set<ImageType>([
    "linguistic_table", "literary_excerpt", "author_portrait",
    "etymology_diagram",
  ]),
  allemand: new Set<ImageType>([
    "linguistic_table", "literary_excerpt", "author_portrait",
    "etymology_diagram",
  ]),
  latin: new Set<ImageType>([
    "linguistic_table", "literary_excerpt", "author_portrait",
    "etymology_diagram", "archaeological_artifact", "monument_architectural",
    "scene_historical_painting", "map_historical", "religious_symbol",
  ]),
  economie: new Set<ImageType>([
    "economic_chart", "economic_flow_diagram", "statistical_graph",
    "sociological_graph", "legal_document_excerpt",
    "table_data", "graph_function", "flowchart", "concept_map",
  ]),
  arts: new Set<ImageType>([
    "art_painting", "art_sculpture", "art_architecture",
    "monument_architectural", "scene_historical_painting",
    "religious_painting", "religious_icon", "religious_symbol",
    "music_score", "musical_instrument",
  ]),
  musique: new Set<ImageType>([
    "music_score", "musical_instrument", "author_portrait",
    "scene_historical_painting", "scene_historical_photo",
  ]),
};

// Types "transversaux" toujours in-domain (data viz, structurels, photos).
const ALWAYS_IN_DOMAIN: ReadonlySet<ImageType> = new Set<ImageType>([
  "table_data", "concept_map", "flowchart", "tree_diagram",
  "venn_diagram", "pyramid_diagram", "statistical_graph",
]);

/**
 * Retourne true si vision_type est "in-domain" pour la matiere donnee.
 * Si subject inconnu/null, on retourne true (pas de filtre).
 */
export function isVisionTypeInDomain(visionType: ImageType, subject: string | null): boolean {
  if (!subject) return true;
  if (ALWAYS_IN_DOMAIN.has(visionType)) return true;
  const affinity = SUBJECT_AFFINITY[subject];
  if (!affinity) return true; // matiere inconnue → on ne filtre pas
  return affinity.has(visionType);
}

/**
 * Threshold confidence dynamique : 0.80 si in-domain, 0.95 si out-of-domain.
 * Plus strict pour les types exotiques (religious_symbol dans cours math, etc.).
 */
export function reviewThresholdFor(visionType: ImageType, subject: string | null): number {
  return isVisionTypeInDomain(visionType, subject)
    ? REVIEW_CONFIDENCE_THRESHOLD_IN_DOMAIN
    : REVIEW_CONFIDENCE_THRESHOLD_OUT_OF_DOMAIN;
}
