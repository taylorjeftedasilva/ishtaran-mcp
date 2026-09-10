// Hybrid search: exact identifier lookup > lexical/full-text > alias > structured filter >
// semantic. Semantic search is deliberately NOT implemented in V1 -- with ~117 public
// operations and a fully structured bundle, exact+lexical+alias covers the golden test
// questions; adding embeddings would be complexity without a demonstrated need. This is a
// documented, deliberate scope limit, not an oversight.
import type { KnowledgeBundle } from '../knowledge/types.js';

export type SearchKind = 'operation' | 'capability' | 'error' | 'webhook' | 'recipe' | 'glossary' | 'gap' | 'project';

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  matchType: 'exact' | 'alias' | 'lexical';
  score: number;
}

// Grounded aliases only -- each maps a term a developer would plausibly type to a real id that
// exists in the bundle. Never invented synonyms for things that don't exist.
const ALIASES: Record<string, { kind: SearchKind; id: string }[]> = {
  wallet: [{ kind: 'recipe', id: 'wallet-payment-app' }],
  payout: [{ kind: 'glossary', id: 'Payout' }],
  settle: [{ kind: 'glossary', id: 'Settlement' }],
  settlement: [{ kind: 'glossary', id: 'Settlement' }],
  fee: [{ kind: 'glossary', id: 'PlatformFee' }],
  gas: [{ kind: 'glossary', id: 'PlatformFee' }],
  withdraw: [{ kind: 'glossary', id: 'Payout' }],
  marketplace: [{ kind: 'recipe', id: 'marketplace' }],
  escrow: [{ kind: 'recipe', id: 'marketplace' }],
  milestone: [{ kind: 'recipe', id: 'service-milestone' }],
  apikey: [{ kind: 'glossary', id: 'API Key' }],
  'api key': [{ kind: 'glossary', id: 'API Key' }],
  jwt: [{ kind: 'glossary', id: 'API Key' }],
  webhook: [{ kind: 'capability', id: 'webhooks' }],
  signature: [{ kind: 'capability', id: 'webhooks' }],
};

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function textScore(query: string, haystack: string): number {
  const q = normalize(query);
  const h = normalize(haystack);
  if (!q || !h) return 0;
  if (h === q) return 100;
  if (h.includes(q)) return 60;
  const terms = q.split(/\s+/).filter(Boolean);
  const hits = terms.filter((t) => h.includes(t)).length;
  return terms.length ? Math.round((hits / terms.length) * 40) : 0;
}

