/**
 * Application version information.
 *
 * At build time, Vite injects the git describe output via the __APP_VERSION__ global.
 * This is set via vite.config.ts as a define substitution.
 * Format: "v0.1.0" (at a tag) or "v0.1.0-5-g3a7b9c1" (between tags)
 */

declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined'
  ? __APP_VERSION__
  : 'unknown';
