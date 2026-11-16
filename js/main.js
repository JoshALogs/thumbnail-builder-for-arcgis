/**
 * App entry point.
 *
 * Connects the Calcite controls to the app state, renders the preview and the
 * layout and theme tiles, and handles images, export, and share links. All
 * drawing goes through renderer.js; all state rules live in state.js.
 * @module main
 */
import { APP_VERSION } from "./config.js";
import { parseColor, toHex, wcagRating } from "./color.js";
import {
  DEFAULT_STATE,
  LIMITS,
  activeLayoutId,
  fromSearchParams,
  isHttpUrl,
  normalizeAccent,
  toSearchParams,
} from "./state.js";
import { getLayout, layoutKind, layoutsFor } from "./layouts.js";
import { BUILTIN_PACK_URL, loadThemePack } from "./themes.js";
import { renderThumbnail } from "./renderer.js";
import { ImageSlot } from "./images.js";
import { loadIcon } from "./icons.js";
import { ITEM_TYPES, iconForLabel } from "./item-types.js";
import {
  canCopyImage,
  canShareFiles,
  copyImage,
  downloadBlob,
  makeFilename,
  renderToBlob,
  shareImage,
} from "./exporter.js";

/** Used only if themes/default.json can't be loaded. */
const FALLBACK_THEME = Object.freeze({
  id: "calcite",
  name: "Calcite",
  description: "Esri brand blue",
  canvas: "rgba(10, 43, 69, 1)",
  accent: "rgba(0, 122, 194, 0.922)",
  chip: "rgba(10, 31, 48, 0.722)",
  patternColor: "rgba(255, 255, 255, 0.149)",
  pattern: "contours",
  logo: "",
  background: "",
});

const MODE_KEY = "thumbnail-builder:mode";
const SLOT_NAMES = ["background", "logo"];

/** Live app data. */
const app = {
  state: fromSearchParams(new URLSearchParams(location.search), layoutKind),
  /** @type {import("./themes.js").Theme[]} */
  builtinThemes: [],
  /** @type {import("./themes.js").Theme[]} */
  themes: [],
  slots: { background: new ImageSlot(), logo: new ImageSlot({ trim: true }) },
  /** @type {Path2D | null} */
  icon: null,
  report: { texts: [] },
};

/** Element references, filled in by collectElements(). */
const els = {};

/** True while code (not the user) is setting control values. */
let syncing = false;

// ---------------------------------------------------------------------------
// Small helpers

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Calcite elements whose properties the app sets during startup. */
const STARTUP_TAGS = [
  "calcite-segmented-control",
  "calcite-segmented-control-item",
  "calcite-input-text",
  "calcite-autocomplete",
  "calcite-switch",
  "calcite-slider",
  "calcite-color-picker",
  "calcite-tile-group",
  "calcite-tile",
];

/**
 * Wait until Calcite has loaded the components the app is about to set up.
 * Calcite defines its elements right away but loads each one's code lazily,
 * and a `checked` set on a segmented-control item before that code arrives is
 * lost, leaving no option selected. Gives up after a few seconds so a slow CDN
 * can't stall the app.
 * @returns {Promise<void>}
 */
async function calciteReady() {
  const ready = (async () => {
    await Promise.all(STARTUP_TAGS.map((tag) => customElements.whenDefined(tag)));
    const elements = document.querySelectorAll(STARTUP_TAGS.join(","));
    await Promise.all([...elements].map((el) => el.componentOnReady?.()));
  })();
  await Promise.race([ready, wait(5000)]);
}

/**
 * Any CSS color as #rrggbbaa, the color picker's format.
 * @param {string} css
 * @returns {string}
 */
function hexa(css) {
  const color = parseColor(css) ?? parseColor(FALLBACK_THEME.accent);
  const hex = toHex(color);
  return hex.length === 7 ? `${hex}ff` : hex;
}

