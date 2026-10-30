/**
 * Moonstage keeps several independent version numbers. They are deliberately
 * separate and must not be assumed to move together.
 *
 * - The npm package version lives in each package.json.
 * - PROJECT_FORMAT is the `format` field of moonstage.json and scene files.
 * - PLUGIN_API is the level a plugin declares in `pluginApi`.
 * - BEHAVIOR_ABI is what a WebAssembly behavior returns from `ms_abi_version`.
 */

/** Project and scene source format understood by this runtime. */
export const PROJECT_FORMAT = 1;

/** Plugin API level implemented by this runtime's plugin host. */
export const PLUGIN_API = 1;

/** WebAssembly behavior ABI implemented by this runtime's behavior host. */
export const BEHAVIOR_ABI = 1;
