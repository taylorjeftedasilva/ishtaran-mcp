import { describe, it, expect } from 'vitest';
import { loadTestBundle } from '../helpers/bundle.js';
import { search } from '../../src/search/index.js';

describe('search', () => {
  const bundle = loadTestBundle();

  it('finds an operation by exact operationId', () => {
    const [top] = search(bundle, 'ExecuteSettlement');
    expect(top?.kind).toBe('operation');
    expect(top?.matchType).toBe('exact');
    expect(top?.score).toBe(100);
  });

  it('finds an error by exact code', () => {
    const [top] = search(bundle, 'NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE');
    expect(top?.kind).toBe('error');
    expect(top?.matchType).toBe('exact');
  });

  it('resolves the "wallet" alias to the wallet-payment-app recipe', () => {
    const results = search(bundle, 'wallet');
    expect(results.some((r) => r.kind === 'recipe' && r.id === 'wallet-payment-app')).toBe(true);
  });

  it('falls back to lexical matching for free text', () => {
    const results = search(bundle, 'platform fee split');
    expect(results.length).toBeGreaterThan(0);
  });

  it('respects a kinds filter', () => {
    const results = search(bundle, 'settlement', { kinds: ['glossary'] });
    expect(results.every((r) => r.kind === 'glossary')).toBe(true);
  });

  it('returns nothing for pure noise', () => {
    const results = search(bundle, 'zzzznonexistentqueryxyz');
    expect(results).toHaveLength(0);
  });
});
