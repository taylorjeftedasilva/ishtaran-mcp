// Pure tool logic, decoupled from the MCP protocol wrapper (tools.ts) and from live engine
// context (getContext()). Each function takes the bundle + validated args and returns a plain
// result object or a { error, ... } shape -- this is what tests exercise directly, and it is
// exactly what tools.ts calls in production, so testing this IS testing the real behavior.
import type { KnowledgeBundle } from './knowledge/types.js';
import { search, type SearchKind } from './search/index.js';

export const KNOWN_LIMITATIONS = [
  'No semantic/embedding search in V1 -- exact/lexical/alias only.',
  'validate_integration_plan checks structural claims against known gaps/invariants; it is not a full NLP claim validator.',
];

export function searchKnowledge(bundle: KnowledgeBundle, args: { query: string; kinds?: SearchKind[]; limit?: number }) {
  const results = search(bundle, args.query, { kinds: args.kinds, limit: args.limit });
  return { results, knowledgeVersion: bundle.manifest.knowledgeVersion, sources: ['knowledge-bundle'], knownLimitations: KNOWN_LIMITATIONS };
}

export function getCapability(bundle: KnowledgeBundle, args: { capability: string }) {
  const cap = bundle.capabilities[args.capability];
  if (!cap) return { error: `Unknown capability: "${args.capability}". See ishtaran://index for valid ids.`, validIds: Object.keys(bundle.capabilities) };
  return { ...cap, knowledgeVersion: bundle.manifest.knowledgeVersion };
}

function sdkGapNote(bundle: KnowledgeBundle, op: { operationId: string; method: string; path: string; sdk: Record<string, unknown> }): string | undefined {
  if (Object.keys(op.sdk).length > 0) return undefined;
  const gap = bundle.gaps.find((g) => g.capability === op.operationId);
  return `The HTTP API supports this operation (${op.method} ${op.path}), but no official SDK helper method is available in any language yet.${gap ? ` See known gap: ${gap.id}.` : ''} Call the HTTP endpoint directly in the meantime.`;
}

export function getOperation(bundle: KnowledgeBundle, args: { operationId: string }) {
  const op = bundle.operations[args.operationId];
  if (!op) return { error: `Unknown or non-public operationId: "${args.operationId}". It may be a Platform-Owner/admin operation, which is intentionally never exposed here.` };
  return { ...op, relatedErrors: bundle.graph.operationToErrors[args.operationId] ?? [], sdkGapNote: sdkGapNote(bundle, op), knowledgeVersion: bundle.manifest.knowledgeVersion };
}

export function chooseSdk(bundle: KnowledgeBundle, args: { operationId: string; language?: 'typescript' | 'java' | 'python' | 'go' }) {
  const op = bundle.operations[args.operationId];
  if (!op) return { error: `Unknown or non-public operationId: "${args.operationId}".` };
  if (args.language) {
    const sdk = op.sdk[args.language];
    if (!sdk) {
      const gap = bundle.gaps.find((g) => g.capability === args.operationId);
      return {
        error: `No ${args.language} SDK method found for ${args.operationId}. The HTTP API supports this operation (${op.method} ${op.path}) -- call it directly.`,
        knownGap: gap ?? null,
      };
    }
    return { operationId: args.operationId, language: args.language, ...sdk };
  }
  return { operationId: args.operationId, sdk: op.sdk, sdkGapNote: sdkGapNote(bundle, op) };
}

export function explainError(bundle: KnowledgeBundle, args: { errorCode: string }) {
  const err = bundle.errors.find((e) => e.code === args.errorCode);
  if (!err) return { error: `Unknown error code: "${args.errorCode}".`, validCodes: bundle.errors.map((e) => e.code) };
  return err;
}

export function getWebhookContract(bundle: KnowledgeBundle, args: { eventType?: string }) {
  if (!args.eventType) return bundle.webhooks;
  const evt = bundle.webhooks.events.find((e) => e.event === args.eventType);
  if (!evt) {
    return {
      error: `Unknown webhook event: "${args.eventType}".`,
      note: args.eventType === 'signing_request.created' ? 'This event does not exist -- SigningRequest signing is request/response, never webhook-driven.' : undefined,
      validEvents: bundle.webhooks.events.map((e) => e.event),
    };
  }
  return { ...evt, contract: bundle.webhooks.contract };
}

export function getRecipe(bundle: KnowledgeBundle, args: { recipeId: string }) {
  const recipe = bundle.recipes.find((r) => r.id === args.recipeId);
  if (!recipe) return { error: `Unknown recipe: "${args.recipeId}".`, validRecipes: bundle.recipes.map((r) => r.id) };
  const referenceProject = recipe.referenceProject ? bundle.projects.find((p) => p.id === recipe.referenceProject) ?? null : null;
  return { ...recipe, referenceProjectDetail: referenceProject };
}

// required_capabilities entries are human-readable phrases (e.g. "Settlement (with PlatformFee)"),
// not necessarily exact capability ids -- resolve each phrase to the real capability id(s) it's
// clearly naming via a light word-prefix heuristic (capability id and a word from the phrase share
// a stem), rather than requiring an exact string match. A phrase that names no real capability
// (e.g. "Split allocation" -- Splits are part of the settlement capability, not their own) simply
// contributes no operations, which is correct: never guess.
function resolveCapabilityIds(bundle: KnowledgeBundle, phrase: string): string[] {
  const words = phrase.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return Object.keys(bundle.capabilities).filter((id) => words.some((w) => id.startsWith(w) || w.startsWith(id)));
}

