// Loads the real, currently-built Knowledge Bundle for tests -- never a hand-authored fixture,
// so tests exercise the exact data the engine ships. Run `npm run build:knowledge` first.
import { shippedKnowledgeDir } from '../../src/knowledge/resolve.js';
import { loadKnowledgeBundle } from '../../src/knowledge/loader.js';
import type { KnowledgeBundle } from '../../src/knowledge/types.js';

let cached: KnowledgeBundle | undefined;

export function loadTestBundle(): KnowledgeBundle {
  if (!cached) cached = loadKnowledgeBundle(shippedKnowledgeDir());
  return cached;
}
