// Loads the real, current OpenAPI contract and classifies every operation as public or
// Platform-Owner/admin -- reusing website/scripts/openapi-utils.mjs's real classification
// logic (path prefix /v1/admin or /v1/platform) instead of reimplementing it, per the plan's
// "reaproveitar, não reimplementar" instruction. This is the ONLY source of truth for
// method/path/schema/status codes (precedence #1) -- never hand-authored.
import { readFileSync } from 'node:fs';
import { repoPath } from '../lib/paths.js';
// @ts-expect-error -- plain .mjs utility from the website package, no local type declarations.
import { getPlatformOwnerOnlySlugs, toKebabCase } from '../../../website/scripts/openapi-utils.mjs';

export interface OpenApiOperation {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  requestBody?: unknown;
  parameters?: unknown;
  responses?: unknown;
  isAdmin: boolean;
}

export interface OpenApiSource {
  raw: Record<string, unknown>;
  version: string;
  operations: OpenApiOperation[];
  publicOperations: OpenApiOperation[];
  adminOperations: OpenApiOperation[];
  contentHash: string;
}

const HTTP_VERBS = ['get', 'post', 'put', 'delete', 'patch'] as const;

export function loadOpenApi(contentHash: string): OpenApiSource {
  const absPath = repoPath('website', 'openapi', 'ishtaran-api.json');
  const raw = JSON.parse(readFileSync(absPath, 'utf-8'));
  const adminSlugs: Set<string> = getPlatformOwnerOnlySlugs(raw);

  const operations: OpenApiOperation[] = [];
  for (const [path, methods] of Object.entries<Record<string, any>>(raw.paths ?? {})) {
    for (const verb of HTTP_VERBS) {
      const op = methods[verb];
      if (!op?.operationId) continue;
      const slug = toKebabCase(op.operationId);
      operations.push({
        operationId: op.operationId,
        method: verb.toUpperCase(),
        path,
        summary: op.summary,
        description: op.description,
        tags: op.tags ?? [],
        requestBody: op.requestBody,
        parameters: op.parameters,
        responses: op.responses,
        isAdmin: adminSlugs.has(slug),
      });
    }
  }

  return {
    raw,
    version: raw.info?.version ?? 'unknown',
    operations,
    publicOperations: operations.filter((o) => !o.isAdmin),
    adminOperations: operations.filter((o) => o.isAdmin),
    contentHash,
  };
}
