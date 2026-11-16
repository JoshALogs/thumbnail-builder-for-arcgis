/**
 * Draws a layout (see layouts.js) onto a 2D canvas context.
 *
 * The renderer only touches the context it is given, so the same code paints
 * the live preview, the small tile previews, and the exported PNG. Text color
 * is chosen by sampling the pixels already drawn behind each text block, which
 * is also how the contrast report is measured.
 * @module renderer
 */
import { ellipsize, fitText } from "./text.js";
import { contourPaths, hashSeed } from "./patterns.js";
import { DARK_TEXT, LIGHT_TEXT, clamp, luminanceOfPixel, parseColor, pickTextColor, toCss } from "./color.js";

/** Font stack for all thumbnail text. Open Sans is bundled, so output matches on every machine. */
export const FONT_FAMILY = '"Open Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Conditions a layer's `when` may list. */
export const CONDITIONS = Object.freeze(["background", "noBackground", "logo", "noLogo", "category", "noCategory"]);

/** Luminance histogram resolution used when sampling backdrops. */
const BINS = 256;

/**
 * @typedef {object} RenderValues
 * @property {string} title
 * @property {string} category item type label ("" for none)
 * @property {boolean} showIcon draw the item type icon in chips
 * @property {string} canvas base color
 * @property {string} accent band, panel, and tint color (may be translucent)
 * @property {string} chip chip background color
 * @property {string} patternColor contour line color
 * @property {"contours" | "none"} pattern
 * @property {number} scrim 0-1 strength of the shade over images
 * @property {"auto" | "light" | "dark"} textMode
 * @property {number} focusX 0-1 horizontal crop focus for images
 * @property {number} focusY 0-1 vertical crop focus for images
 * @property {number} logoScale multiplier for logo boxes
 * @property {string} seed stable text that seeds the pattern
 */

/**
 * @typedef {object} ImageAsset
 * @property {CanvasImageSource} image
 * @property {number} width natural width, px
 * @property {number} height natural height, px
 * @property {{x: number, y: number, w: number, h: number} | null} [bbox] opaque area (logos)
 */

/**
 * @typedef {object} RenderAssets
 * @property {ImageAsset | null} background
 * @property {ImageAsset | null} logo
 * @property {Path2D | null} icon 24x24 item type icon
 */

/**
 * @typedef {object} TextReport
 * @property {string} slot "title" or "category"
 * @property {string} color text color drawn
 * @property {number | null} ratio worst-case contrast, or null if it couldn't be measured
 */

/**
 * Font shorthand for the canvas.
 * @param {number} weight
 * @param {number} size px
 * @returns {string}
 */
function font(weight, size) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

/**
 * Resolve "$name" references against the render values.
 * @param {unknown} value
 * @param {RenderValues} values
 * @returns {any}
 */
function resolve(value, values) {
  return typeof value === "string" && value.startsWith("$") ? values[value.slice(1)] : value;
}

/**
 * A layer's box as an object, defaulting to the whole canvas.
 * @param {{box?: number[]}} layer
 * @param {{W: number, H: number}} env
 * @returns {{x: number, y: number, w: number, h: number}}
 */
function boxOf(layer, env) {
  const [x, y, w, h] = layer.box ?? [0, 0, env.W, env.H];
  return { x, y, w, h };
}

/**
 * Offset that places `inner` within `outer` for an alignment keyword.
 * Accepts start/left/top, center/middle, and end/right/bottom.
 * @param {string | undefined} mode
 * @param {number} outer
 * @param {number} inner
 * @returns {number}
 */
function offset(mode, outer, inner) {
  if (mode === "center" || mode === "middle") return (outer - inner) / 2;
  if (mode === "end" || mode === "right" || mode === "bottom") return outer - inner;
  return 0;
}

/**
 * True when every condition in a layer's `when` holds.
 * @param {string | string[] | undefined} when
 * @param {RenderValues} values
 * @param {RenderAssets} assets
 * @returns {boolean}
 */
