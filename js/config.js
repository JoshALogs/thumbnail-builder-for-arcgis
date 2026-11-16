/**
 * App-wide constants.
 *
 * CALCITE_VERSION must match the version in index.html's <script> and <link>
 * tags; tests/config.test.js fails if they drift apart.
 * @module config
 */

/** Version of this app, shown in the About section. */
export const APP_VERSION = "0.1.0";

/** Calcite components release used for the UI and for item-type icons. */
export const CALCITE_VERSION = "5.2.1";

/** Esri's CDN folder for that release (icons are fetched from its assets). */
export const CALCITE_CDN = `https://js.arcgis.com/calcite-components/${CALCITE_VERSION}`;
