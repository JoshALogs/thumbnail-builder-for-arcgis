/**
 * Common ArcGIS item types, each with a Calcite UI icon for the thumbnail chip.
 * The label is exactly what the thumbnail shows. Users can also type their own.
 * @module item-types
 */

/** @type {ReadonlyArray<{label: string, icon: string}>} */
export const ITEM_TYPES = Object.freeze([
  { label: "Web Map", icon: "map" },
  { label: "Web Scene", icon: "globe" },
  { label: "Feature Layer", icon: "feature-layer" },
  { label: "Map Image Layer", icon: "layer-map-service" },
  { label: "Tile Layer", icon: "tile-layer" },
  { label: "Vector Tile Layer", icon: "layer-vector-tile" },
  { label: "Imagery Layer", icon: "image-layer" },
  { label: "Scene Layer", icon: "layers" },
  { label: "Table", icon: "table" },
  { label: "Dashboard", icon: "dashboard" },
  { label: "Experience", icon: "widgets-group" },
  { label: "Instant App", icon: "apps" },
  { label: "Web App", icon: "apps" },
  { label: "StoryMap", icon: "storymap-experience" },
  { label: "Survey", icon: "survey" },
  { label: "Site", icon: "web" },
  { label: "Notebook", icon: "notebook" },
  { label: "Data", icon: "data" },
  { label: "Document", icon: "file-text" },
]);

/**
 * Icon for a label, matched without regard to case or surrounding spaces.
 * @param {string} label
 * @returns {string | null} Calcite icon name, or null for a custom label
 */
export function iconForLabel(label) {
  const key = String(label || "").trim().toLowerCase();
  return ITEM_TYPES.find((t) => t.label.toLowerCase() === key)?.icon ?? null;
}
