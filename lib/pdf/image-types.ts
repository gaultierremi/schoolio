// Taxonomy d'images PDF pour pipeline B classification Vision (CESS FWB).
// 74 types pedagogiques + 7 types a skip = 81 entrees totales.
// Sans mecanique physique (forces, dynamique) — pas prioritaire phase 2.
// Cf docs/superpowers/specs/2026-05-15-pdf-images-strategy.md section 4.4

export const IMAGE_TYPES = [
  // === Sciences exactes (14) ===
  "formula_math", "graph_function", "geometric_figure",
  "formula_physics_electric", "circuit_diagram", "wave_graph",
  "optics_diagram", "thermodynamic_diagram", "formula_chemical_equation",
  "molecule_organic", "molecule_inorganic", "lewis_structure",
  "periodic_table_excerpt", "lab_apparatus",
  // === Sciences du vivant (12) ===
  "cell_diagram", "anatomy_human", "anatomy_animal", "anatomy_plant",
  "chromosome_diagram", "family_tree_genetic", "ecosystem_diagram",
  "food_chain", "microscopic_image", "photo_animal", "photo_plant", "photo_mineral",
  // === Histoire (9) ===
  "scene_historical_painting", "scene_historical_photo", "portrait_historical",
  "battle_scene", "daily_life_scene", "monument_architectural",
  "archaeological_artifact", "document_historical", "timeline_historical",
  // === Geographie (13) ===
  "map_political", "map_physical", "map_climate", "map_demographic",
  "map_economic", "map_topographic", "map_hydrographic", "map_historical",
  "map_world", "satellite_image", "geological_section",
  "weather_diagram", "urban_diagram",
  // === Religion / philosophie (6) ===
  "religious_painting", "religious_icon", "biblical_scene",
  "religious_symbol", "sacred_text_excerpt", "philosophical_portrait",
  // === Langues / lettres (4) ===
  "linguistic_table", "literary_excerpt", "author_portrait", "etymology_diagram",
  // === Arts (5) ===
  "art_painting", "art_sculpture", "art_architecture",
  "music_score", "musical_instrument",
  // === Economie / sociales (5) ===
  "economic_chart", "economic_flow_diagram", "statistical_graph",
  "sociological_graph", "legal_document_excerpt",
  // === Transversal / structurel (6) ===
  "table_data", "concept_map", "flowchart",
  "venn_diagram", "tree_diagram", "pyramid_diagram",
  // === A skip (filtrer) (7) ===
  "logo", "decoration", "icon", "header_footer",
  "qr_code", "barcode", "cover_page_element",
] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

export const SKIP_TYPES: readonly ImageType[] = [
  "logo", "decoration", "icon", "header_footer",
  "qr_code", "barcode", "cover_page_element",
];

export function isSkipType(t: ImageType): boolean {
  return SKIP_TYPES.includes(t);
}

export function isValidImageType(value: unknown): value is ImageType {
  return typeof value === "string" && (IMAGE_TYPES as readonly string[]).includes(value);
}