/** Read a localStorage key without letting privacy modes throw. */
function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a localStorage key, ignoring failures (it's only a convenience). */
function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Tell screen reader users about a change that isn't visible as text.
 * @param {string} message
 */
function announce(message) {
  els.liveStatus.textContent = "";
  setTimeout(() => {
    els.liveStatus.textContent = message;
  }, 60);
}

/**
 * Show a short notification. Each call gets its own alert so Calcite can queue them.
 * @param {string} title
 * @param {string} [message]
 * @param {"brand" | "danger" | "info" | "success" | "warning"} [kind]
 * @param {{text: string, icon: string, run: () => void}} [action] optional button
 */
function toast(title, message = "", kind = "info", action) {
  const alert = document.createElement("calcite-alert");
  alert.kind = kind;
  alert.icon = true;
  alert.label = title;
  alert.autoClose = true;
  alert.autoCloseDuration = action ? "slow" : "medium";
  alert.placement = "bottom";

  const titleEl = document.createElement("div");
  titleEl.slot = "title";
  titleEl.textContent = title;
  alert.append(titleEl);
  if (message) {
    const messageEl = document.createElement("div");
    messageEl.slot = "message";
    messageEl.textContent = message;
    alert.append(messageEl);
  }
  if (action) {
    const button = document.createElement("calcite-action");
    button.slot = "actions-end";
    button.icon = action.icon;
    button.text = action.text;
    button.textEnabled = true;
    button.addEventListener("click", () => {
      action.run();
      alert.open = false;
    });
    alert.append(button);
  }
  alert.addEventListener("calciteAlertClose", () => alert.remove());
  document.body.append(alert);
  requestAnimationFrame(() => {
    alert.open = true;
  });
}

// ---------------------------------------------------------------------------
// State to drawing

/** @returns {object} the layout in use */
function currentLayout() {
  return getLayout(activeLayoutId(app.state)) ?? layoutsFor(app.state.kind)[0];
}

/** @returns {import("./themes.js").Theme} the theme in use */
function currentTheme() {
  return app.themes.find((t) => t.id === app.state.theme) ?? app.themes[0] ?? FALLBACK_THEME;
}

/**
 * Values the renderer resolves "$name" references against.
 * @param {import("./themes.js").Theme} [theme]
 * @param {boolean} [useAccentOverride] false for theme tiles, which show each theme's own color
 * @returns {import("./renderer.js").RenderValues}
 */
function renderValues(theme = currentTheme(), useAccentOverride = true) {
  const s = app.state;
  return {
    title: s.title,
    category: s.kind === "item" ? s.category : "",
    showIcon: s.showIcon,
    canvas: theme.canvas,
    accent: (useAccentOverride && s.accent) || theme.accent,
    chip: theme.chip,
    patternColor: theme.patternColor,
    pattern: theme.pattern,
    scrim: s.scrim,
    textMode: s.textMode,
    focusX: s.focusX,
    focusY: s.focusY,
    logoScale: s.logoScale,
    seed: theme.id,
  };
}

/** @returns {import("./renderer.js").RenderAssets} */
function renderAssets() {
  return {
    background: app.slots.background.asset,
    logo: app.slots.logo.asset,
    icon: app.state.kind === "item" ? app.icon : null,
  };
}

/**
 * Accessible description of the preview image.
 * @param {object} layout
 * @returns {string}
 */
function describePreview(layout) {
  const s = app.state;
  const parts = [
    `${s.kind === "group" ? "Group" : "Item"} thumbnail preview, ${layout.name} layout, ${currentTheme().name} theme.`,
    s.title.trim() ? `Title: ${s.title.trim()}.` : "No title.",
  ];
  if (s.kind === "item" && s.category.trim()) parts.push(`Label: ${s.category.trim()}.`);
  if (app.slots.background.asset) parts.push("With a background image.");
  if (app.slots.logo.asset) parts.push("With a logo.");
  return parts.join(" ");
}

/**
 * Show the worst measured text contrast, and a notice when it is below 4.5:1.
 * @param {{texts: import("./renderer.js").TextReport[]}} report
 */
function updateContrast(report) {
  const measured = report.texts.filter((t) => typeof t.ratio === "number");
  if (!measured.length) {
    els.contrastChip.icon = "information";
    els.contrastChip.textContent = report.texts.length ? "Contrast not measured" : "No text to check";
    els.contrastNotice.open = false;
    return;
  }
  const worst = measured.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const rating = wcagRating(worst.ratio);
  const passes = worst.ratio >= 4.5;
  const verdict = passes ? `WCAG ${rating}` : rating === "AA large" ? "AA large text only" : "Below WCAG AA";
  els.contrastChip.icon = passes ? "check-circle" : "exclamation-mark-triangle";
  els.contrastChip.textContent = `Contrast ${worst.ratio.toFixed(1)}:1 · ${verdict}`;
  els.contrastChip.label = `Lowest text contrast ${worst.ratio.toFixed(1)} to 1, ${verdict}`;
  els.contrastNotice.open = !passes;
  if (!passes) {
    const what = worst.slot === "title" ? "title" : "item type label";
    els.contrastMessage.textContent =
      `The ${what} measures ${worst.ratio.toFixed(1)}:1 against what's behind it. Aim for 4.5:1: ` +
      "set Text color to Auto, make the band color more opaque, or add shade over the image.";
  }
}

/** Draw the main preview at the screen's pixel density. */
function renderPreview() {
  const layout = currentLayout();
  const [w, h] = layout.size;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const canvas = els.canvas;
  const cw = Math.round(w * dpr);
  const ch = Math.round(h * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  els.stage.style.setProperty("--ratio", String(w / h));
  // The contrast check reads pixels back on every render.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  app.report = renderThumbnail(ctx, layout, renderValues(), renderAssets());
  updateContrast(app.report);
  canvas.setAttribute("aria-label", describePreview(layout));
  els.sizeNote.textContent = `${w} × ${h} PNG`;
}

/**
 * Paint a small tile preview.
 * @param {HTMLCanvasElement} canvas
 * @param {object} layout
 * @param {import("./renderer.js").RenderValues} values
 */
function paintTile(canvas, layout, values) {
  const [w, h] = layout.size;
  const scale = 140 / Math.max(w, h);
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(w * scale * dpr);
  canvas.height = Math.round(h * scale * dpr);
  canvas.style.aspectRatio = `${w} / ${h}`;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  renderThumbnail(ctx, layout, values, renderAssets());
}

/** Repaint every layout and theme tile with the current content. */
function renderTiles() {
  for (const tile of els.layoutTiles.querySelectorAll("calcite-tile")) {
    const layout = getLayout(tile.dataset.id);
    if (layout) paintTile(tile.querySelector("canvas"), layout, renderValues());
  }
  const layout = currentLayout();
  for (const tile of els.themeTiles.querySelectorAll("calcite-tile")) {
    const theme = app.themes.find((t) => t.id === tile.dataset.id);
    if (theme) paintTile(tile.querySelector("canvas"), layout, renderValues(theme, false));
  }
}

let frameId = 0;
let tileTimer = 0;
let urlTimer = 0;

/**
 * Queue a redraw. The preview redraws on the next frame; tiles and the
 * address bar wait for a pause in typing.
 * @param {{tiles?: boolean, url?: boolean}} [options]
 */
function scheduleRender({ tiles = true, url = true } = {}) {
  if (!frameId) {
    frameId = requestAnimationFrame(() => {
      frameId = 0;
      renderPreview();
    });
  }
  if (tiles) {
    clearTimeout(tileTimer);
    tileTimer = setTimeout(renderTiles, 150);
  }
  if (url) {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(syncUrl, 400);
  }
}

// ---------------------------------------------------------------------------
// Share links

/** @returns {string} link that reproduces the current settings */
function shareUrl() {
  const query = toSearchParams(app.state).toString();
  return `${location.origin}${location.pathname}${query ? `?${query}` : ""}`;
}

/** Keep the address bar in step with the settings, without adding history entries. */
function syncUrl() {
  history.replaceState(null, "", shareUrl());
}

// ---------------------------------------------------------------------------
// Building controls

/** Fill the item type suggestions. */
function buildCategoryItems() {
  const items = ITEM_TYPES.map(({ label, icon }) => {
    const item = document.createElement("calcite-autocomplete-item");
    item.heading = label;
    item.value = label;
    item.label = label;
    item.iconStart = icon;
    return item;
  });
  els.category.replaceChildren(...items);
}

/**
 * Show only suggestions that contain the typed text.
 * @param {string} query
 */
function filterCategoryItems(query) {
  const q = query.trim().toLowerCase();
  for (const item of els.category.querySelectorAll("calcite-autocomplete-item")) {
    item.hidden = Boolean(q) && !item.value.toLowerCase().includes(q);
  }
}

/**
 * A selectable tile with a live preview canvas.
 * @param {{id: string, name: string, description: string}} entry
 * @param {string} noun "layout" or "theme", for the accessible label
 * @param {boolean} selected
 * @returns {HTMLElement}
 */
function makeTile(entry, noun, selected) {
  const tile = document.createElement("calcite-tile");
  tile.heading = entry.name;
  tile.description = entry.description;
  tile.label = `${entry.name} ${noun}`;
  tile.selected = selected;
  tile.dataset.id = entry.id;
  const canvas = document.createElement("canvas");
  canvas.slot = "content-top";
  canvas.className = "tile-canvas";
  canvas.setAttribute("aria-hidden", "true");
  tile.append(canvas);
  return tile;
}

/** Rebuild the layout tiles for the current thumbnail kind. */
function buildLayoutTiles() {
  const active = activeLayoutId(app.state);
  els.layoutTiles.replaceChildren(...layoutsFor(app.state.kind).map((l) => makeTile(l, "layout", l.id === active)));
}

/** Rebuild the theme tiles. */
function buildThemeTiles() {
  const active = currentTheme().id;
  els.themeTiles.replaceChildren(...app.themes.map((t) => makeTile(t, "theme", t.id === active)));
}

/**
 * Check the segmented-control item whose value matches.
 * @param {HTMLElement} control
 * @param {string} value
 */
function setSegmented(control, value) {
  // Set `checked` on the items only. Also assigning control.value straight
  // afterwards makes Calcite 5.2 uncheck every item.
  for (const item of control.querySelectorAll("calcite-segmented-control-item")) {
    item.checked = item.value === value;
  }
}

/** Enable or disable image controls to match what's loaded. */
function updateImageControls() {
  const hasBackground = Boolean(app.slots.background.asset);
  const hasLogo = Boolean(app.slots.logo.asset);
  for (const el of [els.focusX, els.focusY, els.scrim]) el.disabled = !hasBackground;
  els.backgroundClear.disabled = !hasBackground;
  els.logoScale.disabled = !hasLogo;
  els.logoClear.disabled = !hasLogo;
}

/** Push the whole state into the controls. */
function syncControls() {
  syncing = true;
  const s = app.state;
  setSegmented(els.kind, s.kind);
  els.title.value = s.title;
  els.category.inputValue = s.category;
  els.showIcon.checked = s.showIcon;
  els.categoryFields.hidden = s.kind === "group";
  els.backgroundUrl.value = s.background;
  els.logoUrl.value = s.logo;
  els.focusX.value = Math.round(s.focusX * 100);
  els.focusY.value = Math.round(s.focusY * 100);
  els.scrim.value = Math.round(s.scrim * 100);
  els.logoScale.value = Math.round(s.logoScale * 100);
  els.accent.value = hexa(s.accent || currentTheme().accent);
  setSegmented(els.textMode, s.textMode);
  els.packUrl.value = s.pack;
  updateImageControls();
  requestAnimationFrame(() => {
    syncing = false;
  });
}

// ---------------------------------------------------------------------------
// Images, icons, and themes

let iconSeq = 0;

/** Load the icon that matches the item type label, if there is one. */
async function updateIcon() {
  const seq = ++iconSeq;
  const path = await loadIcon(iconForLabel(app.state.category));
  if (seq !== iconSeq) return;
  app.icon = path;
  scheduleRender();
}

/**
 * After any image change: update controls, tell screen readers, redraw.
 * @param {string} message
 */
function afterImageChange(message) {
  updateImageControls();
  if (message) announce(message);
  scheduleRender();
}

/**
 * Use a picked, dropped, or pasted file.
 * @param {"background" | "logo"} name
 * @param {File} file
 */
async function setImageFromFile(name, file) {
  try {
    if (!(await app.slots[name].loadFile(file, "user"))) return;
    app.state[name] = ""; // uploads never go in share links
    els[`${name}Url`].value = "";
    afterImageChange(name === "logo" ? "Logo added." : "Background image added.");
  } catch (err) {
    toast("Image not added", err.message, "danger");
  }
}

/**
 * Use an image URL. An empty value removes the image.
 * @param {"background" | "logo"} name
 * @param {string} url
 */
async function setImageFromUrl(name, url) {
  if (!url) {
    removeImage(name);
    return;
  }
  if (!isHttpUrl(url)) {
    toast("Image not added", "Enter a full web address that starts with https://.", "danger");
    return;
  }
  try {
    if (!(await app.slots[name].loadUrl(url, "user"))) return;
    app.state[name] = url;
    afterImageChange(name === "logo" ? "Logo added." : "Background image added.");
  } catch (err) {
    app.state[name] = "";
    toast("Image not added", err.message, "danger");
  }
}

/**
 * Remove an image at the user's request.
 * @param {"background" | "logo"} name
 */
function removeImage(name) {
  app.slots[name].clear("user");
  app.state[name] = "";
  els[`${name}Url`].value = "";
  afterImageChange(name === "logo" ? "Logo removed." : "Background image removed.");
}

/** Load the theme's default images into slots the user hasn't set. */
async function applyThemeAssets() {
  const theme = currentTheme();
  await Promise.all(
    SLOT_NAMES.map(async (name) => {
      const slot = app.slots[name];
      if (slot.source === "user") return;
      if (!theme[name]) {
        slot.clear("none");
        return;
      }
      try {
        await slot.loadUrl(theme[name], "theme");
      } catch {
        slot.clear("none");
      }
    }),
  );
  updateImageControls();
  scheduleRender();
}

/**
 * Switch theme. A theme brings its own color, so any color override is dropped.
 * @param {string} id
 */
function selectTheme(id) {
  app.state.theme = id;
  app.state.accent = "";
  syncing = true;
  els.accent.value = hexa(currentTheme().accent);
  requestAnimationFrame(() => {
    syncing = false;
  });
  applyThemeAssets();
  scheduleRender();
}

/**
 * Load a theme pack and add its themes ahead of the built-in ones.
 * @param {string} url
 * @param {{select?: boolean}} [options] select: switch to the pack's first theme
 * @returns {Promise<boolean>}
 */
async function loadPack(url, { select = true } = {}) {
  if (!isHttpUrl(url)) {
    toast("Theme pack not loaded", "Enter a full web address that starts with https://.", "danger");
    return false;
  }
  els.packLoad.loading = true;
  try {
    const pack = await loadThemePack(url);
    const ids = new Set(pack.themes.map((t) => t.id));
    app.themes = [...pack.themes, ...app.builtinThemes.filter((t) => !ids.has(t.id))];
    app.state.pack = url;
    if (select) selectTheme(pack.themes[0].id);
    buildThemeTiles();
    scheduleRender();
    const count = pack.themes.length;
    toast(`Loaded ${pack.name}`, `${count} theme${count === 1 ? "" : "s"} added.`, "success");
    return true;
  } catch (err) {
    toast("Theme pack not loaded", `${err.message} The pack's server also has to allow cross-origin requests.`, "danger");
    return false;
  } finally {
    els.packLoad.loading = false;
  }
}

// ---------------------------------------------------------------------------
// Export

/** @returns {Promise<Blob>} the thumbnail at exact output size */
function exportBlob() {
  const layout = currentLayout();
  const [w, h] = layout.size;
  return renderToBlob(w, h, (ctx) => renderThumbnail(ctx, layout, renderValues(), renderAssets()));
}

/** @returns {string} */
function exportName() {
  return makeFilename(app.state.title, app.state.kind);
}

// ---------------------------------------------------------------------------
// Light and dark mode

/** @returns {boolean} whether the page is currently dark */
function isDark() {
  if (document.body.classList.contains("calcite-mode-dark")) return true;
  if (document.body.classList.contains("calcite-mode-light")) return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply "auto", "light", or "dark" and update the toggle to offer the other one.
 * @param {string} mode
 */
function applyMode(mode) {
  const safe = ["auto", "light", "dark"].includes(mode) ? mode : "auto";
  document.body.classList.remove("calcite-mode-auto", "calcite-mode-light", "calcite-mode-dark");
  document.body.classList.add(`calcite-mode-${safe}`);
  const dark = isDark();
  els.modeToggle.icon = dark ? "brightness" : "moon";
  els.modeToggle.text = dark ? "Light mode" : "Dark mode";
  els.modeToggle.label = dark ? "Switch to light mode" : "Switch to dark mode";
}

// ---------------------------------------------------------------------------
// Reset with undo

/** Return to defaults, keeping any loaded theme pack. Offers an undo. */
function resetAll() {
  const before = { state: { ...app.state }, slots: app.slots, icon: app.icon };
  app.state = { ...DEFAULT_STATE, pack: app.state.pack };
  // Fresh slots, so the undo can put the old images back untouched.
  app.slots = { background: new ImageSlot(), logo: new ImageSlot({ trim: true }) };
  refreshAll();
  applyThemeAssets();
  toast("Settings reset", "", "info", {
    text: "Undo",
    icon: "undo",
    run: () => {
      app.state = before.state;
      app.slots = before.slots;
      app.icon = before.icon;
      refreshAll();
      announce("Settings restored.");
    },
  });
}

/** Rebuild everything from the state (after reset or undo). */
function refreshAll() {
  buildLayoutTiles();
  buildThemeTiles();
  syncControls();
  updateIcon();
  scheduleRender();
}

// ---------------------------------------------------------------------------
// Wiring

/** Look up every element the app talks to. */
function collectElements() {
  const ids = {
    stage: "preview",
    canvasBox: "canvas-box",
    canvas: "preview-canvas",
    contrastChip: "contrast-chip",
    contrastNotice: "contrast-notice",
    contrastMessage: "contrast-message",
    sizeNote: "size-note",
    liveStatus: "live-status",
    download: "download",
    copyImage: "copy-image",
    share: "share",
    copyLink: "copy-link",
    kind: "kind",
    title: "title",
    category: "category",
    categoryFields: "category-fields",
    showIcon: "show-icon",
    layoutTiles: "layout-tiles",
    themeTiles: "theme-tiles",
    packForm: "pack-form",
    packUrl: "pack-url",
    packLoad: "pack-load",
    backgroundUpload: "background-upload",
    backgroundClear: "background-clear",
    backgroundUrl: "background-url",
    focusX: "focus-x",
    focusY: "focus-y",
    scrim: "scrim",
    logoUpload: "logo-upload",
    logoClear: "logo-clear",
    logoUrl: "logo-url",
    logoScale: "logo-scale",
    accent: "accent",
    accentReset: "accent-reset",
    textMode: "text-mode",
    reset: "reset",
    modeToggle: "mode-toggle",
    helpOpen: "help-open",
    help: "help",
    helpClose: "help-close",
    appVersion: "app-version",
    fileInput: "file-input",
  };
  for (const [key, id] of Object.entries(ids)) {
    els[key] = document.getElementById(id);
    if (!els[key]) throw new Error(`Missing element #${id}`);
  }
}

/** Attach every event handler. */
function wireEvents() {
  els.kind.addEventListener("calciteSegmentedControlChange", () => {
    app.state.kind = els.kind.value === "group" ? "group" : "item";
    els.categoryFields.hidden = app.state.kind === "group";
    buildLayoutTiles();
    announce(`${app.state.kind === "group" ? "Group" : "Item"} thumbnail, ${currentLayout().name} layout.`);
    scheduleRender();
  });

  els.title.addEventListener("calciteInputTextInput", () => {
    app.state.title = String(els.title.value ?? "").slice(0, LIMITS.title);
    scheduleRender();
  });

  els.category.addEventListener("calciteAutocompleteTextInput", () => {
    const text = String(els.category.inputValue ?? "").slice(0, LIMITS.category);
    app.state.category = text;
    filterCategoryItems(text);
    updateIcon();
    scheduleRender();
  });
  els.category.addEventListener("calciteAutocompleteChange", () => {
    const value = String(els.category.value || els.category.inputValue || "").slice(0, LIMITS.category);
    app.state.category = value;
    els.category.inputValue = value;
    filterCategoryItems("");
    updateIcon();
    scheduleRender();
  });

  els.showIcon.addEventListener("calciteSwitchChange", () => {
    app.state.showIcon = els.showIcon.checked;
    scheduleRender();
  });

  els.layoutTiles.addEventListener("calciteTileGroupSelect", () => {
    const tile = els.layoutTiles.selectedItems?.[0];
    if (!tile) return;
    if (app.state.kind === "group") app.state.groupLayout = tile.dataset.id;
    else app.state.itemLayout = tile.dataset.id;
    announce(`${currentLayout().name} layout selected.`);
    scheduleRender();
  });

  els.themeTiles.addEventListener("calciteTileGroupSelect", () => {
    const tile = els.themeTiles.selectedItems?.[0];
    if (!tile) return;
    selectTheme(tile.dataset.id);
    announce(`${currentTheme().name} theme selected.`);
  });

  els.packForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadPack(String(els.packUrl.value ?? "").trim());
  });

  // Images: upload buttons share one hidden file input.
  for (const name of SLOT_NAMES) {
    els[`${name}Upload`].addEventListener("click", () => {
      els.fileInput.dataset.target = name;
      els.fileInput.value = "";
      els.fileInput.click();
    });
    els[`${name}Clear`].addEventListener("click", () => removeImage(name));
    els[`${name}Url`].addEventListener("calciteInputTextChange", () => {
      setImageFromUrl(name, String(els[`${name}Url`].value ?? "").trim());
    });
  }
  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files?.[0];
    if (file) setImageFromFile(els.fileInput.dataset.target === "logo" ? "logo" : "background", file);
  });

  const sliders = [
    [els.focusX, "focusX"],
    [els.focusY, "focusY"],
    [els.scrim, "scrim"],
    [els.logoScale, "logoScale"],
  ];
  for (const [el, key] of sliders) {
    el.addEventListener("calciteSliderInput", () => {
      app.state[key] = Number(el.value) / 100;
      scheduleRender();
    });
  }

  els.accent.addEventListener("calciteColorPickerInput", () => {
    if (syncing) return;
    const accent = normalizeAccent(els.accent.value);
    if (!accent) return;
    app.state.accent = accent;
    scheduleRender();
  });
  els.accentReset.addEventListener("click", () => selectTheme(app.state.theme));

  els.textMode.addEventListener("calciteSegmentedControlChange", () => {
    app.state.textMode = els.textMode.value;
    scheduleRender();
  });

  els.reset.addEventListener("click", resetAll);

  // Drag and drop onto the preview sets the background.
  const zone = els.canvasBox;
  const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
  for (const type of ["dragenter", "dragover"]) {
    zone.addEventListener(type, (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      zone.classList.add("drag-over");
    });
  }
  zone.addEventListener("dragleave", (event) => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("drag-over");
    const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
    if (file) setImageFromFile("background", file);
    else toast("That isn't an image", "Drop a PNG, JPEG, GIF, WebP, or SVG file.", "warning");
  });

  // Pasting an image anywhere sets the background. Text pastes behave normally.
  document.addEventListener("paste", (event) => {
    const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    setImageFromFile("background", file);
  });

  els.download.addEventListener("click", async () => {
    try {
      downloadBlob(await exportBlob(), exportName());
      announce(`Downloaded ${exportName()}.`);
    } catch (err) {
      toast("Download failed", err.message, "danger");
    }
  });

  els.copyImage.addEventListener("click", async () => {
    try {
      await copyImage(exportBlob());
      toast("Image copied", "Paste it anywhere that accepts images.", "success");
    } catch {
      toast("Couldn't copy the image", "The browser blocked clipboard access. Use Download PNG instead.", "danger");
    }
  });

  els.share.addEventListener("click", async () => {
    try {
      await shareImage(await exportBlob(), exportName(), app.state.title);
    } catch (err) {
      if (err?.name !== "AbortError") toast("Couldn't share", err.message, "danger");
    }
  });

  els.copyLink.addEventListener("click", async () => {
    const url = shareUrl();
    const hasUpload = SLOT_NAMES.some((n) => app.slots[n].source === "user" && app.slots[n].asset && !app.slots[n].url);
    try {
      await navigator.clipboard.writeText(url);
      toast(
        "Link copied",
        hasUpload
          ? "Uploaded images stay on your device, so the link opens without them."
          : "The link opens these exact settings.",
        "success",
      );
    } catch {
      window.prompt("Copy this link:", url);
    }
  });

  els.modeToggle.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    writeStored(MODE_KEY, next);
    applyMode(next);
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (document.body.classList.contains("calcite-mode-auto")) applyMode("auto");
  });

  els.helpOpen.addEventListener("click", () => {
    els.help.open = true;
  });
  els.helpClose.addEventListener("click", () => {
    els.help.open = false;
  });

  // Re-render when moving between screens with different pixel densities.
  matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener("change", () =>
    scheduleRender({ url: false }),
  );
}

