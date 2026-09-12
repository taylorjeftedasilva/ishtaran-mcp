// Knowledge Build System orchestrator -- reads every public source (never private src/,
// Terraform, GCP internals, secrets, or admin-only OpenAPI operations), cross-references them,
// and writes the versioned Knowledge Bundle under mcp/knowledge/<knowledgeVersion>/*.json.
// Re-run this any time a public source changes; the MCP Engine (mcp/src/) never changes just
// because this output changes.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { repoPath, mcpPath } from './lib/paths.js';
import { sha256File, sha256Hex } from './lib/hash.js';
import { loadOpenApi, type OpenApiOperation } from './sources/openapi.js';
import { loadSdkMatrix } from './sources/sdkMatrix.js';
import { extractSdkMethods, indexByPathShape, type SdkLanguage } from './sources/sdkExtract.js';
import { loadAiDocs } from './sources/aiDocs.js';
import { ERRORS } from './data/errors.js';
import { WEBHOOK_CONTRACT, WEBHOOK_EVENTS } from './data/webhooks.js';
import { GLOSSARY } from './data/glossary.js';
import { GAPS } from './data/gaps.js';
import { RECIPES } from './data/recipes.js';
import { buildProjects } from './data/projects.js';

const SCHEMA_VERSION = '1.0.0';
const LANGUAGES: SdkLanguage[] = ['typescript', 'java', 'python', 'go'];

function gitCommit(): string {
  return execSync('git rev-parse HEAD', { cwd: repoPath() }).toString().trim();
}
function gitCommitDate(): string {
  return execSync('git log -1 --format=%cI', { cwd: repoPath() }).toString().trim();
}

// A capability groups operations under one topic. Derived from OpenAPI tags[0] -- the OpenAPI
// contract's own grouping, never invented -- falling back to a slugged operationId prefix if a
// route somehow has no tag.
function capabilityIdFor(op: OpenApiOperation): string {
  const tag = op.tags?.[0];
  if (tag) return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return op.operationId.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/^-/, '');
}

