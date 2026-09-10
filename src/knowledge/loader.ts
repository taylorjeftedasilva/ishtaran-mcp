// Loads a Knowledge Bundle from a directory of 14 JSON files. Used both for the bundle shipped
// inside the npm package (mcp/knowledge/<version>/) and for a verified, downloaded bundle in
// the user-level cache (~/.ishtaran/mcp/knowledge/<version>/). Never fetches over the network --
// that is update/manifestClient.ts's job. Loading is synchronous and local, so startup never
// blocks on I/O beyond disk reads.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { KnowledgeBundle } from './types.js';

const FILES = [
  'manifest.json', 'index.json', 'capabilities.json', 'operations.json', 'sdk-map.json',
  'errors.json', 'webhooks.json', 'recipes.json', 'glossary.json', 'gaps.json',
  'projects.json', 'conflicts.json', 'graph.json', 'sources.json',
] as const;

export class KnowledgeBundleLoadError extends Error {}

function readJson(absPath: string): unknown {
  return JSON.parse(readFileSync(absPath, 'utf-8'));
}

export function bundleDirIsComplete(dir: string): boolean {
  return FILES.every((f) => existsSync(path.join(dir, f)));
}

export function loadKnowledgeBundle(dir: string): KnowledgeBundle {
  if (!bundleDirIsComplete(dir)) {
    throw new KnowledgeBundleLoadError(`Knowledge bundle directory is incomplete or missing: ${dir}`);
  }
  return {
    manifest: readJson(path.join(dir, 'manifest.json')) as KnowledgeBundle['manifest'],
    index: readJson(path.join(dir, 'index.json')) as KnowledgeBundle['index'],
    capabilities: readJson(path.join(dir, 'capabilities.json')) as KnowledgeBundle['capabilities'],
    operations: readJson(path.join(dir, 'operations.json')) as KnowledgeBundle['operations'],
    sdkMap: readJson(path.join(dir, 'sdk-map.json')) as KnowledgeBundle['sdkMap'],
    errors: readJson(path.join(dir, 'errors.json')) as KnowledgeBundle['errors'],
    webhooks: readJson(path.join(dir, 'webhooks.json')) as KnowledgeBundle['webhooks'],
    recipes: readJson(path.join(dir, 'recipes.json')) as KnowledgeBundle['recipes'],
    glossary: readJson(path.join(dir, 'glossary.json')) as KnowledgeBundle['glossary'],
    gaps: readJson(path.join(dir, 'gaps.json')) as KnowledgeBundle['gaps'],
    projects: readJson(path.join(dir, 'projects.json')) as KnowledgeBundle['projects'],
    conflicts: readJson(path.join(dir, 'conflicts.json')) as KnowledgeBundle['conflicts'],
    graph: readJson(path.join(dir, 'graph.json')) as KnowledgeBundle['graph'],
    sources: readJson(path.join(dir, 'sources.json')) as KnowledgeBundle['sources'],
  };
}