/** Start the app. */
async function init() {
  collectElements();
  applyMode(readStored(MODE_KEY) || "auto");
  els.appVersion.textContent = APP_VERSION;

  // Give the bundled font a moment, so the first frame isn't drawn in a fallback.
  await Promise.race([document.fonts.load('700 40px "Open Sans"'), wait(2500)]).catch(() => {});

  try {
    app.builtinThemes = (await loadThemePack(BUILTIN_PACK_URL)).themes;
  } catch {
    app.builtinThemes = [FALLBACK_THEME];
  }
  app.themes = [...app.builtinThemes];
  const linkedTheme = app.state.theme;
  if (app.state.pack) await loadPack(app.state.pack, { select: false });
  app.state.theme = app.themes.some((t) => t.id === linkedTheme) ? linkedTheme : app.themes[0].id;

  buildCategoryItems();
  buildLayoutTiles();
  buildThemeTiles();
  await calciteReady();
  syncControls();
  wireEvents();

  els.copyImage.hidden = !canCopyImage();
  els.share.hidden = !(canShareFiles() && matchMedia("(pointer: coarse)").matches);

  await Promise.all(SLOT_NAMES.map((name) => (app.state[name] ? setImageFromUrl(name, app.state[name]) : null)));
  await applyThemeAssets();
  await updateIcon();

  renderPreview();
  renderTiles();
  document.fonts.ready.then(() => scheduleRender({ url: false }));
}

init().catch((err) => {
  console.error(err);
  toast("The app couldn't start", err.message, "danger");
});
