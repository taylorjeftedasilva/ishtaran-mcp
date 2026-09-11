import { describe, it, expect } from 'vitest';
import { loadTestBundle } from '../helpers/bundle.js';
import * as logic from '../../src/toolLogic.js';

describe('toolLogic', () => {
  const bundle = loadTestBundle();

  it('getOperation returns a real operation', () => {
    const op = logic.getOperation(bundle, { operationId: 'ExecuteSettlement' });
    expect('error' in op).toBe(false);
  });

  it('getOperation errors on an unknown/admin operationId', () => {
    const op = logic.getOperation(bundle, { operationId: 'AdminGetNetworkResourceReserveBalance' });
    expect('error' in op).toBe(true);
  });

  it('choose_sdk returns all 4 languages when none specified, and a real gap for ListEnvironments', () => {
    const allLangs = logic.chooseSdk(bundle, { operationId: 'ExecuteSettlement' });
    expect('sdk' in allLangs && Object.keys((allLangs as any).sdk).length).toBeGreaterThan(0);

    const gap = logic.chooseSdk(bundle, { operationId: 'ListEnvironments', language: 'typescript' });
    expect('error' in gap).toBe(true);
    expect((gap as any).error).toMatch(/HTTP API supports this operation/);
    expect((gap as any).knownGap?.id).toBe('list-environments-sdk-gap');

    const noLang = logic.chooseSdk(bundle, { operationId: 'ListEnvironments' }) as any;
    expect(noLang.sdkGapNote).toMatch(/HTTP API supports this operation.*no official SDK helper/);
  });

  it('getOperation surfaces the same HTTP-supported-but-no-SDK note for ListEnvironments', () => {
    const op = logic.getOperation(bundle, { operationId: 'ListEnvironments' }) as any;
    expect(op.sdkGapNote).toMatch(/no official SDK helper/);
  });

  it('explainError returns real remediation for NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE', () => {
    const err = logic.explainError(bundle, { errorCode: 'NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE' });
    expect((err as any).retryable).toBe(true);
    expect((err as any).extensions).toContain('deficit');
  });

  it('getWebhookContract without eventType returns the full contract + catalog of 36 events', () => {
    const full = logic.getWebhookContract(bundle, {}) as any;
    expect(full.events.length).toBe(36);
    expect(full.contract.signature.algorithm).toBe('HMAC-SHA256');
  });

  it('getWebhookContract flags signing_request.created as non-existent', () => {
    const res = logic.getWebhookContract(bundle, { eventType: 'signing_request.created' }) as any;
    expect(res.error).toBeDefined();
    expect(res.note).toMatch(/does not exist/);
  });

  it('getRecipe marketplace is READY with a real reference project', () => {
    const recipe = logic.getRecipe(bundle, { recipeId: 'marketplace' }) as any;
    expect(recipe.recipeStatus).toBe('READY');
    expect(recipe.referenceProjectStatus).toBe('READY');
    expect(recipe.referenceProjectDetail?.id).toBe('marketplace-mercatto');
  });

  it('getRecipe wallet-payment-app is SUPPORTED_CONCEPT with a READY reference project (promoted 2026-09-11), never NOT_SUPPORTED', () => {
    const recipe = logic.getRecipe(bundle, { recipeId: 'wallet-payment-app' }) as any;
    expect(recipe.recipeStatus).toBe('SUPPORTED_CONCEPT');
    expect(recipe.referenceProjectStatus).toBe('READY');
    expect(recipe.referenceProject).toBe('wallet-payment-app');
    expect(recipe.referenceProjectDetail?.id).toBe('wallet-payment-app');
  });

  it('planIntegration resolves "marketplace" goal text to the marketplace recipe with real operations', () => {
    const plan = logic.planIntegration(bundle, { goal: 'I want to build a marketplace with a platform fee' }) as any;
    expect(plan.recipe.id).toBe('marketplace');
    expect(plan.operations.length).toBeGreaterThan(0);
  });
});
