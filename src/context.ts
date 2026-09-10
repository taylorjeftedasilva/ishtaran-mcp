// Mutable engine-wide context: the currently active Knowledge Bundle, plus this Engine's own
// package version. `update_knowledge` swaps `bundle`/`bundleDir`/`origin` in place after a
// successful, verified download -- every resource/tool reads through getContext() rather than
// capturing a snapshot at registration time, so an update takes effect immediately.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from './root.js';
import { resolveActiveBundle, type ResolvedBundle } from './knowledge/resolve.js';
import type { KnowledgeBundle } from './knowledge/types.js';

const ENGINE_VERSION = (JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8')) as { version: string }).version;

let current: ResolvedBundle = resolveActiveBundle();

export function getContext(): { bundle: KnowledgeBundle; bundleDir: string; origin: ResolvedBundle['origin']; engineVersion: string } {
  return { ...current, engineVersion: ENGINE_VERSION };
}

export function reloadContext(): void {
  current = resolveActiveBundle();
}

export function getEngineVersion(): string {
  return ENGINE_VERSION;
}
