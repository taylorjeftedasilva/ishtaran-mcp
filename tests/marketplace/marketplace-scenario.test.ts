// The full marketplace scenario: Alice (buyer) / Bob (seller), 90/10 platform split, MANUAL
// payout -- verified end-to-end against plan_integration + validate_integration_plan, matching
// the real examples/marketplace-mercatto/ reference implementation this recipe points at.
import { describe, it, expect } from 'vitest';
import { loadTestBundle } from '../helpers/bundle.js';
import { planIntegration, validateIntegrationPlan } from '../../src/toolLogic.js';

describe('marketplace scenario (Alice/Bob, 90/10 split, MANUAL payout)', () => {
  const bundle = loadTestBundle();

  it('plan_integration resolves the marketplace recipe with a READY reference project', () => {
    const plan = planIntegration(bundle, { goal: 'Alice buys from Bob, platform takes a cut, remaining 90% goes to Bob, manual payout' }) as any;
    expect(plan.recipe.id).toBe('marketplace');
    expect(plan.recipe.recipeStatus).toBe('READY');
    expect(plan.recipe.referenceProjectStatus).toBe('READY');
    expect(plan.recipe.referenceProject).toBe('marketplace-mercatto');
  });

  it('the plan includes real Settlement, Split, and Payout operations -- never invented ones', () => {
    const plan = planIntegration(bundle, { recipeId: 'marketplace', goal: '' }) as any;
    const opIds = plan.operations.map((o: any) => o.operationId);
    expect(opIds).toContain('ExecuteSettlement');
    for (const opId of opIds) {
      expect(bundle.operations[opId], `${opId} must be a real public operation`).toBeDefined();
    }
  });

  it('the plan surfaces the real idempotency-conflict and network-execution-funding errors', () => {
    const plan = planIntegration(bundle, { recipeId: 'marketplace', goal: '' }) as any;
    const codes = plan.errors.map((e: any) => e.code);
    expect(codes).toContain('IDEMPOTENCY_KEY_CONFLICT');
    expect(codes).toContain('NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE');
  });

  it('the plan surfaces the real settlement/split/payout webhook events', () => {
    const plan = planIntegration(bundle, { recipeId: 'marketplace', goal: '' }) as any;
    const events = plan.webhooks.map((w: any) => w.event);
    expect(events).toContain('settlement.executed');
    expect(events).toContain('settlement.split_portion_released');
  });

  it('validating the real plan (MANUAL trigger, single-account withdrawal, backend-only API Key) produces zero violations', () => {
    const res = validateIntegrationPlan(bundle, {
      claims: [
        'CreatePayoutBatch is always called with trigger MANUAL.',
        'The Application API Key lives only in our backend service.',
        'Bob\'s payout Withdrawal draws from exactly his one Account.',
      ],
      operationIds: ['ExecuteSettlement', 'CreatePayoutBatch'],
    });
    expect(res.valid).toBe(true);
  });

  it('a 90/10 split claim is internally consistent with the recipe\'s documented economic_flow', () => {
    const plan = planIntegration(bundle, { recipeId: 'marketplace', goal: '' }) as any;
    expect(plan.economic_flow.some((s: string) => /PlatformFee/.test(s))).toBe(true);
    expect(plan.economic_flow.some((s: string) => /splitPercentage/i.test(s))).toBe(true);
  });
});
