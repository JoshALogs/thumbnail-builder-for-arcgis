/**
 * Export: PNG rendering at exact output size, download, clipboard, and the
 * system share sheet.
 * @module exporter
 */

/**
 * Download file name in the form Thumbnail_Regional_Trail_Network.png.
 * The kind prefix keeps names from ever starting with a digit and groups
 * thumbnails together in a downloads folder.
 * @param {string} title
 * @param {"item" | "group"} kind
 * @returns {string}
 */
export function makeFilename(title, kind) {
  const words = String(title || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[A-Za-z0-9]+/g) || [];
  const stem = words
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("_")
    .slice(0, 80)
    .replace(/_+$/, "");
  const prefix = kind === "group" ? "Group_Thumbnail" : "Thumbnail";
  return stem ? `${prefix}_${stem}.png` : `${prefix}.png`;
}

/**
 * Paint into a fresh canvas at exactly width x height and encode it as PNG.
 * Re-rendering at 1x (rather than shrinking the HiDPI preview) keeps text crisp.
 * @param {number} width
 * @param {number} height
 * @param {(ctx: CanvasRenderingContext2D) => void} paint
 * @returns {Promise<Blob>}
 */
export function renderToBlob(width, height, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d", { willReadFrequently: true }));
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser couldn't create the PNG."))),
      "image/png",
    );
  });
}

/**
 * Save a blob through a temporary download link.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** True when the browser can put an image on the clipboard. */
export function canCopyImage() {
  return typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";
}

/**
 * Copy a PNG to the clipboard. The blob is passed as a promise so Safari keeps
 * the click's permission while the image renders.
 * @param {Promise<Blob>} blobPromise
 */
export async function copyImage(blobPromise) {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
}

/** True when the system share sheet accepts image files. */
export function canShareFiles() {
  try {
    const probe = new File([new Uint8Array(1)], "probe.png", { type: "image/png" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Open the system share sheet with the PNG.
 * @param {Blob} blob
 * @param {string} filename
 * @param {string} title
 */
export async function shareImage(blob, filename, title) {
  const file = new File([blob], filename, { type: "image/png" });
  await navigator.share({ files: [file], title });
}