export function planIntegration(bundle: KnowledgeBundle, args: { goal: string; recipeId?: string }) {
  let recipe = args.recipeId ? bundle.recipes.find((r) => r.id === args.recipeId) : undefined;
  if (!recipe) {
    const hits = search(bundle, args.goal, { kinds: ['recipe'], limit: 1 });
    recipe = hits[0] ? bundle.recipes.find((r) => r.id === hits[0]!.id) : undefined;
  }
  if (!recipe) return { error: `No recipe matched "${args.goal}". Available recipes: ${bundle.recipes.map((r) => r.id).join(', ')}.` };
  const capabilityIds = new Set(recipe.required_capabilities.flatMap((c) => resolveCapabilityIds(bundle, c)));
  const operationDetails = [...capabilityIds]
    .flatMap((c) => bundle.capabilities[c]?.operations ?? [])
    .map((opId) => bundle.operations[opId])
    .filter((o): o is NonNullable<typeof o> => Boolean(o));
  const errorDetails = recipe.errors.map((code) => bundle.errors.find((e) => e.code === code)).filter(Boolean);
  const webhookDetails = recipe.webhooks.map((evt) => bundle.webhooks.events.find((e) => e.event === evt)).filter(Boolean);
  return {
    recipe: { id: recipe.id, name: recipe.name, recipeStatus: recipe.recipeStatus, referenceProjectStatus: recipe.referenceProjectStatus, referenceProject: recipe.referenceProject },
    actors: recipe.actors,
    economic_flow: recipe.economic_flow,
    API_flow: recipe.API_flow,
    SDK_flow: recipe.SDK_flow,
    invariants: recipe.invariants,
    anti_patterns: recipe.anti_patterns,
    idempotency: recipe.idempotency,
    security: recipe.security,
    operations: operationDetails,
    errors: errorDetails,
    webhooks: webhookDetails,
    knowledgeVersion: bundle.manifest.knowledgeVersion,
  };
}

export interface PlanViolation {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

const ANTI_PATTERN_CHECKS: { test: (t: string) => boolean; rule: string; message: string }[] = [
  { test: (t) => /withdrawal/.test(t) && /(multi|multiple|aggregat)/.test(t) && /source|account/.test(t), rule: 'withdrawal-multi-source-unsupported', message: 'A single Withdrawal draws from exactly one Account -- multi-source aggregation is NOT SUPPORTED. (Settlement, not Withdrawal, supports multi-source.)' },
  { test: (t) => /managedcustody|managed custody/.test(t) && !/not available|unavailable|no dispon/.test(t), rule: 'managed-custody-unavailable', message: 'ManagedCustody is not an available/operating custody mode -- only SELF_CUSTODY operates today.' },
  { test: (t) => /(threshold|scheduled)/.test(t) && /payout/.test(t), rule: 'payout-policy-threshold-scheduled-unsupported', message: 'PayoutPolicy THRESHOLD/SCHEDULED are not publicly supported -- only IMMEDIATE and MANUAL.' },
  { test: (t) => /signing_request\.created|settlement\.confirming/.test(t), rule: 'nonexistent-webhook-event', message: 'This webhook event does not exist. SigningRequest signing is request/response, never webhook-driven.' },
  { test: (t) => /production/.test(t) && /(real|live)/.test(t) && /(crypto|transaction|deposit|withdraw)/.test(t), rule: 'production-not-active', message: 'Production is not an active environment for real crypto flows today -- Sandbox is the current live-integration surface.' },
  { test: (t) => /api ?key/.test(t) && /(mobile|browser|client|frontend)/.test(t), rule: 'api-key-client-side', message: 'An API Key must never be embedded in a mobile app, browser bundle, or any client the end user controls -- issue a scoped AccountHolder JWT from your backend instead.' },
  { test: (t) => /idempotency/.test(t) && /(new key|fresh key|random key)/.test(t) && /retry/.test(t), rule: 'idempotency-key-not-stable', message: 'Generating a new Idempotency-Key on every retry defeats its purpose -- use a stable, deterministic key per real intent.' },
  { test: (t) => /(split|platformfee|platform fee|pricingpolicy|pricing policy)/.test(t) && /(self.?serv|self.?configur|via.{0,20}public api|api call)/.test(t) && !/(admin|platform.?owner|cannot|can'?t|not (self|public))/.test(t), rule: 'pricing-policy-not-self-serve', message: 'PlatformFee/PricingPolicy is configured exclusively via AdminConfigurePricingPolicy, a Platform-Owner-only route -- an integrating Organization cannot self-serve its own fee rate through the public API.' },
  { test: (t) => /splits?\s*(array|parameter|field)/.test(t) && /executesettlement/.test(t), rule: 'executesettlement-has-no-splits-param', message: 'ExecuteSettlement only accepts an optional partial `amount` and `idempotencyKey` -- there is no `splits` parameter. The revenue split is declared per participant via `splitPercentage` on ParticipantInput at CreateTransaction time.' },
];

export function validateIntegrationPlan(bundle: KnowledgeBundle, args: { claims?: string[]; operationIds?: string[] }) {
  const claims = args.claims ?? [];
  const operationIds = args.operationIds ?? [];
  const violations: PlanViolation[] = [];
  const text = claims.join(' \n ').toLowerCase();

  for (const c of ANTI_PATTERN_CHECKS) {
    if (c.test(text)) violations.push({ rule: c.rule, severity: 'error', message: c.message });
  }
  for (const opId of operationIds) {
    if (!bundle.operations[opId]) {
      violations.push({ rule: 'unknown-or-admin-operation', severity: 'error', message: `"${opId}" is not a public operation known to this bundle (it may not exist, or may be a Platform-Owner/admin operation, which is never exposed here).` });
    }
  }
  return { valid: violations.length === 0, violations, checkedGaps: bundle.gaps.map((g) => g.id), knowledgeVersion: bundle.manifest.knowledgeVersion, knownLimitations: KNOWN_LIMITATIONS };
}
