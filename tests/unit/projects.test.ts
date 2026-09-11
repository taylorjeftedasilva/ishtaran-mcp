import { describe, it, expect } from 'vitest';
import { loadTestBundle } from '../helpers/bundle.js';

describe('project registry', () => {
  const bundle = loadTestBundle();

  it('has at least the 4 required entries with the right status', () => {
    const byId = Object.fromEntries(bundle.projects.map((p) => [p.id, p]));
    expect(byId['marketplace-mercatto']?.status).toBe('READY');
    expect(byId['quickstart-node']?.status).toBe('READY');
    // Promoted from PLANNED (2026-09-11): real, tested, publicly published reference code now
    // exists at a real standalone repo (see the next test) -- see build/data/projects.ts.
    expect(byId['wallet-payment-app']?.status).toBe('READY');
    expect(byId['service-milestone']?.status).toBe('PLANNED');
  });

  // Known-real repos allowlist (2026-09-11): the monorepo path was the only real option when this
  // test was first written. Two projects now also have their own real, dedicated standalone
  // GitHub repos (published this session, verified live) -- the check stays a strict allowlist,
  // never a loose pattern, so a genuinely fabricated URL still fails this test.
  const KNOWN_REAL_REPOS = [
    /github\.com\/taylorjeftedasilva\/smartcontract/,
    /^https:\/\/github\.com\/taylorjeftedasilva\/ishtaran-mercatto-example$/,
    /^https:\/\/github\.com\/taylorjeftedasilva\/ishtaran-wallet-example$/,
  ];

  it('READY entries have a real repositoryUrl pointing at the monorepo or a known real standalone repo, never a fabricated one', () => {
    for (const p of bundle.projects.filter((p) => p.status === 'READY')) {
      expect(KNOWN_REAL_REPOS.some((re) => re.test(p.repositoryUrl ?? ''))).toBe(true);
    }
  });

  it('PLANNED entries never carry a repositoryUrl, revision, or SDK -- nothing that would imply real code exists', () => {
    for (const p of bundle.projects.filter((p) => p.status === 'PLANNED')) {
      expect(p.repositoryUrl).toBeNull();
      expect(p.revision).toBeNull();
      expect(p.sdk).toHaveLength(0);
      expect(p.entryPoints).toHaveLength(0);
      expect(p.knownLimitations.some((l) => /PLANNED only/.test(l))).toBe(true);
    }
  });

  it('every PLANNED project corresponds to a recipe with referenceProjectStatus PLANNED', () => {
    for (const p of bundle.projects.filter((p) => p.status === 'PLANNED')) {
      const recipe = bundle.recipes.find((r) => r.id === p.pattern);
      expect(recipe, `no recipe found for pattern ${p.pattern}`).toBeDefined();
      expect(recipe!.referenceProjectStatus).toBe('PLANNED');
    }
  });
});
