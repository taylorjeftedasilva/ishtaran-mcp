import { describe, it, expect } from 'vitest';
import { loadTestBundle } from '../helpers/bundle.js';

describe('project registry', () => {
  const bundle = loadTestBundle();

  it('has at least the 4 required entries with the right status', () => {
    const byId = Object.fromEntries(bundle.projects.map((p) => [p.id, p]));
    expect(byId['marketplace-mercatto']?.status).toBe('READY');
    expect(byId['quickstart-node']?.status).toBe('READY');
    expect(byId['wallet-payment-app']?.status).toBe('PLANNED');
    expect(byId['service-milestone']?.status).toBe('PLANNED');
  });

  it('READY entries have a real repositoryUrl pointing at the actual monorepo, never a fabricated standalone repo', () => {
    for (const p of bundle.projects.filter((p) => p.status === 'READY')) {
      expect(p.repositoryUrl).toMatch(/github\.com\/taylorjeftedasilva\/smartcontract/);
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