function conditionsMet(when, values, assets) {
  if (!when) return true;
  const hasCategory = Boolean(String(values.category ?? "").trim());
  return (Array.isArray(when) ? when : [when]).every((condition) => {
    switch (condition) {
      case "background": return Boolean(assets.background);
      case "noBackground": return !assets.background;
      case "logo": return Boolean(assets.logo);
      case "noLogo": return !assets.logo;
      case "category": return hasCategory;
      case "noCategory": return !hasCategory;
      default: return true;
    }
  });
}

/**
 * Value at a quantile of a luminance histogram.
 * @param {Uint32Array} hist
 * @param {number} count samples in the histogram
 * @param {number} q quantile, 0-1
 * @param {boolean} upperEdge report the bin's upper edge (true) or lower edge
 * @returns {number}
 */
function quantile(hist, count, q, upperEdge) {
  const target = Math.max(1, Math.ceil(q * count));
  let seen = 0;
  for (let k = 0; k < hist.length; k++) {
    seen += hist[k];
    if (seen >= target) return (upperEdge ? k + 1 : k) / hist.length;
  }
  return upperEdge ? 1 : 0;
}

/**
 * Luminance of the darkest and lightest parts of what is already drawn in a
 * box, ignoring the extreme 5% at each end so stray pixels don't dominate.
 * Returns null if the pixels can't be read.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, w: number, h: number}} box output pixels
 * @returns {{min: number, max: number} | null}
 */
function sampleBackdrop(ctx, box) {
  const t = ctx.getTransform();
  const x0 = Math.max(0, Math.floor(box.x * t.a + t.e));
  const y0 = Math.max(0, Math.floor(box.y * t.d + t.f));
  const x1 = Math.min(ctx.canvas.width, Math.ceil((box.x + box.w) * t.a + t.e));
  const y1 = Math.min(ctx.canvas.height, Math.ceil((box.y + box.h) * t.d + t.f));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;

  let data;
  try {
    data = ctx.getImageData(x0, y0, w, h).data;
  } catch {
    return null; // tainted canvas
  }

  const hist = new Uint32Array(BINS);
  const stride = Math.max(1, Math.floor(Math.sqrt((w * h) / 16000)));
  let count = 0;
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      // Flatten transparency onto white, the usual page color behind thumbnails.
      const r = a === 255 ? data[i] : Math.round((data[i] * a + 255 * (255 - a)) / 255);
      const g = a === 255 ? data[i + 1] : Math.round((data[i + 1] * a + 255 * (255 - a)) / 255);
      const b = a === 255 ? data[i + 2] : Math.round((data[i + 2] * a + 255 * (255 - a)) / 255);
      hist[Math.min(BINS - 1, Math.floor(luminanceOfPixel(r, g, b) * BINS))]++;
      count++;
    }
  }
  return { min: quantile(hist, count, 0.05, false), max: quantile(hist, count, 0.95, true) };
}

/**
 * Choose a text color for a box and measure its contrast.
 * @param {object} env
 * @param {{x: number, y: number, w: number, h: number}} box
 * @returns {{color: string, ratio: number | null}}
 */
function chooseTextColor(env, box) {
  const range = sampleBackdrop(env.ctx, box);
  if (!range) {
    return { color: env.values.textMode === "dark" ? DARK_TEXT : LIGHT_TEXT, ratio: null };
  }
  return pickTextColor(range, env.values.textMode);
}

/**
 * Draw an image so it covers a box, cropping around the focus point.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ImageAsset} asset
 * @param {{x: number, y: number, w: number, h: number}} box
 * @param {number} focusX 0-1
 * @param {number} focusY 0-1
 */
