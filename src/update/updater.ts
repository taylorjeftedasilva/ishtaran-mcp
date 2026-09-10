// Applies a verified remote Knowledge Bundle update. Downloads DATA only (a JSON document),
// never code -- nothing here is ever eval'd or executed. Every step that can fail leaves the
// previously-active bundle completely untouched: a partially-updated cache must never happen.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { cacheActivePointerPath, cacheKnowledgeDir, cacheRoot } from '../cache/paths.js';
import { bundleDirIsComplete } from '../knowledge/loader.js';
import type { RemoteManifest } from './manifestClient.js';

const BUNDLE_FILES = [
  'manifest.json', 'index.json', 'capabilities.json', 'operations.json', 'sdk-map.json',
  'errors.json', 'webhooks.json', 'recipes.json', 'glossary.json', 'gaps.json',
  'projects.json', 'conflicts.json', 'graph.json', 'sources.json',
] as const;

const MAX_BUNDLE_BYTES = 25 * 1024 * 1024; // 25MB -- generous headroom over any realistic bundle size

export type UpdateApplyResult =
  | { ok: true; knowledgeVersion: string; dir: string }
  | { ok: false; reason: 'download_failed' | 'too_large' | 'hash_mismatch' | 'invalid_schema' | 'engine_incompatible' | 'path_traversal'; detail: string };

function compareSemver(a: string, b: string): number {
  const pa = a.split('+')[0]!.split('-')[0]!.split('.').map(Number);
  const pb = b.split('+')[0]!.split('-')[0]!.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function engineIsCompatible(installedEngineVersion: string, minimumCompatibleMcpVersion: string): boolean {
  return compareSemver(installedEngineVersion, minimumCompatibleMcpVersion) >= 0;
}

function isCompleteBundlePayload(payload: unknown): payload is Record<(typeof BUNDLE_FILES)[number], unknown> {
  if (typeof payload !== 'object' || payload === null) return false;
  const obj = payload as Record<string, unknown>;
  return BUNDLE_FILES.every((f) => f in obj);
}

/** Rejects any knowledgeVersion string that could escape the cache directory via path traversal. */
function isSafeVersionSegment(version: string): boolean {
  return /^[A-Za-z0-9._+-]+$/.test(version) && !version.includes('..');
}

export async function applyKnowledgeUpdate(manifest: RemoteManifest, installedEngineVersion: string): Promise<UpdateApplyResult> {
  if (!engineIsCompatible(installedEngineVersion, manifest.minimumCompatibleMcpVersion)) {
    return {
      ok: false,
      reason: 'engine_incompatible',
      detail: `This knowledge bundle requires MCP engine >= ${manifest.minimumCompatibleMcpVersion}, but ${installedEngineVersion} is installed. Update @ishtaran/mcp via your package manager first.`,
    };
  }
  if (!isSafeVersionSegment(manifest.knowledgeVersion)) {
    return { ok: false, reason: 'path_traversal', detail: `Unsafe knowledgeVersion string: ${manifest.knowledgeVersion}` };
  }

  let res: Response;
  try {
    res = await fetch(manifest.bundleUrl, { headers: { accept: 'application/json' } });
  } catch (err) {
    return { ok: false, reason: 'download_failed', detail: (err as Error).message };
  }
  if (!res.ok) {
    return { ok: false, reason: 'download_failed', detail: `HTTP ${res.status} fetching ${manifest.bundleUrl}` };
  }

  const raw = await res.text();
  if (Buffer.byteLength(raw, 'utf-8') > MAX_BUNDLE_BYTES) {
    return { ok: false, reason: 'too_large', detail: `Bundle exceeds ${MAX_BUNDLE_BYTES} bytes.` };
  }

  const actualHash = createHash('sha256').update(raw).digest('hex');
  if (actualHash !== manifest.bundleHash) {
    return { ok: false, reason: 'hash_mismatch', detail: `Expected ${manifest.bundleHash}, got ${actualHash}.` };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: 'invalid_schema', detail: `Bundle is not valid JSON: ${(err as Error).message}` };
  }
  if (!isCompleteBundlePayload(payload)) {
    return { ok: false, reason: 'invalid_schema', detail: `Bundle payload is missing one or more required files: ${BUNDLE_FILES.join(', ')}` };
  }

  const finalDir = cacheKnowledgeDir(manifest.knowledgeVersion);
  const tmpDir = path.join(cacheRoot(), 'knowledge', `.tmp-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    for (const file of BUNDLE_FILES) {
      writeFileSync(path.join(tmpDir, file), JSON.stringify(payload[file], null, 2) + '\n', 'utf-8');
    }
    if (!bundleDirIsComplete(tmpDir)) {
      throw new Error('post-write completeness check failed');
    }
    if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
    renameSync(tmpDir, finalDir); // atomic on the same filesystem
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    return { ok: false, reason: 'invalid_schema', detail: `Failed to materialize bundle: ${(err as Error).message}` };
  }

  // Atomically swap the active pointer only after the bundle directory is fully written.
  const activePath = cacheActivePointerPath();
  const activeTmp = `${activePath}.tmp-${randomUUID()}`;
  mkdirSync(path.dirname(activePath), { recursive: true });
  writeFileSync(activeTmp, JSON.stringify({ knowledgeVersion: manifest.knowledgeVersion }, null, 2) + '\n', 'utf-8');
  renameSync(activeTmp, activePath);

  return { ok: true, knowledgeVersion: manifest.knowledgeVersion, dir: finalDir };
}
