// The 14 required update-flow scenarios (plus the 7 capability-awareness ones covered by
// status.test.ts). Every network call goes through global fetch, stubbed per-test -- nothing
// here hits the real network. Cache isolation is per-test via a fresh ISHTARAN_MCP_HOME temp dir.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fetchRemoteManifest, REMOTE_MANIFEST_URL, type RemoteManifest } from '../../src/update/manifestClient.js';
import { applyKnowledgeUpdate, engineIsCompatible } from '../../src/update/updater.js';
import { bundleDirIsComplete } from '../../src/knowledge/loader.js';
import { shippedKnowledgeDir } from '../../src/knowledge/resolve.js';
import { cacheKnowledgeDir, cacheActivePointerPath } from '../../src/cache/paths.js';
import { readFileSync, existsSync } from 'node:fs';

let tmpHome: string;
const originalFetch = global.fetch;

beforeEach(() => {
  tmpHome = mkdtempSync(path.join(tmpdir(), 'ishtaran-mcp-test-'));
  process.env.ISHTARAN_MCP_HOME = tmpHome;
});
afterEach(() => {
  delete process.env.ISHTARAN_MCP_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function bundlePayloadFrom(localDir: string) {
  const files = ['manifest.json', 'index.json', 'capabilities.json', 'operations.json', 'sdk-map.json', 'errors.json', 'webhooks.json', 'recipes.json', 'glossary.json', 'gaps.json', 'projects.json', 'conflicts.json', 'graph.json', 'sources.json'];
  const payload: Record<string, unknown> = {};
  for (const f of files) payload[f] = JSON.parse(readFileSync(path.join(localDir, f), 'utf-8'));
  return payload;
}

function fakeManifest(overrides: Partial<RemoteManifest> = {}, bundlePayload?: unknown): RemoteManifest {
  const raw = JSON.stringify(bundlePayload ?? { hello: 'world' });
  return {
    schemaVersion: '1.0.0',
    knowledgeVersion: '0.2.0+abc123',
    generatedAt: new Date().toISOString(),
    sourceCommit: 'deadbeef',
    openApiHash: 'x',
    openApiVersion: 'v1',
    bundleUrl: 'https://ishtaran.com/mcp/knowledge/abc123.json',
    bundleHash: createHash('sha256').update(raw).digest('hex'),
    latestMcpVersion: '0.1.0',
    minimumCompatibleMcpVersion: '0.1.0',
    signature: null,
    signatureAlgorithm: null,
    ...overrides,
  };
}

describe('manifestClient', () => {
  it('rejects a non-HTTPS manifest URL', async () => {
    const res = await fetchRemoteManifest('http://ishtaran.com/mcp/manifest.json');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('non_https');
  });

  it('reports network_error on fetch failure -- MCP stays functional (offline scenario)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const res = await fetchRemoteManifest();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('network_error');
  });

  it('reports invalid_schema when required fields are missing', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ foo: 'bar' }), { status: 200 }));
    const res = await fetchRemoteManifest();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_schema');
  });

  it('accepts a well-formed manifest and returns it', async () => {
    const manifest = fakeManifest();
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(manifest), { status: 200 }));
    const res = await fetchRemoteManifest();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.manifest.knowledgeVersion).toBe('0.2.0+abc123');
  });

  it('uses the real, verified public manifest URL', () => {
    expect(REMOTE_MANIFEST_URL).toBe('https://ishtaran.com/mcp/manifest.json');
  });
});

describe('applyKnowledgeUpdate', () => {
  it('engineIsCompatible: newer/equal engine passes, older engine fails', () => {
    expect(engineIsCompatible('0.1.0', '0.1.0')).toBe(true);
    expect(engineIsCompatible('0.2.0', '0.1.0')).toBe(true);
    expect(engineIsCompatible('0.0.9', '0.1.0')).toBe(false);
  });

  it('refuses to update when the engine is too old (engine_incompatible)', async () => {
    const manifest = fakeManifest({ minimumCompatibleMcpVersion: '99.0.0' });
    const res = await applyKnowledgeUpdate(manifest, '0.1.0');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('engine_incompatible');
  });

  it('download failure leaves no partial bundle behind', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connection reset'));
    const manifest = fakeManifest();
    const res = await applyKnowledgeUpdate(manifest, '0.1.0');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('download_failed');
    expect(existsSync(cacheKnowledgeDir(manifest.knowledgeVersion))).toBe(false);
  });

  it('hash mismatch is rejected and nothing is written', async () => {
    const payload = { hello: 'world' };
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const manifest = fakeManifest({ bundleHash: '0'.repeat(64) });
    const res = await applyKnowledgeUpdate(manifest, '0.1.0');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('hash_mismatch');
    expect(existsSync(cacheKnowledgeDir(manifest.knowledgeVersion))).toBe(false);
  });

  it('invalid bundle payload (missing required files) is rejected', async () => {
    const payload = { 'manifest.json': {} }; // incomplete -- missing the other 13 files
    const raw = JSON.stringify(payload);
    global.fetch = vi.fn().mockResolvedValue(new Response(raw, { status: 200 }));
    const manifest = fakeManifest({ bundleHash: createHash('sha256').update(raw).digest('hex') });
    const res = await applyKnowledgeUpdate(manifest, '0.1.0');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_schema');
  });

  it('rejects a knowledgeVersion containing path traversal segments', async () => {
    const manifest = fakeManifest({ knowledgeVersion: '../../etc/passwd' });
    const res = await applyKnowledgeUpdate(manifest, '0.1.0');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('path_traversal');
  });

  it('a valid, matching-hash bundle is downloaded, verified, and made active (full round trip)', async () => {
    const payload = bundlePayloadFrom(shippedKnowledgeDir());
    const raw = JSON.stringify(payload);
    const manifest = fakeManifest({ knowledgeVersion: '0.2.0+realtest', bundleHash: createHash('sha256').update(raw).digest('hex') });
    global.fetch = vi.fn().mockResolvedValue(new Response(raw, { status: 200 }));

    const res = await applyKnowledgeUpdate(manifest, '0.1.0');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(bundleDirIsComplete(res.dir)).toBe(true);
    expect(existsSync(cacheActivePointerPath())).toBe(true);
    const active = JSON.parse(readFileSync(cacheActivePointerPath(), 'utf-8'));
    expect(active.knowledgeVersion).toBe('0.2.0+realtest');
  });

  it('rejects a bundle larger than the configured size limit', async () => {
    // Build a payload whose serialized size exceeds the 25MB cap without allocating 25MB of
    // real content -- a single oversized string field is enough.
    const bigString = 'x'.repeat(26 * 1024 * 1024);
    const payload = { 'manifest.json': { bigString } };
    const raw = JSON.stringify(payload);
    global.fetch = vi.fn().mockResolvedValue(new Response(raw, { status: 200 }));
    const manifest = fakeManifest({ bundleHash: createHash('sha256').update(raw).digest('hex') });
    const res = await applyKnowledgeUpdate(manifest, '0.1.0');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('too_large');
  });
});
