// Registers all MCP tools as thin protocol wrappers over toolLogic.ts's pure functions (unit-
// tested directly) plus the update/* modules for the two freshness tools. Tool execution errors
// (unknown id, etc.) use `isError: true` in the result (recoverable, model can retry with a
// different input); only truly unexpected engine failures should ever throw and become a
// protocol-level error.
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { getContext, reloadContext } from './context.js';
import * as logic from './toolLogic.js';
import { fetchRemoteManifest } from './update/manifestClient.js';
import { applyKnowledgeUpdate } from './update/updater.js';
import { getKnowledgeStatus, acknowledgeUpdateNotice } from './update/status.js';

function ok(structuredContent: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
}
function result<T extends object>(data: T) {
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string') return { content: [{ type: 'text' as const, text: error }], isError: true as const, structuredContent: data };
  return ok(data);
}
function fail(message: string, extra?: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const, structuredContent: { error: message, ...extra } };
}

export function registerTools(server: McpServer) {
  server.registerTool(
    'search_knowledge',
    {
      title: 'Search knowledge',
      description: 'Hybrid search (exact id > alias > lexical) across operations, capabilities, errors, webhooks, recipes, glossary, gaps, and reference projects.',
      inputSchema: z.object({
        query: z.string().describe('Free text or an exact id (operationId, error code, event name, capability id, recipe id).'),
        kinds: z.array(z.enum(['operation', 'capability', 'error', 'webhook', 'recipe', 'glossary', 'gap', 'project'])).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async (args) => result(logic.searchKnowledge(getContext().bundle, args)),
  );

  server.registerTool(
    'get_capability',
    { title: 'Get capability', description: 'Full detail for one capability: its operations, related errors/webhooks/recipes.', inputSchema: z.object({ capability: z.string() }) },
    async (args) => result(logic.getCapability(getContext().bundle, args)),
  );

  server.registerTool(
    'get_operation',
    { title: 'Get operation', description: 'Full detail for one public API operation, including per-language SDK mapping.', inputSchema: z.object({ operationId: z.string() }) },
    async (args) => result(logic.getOperation(getContext().bundle, args)),
  );

  server.registerTool(
    'choose_sdk',
    {
      title: 'Choose SDK method',
      description: 'The real SDK method(s) for one operation, per language extracted directly from SDK source -- never invented by analogy.',
      inputSchema: z.object({ operationId: z.string(), language: z.enum(['typescript', 'java', 'python', 'go']).optional() }),
    },
    async (args) => result(logic.chooseSdk(getContext().bundle, args)),
  );

  server.registerTool(
    'explain_error',
    { title: 'Explain error', description: 'Meaning, HTTP status, retryability, remediation, and related operations for one error code.', inputSchema: z.object({ errorCode: z.string() }) },
    async (args) => result(logic.explainError(getContext().bundle, args)),
  );

  server.registerTool(
    'get_webhook_contract',
    {
      title: 'Get webhook contract',
      description: 'The full delivery contract (headers, HMAC formula, timestamp/ordering rules), or detail for one specific event type.',
      inputSchema: z.object({ eventType: z.string().optional() }),
    },
    async (args) => result(logic.getWebhookContract(getContext().bundle, args)),
  );

  server.registerTool(
    'get_recipe',
    { title: 'Get recipe', description: 'A full integration pattern: capabilities, flow, invariants, errors, webhooks, anti-patterns, and reference project status.', inputSchema: z.object({ recipeId: z.string() }) },
    async (args) => result(logic.getRecipe(getContext().bundle, args)),
  );

  server.registerTool(
    'plan_integration',
    {
      title: 'Plan integration',
      description: 'Given a goal, resolves the matching recipe (or the closest by search) and expands it into a concrete plan with real operations, SDK calls, errors, and webhooks.',
      inputSchema: z.object({ goal: z.string().describe('e.g. "marketplace with 90/10 split and manual payout"'), recipeId: z.string().optional().describe('Skip search and use this recipe id directly.') }),
    },
    async (args) => result(logic.planIntegration(getContext().bundle, args)),
  );

  server.registerTool(
    'validate_integration_plan',
    {
      title: 'Validate integration plan',
      description: 'Checks a proposed plan (free-text claims and/or operationIds) against known gaps and platform invariants -- flags unsupported claims (e.g. multi-source Withdrawal, ManagedCustody, non-existent webhook events, API Key in a client app) rather than letting them pass silently.',
      inputSchema: z.object({ claims: z.array(z.string()).optional().describe('Free-text statements about the intended integration.'), operationIds: z.array(z.string()).optional() }),
    },
    async (args) => ok(logic.validateIntegrationPlan(getContext().bundle, args)),
  );

  server.registerTool(
    'get_knowledge_status',
    {
      title: 'Get knowledge status',
      description: 'Local vs remote knowledge version, whether an update is available, and when the remote was last checked. Never blocks on network beyond a short timeout.',
      inputSchema: z.object({}),
    },
    async () => {
      const { bundle, origin, engineVersion } = getContext();
      const status = await getKnowledgeStatus(bundle.manifest);
      if (status.updateAvailable) acknowledgeUpdateNotice(status.remoteKnowledgeVersion!);
      return ok({ ...status, bundleOrigin: origin, engineVersion });
    },
  );

  server.registerTool(
    'update_knowledge',
    {
      title: 'Update knowledge',
      description: 'Downloads and applies the newer remote knowledge bundle (data only, verified by SHA-256 hash and schema before being made active). Requires consent:true -- never runs without it. Never updates the MCP engine itself.',
      inputSchema: z.object({ consent: z.boolean().describe('Must be true to proceed -- this is the explicit-consent gate.') }),
    },
    async ({ consent }) => {
      if (!consent) return fail('update_knowledge requires consent:true. Ask the user before calling this again.');
      const { bundle, engineVersion } = getContext();
      const check = await fetchRemoteManifest();
      if (!check.ok) return fail(`Could not reach the remote manifest (${check.reason}): ${check.detail}. Your current knowledge bundle is unaffected and fully functional.`);
      if (check.manifest.knowledgeVersion === bundle.manifest.knowledgeVersion) {
        return ok({ updated: false, reason: 'already_current', knowledgeVersion: bundle.manifest.knowledgeVersion });
      }
      const applyResult = await applyKnowledgeUpdate(check.manifest, engineVersion);
      if (!applyResult.ok) return fail(`Update failed (${applyResult.reason}): ${applyResult.detail}. Your previous knowledge bundle remains active and untouched.`);
      reloadContext();
      return ok({ updated: true, knowledgeVersion: applyResult.knowledgeVersion, previousKnowledgeVersion: bundle.manifest.knowledgeVersion });
    },
  );
}
