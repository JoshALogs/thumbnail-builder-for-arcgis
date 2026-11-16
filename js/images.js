/**
 * Image slots for the background and logo.
 *
 * A slot loads from a file (picked, dropped, or pasted) or a URL, ignores any
 * load that finishes after a newer one started, and keeps only what the
 * renderer needs. Cross-origin URLs are requested with CORS, so an image that
 * loads can always be exported; one that can't be shared fails up front with
 * a clear message instead of breaking the download later.
 * @module images
 */

/** Largest file accepted, to keep the tab responsive. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * True when a URL points at a different origin than this page.
 * @param {string} url
 * @returns {boolean}
 */
function isCrossOrigin(url) {
  try {
    return new URL(url, location.href).origin !== location.origin;
  } catch {
    return false;
  }
}

/**
 * Bounding box of a logo's opaque pixels, so transparent padding around the
 * artwork doesn't shrink or shift it. Scans a copy at most 512 px across.
 * @param {CanvasImageSource} image
 * @param {number} width natural width
 * @param {number} height natural height
 * @returns {{x: number, y: number, w: number, h: number} | null} null to use the full frame
 */
function opaqueBounds(image, width, height) {
  const scale = Math.min(1, 512 / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * scale));
  const sh = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, sw, sh);
  let data;
  try {
    data = ctx.getImageData(0, 0, sw, sh).data;
  } catch {
    return null;
  }
  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (data[(y * sw + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  // Map back to source pixels, padded by one sample so soft edges survive.
  const inv = 1 / scale;
  const x0 = Math.max(0, Math.floor((minX - 1) * inv));
  const y0 = Math.max(0, Math.floor((minY - 1) * inv));
  const x1 = Math.min(width, Math.ceil((maxX + 2) * inv));
  const y1 = Math.min(height, Math.ceil((maxY + 2) * inv));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Long side, in px, of the bitmap a logo is redrawn into (covers a 200% logo on a 3x screen). */
const LOGO_RASTER = 1024;

/** Long side, in px, of the bitmap an SVG background is redrawn into. */
const SVG_BACKGROUND_RASTER = 2400;

/**
 * Redraw an image into a canvas with a known pixel size. Drawing an SVG through
 * a source crop on a scaled canvas is unreliable in some browsers, so SVGs and
 * logos are turned into plain bitmaps once, at load.
 * @param {HTMLImageElement} image
 * @param {number} width natural width
 * @param {number} height natural height
 * @param {number} longSide target size of the longer edge, px
 * @returns {{canvas: HTMLCanvasElement, width: number, height: number}}
 */
function rasterize(image, width, height, longSide) {
  const scale = longSide / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, w, h);
  return { canvas, width: w, height: h };
}

/**
 * Load and decode an image, ready for the renderer.
 * @param {string} src
 * @param {{cors: boolean, trim: boolean, svg: boolean}} options
 *   cors: request with crossOrigin="anonymous"; trim: logo handling (bitmap
 *   plus opaque bounding box); svg: the source is an SVG
 * @returns {Promise<import("./renderer.js").ImageAsset>}
 */
function decode(src, { cors, trim, svg }) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (cors) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) {
        reject(new Error("That image has no size. An SVG needs width and height attributes."));
        return;
      }
      if (!trim && !svg) {
        resolve({ image, width, height, bbox: null });
        return;
      }
      const bitmap = rasterize(image, width, height, trim ? LOGO_RASTER : SVG_BACKGROUND_RASTER);
      resolve({
        image: bitmap.canvas,
        width: bitmap.width,
        height: bitmap.height,
        bbox: trim ? opaqueBounds(bitmap.canvas, bitmap.width, bitmap.height) : null,
      });
    };
    image.onerror = () => {
      reject(
        new Error(
          cors
            ? "That image couldn't be loaded. The site may not allow other sites to use it. Download it, then upload the file instead."
            : "That file couldn't be read as an image.",
        ),
      );
    };
    image.src = src;
  });
}

/** One image input (background or logo). */
export class ImageSlot {
  /**
   * @param {{trim?: boolean}} [options] trim: crop transparent padding (logos)
   */
  constructor({ trim = false } = {}) {
    this.trim = trim;
    /** @type {import("./renderer.js").ImageAsset | null} */
    this.asset = null;
    /** Where the current image came from: "none", "theme", or "user". */
    this.source = "none";
    /** Shareable URL of the current image, or "" (uploads can't be shared). */
    this.url = "";
    this._seq = 0;
    this._objectUrl = "";
  }

  /**
   * Swap the object URL backing the current image, revoking the old one.
   * @param {string} next
   */
  _setObjectUrl(next) {
    if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
    this._objectUrl = next;
  }

  /**
   * Load a picked, dropped, or pasted file.
   * @param {File | Blob} file
   * @param {"user" | "theme"} [source]
   * @returns {Promise<boolean>} false if a newer load replaced this one
   */
  async loadFile(file, source = "user") {
    if (!file || !/^image\//.test(file.type)) throw new Error("That file isn't an image.");
    if (file.size > MAX_FILE_BYTES) throw new Error("That image is over 25 MB. Try a smaller copy.");
    const seq = ++this._seq;
    const objectUrl = URL.createObjectURL(file);
    try {
      const asset = await decode(objectUrl, { cors: false, trim: this.trim, svg: file.type === "image/svg+xml" });
      if (seq !== this._seq) {
        URL.revokeObjectURL(objectUrl);
        return false;
      }
      this._setObjectUrl(objectUrl);
      Object.assign(this, { asset, source, url: "" });
      return true;
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      if (seq !== this._seq) return false;
      throw err;
    }
  }

  /**
   * Load an image URL.
   * @param {string} url
   * @param {"user" | "theme"} [source]
   * @returns {Promise<boolean>} false if a newer load replaced this one
   */
  async loadUrl(url, source = "user") {
    const seq = ++this._seq;
    let asset;
    try {
      const svg = /\.svg(?:[?#]|$)/i.test(url);
      asset = await decode(url, { cors: isCrossOrigin(url), trim: this.trim, svg });
    } catch (err) {
      if (seq !== this._seq) return false;
      throw err;
    }
    if (seq !== this._seq) return false;
    this._setObjectUrl("");
    Object.assign(this, { asset, source, url });
    return true;
  }

  /**
   * Remove the image.
   * @param {"none" | "user"} [source] "user" records that the user removed it
   */
  clear(source = "none") {
    this._seq++;
    this._setObjectUrl("");
    Object.assign(this, { asset: null, source, url: "" });
  }
}
