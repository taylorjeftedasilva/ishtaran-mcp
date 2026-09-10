// Never hardcodes a route count -- derives Public/Admin classification dynamically from the
// CURRENT OpenAPI contract (reusing the same getPlatformOwnerOnlySlugs classification the build
// pipeline uses) and asserts the bundle matches it exactly. If the API grows next week, this
// test still passes without editing a single number.
//
// The cross-check against the live OpenAPI contract only runs INSIDE the monorepo (where
// website/openapi/ishtaran-api.json actually lives) -- the standalone public ishtaran-mcp repo
// ships the Knowledge Bundle as pre-built, committed data and has no access to the 5 separate
// source repos (platform + 4 SDKs) the build pipeline reads from. Deliberately never a static
// top-level `import` of build/sources/openapi.ts here -- that module itself statically imports
// website/scripts/openapi-utils.mjs, so merely importing it (even to leave the call unused)
// throws "Cannot find module" outside the monorepo. The self-contained bundle checks (no admin
// path ever present) still run everywhere.
import { existsSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { repoPath } from '../../build/lib/paths.js';
import { loadTestBundle } from '../helpers/bundle.js';
import type { OpenApiSource } from '../../build/sources/openapi.js';

const openApiPath = repoPath('website', 'openapi', 'ishtaran-api.json');
const insideMonorepo = existsSync(openApiPath);

describe('public/admin operation partition (cross-checked against the live OpenAPI contract)', () => {
  let openApi: OpenApiSource;

  beforeAll(async () => {
    if (!insideMonorepo) return;
    const { loadOpenApi } = await import('../../build/sources/openapi.js');
    const { sha256File } = await import('../../build/lib/hash.js');
    openApi = loadOpenApi(sha256File(openApiPath));
  });

  it.skipIf(!insideMonorepo)('Public + Excluded admin = OpenAPI total (never a fixed number)', () => {
    const bundle = loadTestBundle();
    expect(openApi.publicOperations.length + openApi.adminOperations.length).toBe(openApi.operations.length);
    expect(bundle.index.counts.publicOperations).toBe(openApi.publicOperations.length);
    expect(bundle.index.counts.excludedAdminOperations).toBe(openApi.adminOperations.length);
  });

  it.skipIf(!insideMonorepo)('every public operation has an entry in operations.json', () => {
    const bundle = loadTestBundle();
    for (const op of openApi.publicOperations) {
      expect(bundle.operations[op.operationId], `missing bundle entry for public operation ${op.operationId}`).toBeDefined();
    }
  });

  it.skipIf(!insideMonorepo)('zero admin operations ever appear in operations.json', () => {
    const bundle = loadTestBundle();
    for (const op of openApi.adminOperations) {
      expect(bundle.operations[op.operationId], `admin operation ${op.operationId} leaked into the public bundle`).toBeUndefined();
    }
  });

  it.skipIf(!insideMonorepo)('zero admin operationIds appear anywhere inside capabilities.json', () => {
    const bundle = loadTestBundle();
    const adminIds = new Set(openApi.adminOperations.map((o) => o.operationId));
    for (const cap of Object.values(bundle.capabilities)) {
      for (const opId of cap.operations) {
        expect(adminIds.has(opId), `admin operation ${opId} leaked into capability ${cap.id}`).toBe(false);
      }
    }
  });

  it.skipIf(!insideMonorepo)('every public operation is associated with exactly one capability', () => {
    const bundle = loadTestBundle();
    const covered = new Set(Object.values(bundle.capabilities).flatMap((c) => c.operations));
    for (const op of openApi.publicOperations) {
      expect(covered.has(op.operationId), `public operation ${op.operationId} has no capability`).toBe(true);
    }
  });
});

describe('public/admin operation partition (self-contained bundle checks)', () => {
  const bundle = loadTestBundle();

  it('no /v1/admin or /v1/platform path ever appears in the bundle', () => {
    for (const op of Object.values(bundle.operations)) {
      expect(op.path.startsWith('/v1/admin')).toBe(false);
      expect(op.path.startsWith('/v1/platform')).toBe(false);
    }
  });

  it('every public operation is associated with exactly one capability (bundle-internal)', () => {
    const covered = new Set(Object.values(bundle.capabilities).flatMap((c) => c.operations));
    for (const opId of Object.keys(bundle.operations)) {
      expect(covered.has(opId), `public operation ${opId} has no capability`).toBe(true);
    }
  });
});
