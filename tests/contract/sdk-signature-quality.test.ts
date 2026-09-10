// Regression test for a real defect the 2026-09-09 blind-LLM-test session surfaced: the
// extractor's display `signature` field silently truncated at the method's opening `(` for any
// multi-line parameter list, and for Python specifically, an early fix over-corrected by running
// past the signature into an unrelated `{` inside the method body (a dict literal argument).
// Never hardcodes which operations are affected -- derives the check from the whole bundle.
import { describe, it, expect } from 'vitest';
import { loadTestBundle } from '../helpers/bundle.js';

describe('sdk-map signature quality', () => {
  const bundle = loadTestBundle();

  it('no extracted signature is truncated at an unclosed opening paren', () => {
    const truncated = bundle.sdkMap.filter((m) => m.signature.trimEnd().endsWith('('));
    expect(truncated, JSON.stringify(truncated.slice(0, 5))).toHaveLength(0);
  });

  it('every signature has balanced parens', () => {
    const unbalanced = bundle.sdkMap.filter((m) => {
      const opens = (m.signature.match(/\(/g) ?? []).length;
      const closes = (m.signature.match(/\)/g) ?? []).length;
      return opens !== closes;
    });
    expect(unbalanced, JSON.stringify(unbalanced.slice(0, 5))).toHaveLength(0);
  });

  it('every Python signature terminates at its own def line colon, not a body dict literal', () => {
    const pythonSignatures = bundle.sdkMap.filter((m) => m.language === 'python');
    expect(pythonSignatures.length).toBeGreaterThan(0);
    for (const m of pythonSignatures) {
      expect(m.signature.startsWith('def '), m.signature).toBe(true);
      expect(m.signature.endsWith(':'), m.signature).toBe(true);
      // A signature that ran past the real `def` line picks up body code -- these tokens never
      // legitimately appear in a bare `def name(...) -> ReturnType:` line.
      expect(m.signature).not.toMatch(/_to_json|self\._execute|post_request|get_request/);
    }
  });

  it('a previously-confirmed-truncated operation (CreatePaymentIntent) now has its full parameter list', () => {
    const op = bundle.operations['CreatePaymentIntent'];
    expect(op?.sdk.typescript?.signature).toContain('idempotencyKey');
    expect(op?.sdk.typescript?.signature).toContain(')');
  });
});
