// Reference-implementation registry. `revision` is the monorepo commit hash at build time
// (captured by build/index.ts via `git rev-parse HEAD`, never hardcoded). `repositoryUrl` is
// intentionally the local monorepo path today -- there is no public ishtaran-mcp/mercatto
// remote repo yet (confirmed this session); this field must be updated, never invented, if/when
// a public mirror repo is created. `sourceArchiveUrl` is null for the same reason: the local
// build indexes the path directly rather than downloading an archive.
export type ProjectStatus = 'READY' | 'PLANNED' | 'EXPERIMENTAL' | 'DEPRECATED';

export interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  pattern: string;
  repositoryUrl: string;
  defaultBranch: string;
  revision: string;
  sourceArchiveUrl: string | null;
  contentHash: string | null;
  languages: string[];
  frameworks: string[];
  capabilities: string[];
  sdk: { language: string; version: string }[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  docs: string[];
  entryPoints: string[];
  minimumKnowledgeVersion: string;
  knownLimitations: string[];
  lastValidatedAt: string;
}

export function buildProjects(monorepoCommit: string, monorepoCommitDate: string, tsSdkVersion: string): ProjectEntry[] {
  return [
    {
      id: 'marketplace-mercatto',
      name: 'Mercatto (marketplace reference implementation)',
      description:
        'A complete two-sided marketplace reference implementation: buyer/seller Accounts, PaymentIntent funding, Transaction reserve, Settlement with PlatformFee and Split, MANUAL Payout, and 14+ scenario scripts exercising the full lifecycle including refunds, freezes, and network-execution edge cases.',
      status: 'READY',
      pattern: 'marketplace',
      repositoryUrl: 'https://github.com/taylorjeftedasilva/smartcontract (monorepo path: examples/marketplace-mercatto)',
      defaultBranch: 'main',
      revision: monorepoCommit,
      sourceArchiveUrl: null,
      contentHash: null,
      languages: ['typescript'],
      frameworks: ['node'],
      capabilities: [
        'accounts', 'payment-intents', 'transactions', 'settlements', 'splits', 'payouts',
        'refunds', 'webhooks', 'network-execution',
      ],
      sdk: [{ language: 'typescript', version: tsSdkVersion }],
      difficulty: 'intermediate',
      tags: ['marketplace', 'split', 'escrow', 'webhooks'],
      docs: ['examples/marketplace-mercatto/README.md', 'examples/marketplace-mercatto/GAPS.md'],
      entryPoints: ['examples/marketplace-mercatto/scenarios/'],
      minimumKnowledgeVersion: '0.1.0',
      knownLimitations: ['Uses Sandbox only, never Production.', 'THRESHOLD/SCHEDULED PayoutPolicy not exercised (not publicly supported).'],
      lastValidatedAt: monorepoCommitDate,
    },
    {
      id: 'quickstart-node',
      name: 'Quickstart (Node.js first-contact flow)',
      description:
        'A minimal getting-started flow: auth, Application/Environment/API Key setup, Account creation, a basic Transaction/PaymentIntent, and the Sandbox faucet. Not a marketplace/wallet/service reference -- a first-contact example only.',
      status: 'READY',
      pattern: 'getting-started',
      repositoryUrl: 'https://github.com/taylorjeftedasilva/smartcontract (monorepo path: examples/quickstart-node)',
      defaultBranch: 'main',
      revision: monorepoCommit,
      sourceArchiveUrl: null,
      contentHash: null,
      languages: ['javascript'],
      frameworks: ['node'],
      capabilities: ['applications', 'environments', 'api-keys', 'accounts', 'transactions', 'payment-intents', 'sandbox-faucet'],
      sdk: [{ language: 'typescript', version: tsSdkVersion }],
      difficulty: 'beginner',
      tags: ['getting-started', 'onboarding'],
      docs: ['examples/quickstart-node/index.js'],
      entryPoints: ['examples/quickstart-node/index.js'],
      minimumKnowledgeVersion: '0.1.0',
      knownLimitations: ['Does not cover Settlement, Payout, Withdrawal, or webhooks -- not a substitute for the marketplace/wallet/service recipes.'],
      lastValidatedAt: monorepoCommitDate,
    },
  ];
}