function main() {
  console.log('[mcp-build] Loading sources...');

  const openApiAbsPath = repoPath('website', 'openapi', 'ishtaran-api.json');
  const openApiHash = sha256File(openApiAbsPath);
  const openApi = loadOpenApi(openApiHash);

  const sdkMatrix = loadSdkMatrix();
  const extractedMethods = extractSdkMethods();
  const methodsByPathShape = indexByPathShape(extractedMethods);
  const aiDocs = loadAiDocs();

  const commit = gitCommit();
  const commitDate = gitCommitDate();
  const tsSdkVersion = JSON.parse(readFileSync(repoPath('sdks', 'typescript', 'package.json'), 'utf-8')).version as string;
  const pythonSdkVersion = /^version\s*=\s*"([^"]+)"/m.exec(
    readFileSync(repoPath('sdks', 'python', 'pyproject.toml'), 'utf-8'),
  )?.[1] as string;
  const javaSdkVersion = /<version>([^<]+)<\/version>/.exec(
    readFileSync(repoPath('sdks', 'java', 'pom.xml'), 'utf-8'),
  )?.[1] as string;
  const goSdkVersion = /SDKVersion\s*=\s*"([^"]+)"/.exec(
    readFileSync(repoPath('sdks', 'go', 'user_agent.go'), 'utf-8'),
  )?.[1] as string;
  const sdkVersionsByLanguage: Record<SdkLanguage, string> = {
    typescript: tsSdkVersion,
    python: pythonSdkVersion,
    java: javaSdkVersion,
    go: goSdkVersion,
  };

  console.log(`[mcp-build] OpenAPI: ${openApi.operations.length} total, ${openApi.publicOperations.length} public, ${openApi.adminOperations.length} admin (excluded).`);
  console.log(`[mcp-build] SDK extraction: ${extractedMethods.length} methods across ${LANGUAGES.length} languages.`);

  // ---- operations.json (public only -- admin operations NEVER enter the bundle) ----
  const operations: Record<string, unknown> = {};
  const unmatchedByLanguage: Record<SdkLanguage, string[]> = { typescript: [], java: [], python: [], go: [] };

  for (const op of openApi.publicOperations) {
    const pathShapeKey = `${op.method} ${op.path.replace(/\{[^}]+\}/g, '*')}`;
    const candidates = methodsByPathShape.get(pathShapeKey) ?? [];
    const sdk: Record<string, unknown> = {};
    for (const lang of LANGUAGES) {
      const match = candidates.find((c) => c.language === lang);
      if (match) {
        sdk[lang] = { method: match.methodName, resource: match.resourceAccessor, signature: match.signature };
      } else {
        unmatchedByLanguage[lang].push(op.operationId);
      }
    }
    const matrixEntry = sdkMatrix.byOperationId.get(op.operationId);
    operations[op.operationId] = {
      operationId: op.operationId,
      method: op.method,
      path: op.path,
      summary: op.summary ?? null,
      description: op.description ?? null,
      tags: op.tags,
      capability: capabilityIdFor(op),
      sdk,
      matrixStatus: matrixEntry?.status ?? null,
      sources: ['website/openapi/ishtaran-api.json', 'sdk-feature-matrix.json'],
    };
  }

  // ---- capabilities.json ----
  const capabilities: Record<string, unknown> = {};
  for (const op of openApi.publicOperations) {
    const capId = capabilityIdFor(op);
    if (!capabilities[capId]) {
      capabilities[capId] = { id: capId, operations: [], relatedErrors: [], relatedWebhooks: [], relatedRecipes: [], sources: ['website/openapi/ishtaran-api.json'] };
    }
    (capabilities[capId] as any).operations.push(op.operationId);
  }
  for (const err of ERRORS) {
    for (const opId of err.relatedOperations) {
      const op = openApi.publicOperations.find((o) => o.operationId === opId);
      if (op) {
        const capId = capabilityIdFor(op);
        (capabilities[capId] as any)?.relatedErrors.push(err.code);
      }
    }
  }
  for (const recipe of RECIPES) {
    for (const capId of Object.keys(capabilities)) {
      // best-effort textual link: a capability id appearing among the recipe's capability text
      const inRecipe = recipe.required_capabilities.some((c) => c.toLowerCase().includes(capId.replace(/-/g, ' ')));
      if (inRecipe) (capabilities[capId] as any).relatedRecipes.push(recipe.id);
    }
  }

  // ---- gaps.json: cross-check hand-authored gaps against what the extractor actually found ----
  const allLanguagesUnmatched = openApi.publicOperations
    .map((o) => o.operationId)
    .filter((id) => LANGUAGES.every((lang) => unmatchedByLanguage[lang].includes(id)));
  const declaredSdkGapIds = new Set(GAPS.filter((g) => g.id.includes('sdk-gap')).map((g) => g.capability));
  const undeclaredGaps = allLanguagesUnmatched.filter((id) => !declaredSdkGapIds.has(id));
  if (undeclaredGaps.length > 0) {
    console.warn(`[mcp-build] WARNING: operations unmatched in all 4 SDK languages but not yet declared in gaps.ts: ${undeclaredGaps.join(', ')}`);
  }

  // ---- conflicts.json: structural cross-source checks ----
  const conflicts: unknown[] = [];
  for (const entry of aiDocs.capabilityIndex as any[]) {
    const opId = entry?.http?.operationId;
    if (!opId) continue;
    if (!operations[opId] && !openApi.adminOperations.some((o) => o.operationId === opId)) {
      conflicts.push({
        type: 'ai-doc-operation-not-in-openapi',
        source: 'website/static/ai/marketplace-mercatto/capability-index.yaml',
        operationId: opId,
        description: `capability-index.yaml references operationId "${opId}" which does not exist in the current public OpenAPI contract.`,
      });
    }
  }
  for (const err of ERRORS) {
    for (const opId of err.relatedOperations) {
      if (!operations[opId] && !openApi.adminOperations.some((o) => o.operationId === opId)) {
        conflicts.push({
          type: 'error-related-operation-not-in-openapi',
          source: 'mcp/build/data/errors.ts',
          errorCode: err.code,
          operationId: opId,
          description: `errors.ts declares "${err.code}" as related to operationId "${opId}", which does not exist in the current public OpenAPI contract.`,
        });
      }
    }
  }

  // NOTE (2026-09-09, found via blind-LLM-test session): website/docs/errors.md previously told
  // integrators to "Always send trigger = MANUAL" for CreatePayoutBatch, but the real OpenAPI
  // request schema (Payout.Contracts.Requests.CreatePayoutBatchRequest) has no `trigger` field at
  // all -- pure documentation drift, no backend/contract change. Corrected directly in
  // website/docs/errors.md (+ pt-BR/es) and in build/data/errors.ts's remediation text; no
  // standing conflicts.json entry is needed once both sides already agree.

  // ---- graph.json: deterministic relations for exact lookup ----
  const graph = {
    conceptToCapabilities: Object.fromEntries(GLOSSARY.map((g) => [g.term, Object.keys(capabilities).filter((c) => g.definition.toLowerCase().includes(c.replace(/-/g, ' ')))])),
    capabilityToOperations: Object.fromEntries(Object.entries(capabilities).map(([id, c]) => [id, (c as any).operations])),
    operationToErrors: ERRORS.flatMap((e) => e.relatedOperations.map((op) => [op, e.code] as const)).reduce((acc, [op, code]) => {
      (acc[op] ??= []).push(code);
      return acc;
    }, {} as Record<string, string[]>),
    errorToOperations: Object.fromEntries(ERRORS.map((e) => [e.code, e.relatedOperations])),
    recipeToCapabilities: Object.fromEntries(RECIPES.map((r) => [r.id, r.required_capabilities])),
    recipeToOperations: Object.fromEntries(RECIPES.map((r) => [r.id, r.required_capabilities.flatMap((c) => (capabilities[capabilityIdFor({ tags: [c] } as any)] as any)?.operations ?? [])])),
    webhookEventToCategory: Object.fromEntries(WEBHOOK_EVENTS.map((w) => [w.event, w.category])),
  };

  // ---- sources.json: every ingested file + hash, for citation + staleness detection ----
  const trackedSourceFiles = [
    'website/openapi/ishtaran-api.json',
    'sdk-feature-matrix.json',
    'website/docs/webhooks.md',
    'website/docs/errors.md',
    'website/docs/idempotency.md',
    'website/docs/getting-started.md',
    'website/docs/concepts/authentication.md',
    'website/docs/concepts/network-execution.md',
    'website/docs/concepts/self-custody.md',
    'website/docs/concepts/transactions-settlements.md',
    'website/static/ai/marketplace-mercatto/manifest.yaml',
    'website/static/ai/marketplace-mercatto/capability-index.yaml',
    'website/static/ai/marketplace-mercatto/anti-patterns.yaml',
    'website/static/ai/marketplace-mercatto/scenario-manifest.yaml',
    'website/static/ai/marketplace-mercatto/operation-cards/execute-settlement.yaml',
    'docs/architecture/CUSTODY-EXECUTION-MODES.md',
  ];
  const sources = trackedSourceFiles
    .map((rel) => {
      const abs = repoPath(...rel.split('/'));
      if (!existsSync(abs)) return null;
      return { path: rel, contentHash: sha256File(abs) };
    })
    .filter((s): s is { path: string; contentHash: string } => s !== null);

  // ---- projects.json ----
  const projects = buildProjects(commit, commitDate, tsSdkVersion);

  // ---- errors.json / webhooks.json / recipes.json / glossary.json / gaps.json ----
  const errorsJson = ERRORS;
  const webhooksJson = { contract: WEBHOOK_CONTRACT, events: WEBHOOK_EVENTS };
  const recipesJson = RECIPES;
  const glossaryJson = GLOSSARY;
  const gapsJson = GAPS;

  // ---- index.json: navigation summary ----
  const index = {
    capabilities: Object.keys(capabilities).sort(),
    concepts: GLOSSARY.map((g) => g.term),
    recipes: RECIPES.map((r) => ({ id: r.id, recipeStatus: r.recipeStatus, referenceProjectStatus: r.referenceProjectStatus })),
    errorCodes: ERRORS.map((e) => e.code),
    webhookEvents: WEBHOOK_EVENTS.map((w) => w.event),
    projects: projects.map((p) => ({ id: p.id, status: p.status, pattern: p.pattern })),
    counts: {
      publicOperations: openApi.publicOperations.length,
      excludedAdminOperations: openApi.adminOperations.length,
      capabilities: Object.keys(capabilities).length,
      errors: ERRORS.length,
      webhookEvents: WEBHOOK_EVENTS.length,
      recipes: RECIPES.length,
      projects: projects.length,
      conflicts: conflicts.length,
    },
  };

  // ---- knowledgeVersion: deterministic content hash over the assembled bundle ----
  const preHashPayload = JSON.stringify({ openApiHash, operations, capabilities, errorsJson, webhooksJson, recipesJson, glossaryJson, gapsJson, projects, conflicts, graph, index });
  const knowledgeVersion = `0.1.0+${sha256Hex(preHashPayload).slice(0, 12)}`;

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    knowledgeVersion,
    generatedAt: new Date().toISOString(),
    sourceCommit: commit,
    openApiVersion: openApi.version,
    openApiHash,
    bundleHash: sha256Hex(preHashPayload),
    supportedSdkVersions: LANGUAGES.map((lang) => ({ language: lang, version: sdkVersionsByLanguage[lang] })),
    minimumCompatibleMcpVersion: '0.1.0',
    environmentStatus: { local: 'active', sandbox: 'active', production: 'not_active_for_real_crypto_flows' },
    signature: null,
    signatureAlgorithm: null,
  };

  // ---- write bundle ----
  const outDir = mcpPath('knowledge', knowledgeVersion);
  mkdirSync(outDir, { recursive: true });
  const files: Record<string, unknown> = {
    'manifest.json': manifest,
    'index.json': index,
    'capabilities.json': capabilities,
    'operations.json': operations,
    'sdk-map.json': extractedMethods,
    'errors.json': errorsJson,
    'webhooks.json': webhooksJson,
    'recipes.json': recipesJson,
    'glossary.json': glossaryJson,
    'gaps.json': gapsJson,
    'projects.json': projects,
    'conflicts.json': conflicts,
    'graph.json': graph,
    'sources.json': sources,
  };
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(`${outDir}/${name}`, JSON.stringify(content, null, 2) + '\n', 'utf-8');
  }

  // also write a stable "latest" pointer file the MCP engine reads at startup
  writeFileSync(mcpPath('knowledge', 'latest.json'), JSON.stringify({ knowledgeVersion }, null, 2) + '\n', 'utf-8');

  // Prune stale bundle directories from prior local builds -- only the version latest.json
  // points to ships in the package; there is no in-package rollback history (rollback is via
  // the user-level cache under ~/.ishtaran/mcp/, a separate mechanism from what npm ships).
  const knowledgeRoot = mcpPath('knowledge');
  for (const entry of readdirSync(knowledgeRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== knowledgeVersion) {
      rmSync(`${knowledgeRoot}/${entry.name}`, { recursive: true, force: true });
      console.log(`[mcp-build] Pruned stale local bundle: ${entry.name}`);
    }
  }

  console.log(`[mcp-build] Wrote knowledge bundle: mcp/knowledge/${knowledgeVersion}/ (14 files).`);
  console.log(`[mcp-build] Public operations: ${openApi.publicOperations.length}, Excluded admin: ${openApi.adminOperations.length}, Total: ${openApi.operations.length}.`);
  console.log(`[mcp-build] Structural conflicts detected: ${conflicts.length}.`);
  if (undeclaredGaps.length > 0) {
    console.log(`[mcp-build] NOTE: ${undeclaredGaps.length} operation(s) unmatched in all SDKs are not yet in gaps.ts: ${undeclaredGaps.join(', ')}`);
  }
}

main();