function drawCover(ctx, asset, box, focusX, focusY) {
  const scale = Math.max(box.w / asset.width, box.h / asset.height);
  const sw = box.w / scale;
  const sh = box.h / scale;
  const sx = (asset.width - sw) * clamp(focusX ?? 0.5, 0, 1);
  const sy = (asset.height - sh) * clamp(focusY ?? 0.5, 0, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(asset.image, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
}

/**
 * Trace a pill (fully rounded rectangle).
 * @param {CanvasRenderingContext2D} ctx
 */
function pill(ctx, x, y, w, h) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, h / 2);
  else ctx.rect(x, y, w, h);
}

/** Painters keyed by layer type. Each runs inside its own save()/restore(). */
const PAINTERS = {
  fill(env, layer) {
    const color = resolve(layer.color, env.values);
    if (!color) return;
    const box = boxOf(layer, env);
    env.ctx.fillStyle = color;
    env.ctx.fillRect(box.x, box.y, box.w, box.h);
  },

  circle(env, layer) {
    const color = resolve(layer.color, env.values);
    if (!color) return;
    env.ctx.beginPath();
    env.ctx.arc(layer.cx, layer.cy, layer.r, 0, Math.PI * 2);
    env.ctx.fillStyle = color;
    env.ctx.fill();
  },

  pattern(env, layer) {
    const { ctx, values } = env;
    if (values.pattern === "none" || !values.patternColor) return;
    const box = boxOf(layer, env);
    const { minor, index } = contourPaths(box.w, box.h, hashSeed(String(values.seed ?? "")));
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.translate(box.x, box.y);
    ctx.strokeStyle = values.patternColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 1;
    ctx.stroke(minor);
    ctx.lineWidth = 2;
    ctx.stroke(index);
  },

  image(env, layer) {
    const asset = env.assets[layer.slot];
    if (!asset) return;
    drawCover(env.ctx, asset, boxOf(layer, env), env.values.focusX, env.values.focusY);
  },

  gradient(env, layer) {
    const { ctx, values } = env;
    const box = boxOf(layer, env);
    const base = parseColor(layer.color ?? "#000000") ?? { r: 0, g: 0, b: 0, a: 1 };
    const from = clamp(Number(resolve(layer.from, values)) || 0, 0, 1);
    const to = clamp(Number(resolve(layer.to, values)) || 0, 0, 1);
    // Vertical, "from" at the top. Eased stops avoid a hard edge where the shade ends.
    const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const eased = t * t * (3 - 2 * t);
      g.addColorStop(t, toCss({ ...base, a: from + (to - from) * eased }));
    }
    ctx.fillStyle = g;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  },

  text(env, layer) {
    const { ctx, values } = env;
    let content = String(values[layer.slot] ?? "").trim();
    if (!content) return;
    if (layer.uppercase) content = content.toUpperCase();

    const box = boxOf(layer, env);
    const weight = layer.weight ?? 700;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${layer.tracking ?? 0}px`;
    const measure = (text, size) => {
      ctx.font = font(weight, size);
      return ctx.measureText(text).width;
    };
    const fit = fitText(content, box, layer, measure);
    ctx.font = font(weight, fit.size);
    const widths = fit.lines.map((line) => ctx.measureText(line).width);
    const blockW = Math.max(0, ...widths);
    const blockH = fit.lines.length * fit.lineHeight;
    const top = box.y + offset(layer.valign, box.h, blockH);

    // Measure contrast where the text actually sits, before drawing it.
    const sampleBox = { x: box.x + offset(layer.align, box.w, blockW), y: top, w: blockW, h: blockH };
    const { color, ratio } = chooseTextColor(env, sampleBox);
    env.report.texts.push({ slot: layer.slot, color, ratio });

    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fit.lines.forEach((line, i) => {
      const x = box.x + offset(layer.align, box.w, widths[i]);
      ctx.fillText(line, x, top + fit.lineHeight * (i + 0.5));
    });
  },

  chip(env, layer) {
    const { ctx, values, assets } = env;
    const label = String(values[layer.slot] ?? "").trim();
    if (!label) return;

    const region = boxOf(layer, env);
    const h = region.h;
    const size = Math.round(h * 0.42);
    const padX = Math.round(h * 0.4);
    const icon = values.showIcon ? assets.icon : null;
    const iconSize = icon ? Math.round(h * 0.5) : 0;
    const gap = icon ? Math.round(h * 0.22) : 0;

    ctx.font = font(600, size);
    const measure = (text) => ctx.measureText(text).width;
    const room = region.w - padX * 2 - iconSize - gap;
    const text = measure(label) <= room ? label : ellipsize(label, room, size, measure);
    const w = Math.min(region.w, padX * 2 + iconSize + gap + measure(text));
    const x = region.x + offset(layer.align, region.w, w);
    const y = region.y;

    pill(ctx, x, y, w, h);
    ctx.fillStyle = resolve(layer.fill ?? "$chip", values);
    ctx.fill();

    const { color, ratio } = chooseTextColor(env, { x: x + h / 2, y, w: Math.max(1, w - h), h });
    env.report.texts.push({ slot: layer.slot, color, ratio });
    ctx.fillStyle = color;

    let cursor = x + padX;
    if (icon) {
      ctx.save();
      ctx.translate(cursor, y + (h - iconSize) / 2);
      ctx.scale(iconSize / 24, iconSize / 24);
      ctx.fill(icon);
      ctx.restore();
      cursor += iconSize + gap;
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cursor, y + h / 2);
  },

  rule(env, layer) {
    const box = boxOf(layer, env);
    env.ctx.fillStyle = chooseTextColor(env, box).color;
    env.ctx.fillRect(box.x, box.y, box.w, box.h);
  },

  logo(env, layer) {
    const asset = env.assets.logo;
    if (!asset) return;
    const { ctx, values } = env;
    const region = boxOf(layer, env);
    // Scale the box from its aligned edge, so a corner logo grows inward.
    const scale = clamp(Number(values.logoScale) || 1, 0.25, 3);
    const bw = region.w * scale;
    const bh = region.h * scale;
    const bx = region.x + offset(layer.align, region.w, bw);
    const by = region.y + offset(layer.valign, region.h, bh);

    const src = asset.bbox ?? { x: 0, y: 0, w: asset.width, h: asset.height };
    const fit = Math.min(bw / src.w, bh / src.h);
    const dw = src.w * fit;
    const dh = src.h * fit;
    const dx = bx + offset(layer.align, bw, dw);
    const dy = by + offset(layer.valign, bh, dh);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (layer.shadow !== false) {
      // Canvas shadows ignore the transform, so scale them to match HiDPI previews.
      const k = ctx.getTransform().a || 1;
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 6 * k;
      ctx.shadowOffsetY = 1 * k;
    }
    ctx.drawImage(asset.image, src.x, src.y, src.w, src.h, dx, dy, dw, dh);
  },
};

/** Layer types the renderer understands. */
export const LAYER_TYPES = Object.freeze(Object.keys(PAINTERS));

/**
 * Render a layout. The context must already be scaled so one unit is one
 * output pixel (setTransform(dpr, 0, 0, dpr, 0, 0) for a HiDPI preview).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{size: number[], layers: object[]}} layout
 * @param {RenderValues} values
 * @param {RenderAssets} assets
 * @returns {{texts: TextReport[]}} contrast of every text block drawn
 */
export function renderThumbnail(ctx, layout, values, assets) {
  const [W, H] = layout.size;
  const env = { ctx, W, H, values, assets, report: { texts: [] } };
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  for (const layer of layout.layers) {
    if (!conditionsMet(layer.when, values, assets)) continue;
    const paint = PAINTERS[layer.type];
    if (!paint) continue;
    ctx.save();
    paint(env, layer);
    ctx.restore();
  }
  ctx.restore();
  return env.report;
}
