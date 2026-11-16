/**
 * Word wrapping and auto-fitting for canvas text.
 *
 * The width-measuring function is passed in, so this logic runs (and is tested)
 * without a canvas.
 * @module text
 */

/**
 * @callback Measure
 * @param {string} text
 * @param {number} size font size in px
 * @returns {number} rendered width in px
 */

/**
 * Longest prefix of `word` that fits in maxWidth (at least one character).
 * @param {string} word
 * @param {number} maxWidth
 * @param {number} size
 * @param {Measure} measure
 * @returns {number} character count
 */
function fittingPrefix(word, maxWidth, size, measure) {
  let lo = 1;
  let hi = word.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(word.slice(0, mid), size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Wrap text into lines no wider than maxWidth. A single word wider than a line
 * is broken by character, so nothing overflows sideways.
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} size
 * @param {Measure} measure
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, size, measure) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (let word of words) {
    while (word.length > 1 && measure(word, size) > maxWidth) {
      if (line) {
        lines.push(line);
        line = "";
      }
      const cut = fittingPrefix(word, maxWidth, size, measure);
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Shorten a line until it fits with a trailing ellipsis.
 * @param {string} line
 * @param {number} maxWidth
 * @param {number} size
 * @param {Measure} measure
 * @returns {string}
 */
export function ellipsize(line, maxWidth, size, measure) {
  let text = line;
  while (text.length > 1 && measure(`${text}…`, size) > maxWidth) {
    text = text.slice(0, -1).trimEnd();
  }
  return `${text}…`;
}

/**
 * @typedef {object} FitOptions
 * @property {number} maxSize largest font size to try, px
 * @property {number} minSize smallest font size allowed, px
 * @property {number} [lineHeight] line height as a multiple of font size
 * @property {number} [maxLines] most lines allowed
 * @property {number} [step] font size decrement, px
 */

/**
 * @typedef {object} FitResult
 * @property {number} size chosen font size, px
 * @property {string[]} lines wrapped lines to draw
 * @property {number} lineHeight line height, px
 * @property {boolean} truncated true when text was cut to fit at minSize
 */

/**
 * Find the largest font size, stepping down from maxSize, at which the text
 * wraps into at most maxLines lines that fit the box. If it still doesn't fit
 * at minSize, keep the lines that fit and end the last one with an ellipsis.
 * @param {string} text
 * @param {{w: number, h: number}} box
 * @param {FitOptions} options
 * @param {Measure} measure
 * @returns {FitResult}
 */
export function fitText(text, box, options, measure) {
  const { maxSize, minSize, lineHeight = 1.15, maxLines = 3, step = 1 } = options;
  const clean = String(text ?? "").trim();
  if (!clean) return { size: maxSize, lines: [], lineHeight: maxSize * lineHeight, truncated: false };

  for (let size = maxSize; size >= minSize; size -= step) {
    const lh = size * lineHeight;
    const lines = wrapText(clean, box.w, size, measure);
    if (lines.length <= maxLines && lines.length * lh <= box.h + 0.5) {
      return { size, lines, lineHeight: lh, truncated: false };
    }
  }

  const size = minSize;
  const lh = size * lineHeight;
  const room = Math.max(1, Math.min(maxLines, Math.floor((box.h + 0.5) / lh)));
  const lines = wrapText(clean, box.w, size, measure);
  const kept = lines.slice(0, room);
  if (lines.length > room) {
    kept[kept.length - 1] = ellipsize(kept[kept.length - 1], box.w, size, measure);
  }
  return { size, lines: kept, lineHeight: lh, truncated: true };
}
