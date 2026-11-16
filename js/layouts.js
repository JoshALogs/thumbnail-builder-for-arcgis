/**
 * Built-in layouts.
 *
 * A layout is plain data: an output size and a stack of layers drawn bottom to
 * top. Coordinates are output pixels, and every `box` is [x, y, width, height].
 * Strings starting with "$" are looked up in the current theme and settings at
 * render time (see renderer.js), so one layout works with every theme.
 *
 * Layer types: fill, circle, pattern, image, gradient, text, chip, rule, logo.
 * A layer's `when` lists conditions that must all hold for it to draw:
 * background, noBackground, logo, noLogo, category, noCategory.
 * @module layouts
 */

/** ArcGIS's recommended item thumbnail size (3:2). */
const ITEM_SIZE = [600, 400];

/** Group thumbnails display square. */
const GROUP_SIZE = [400, 400];

/** @type {ReadonlyArray<object>} */
export const LAYOUTS = Object.freeze([
  {
    id: "item-banner",
    kind: "item",
    name: "Banner",
    description: "Image above a solid title band",
    size: ITEM_SIZE,
    layers: [
      { type: "fill", color: "$canvas" },
      { type: "pattern", when: "noBackground" },
      { type: "image", slot: "background" },
      { type: "gradient", box: [0, 0, 600, 150], from: "$scrim", to: 0, when: "background" },
      { type: "fill", color: "$accent", box: [0, 292, 600, 108] },
      {
        type: "text", slot: "title", box: [32, 304, 536, 84],
        maxSize: 40, minSize: 18, weight: 700, lineHeight: 1.12, maxLines: 2, align: "left", valign: "middle",
      },
      { type: "chip", slot: "category", box: [24, 24, 380, 40], align: "start", when: "category" },
      { type: "logo", box: [476, 24, 100, 100], align: "end", valign: "start", when: "logo" },
    ],
  },
  {
    id: "item-panel",
    kind: "item",
    name: "Panel",
    description: "Image beside a solid title panel",
    size: ITEM_SIZE,
    layers: [
      { type: "fill", color: "$canvas" },
      { type: "pattern", box: [0, 0, 372, 400], when: "noBackground" },
      { type: "image", slot: "background", box: [0, 0, 372, 400] },
      { type: "fill", color: "$accent", box: [372, 0, 228, 400] },
      {
        type: "text", slot: "category", box: [396, 36, 180, 40], when: "category",
        maxSize: 15, minSize: 11, weight: 700, lineHeight: 1.2, maxLines: 2, align: "left", valign: "top",
        uppercase: true, tracking: 1.2,
      },
      { type: "rule", box: [396, 84, 44, 4], when: "category" },
      {
        type: "text", slot: "title", box: [396, 104, 180, 190], when: "category",
        maxSize: 34, minSize: 15, weight: 700, lineHeight: 1.14, maxLines: 6, align: "left", valign: "top",
      },
      {
        type: "text", slot: "title", box: [396, 40, 180, 254], when: "noCategory",
        maxSize: 36, minSize: 15, weight: 700, lineHeight: 1.14, maxLines: 7, align: "left", valign: "top",
      },
      { type: "logo", box: [396, 304, 180, 72], align: "start", valign: "end", when: "logo" },
    ],
  },
  {
    id: "item-poster",
    kind: "item",
    name: "Poster",
    description: "Centered title on a tinted image or pattern",
    size: ITEM_SIZE,
    layers: [
      { type: "fill", color: "$canvas" },
      { type: "image", slot: "background", when: "background" },
      { type: "fill", color: "$accent" },
      { type: "pattern", when: "noBackground" },
      { type: "logo", box: [250, 28, 100, 100], align: "center", valign: "start", when: "logo" },
      {
        type: "text", slot: "title", box: [48, 140, 504, 150], when: "logo",
        maxSize: 46, minSize: 20, weight: 700, lineHeight: 1.1, maxLines: 3, align: "center", valign: "middle",
      },
      {
        type: "text", slot: "title", box: [48, 64, 504, 226], when: "noLogo",
        maxSize: 50, minSize: 20, weight: 700, lineHeight: 1.1, maxLines: 4, align: "center", valign: "middle",
      },
      { type: "chip", slot: "category", box: [80, 318, 440, 40], align: "center", when: "category" },
    ],
  },
  {
    id: "group-banner",
    kind: "group",
    name: "Banner",
    description: "Image or logo above a title band",
    size: GROUP_SIZE,
    layers: [
      { type: "fill", color: "$canvas" },
      { type: "pattern", when: "noBackground" },
      { type: "image", slot: "background" },
      { type: "logo", box: [120, 64, 160, 160], align: "center", valign: "middle", when: "logo" },
      { type: "fill", color: "$accent", box: [0, 296, 400, 104] },
      {
        type: "text", slot: "title", box: [24, 306, 352, 84],
        maxSize: 34, minSize: 16, weight: 700, lineHeight: 1.12, maxLines: 2, align: "center", valign: "middle",
      },
    ],
  },
  {
    id: "group-badge",
    kind: "group",
    name: "Badge",
    description: "Logo in a circle above the title",
    size: GROUP_SIZE,
    layers: [
      { type: "fill", color: "$canvas" },
      { type: "image", slot: "background", when: "background" },
      { type: "pattern", when: "noBackground" },
      { type: "gradient", box: [0, 230, 400, 170], from: 0, to: "$scrim", when: "background" },
      { type: "circle", cx: 200, cy: 156, r: 112, color: "$accent", when: "logo" },
      { type: "logo", box: [128, 84, 144, 144], align: "center", valign: "middle", shadow: false, when: "logo" },
      {
        type: "text", slot: "title", box: [28, 290, 344, 88], when: "logo",
        maxSize: 32, minSize: 16, weight: 700, lineHeight: 1.12, maxLines: 2, align: "center", valign: "middle",
      },
      // Without a logo, the title takes the middle of the badge instead.
      { type: "circle", cx: 200, cy: 200, r: 168, color: "$accent", when: "noLogo" },
      {
        type: "text", slot: "title", box: [64, 112, 272, 176], when: "noLogo",
        maxSize: 40, minSize: 16, weight: 700, lineHeight: 1.12, maxLines: 4, align: "center", valign: "middle",
      },
    ],
  },
]);

/**
 * Layouts for one thumbnail kind, in display order.
 * @param {"item" | "group"} kind
 * @returns {object[]}
 */
export function layoutsFor(kind) {
  return LAYOUTS.filter((layout) => layout.kind === kind);
}

/**
 * Look up a layout by id.
 * @param {string} id
 * @returns {object | null}
 */
export function getLayout(id) {
  return LAYOUTS.find((layout) => layout.id === id) || null;
}

/**
 * The kind ("item" or "group") a layout id belongs to, or null if unknown.
 * @param {string} id
 * @returns {"item" | "group" | null}
 */
export function layoutKind(id) {
  return getLayout(id)?.kind ?? null;
}
