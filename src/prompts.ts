// Registers the 7 MCP prompts. Every prompt only structures the interaction -- it tells the
// model which tools to call and in what order, and never hardcodes a business fact that should
// come from the Knowledge Bundle instead (facts change with the bundle; these prompts don't).
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';

function userMessage(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
}

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    'integrate_ishtaran',
    { title: 'Integrate Ishtaran', description: 'Starting point for any new Ishtaran integration.', argsSchema: z.object({ goal: z.string().describe('What you want to build, in plain language.') }) },
    ({ goal }) =>
      userMessage(
        `I want to integrate Ishtaran for: ${goal}\n\n` +
          `Before writing any code: call search_knowledge or plan_integration (tools on the ishtaran MCP) to find the matching recipe and its real capabilities, operations, and SDK calls. ` +
          `Check ishtaran://known-gaps and the recipe's anti_patterns before proposing an architecture. Never invent an endpoint, SDK method, or error code -- if something isn't in the knowledge bundle, say so explicitly rather than guessing.`,
      ),
  );

  server.registerPrompt(
    'build_marketplace',
    { title: 'Build a marketplace', description: 'Two-sided marketplace with platform fee and split.', argsSchema: z.object({ details: z.string().optional().describe('Specifics: split ratio, payout mode, currencies, etc.') }) },
    ({ details }) =>
      userMessage(
        `Help me build an Ishtaran-powered marketplace.${details ? ` Details: ${details}` : ''}\n\n` +
          `Call get_recipe with recipeId:"marketplace" first (it is READY with a real reference project, marketplace-mercatto). Use plan_integration to expand it into the concrete operations/SDK calls/webhooks for my details, and validate_integration_plan before finalizing.`,
      ),
  );

  server.registerPrompt(
    'build_wallet',
    { title: 'Build a wallet / payment app', description: 'End-user balance, deposit, withdrawal.', argsSchema: z.object({ details: z.string().optional() }) },
    ({ details }) =>
      userMessage(
        `Help me build an Ishtaran-powered wallet/payment app.${details ? ` Details: ${details}` : ''}\n\n` +
          `Call get_recipe with recipeId:"wallet-payment-app". Its recipeStatus is SUPPORTED_CONCEPT (every underlying capability is real and supported) but referenceProjectStatus is PLANNED -- there is no runnable reference project yet, so lean on the recipe's API_flow/SDK_flow/invariants directly rather than pointing me at example code that doesn't exist.`,
      ),
  );

  server.registerPrompt(
    'build_service_marketplace',
    { title: 'Build a services / milestone marketplace', description: 'Partial-Settlement, milestone-gated release.', argsSchema: z.object({ details: z.string().optional() }) },
    ({ details }) =>
      userMessage(
        `Help me build an Ishtaran-powered services/milestone platform.${details ? ` Details: ${details}` : ''}\n\n` +
          `Call get_recipe with recipeId:"service-milestone". Its recipeStatus is SUPPORTED_CONCEPT (Partial Settlement is real and supported) but referenceProjectStatus is PLANNED -- do not claim a reference project exists.`,
      ),
  );

  server.registerPrompt(
    'debug_ishtaran',
    { title: 'Debug an Ishtaran error', description: 'Diagnose an error code or symptom.', argsSchema: z.object({ errorCodeOrSymptom: z.string() }) },
    ({ errorCodeOrSymptom }) =>
      userMessage(
        `I'm seeing this from Ishtaran: ${errorCodeOrSymptom}\n\n` +
          `If this looks like a known error code, call explain_error directly. Otherwise call search_knowledge first to find the matching error code or capability, then explain_error. Give me the real remediation from the knowledge bundle, not a guess.`,
      ),
  );

  server.registerPrompt(
    'implement_webhook_receiver',
    { title: 'Implement a webhook receiver', description: 'Signature verification + delivery handling for one language.', argsSchema: z.object({ language: z.string().optional().describe('typescript, python, java, or go') }) },
    ({ language }) =>
      userMessage(
        `Help me implement an Ishtaran webhook receiver${language ? ` in ${language}` : ''}.\n\n` +
          `Call get_webhook_contract (no eventType) first for the full contract: headers, the exact HMAC-SHA256 signed-content formula, timestamp tolerance (note: Ishtaran itself enforces none server-side -- the SDKs default to 300s, but a receiver not using an SDK must implement its own tolerance check), delivery/retry/ordering rules, and the event-type gap (the event type is never in the delivery itself -- fetch GET /v1/webhook-deliveries/{id}). Then use choose_sdk for the signature-verification helper if ${language ?? 'the target language'} has one.`,
      ),
  );

  server.registerPrompt(
    'review_ishtaran_integration',
    { title: 'Review an Ishtaran integration', description: 'Adversarial review of a proposed or existing integration plan.', argsSchema: z.object({ summary: z.string().describe('Describe the integration: flows, claims, operations used.') }) },
    ({ summary }) =>
      userMessage(
        `Review this Ishtaran integration for correctness:\n\n${summary}\n\n` +
          `Call validate_integration_plan with the relevant claims/operationIds extracted from this summary. Treat every violation it returns as a real finding to report, not something to silently work around. Also check ishtaran://known-gaps for anything this integration might be assuming that isn't actually supported.`,
      ),
  );
}