export function search(bundle: KnowledgeBundle, query: string, opts: { kinds?: SearchKind[]; limit?: number } = {}): SearchResult[] {
  const results: SearchResult[] = [];
  const q = normalize(query);
  const wantKind = (k: SearchKind) => !opts.kinds || opts.kinds.includes(k);

  // 1. Exact identifier lookup
  if (wantKind('operation') && bundle.operations[query]) {
    const op = bundle.operations[query]!;
    results.push({ kind: 'operation', id: op.operationId, title: `${op.method} ${op.path}`, snippet: op.summary ?? op.operationId, matchType: 'exact', score: 100 });
  }
  if (wantKind('capability') && bundle.capabilities[q]) {
    results.push({ kind: 'capability', id: q, title: q, snippet: `${bundle.capabilities[q]!.operations.length} operations`, matchType: 'exact', score: 100 });
  }
  if (wantKind('error')) {
    const err = bundle.errors.find((e) => normalize(e.code) === q);
    if (err) results.push({ kind: 'error', id: err.code, title: err.code, snippet: err.meaning, matchType: 'exact', score: 100 });
  }
  if (wantKind('webhook')) {
    const evt = bundle.webhooks.events.find((e) => normalize(e.event) === q);
    if (evt) results.push({ kind: 'webhook', id: evt.event, title: evt.event, snippet: evt.when, matchType: 'exact', score: 100 });
  }
  if (wantKind('recipe') && bundle.recipes.find((r) => normalize(r.id) === q)) {
    const r = bundle.recipes.find((r) => normalize(r.id) === q)!;
    results.push({ kind: 'recipe', id: r.id, title: r.name, snippet: r.description, matchType: 'exact', score: 100 });
  }
  if (wantKind('project')) {
    const p = bundle.projects.find((p) => normalize(p.id) === q);
    if (p) results.push({ kind: 'project', id: p.id, title: p.name, snippet: p.description, matchType: 'exact', score: 100 });
  }

  // 2. Alias
  const aliasHits = ALIASES[q] ?? [];
  for (const hit of aliasHits) {
    if (!wantKind(hit.kind)) continue;
    if (results.some((r) => r.kind === hit.kind && r.id === hit.id)) continue;
    if (hit.kind === 'glossary') {
      const g = bundle.glossary.find((g) => g.term === hit.id);
      if (g) results.push({ kind: 'glossary', id: g.term, title: g.term, snippet: g.definition, matchType: 'alias', score: 90 });
    } else if (hit.kind === 'recipe') {
      const r = bundle.recipes.find((r) => r.id === hit.id);
      if (r) results.push({ kind: 'recipe', id: r.id, title: r.name, snippet: r.description, matchType: 'alias', score: 90 });
    } else if (hit.kind === 'capability') {
      const c = bundle.capabilities[hit.id];
      if (c) results.push({ kind: 'capability', id: hit.id, title: hit.id, snippet: `${c.operations.length} operations`, matchType: 'alias', score: 90 });
    }
  }

  // 3. Lexical, across every collection
  if (wantKind('operation')) {
    for (const op of Object.values(bundle.operations)) {
      const s = Math.max(textScore(query, op.operationId), textScore(query, op.summary ?? ''), textScore(query, op.description ?? ''));
      if (s > 0) results.push({ kind: 'operation', id: op.operationId, title: `${op.method} ${op.path}`, snippet: op.summary ?? op.operationId, matchType: 'lexical', score: s });
    }
  }
  if (wantKind('capability')) {
    for (const id of Object.keys(bundle.capabilities)) {
      const s = textScore(query, id);
      if (s > 0) results.push({ kind: 'capability', id, title: id, snippet: `${bundle.capabilities[id]!.operations.length} operations`, matchType: 'lexical', score: s });
    }
  }
  if (wantKind('error')) {
    for (const e of bundle.errors) {
      const s = Math.max(textScore(query, e.code), textScore(query, e.meaning));
      if (s > 0) results.push({ kind: 'error', id: e.code, title: e.code, snippet: e.meaning, matchType: 'lexical', score: s });
    }
  }
  if (wantKind('webhook')) {
    for (const w of bundle.webhooks.events) {
      const s = Math.max(textScore(query, w.event), textScore(query, w.when));
      if (s > 0) results.push({ kind: 'webhook', id: w.event, title: w.event, snippet: w.when, matchType: 'lexical', score: s });
    }
  }
  if (wantKind('recipe')) {
    for (const r of bundle.recipes) {
      const s = Math.max(textScore(query, r.name), textScore(query, r.description));
      if (s > 0) results.push({ kind: 'recipe', id: r.id, title: r.name, snippet: r.description, matchType: 'lexical', score: s });
    }
  }
  if (wantKind('glossary')) {
    for (const g of bundle.glossary) {
      const s = Math.max(textScore(query, g.term), textScore(query, g.definition));
      if (s > 0) results.push({ kind: 'glossary', id: g.term, title: g.term, snippet: g.definition, matchType: 'lexical', score: s });
    }
  }
  if (wantKind('gap')) {
    for (const g of bundle.gaps) {
      const s = Math.max(textScore(query, g.capability), textScore(query, g.description));
      if (s > 0) results.push({ kind: 'gap', id: g.id, title: g.capability, snippet: g.description, matchType: 'lexical', score: s });
    }
  }
  if (wantKind('project')) {
    for (const p of bundle.projects) {
      const s = Math.max(textScore(query, p.id), textScore(query, p.name), textScore(query, p.description));
      if (s > 0) results.push({ kind: 'project', id: p.id, title: p.name, snippet: p.description, matchType: 'lexical', score: s });
    }
  }

  // De-dupe (an exact/alias hit may also appear via lexical), keep the highest-score instance.
  const bestById = new Map<string, SearchResult>();
  for (const r of results) {
    const key = `${r.kind}:${r.id}`;
    const existing = bestById.get(key);
    if (!existing || r.score > existing.score) bestById.set(key, r);
  }

  return [...bestById.values()].sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 20);
}
