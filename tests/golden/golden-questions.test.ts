// The brief's required golden questions, exercised against the real engine logic (toolLogic.ts)
// and the real generated bundle -- never against a hand-authored fixture. Each assertion checks
// that the ANSWER an agent would get from this MCP is the real, grounded answer, not a guess.
import { describe, it, expect } from 'vitest';
import { loadTestBundle } from '../helpers/bundle.js';
import * as logic from '../../src/toolLogic.js';
import { search } from '../../src/search/index.js';

describe('golden questions', () => {
  const bundle = loadTestBundle();

  it('"Can I put the API Key in my mobile app?" -> no, and validate_integration_plan catches it if proposed', () => {
    const apiKeyEntry = bundle.glossary.find((g) => g.term === 'API Key')!;
    expect(apiKeyEntry.commonConfusion).toMatch(/device the end user controls/i);
    const validation = logic.validateIntegrationPlan(bundle, { claims: ['We will embed the API Key directly in our mobile app'] });
    expect(validation.valid).toBe(false);
    expect(validation.violations.some((v) => v.rule === 'api-key-client-side')).toBe(true);
  });

  it('"What is the difference between Settlement and Payout?"', () => {
    const settlement = bundle.glossary.find((g) => g.term === 'Settlement')!;
    const payout = bundle.glossary.find((g) => g.term === 'Payout')!;
    expect(settlement.commonConfusion).toMatch(/Settlement != Payout/);
    expect(payout.contrastsWith).toBe('Withdrawal');
  });

  it('"Is Payout MANUAL a real supported mode?" -> yes, and it is the only trigger CreatePayoutBatch accepts', () => {
    const err = logic.explainError(bundle, { errorCode: 'PAYOUT_BATCH_TRIGGER_NOT_SUPPORTED' }) as any;
    expect(err.remediation).toMatch(/MANUAL/);
    const policyGap = bundle.gaps.find((g) => g.id === 'payout-policy-threshold-scheduled-unsupported')!;
    expect(policyGap.status).toBe('NOT_SUPPORTED');
  });

  it('"What do I do on first funding of a Network Execution account?" -> deposit at least the deficit', () => {
    const err = logic.explainError(bundle, { errorCode: 'NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE' }) as any;
    expect(err.remediation).toMatch(/deficit/);
    expect(err.extensions).toContain('deficit');
  });

  it('"What is the difference between CUSTOMER_RESOURCES and ISHTARAN_RESOURCES?"', () => {
    const entry = bundle.glossary.find((g) => g.term === 'CUSTOMER_RESOURCES')!;
    expect(entry.contrastsWith).toBe('ISHTARAN_RESOURCES');
    expect(entry.commonConfusion).toMatch(/ISHTARAN_RESOURCES/);
  });

  it('"How do I validate a webhook signature?"', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(contract.contract.signature.algorithm).toBe('HMAC-SHA256');
    expect(contract.contract.signature.signedContent).toBe('{unixTimestampSeconds}.{rawBody}');
    expect(contract.contract.signature.comparison).toMatch(/constant-time/);
  });

  it('"Can I receive the same webhook twice?" -> yes, at-least-once, dedup by delivery id', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(contract.contract.delivery.atLeastOnce).toBe(true);
    expect(contract.contract.delivery.exactlyOnce).toBe(false);
    expect(contract.contract.headers['X-Webhook-Delivery-Id']).toMatch(/dedup/);
  });

  it('"Are webhooks delivered in order?" -> no', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(contract.contract.ordering.guaranteed).toBe(false);
  });

  it('"Does signing_request.created exist as a webhook event?" -> no', () => {
    const res = logic.getWebhookContract(bundle, { eventType: 'signing_request.created' }) as any;
    expect(res.error).toBeDefined();
    expect(res.note).toMatch(/does not exist/);
  });

  it('"Does settlement.confirming exist?" -> no', () => {
    const res = logic.getWebhookContract(bundle, { eventType: 'settlement.confirming' }) as any;
    expect(res.error).toBeDefined();
  });

  it('"Can a Withdrawal pull from multiple source Accounts?" -> no', () => {
    const validation = logic.validateIntegrationPlan(bundle, { claims: ['our Withdrawal will aggregate multiple source accounts'] });
    expect(validation.violations.some((v) => v.rule === 'withdrawal-multi-source-unsupported')).toBe(true);
    const gap = bundle.gaps.find((g) => g.id === 'withdrawal-multi-source-unsupported')!;
    expect(gap.status).toBe('NOT_SUPPORTED');
  });

  it('"Is ManagedCustody available?" -> no, SELF_CUSTODY only', () => {
    const gap = bundle.gaps.find((g) => g.id === 'managed-custody-unavailable')!;
    expect(gap.status).toBe('NOT_SUPPORTED');
    const glossary = bundle.glossary.find((g) => g.term === 'ManagedCustody availability')!;
    expect(glossary.definition).toMatch(/NOT AVAILABLE/);
  });

  it('"Is Production ready for real crypto transactions today?" -> no', () => {
    expect(bundle.manifest.environmentStatus.production).toBe('not_active_for_real_crypto_flows');
    const gap = bundle.gaps.find((g) => g.id === 'production-not-active')!;
    expect(gap.status).toBe('NOT_SUPPORTED');
  });

  it('"How do I resolve NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE?"', () => {
    const err = logic.explainError(bundle, { errorCode: 'NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE' }) as any;
    expect(err.retryable).toBe(true);
    expect(err.remediation).toMatch(/Fund the Account/);
  });

  // -- real dev questions about webhooks --
  it('"What headers does every webhook delivery carry?"', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(Object.keys(contract.contract.headers)).toEqual(['X-Webhook-Signature', 'X-Webhook-Timestamp', 'X-Webhook-Delivery-Id']);
  });

  it('"Does Ishtaran enforce a timestamp tolerance window on delivery?" -> no, that is the receiver\'s job', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(contract.contract.timestamp.serverEnforcedTolerance).toBeNull();
  });

  it('"What happens if my endpoint is down / times out?"', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(contract.contract.delivery.maxAttempts).toBeGreaterThan(1);
    expect(contract.contract.delivery.deadLetterAfterMaxAttempts).toBe(true);
    expect(contract.contract.delivery.manualRedeliveryRoute).toMatch(/redeliver/);
  });

  it('"Is the event type in the webhook payload or headers?" -> no, known gap', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(contract.contract.eventTypeGap.status).toBe('PRODUCT_DX_GAP');
    const gap = bundle.gaps.find((g) => g.id === 'webhook-event-type-not-in-delivery')!;
    expect(gap).toBeDefined();
  });

  it('"Is the webhook payload wrapped in an envelope with a type field?" -> no', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(contract.contract.payload.envelope).toBe(false);
    expect(contract.contract.payload.hasTypeField).toBe(false);
  });

  it('"Is signing (SigningRequest) webhook-driven?" -> no, request/response only', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(contract.contract.selfCustodyNote).toMatch(/request\/response/);
  });

  it('"How many real webhook events exist?" -> derived, not hardcoded in the test', () => {
    const contract = logic.getWebhookContract(bundle, {}) as any;
    expect(contract.events.length).toBe(bundle.index.counts.webhookEvents);
    expect(contract.events.length).toBe(bundle.webhooks.events.length);
  });

  it('search_knowledge surfaces the marketplace recipe for a natural-language goal', () => {
    const results = search(bundle, 'I want to build a two-sided marketplace with a platform fee and split payouts');
    expect(results.some((r) => r.kind === 'recipe' && r.id === 'marketplace')).toBe(true);
  });
});
