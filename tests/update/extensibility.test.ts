// The addendum's core extensibility scenario: simulate an MCP engine that today only knows
// about marketplace-mercatto, publish a NEW project (service-marketplace, READY) + a new recipe
// to a remote fixture, apply the update, and confirm the engine discovers and can answer
// questions about the new content -- all without a single src/ (Engine) file changing. If this
// fails, the update architecture is incomplete, per the addendum's own framing.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { applyKnowledgeUpdate } from '../../src/update/updater.js';
import { loadKnowledgeBundle } from '../../src/knowledge/loader.js';
import { shippedKnowledgeDir } from '../../src/knowledge/resolve.js';
import { cacheKnowledgeDir } from '../../src/cache/paths.js';
import { search } from '../../src/search/index.js';
import { getRecipe, chooseSdk } from '../../src/toolLogic.js';
import type { RemoteManifest } from '../../src/update/manifestClient.js';

let tmpHome: string;
const originalFetch = global.fetch;

beforeEach(() => {
  tmpHome = mkdtempSync(path.join(tmpdir(), 'ishtaran-mcp-ext-test-'));
  process.env.ISHTARAN_MCP_HOME = tmpHome;
});
afterEach(() => {
  delete process.env.ISHTARAN_MCP_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const FILES = ['manifest.json', 'index.json', 'capabilities.json', 'operations.json', 'sdk-map.json', 'errors.json', 'webhooks.json', 'recipes.json', 'glossary.json', 'gaps.json', 'projects.json', 'conflicts.json', 'graph.json', 'sources.json'] as const;

it('a new READY project + recipe published remotely is discoverable after update_knowledge -- no Engine code change', async () => {
  // 1. Start from today's real bundle -- this stands in for "MCP 1.0.0 installed, only Mercatto known".
  const baseline = loadKnowledgeBundle(shippedKnowledgeDir());
  expect(baseline.projects.some((p) => p.id === 'service-marketplace')).toBe(false);

  // 2. Build a "remote" bundle payload: baseline + one new project + one new recipe, exactly
  //    the kind of publish a content team would do without touching mcp/src/ at all.
  const payload: Record<string, unknown> = {};
  for (const f of FILES) payload[f] = JSON.parse(readFileSync(path.join(shippedKnowledgeDir(), f), 'utf-8'));

  const newProject = {
    id: 'service-marketplace',
    name: 'Service Marketplace (new reference project)',
    description: 'A freshly published reference implementation for the service-milestone pattern.',
    status: 'READY',
    pattern: 'service-milestone',
    repositoryUrl: 'https://github.com/example/service-marketplace',
    defaultBranch: 'main',
    revision: 'abc1234',
    sourceArchiveUrl: null,
    contentHash: null,
    languages: ['typescript'],
    frameworks: ['node'],
    capabilities: ['settlement', 'transactions'],
    sdk: [{ language: 'typescript', version: '0.1.3' }],
    difficulty: 'intermediate',
    tags: ['services', 'milestone'],
    docs: [],
    entryPoints: [],
    minimumKnowledgeVersion: '0.1.0',
    knownLimitations: [],
    lastValidatedAt: new Date().toISOString(),
  };
  (payload['projects.json'] as unknown[]).push(newProject);

  const recipes = payload['recipes.json'] as any[];
  const serviceMilestoneIdx = recipes.findIndex((r) => r.id === 'service-milestone');
  recipes[serviceMilestoneIdx] = { ...recipes[serviceMilestoneIdx], referenceProjectStatus: 'READY', referenceProject: 'service-marketplace' };

  const raw = JSON.stringify(payload);
  const remoteManifest: RemoteManifest = {
    schemaVersion: '1.0.0',
    knowledgeVersion: '0.2.0+newproject',
    generatedAt: new Date().toISOString(),
    sourceCommit: 'newcommit',
    openApiHash: baseline.manifest.openApiHash,
    openApiVersion: baseline.manifest.openApiVersion,
    bundleUrl: 'https://ishtaran.com/mcp/knowledge/newproject.json',
    bundleHash: createHash('sha256').update(raw).digest('hex'),
    latestMcpVersion: '0.1.0',
    minimumCompatibleMcpVersion: '0.1.0',
    signature: null,
    signatureAlgorithm: null,
  };
  global.fetch = vi.fn().mockResolvedValue(new Response(raw, { status: 200 }));

  // 3. Apply the update through the real, unmodified updater -- no engine code path bypassed.
  const applyResult = await applyKnowledgeUpdate(remoteManifest, '0.1.0');
  expect(applyResult.ok).toBe(true);
  if (!applyResult.ok) return;

  // 4. Reload exactly the way context.ts would on next resolveActiveBundle() -- pure data read.
  const updated = loadKnowledgeBundle(cacheKnowledgeDir(applyResult.knowledgeVersion));

  // 5. The engine (search/toolLogic -- zero changes made to either for this test) now discovers
  //    the new project and serves the updated recipe, using only the new bundle as input.
  const searchHits = search(updated, 'service-marketplace', { kinds: ['project'] });
  expect(searchHits.some((r) => r.id === 'service-marketplace')).toBe(true);

  const recipe = getRecipe(updated, { recipeId: 'service-milestone' }) as any;
  expect(recipe.referenceProjectStatus).toBe('READY');
  expect(recipe.referenceProjectDetail.id).toBe('service-marketplace');
  expect(recipe.referenceProjectDetail.status).toBe('READY');

  // 6. A PLANNED project must never be reported as if it were available -- sanity check the
  //    inverse still holds for the one recipe we did NOT touch.
  const stillPlanned = getRecipe(updated, { recipeId: 'wallet-payment-app' }) as any;
  expect(stillPlanned.referenceProjectStatus).toBe('PLANNED');
  expect(stillPlanned.referenceProjectDetail).toBeNull();

  // Sanity: an operation lookup untouched by the update still resolves correctly post-swap.
  expect('error' in chooseSdk(updated, { operationId: 'ExecuteSettlement' })).toBe(false);
});
