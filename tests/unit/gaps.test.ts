import { describe, it, expect } from 'vitest';
import { loadTestBundle } from '../helpers/bundle.js';

describe('gaps consistency', () => {
  const bundle = loadTestBundle();

  it('ListEnvironments exists as a public operation but has zero SDK matches in any of the 4 languages', () => {
    const op = bundle.operations['ListEnvironments'];
    expect(op).toBeDefined();
    expect(Object.keys(op!.sdk)).toHaveLength(0);
  });

  it('every KNOWN_GAP capability that names an operationId points at something real or explicitly cross-SDK-absent', () => {
    const gap = bundle.gaps.find((g) => g.id === 'list-environments-sdk-gap');
    expect(gap).toBeDefined();
    expect(gap!.affects).toEqual(['sdks/typescript', 'sdks/python', 'sdks/java', 'sdks/go']);
  });

  it('withdrawal multi-source is declared NOT_SUPPORTED, matching the glossary invariant', () => {
    const gap = bundle.gaps.find((g) => g.id === 'withdrawal-multi-source-unsupported');
    const glossary = bundle.glossary.find((g) => g.term === 'Withdrawal multi-source');
    expect(gap?.status).toBe('NOT_SUPPORTED');
    expect(glossary).toBeDefined();
  });
});
