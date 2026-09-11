// Reference-implementation registry. `revision` is the monorepo commit hash at build time
// (captured by build/index.ts via `git rev-parse HEAD`, never hardcoded). `repositoryUrl` is
// intentionally the local monorepo path today -- there is no public ishtaran-mcp/mercatto
// remote repo yet (confirmed this session); this field must be updated, never invented, if/when
// a public mirror repo is created. `sourceArchiveUrl` is null for the same reason: the local
// build indexes the path directly rather than downloading an archive. A PLANNED entry has
// `repositoryUrl: null` -- never a fabricated URL for code that doesn't exist yet.
export type ProjectStatus = 'READY' | 'PLANNED' | 'EXPERIMENTAL' | 'DEPRECATED';

export interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  pattern: string;
  repositoryUrl: string | null;
  defaultBranch: string | null;
  revision: string | null;
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
      repositoryUrl: 'https://github.com/taylorjeftedasilva/ishtaran-mercatto-example',
      defaultBranch: 'main',
      revision: monorepoCommit,
      sourceArchiveUrl: null,
      contentHash: null,
      languages: ['typescript'],
      frameworks: ['node'],
      capabilities: [
        'accounts', 'payment-intents', 'transactions', 'settlements', 'splits', 'payouts',
        'refunds', 'webhooks', 'network-execution', 'walletbalance',
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
    {
      id: 'wallet-payment-app',
      name: 'Wallet & Payment App (self-custody wallet reference)',
      description:
        'A self-custody wallet and payment app: the private key stays entirely client-side, the balance shown is the wallet\'s own observed on-chain state (WalletBalance, never Ledger), and Send (direct wallet-to-wallet transfer) and Pay (fulfillment of a Payment Request, drives the real Transaction/PaymentIntent/Settlement pipeline) are kept structurally distinct throughout. Also demonstrates app-owner-configurable monetization (a RevenueStrategy decides who absorbs the platform fee) without the app writing its own fee/settlement logic. Real, runnable reference code -- verified live against the public Sandbox (manual product validation plus a 9-scenario E2E battery). Its recipe entry (id: wallet-payment-app) describes an OLDER, simpler Ledger-only backend-custody pattern -- this reference project does NOT follow that pattern; see its own README/GAPS.md for the real, self-custody architecture actually implemented.',
      status: 'READY',
      pattern: 'wallet-payment-app',
      repositoryUrl: 'https://github.com/taylorjeftedasilva/ishtaran-wallet-example',
      defaultBranch: 'main',
      revision: monorepoCommit,
      sourceArchiveUrl: null,
      contentHash: null,
      languages: ['typescript'],
      frameworks: ['node', 'react', 'fastify'],
      capabilities: ['accounts', 'deposits', 'transactions', 'settlements', 'withdrawals', 'walletbalance', 'webhooks'],
      sdk: [{ language: 'typescript', version: tsSdkVersion }],
      difficulty: 'intermediate',
      tags: ['wallet', 'payments', 'self-custody', 'wallet-balance'],
      docs: ['README.md', 'GAPS.md'],
      entryPoints: ['apps/api/src/server.ts', 'apps/web/src/App.tsx', 'e2e/wallet/run.ts'],
      minimumKnowledgeVersion: '0.1.0',
      knownLimitations: [
        'Browser-local private key storage is a demo convenience, not a production key-management solution.',
        'Production blockchain execution is not available on Ishtaran yet -- Sandbox only.',
        'Does not follow this project\'s own wallet-payment-app recipe text (that recipe predates this implementation and describes a simpler Ledger-only pattern) -- read the repo\'s own docs for the real architecture, not the recipe.',
      ],
      lastValidatedAt: monorepoCommitDate,
    },
    {
      id: 'service-milestone',
      name: 'Services / milestone-based release (planned reference)',
      description:
        'A planned reference implementation for the service-milestone recipe (partial Settlement released per milestone). The underlying capability (partial ExecuteSettlement) is real and supported today (see the service-milestone recipe, recipeStatus: SUPPORTED_CONCEPT) -- no runnable code exists for this pattern yet.',
      status: 'PLANNED',
      pattern: 'service-milestone',
      repositoryUrl: null,
      defaultBranch: null,
      revision: null,
      sourceArchiveUrl: null,
      contentHash: null,
      languages: [],
      frameworks: [],
      capabilities: ['transactions', 'settlement', 'refunds'],
      sdk: [],
      difficulty: 'intermediate',
      tags: ['services', 'milestone', 'escrow', 'planned'],
      docs: [],
      entryPoints: [],
      minimumKnowledgeVersion: '0.1.0',
      knownLimitations: ['PLANNED only -- no reference code exists yet. Do not present this as available; use the service-milestone recipe (get_recipe) for the supported pattern instead.'],
      lastValidatedAt: monorepoCommitDate,
    },
  ];
}
