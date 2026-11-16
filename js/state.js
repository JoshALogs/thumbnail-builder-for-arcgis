/**
 * App state: defaults, validation, and the share-link format.
 *
 * Pure functions with no DOM access, so they're tested in Node. A share link
 * carries only settings that differ from the defaults, and never an uploaded
 * file (those stay on the user's device).
 * @module state
 */
import { clamp, parseColor, toHex } from "./color.js";

/** Starting state, also what Reset returns to. */
export const DEFAULT_STATE = Object.freeze({
  kind: "item",
  itemLayout: "item-banner",
  groupLayout: "group-banner",
  theme: "calcite",
  pack: "",
  title: "Regional Trail Network",
  category: "Web Map",
  showIcon: true,
  accent: "",
  textMode: "auto",
  scrim: 0.45,
  logoScale: 1,
  focusX: 0.5,
  focusY: 0.5,
  background: "",
  logo: "",
});

/** Length limits for user text, so a hostile link can't bloat the page. */
export const LIMITS = Object.freeze({ title: 200, category: 60, url: 2000 });

const TEXT_MODES = ["auto", "light", "dark"];
const THEME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/i;

/**
 * True for an absolute http(s) URL of reasonable length.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHttpUrl(value) {
  if (typeof value !== "string" || !value || value.length > LIMITS.url) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Normalize a user color to #rrggbb or #rrggbbaa, or "" if it isn't a color.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeAccent(value) {
  const color = parseColor(value);
  return color ? toHex(color) : "";
}

/**
 * Id of the layout in use for the state's thumbnail kind.
 * @param {{kind: string, itemLayout: string, groupLayout: string}} state
 * @returns {string}
 */
export function activeLayoutId(state) {
  return state.kind === "group" ? state.groupLayout : state.itemLayout;
}

/**
 * Parse a whole-number percentage into a clamped fraction.
 * @param {string | null} text
 * @param {number} min fraction
 * @param {number} max fraction
 * @returns {number | null} null when missing or not a number
 */
function percent(text, min, max) {
  if (text === null || text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? clamp(n / 100, min, max) : null;
}

/**
 * Encode state as URL search params, omitting anything at its default.
 * @param {typeof DEFAULT_STATE} state
 * @returns {URLSearchParams}
 */
export function toSearchParams(state) {
  const d = DEFAULT_STATE;
  const p = new URLSearchParams();
  if (state.kind !== d.kind) p.set("kind", state.kind);
  const layout = activeLayoutId(state);
  if (layout !== activeLayoutId({ ...d, kind: state.kind })) p.set("layout", layout);
  if (state.theme !== d.theme) p.set("theme", state.theme);
  if (state.pack) p.set("pack", state.pack);
  if (state.title !== d.title) p.set("title", state.title);
  if (state.category !== d.category) p.set("category", state.category);
  if (state.showIcon !== d.showIcon) p.set("icon", state.showIcon ? "1" : "0");
  if (state.accent) p.set("accent", state.accent.replace(/^#/, ""));
  if (state.textMode !== d.textMode) p.set("text", state.textMode);
  if (state.scrim !== d.scrim) p.set("scrim", String(Math.round(state.scrim * 100)));
  if (state.logoScale !== d.logoScale) p.set("logoScale", String(Math.round(state.logoScale * 100)));
  if (state.focusX !== d.focusX || state.focusY !== d.focusY) {
    p.set("focus", `${Math.round(state.focusX * 100)},${Math.round(state.focusY * 100)}`);
  }
  if (isHttpUrl(state.background)) p.set("background", state.background);
  if (isHttpUrl(state.logo)) p.set("logo", state.logo);
  return p;
}

/**
 * Decode state from URL search params. Missing or invalid values keep their
 * defaults, so any link opens something sensible.
 * @param {URLSearchParams} params
 * @param {(id: string) => ("item" | "group" | null)} [layoutKind] layout lookup
 * @returns {typeof DEFAULT_STATE}
 */
export function fromSearchParams(params, layoutKind = () => null) {
  const s = { ...DEFAULT_STATE };

  const kind = params.get("kind");
  if (kind === "item" || kind === "group") s.kind = kind;

  const layout = params.get("layout");
  const kindOfLayout = layout ? layoutKind(layout) : null;
  if (kindOfLayout === "item") s.itemLayout = layout;
  if (kindOfLayout === "group") s.groupLayout = layout;
  if (kindOfLayout && !params.has("kind")) s.kind = kindOfLayout;

  const theme = params.get("theme");
  if (theme && THEME_ID.test(theme)) s.theme = theme;
  if (isHttpUrl(params.get("pack"))) s.pack = params.get("pack");

  if (params.has("title")) s.title = params.get("title").slice(0, LIMITS.title);
  if (params.has("category")) s.category = params.get("category").slice(0, LIMITS.category);

  const icon = params.get("icon");
  if (icon === "0" || icon === "1") s.showIcon = icon === "1";

  const accent = params.get("accent");
  if (accent) s.accent = normalizeAccent(accent.startsWith("#") ? accent : `#${accent}`);

  const textMode = params.get("text");
  if (TEXT_MODES.includes(textMode)) s.textMode = textMode;

  const scrim = percent(params.get("scrim"), 0, 0.8);
  if (scrim !== null) s.scrim = scrim;
  const logoScale = percent(params.get("logoScale"), 0.5, 2);
  if (logoScale !== null) s.logoScale = logoScale;

  const focus = (params.get("focus") || "").split(",");
  if (focus.length === 2) {
    const fx = percent(focus[0], 0, 1);
    const fy = percent(focus[1], 0, 1);
    if (fx !== null && fy !== null) {
      s.focusX = fx;
      s.focusY = fy;
    }
  }

  if (isHttpUrl(params.get("background"))) s.background = params.get("background");
  if (isHttpUrl(params.get("logo"))) s.logo = params.get("logo");
  return s;
}
