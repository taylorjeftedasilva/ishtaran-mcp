// The 5 required anti-pattern rejection scenarios, each verified end-to-end against
// validate_integration_plan (the real tool logic, not a mock).
import { describe, it, expect } from 'vitest';
import { loadTestBundle } from '../helpers/bundle.js';
import { validateIntegrationPlan } from '../../src/toolLogic.js';

describe('anti-pattern rejection', () => {
  const bundle = loadTestBundle();

  it('1. rejects embedding the API Key in a mobile/browser client', () => {
    const res = validateIntegrationPlan(bundle, { claims: ['Our React Native mobile app will hold the Application API Key and call the Ishtaran API directly with it.'] });
    expect(res.valid).toBe(false);
    expect(res.violations.map((v) => v.rule)).toContain('api-key-client-side');
  });

  it('2. rejects a Withdrawal aggregating multiple source Accounts', () => {
    const res = validateIntegrationPlan(bundle, { claims: ['We will request one Withdrawal that pulls from multiple source accounts to reach the target amount.'] });
    expect(res.valid).toBe(false);
    expect(res.violations.map((v) => v.rule)).toContain('withdrawal-multi-source-unsupported');
  });

  it('3. rejects treating ManagedCustody as an available option', () => {
    const res = validateIntegrationPlan(bundle, { claims: ['We plan to configure the Organization to use ManagedCustody instead of SelfCustody for lower operational overhead.'] });
    expect(res.valid).toBe(false);
    expect(res.violations.map((v) => v.rule)).toContain('managed-custody-unavailable');
  });

  it('4. rejects THRESHOLD/SCHEDULED PayoutPolicy as if publicly supported', () => {
    const res = validateIntegrationPlan(bundle, { claims: ['We will set the PayoutPolicy mode to SCHEDULED so payouts run every Friday.'] });
    expect(res.valid).toBe(false);
    expect(res.violations.map((v) => v.rule)).toContain('payout-policy-threshold-scheduled-unsupported');
  });

  it('5. rejects generating a new Idempotency-Key on every retry', () => {
    const res = validateIntegrationPlan(bundle, { claims: ['On every retry of a failed settlement call, we generate a new key for Idempotency-Key so the request is never rejected as a duplicate.'] });
    expect(res.valid).toBe(false);
    expect(res.violations.map((v) => v.rule)).toContain('idempotency-key-not-stable');
  });

  it('6. rejects treating PlatformFee/PricingPolicy as self-serve configurable via public API', () => {
    const res = validateIntegrationPlan(bundle, { claims: ['The integrator can self-serve the platform fee split via a public API call on their Organization.'] });
    expect(res.valid).toBe(false);
    expect(res.violations.map((v) => v.rule)).toContain('pricing-policy-not-self-serve');
  });

  it('7. rejects passing a splits parameter to ExecuteSettlement', () => {
    const res = validateIntegrationPlan(bundle, { claims: ['I can pass a splits array to ExecuteSettlement to define the 90/10 split at settlement time.'] });
    expect(res.valid).toBe(false);
    expect(res.violations.map((v) => v.rule)).toContain('executesettlement-has-no-splits-param');
  });

  it('a clean, correct plan produces zero violations', () => {
    const res = validateIntegrationPlan(bundle, {
      claims: ['Only our backend service holds the credential used to call Ishtaran; end-user devices authenticate with a scoped AccountHolder session token.', 'Each Withdrawal request draws from exactly one Account.'],
      operationIds: ['ExecuteSettlement', 'RequestWithdrawal'],
    });
    expect(res.valid).toBe(true);
    expect(res.violations).toHaveLength(0);
  });
});
