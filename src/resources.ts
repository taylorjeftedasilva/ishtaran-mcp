// Registers every ishtaran:// resource. Every read goes through getContext() so an
// update_knowledge swap is reflected immediately, without restarting the process. Admin/
// Platform-Owner operations were already excluded at build time (openapi.ts) -- nothing here
// re-checks that, since the bundle itself never contains them.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { getContext } from './context.js';
import { updateNoticeForMetadata } from './update/status.js';

function json(uri: string, data: unknown) {
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
}

function notFound(uri: string, kind: string, id: string) {
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ error: `Unknown ${kind}: ${id}`, hint: `Read ishtaran://index to see valid ${kind} ids.` }, null, 2) }] };
}

export function registerResources(server: McpServer) {
  server.registerResource(
    'index',
    'ishtaran://index',
    { title: 'Ishtaran knowledge index', description: 'Navigation summary: capabilities, concepts, recipes, error codes, webhook events, reference projects, and counts.', mimeType: 'application/json' },
    async (uri) => {
      const { bundle, origin, engineVersion } = getContext();
      return json(uri.href, { ...bundle.index, knowledgeVersion: bundle.manifest.knowledgeVersion, bundleOrigin: origin, engineVersion, updateNotice: updateNoticeForMetadata(bundle.manifest) });
    },
  );

  server.registerResource(
    'version',
    'ishtaran://version',
    { title: 'MCP + knowledge version', description: 'Engine version, knowledge bundle version, source commit, and OpenAPI hash.', mimeType: 'application/json' },
    async (uri) => {
      const { bundle, engineVersion, origin } = getContext();
      return json(uri.href, { engineVersion, bundleOrigin: origin, ...bundle.manifest });
    },
  );

  server.registerResource(
    'auth',
    'ishtaran://auth',
    { title: 'Authentication model', description: 'API Key vs Member JWT vs AccountHolder JWT -- when to use each, and what never to embed client-side.', mimeType: 'application/json' },
    async (uri) => {
      const { bundle } = getContext();
      const entries = bundle.glossary.filter((g) => ['API Key'].includes(g.term) || g.term.toLowerCase().includes('jwt'));
      return json(uri.href, { entries, sources: entries.flatMap((e) => e.sources) });
    },
  );

  server.registerResource(
    'idempotency',
    'ishtaran://idempotency',
    { title: 'Idempotency contract', description: 'Idempotency-Key rules and the IDEMPOTENCY_KEY_CONFLICT / PAYOUT_BATCH_IDEMPOTENCY_KEY_CONFLICT errors.', mimeType: 'application/json' },
    async (uri) => {
      const { bundle } = getContext();
      const errors = bundle.errors.filter((e) => e.code.includes('IDEMPOTENCY'));
      return json(uri.href, { rule: 'Every mutating, financially-relevant operation requires a stable, deterministic Idempotency-Key per real intent -- never a fresh key on blind retry.', errors });
    },
  );

  server.registerResource(
    'environments',
    'ishtaran://environments',
    { title: 'Environments', description: 'Local / Sandbox / Production status.', mimeType: 'application/json' },
    async (uri) => {
      const { bundle } = getContext();
      return json(uri.href, bundle.manifest.environmentStatus);
    },
  );

  server.registerResource(
    'known-gaps',
    'ishtaran://known-gaps',
    { title: 'Known gaps', description: 'SUPPORTED / NOT_SUPPORTED / DEPRECATED / FUTURE / KNOWN_GAP entries -- what the platform genuinely does not do yet, or never will publicly.', mimeType: 'application/json' },
    async (uri) => {
      const { bundle } = getContext();
      return json(uri.href, bundle.gaps);
    },
  );

  server.registerResource(
    'openapi',
    'ishtaran://openapi',
    { title: 'OpenAPI summary', description: 'Public contract summary (never the full 100+ paths at once) -- counts plus a pointer to the full spec.', mimeType: 'application/json' },
    async (uri) => {
      const { bundle } = getContext();
      return json(uri.href, {
        openApiVersion: bundle.manifest.openApiVersion,
        openApiHash: bundle.manifest.openApiHash,
        publicOperationCount: bundle.index.counts.publicOperations,
        excludedAdminOperationCount: bundle.index.counts.excludedAdminOperations,
        note: 'Use ishtaran://operations/{operationId} for one operation\'s full detail, or the search_knowledge / get_operation tools -- never dumped in bulk here.',
        fullSpecUrl: 'https://ishtaran.com/openapi.json',
      });
    },
  );

  server.registerResource(
    'webhooks',
    'ishtaran://webhooks',
    { title: 'Webhook contract + event catalog', description: 'Headers, HMAC signature formula, timestamp/ordering/delivery rules, and the full list of real event types.', mimeType: 'application/json' },
    async (uri) => {
      const { bundle } = getContext();
      return json(uri.href, bundle.webhooks);
    },
  );

  server.registerResource(
    'concepts',
    new ResourceTemplate('ishtaran://concepts/{concept}', {
      list: async () => ({ resources: getContext().bundle.glossary.map((g) => ({ uri: `ishtaran://concepts/${encodeURIComponent(g.term)}`, name: g.term })) }),
    }),
    { title: 'Concept / invariant', description: 'One glossary invariant (e.g. Settlement vs Payout).', mimeType: 'application/json' },
    async (uri, variables) => {
      const term = decodeURIComponent(String(variables.concept));
      const { bundle } = getContext();
      const entry = bundle.glossary.find((g) => g.term.toLowerCase() === term.toLowerCase());
      return entry ? json(uri.href, entry) : notFound(uri.href, 'concept', term);
    },
  );

  server.registerResource(
    'capabilities',
    new ResourceTemplate('ishtaran://capabilities/{capability}', {
      list: async () => ({ resources: Object.keys(getContext().bundle.capabilities).map((id) => ({ uri: `ishtaran://capabilities/${id}`, name: id })) }),
    }),
    { title: 'Capability', description: 'One capability: its operations, related errors/webhooks/recipes.', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = String(variables.capability);
      const { bundle } = getContext();
      const cap = bundle.capabilities[id];
      return cap ? json(uri.href, cap) : notFound(uri.href, 'capability', id);
    },
  );

  server.registerResource(
    'operations',
    new ResourceTemplate('ishtaran://operations/{operationId}', {
      list: async () => ({ resources: Object.keys(getContext().bundle.operations).map((id) => ({ uri: `ishtaran://operations/${id}`, name: id })) }),
    }),
    { title: 'Operation', description: 'One public API operation: method, path, capability, and per-language SDK mapping.', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = String(variables.operationId);
      const { bundle } = getContext();
      const op = bundle.operations[id];
      return op ? json(uri.href, op) : notFound(uri.href, 'operation', id);
    },
  );

  server.registerResource(
    'sdk',
    new ResourceTemplate('ishtaran://sdk/{language}/{operationId}', {
      list: async () => {
        const { bundle } = getContext();
        const resources: { uri: string; name: string }[] = [];
        for (const op of Object.values(bundle.operations)) {
          for (const lang of Object.keys(op.sdk)) resources.push({ uri: `ishtaran://sdk/${lang}/${op.operationId}`, name: `${lang}: ${op.operationId}` });
        }
        return { resources };
      },
    }),
    { title: 'SDK method for an operation', description: 'The real method/resource/signature for one language, extracted from the actual SDK source.', mimeType: 'application/json' },
    async (uri, variables) => {
      const language = String(variables.language);
      const operationId = String(variables.operationId);
      const { bundle } = getContext();
      const op = bundle.operations[operationId];
      if (!op) return notFound(uri.href, 'operation', operationId);
      const sdk = op.sdk[language];
      if (!sdk) return json(uri.href, { operationId, language, available: false, note: `No ${language} SDK method found for this operation -- check ishtaran://known-gaps.` });
      return json(uri.href, { operationId, language, ...sdk });
    },
  );

  server.registerResource(
    'errors',
    new ResourceTemplate('ishtaran://errors/{errorCode}', {
      list: async () => ({ resources: getContext().bundle.errors.map((e) => ({ uri: `ishtaran://errors/${e.code}`, name: e.code })) }),
    }),
    { title: 'Error code', description: 'One error code: meaning, HTTP status, remediation, retryability, related operations.', mimeType: 'application/json' },
    async (uri, variables) => {
      const code = String(variables.errorCode);
      const { bundle } = getContext();
      const err = bundle.errors.find((e) => e.code === code);
      return err ? json(uri.href, err) : notFound(uri.href, 'error code', code);
    },
  );

  server.registerResource(
    'webhook-event',
    new ResourceTemplate('ishtaran://webhooks/{eventType}', {
      list: async () => ({ resources: getContext().bundle.webhooks.events.map((e) => ({ uri: `ishtaran://webhooks/${e.event}`, name: e.event })) }),
    }),
    { title: 'One webhook event', description: 'When it fires, key fields, aggregate id field, category.', mimeType: 'application/json' },
    async (uri, variables) => {
      const eventType = String(variables.eventType);
      const { bundle } = getContext();
      const evt = bundle.webhooks.events.find((e) => e.event === eventType);
      if (!evt) {
        return json(uri.href, { error: `Unknown webhook event: ${eventType}`, note: eventType === 'signing_request.created' ? 'This event does not exist -- SigningRequest signing is request/response, never webhook-driven.' : 'Check ishtaran://webhooks for the full catalog.' });
      }
      return json(uri.href, evt);
    },
  );

  server.registerResource(
    'recipes',
    new ResourceTemplate('ishtaran://recipes/{recipeId}', {
      list: async () => ({ resources: getContext().bundle.recipes.map((r) => ({ uri: `ishtaran://recipes/${r.id}`, name: r.name })) }),
    }),
    { title: 'Integration recipe', description: 'A full pattern: capabilities, flow, invariants, errors, webhooks, anti-patterns.', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = String(variables.recipeId);
      const { bundle } = getContext();
      const recipe = bundle.recipes.find((r) => r.id === id);
      return recipe ? json(uri.href, recipe) : notFound(uri.href, 'recipe', id);
    },
  );

  server.registerResource(
    'examples',
    new ResourceTemplate('ishtaran://examples/{projectId}', {
      list: async () => ({ resources: getContext().bundle.projects.map((p) => ({ uri: `ishtaran://examples/${p.id}`, name: p.name })) }),
    }),
    { title: 'Reference project', description: 'A reference implementation: status (READY/PLANNED/...), pattern, capabilities, entry points.', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = String(variables.projectId);
      const { bundle } = getContext();
      const project = bundle.projects.find((p) => p.id === id);
      return project ? json(uri.href, project) : notFound(uri.href, 'project', id);
    },
  );
}
