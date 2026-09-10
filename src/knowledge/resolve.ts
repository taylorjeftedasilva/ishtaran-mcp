// Decides which Knowledge Bundle directory is active at startup:
//   1. A verified, downloaded bundle in the user-level cache (~/.ishtaran/mcp/), if
//      active.json points to one and it's complete -- this is how `update_knowledge` takes
//      effect on the NEXT read without ever touching the installed package.
//   2. Otherwise, the bundle shipped inside the installed package (mcp/knowledge/<version>/,
//      pointed to by mcp/knowledge/latest.json at build time).
// This never performs network I/O -- it only resolves a local path.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../root.js';
import { bundleDirIsComplete, loadKnowledgeBundle, KnowledgeBundleLoadError } from './loader.js';
import { cacheActivePointerPath, cacheKnowledgeDir } from '../cache/paths.js';
import type { KnowledgeBundle } from './types.js';

export function shippedKnowledgeDir(): string {
  const latestPointer = path.join(PACKAGE_ROOT, 'knowledge', 'latest.json');
  if (!existsSync(latestPointer)) {
    throw new KnowledgeBundleLoadError(`No shipped knowledge bundle found at ${latestPointer}. Run "npm run build:knowledge" first.`);
  }
  const { knowledgeVersion } = JSON.parse(readFileSync(latestPointer, 'utf-8')) as { knowledgeVersion: string };
  return path.join(PACKAGE_ROOT, 'knowledge', knowledgeVersion);
}

export interface ResolvedBundle {
  bundle: KnowledgeBundle;
  bundleDir: string;
  origin: 'user-cache' | 'shipped';
}

export function resolveActiveBundle(): ResolvedBundle {
  const activePointerPath = cacheActivePointerPath();
  if (existsSync(activePointerPath)) {
    try {
      const { knowledgeVersion } = JSON.parse(readFileSync(activePointerPath, 'utf-8')) as { knowledgeVersion: string };
      const dir = cacheKnowledgeDir(knowledgeVersion);
      if (bundleDirIsComplete(dir)) {
        return { bundle: loadKnowledgeBundle(dir), bundleDir: dir, origin: 'user-cache' };
      }
      console.error(`[ishtaran-mcp] Cached active bundle ${knowledgeVersion} is incomplete; falling back to the shipped bundle.`);
    } catch (err) {
      console.error(`[ishtaran-mcp] Failed to load cached active bundle, falling back to shipped: ${(err as Error).message}`);
    }
  }
  const dir = shippedKnowledgeDir();
  return { bundle: loadKnowledgeBundle(dir), bundleDir: dir, origin: 'shipped' };
}
