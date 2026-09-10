// The single source of truth for "where is the mcp/ package root at runtime". Deliberately the
// ONLY place that does import.meta.url arithmetic: tsup bundles the whole src/ tree into one
// dist/index.js file, so every other module's import.meta.url collapses to that one bundle
// file's location at runtime, regardless of how deeply nested the source file was in dev. Since
// this module lives directly under src/ (one level below mcp/, exactly matching dist/index.js's
// one level below mcp/dist/), a single '..' resolves correctly in both dev (tsx, real per-file
// paths) and the built bundle (single collapsed file) -- any other module must import
// PACKAGE_ROOT from here rather than recomputing it itself.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
