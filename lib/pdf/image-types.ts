// Taxonomy d'images PDF pour pipeline B classification Vision (CESS FWB).
// 64 types pedagogiques + 7 types a skip (logos/decoration/icons).
// Sans mecanique physique (forces, dynamique) — pas prioritaire phase 2.
// Cf docs/superpowers/specs/2026-05-15-pdf-images-strategy.md section 4.4

export const IMAGE_TYPES = [
  // === Sciences exactes ===
  "formula_math", "graph_function", "geometric_figure",
  "formula_physics_electric", "circuit_diagram",
  "formula_chemical_equation",
  "molecule_organic", "molecule_inorganic", "lewis_structure",
  "periodic_table_excerpt", "lab_apparatus",
  "wave_graph", "formula_physics_optics",
  // === Sciences du vivant ===
  "cell_diagram", "anatomy_human", "anatomy_animal", "anatomy_plant",
  "chromosome_diagram", "family_tree_genetic", "ecosystem_diagram",
  "food_chain", "photo_animal", "photo_plant", "photo_mineral",
  // === Histoire ===
  "scene_historical_painting", "scene_historical_photo", "portrait_historical",
  "daily_life_scene", "monument_architectural",
  "archaeological_artifact", "document_historical", "timeline_historical",
  // === Geographie ===
  "map_political", "map_physical", "map_climate", "map_demographic",
  "map_economic", "map_topographic",
  "satellite_image", "weather_diagram",
  // === Religion / philosophie ===
  "religious_painting", "religious_icon", "biblical_scene",
  "religious_symbol", "sacred_text_excerpt", "philosophical_portrait",
  // === Langues / lettres ===
  "linguistic_table", "literary_excerpt", "author_portrait",
  // === Arts ===
  "art_painting", "art_sculpture", "art_architecture",
  "music_score", "musical_instrument",
  // === Economie / sociales ===
  "economic_chart", "economic_flow_diagram", "statistical_graph",
  "sociological_graph", "legal_document_excerpt",
  // === Transversal / structurel ===
  "table_data", "concept_map", "flowchart",
  "venn_diagram", "tree_diagram",
  // === A skip (filtrer) ===
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
