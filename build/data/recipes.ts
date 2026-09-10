// Hand-authored recipes -- grounded in real capabilities (operations.json/errors.json/
// webhooks.json cross-referenced at build time in index.ts) and, for `marketplace`, in the
// real examples/marketplace-mercatto/ scenarios run and verified this session.
// recipeStatus: the underlying pattern is real/supported regardless of whether example code
// exists. referenceProjectStatus: whether a runnable reference project exists in projects.json.
// Never let recipeStatus collapse into referenceProjectStatus -- a PLANNED reference project
// never means the pattern itself is unsupported.
export type RecipeStatus = 'READY' | 'SUPPORTED_CONCEPT';
export type ReferenceProjectStatus = 'READY' | 'PLANNED';

export interface Recipe {
  id: string;
  name: string;
  description: string;
  recipeStatus: RecipeStatus;
  referenceProjectStatus: ReferenceProjectStatus;
  referenceProject: string | null;
  use_cases: string[];
  required_capabilities: string[];
  optional_capabilities: string[];
  authentication: string[];
  actors: string[];
  economic_flow: string[];
  API_flow: string[];
  SDK_flow: string[];
  invariants: string[];
  errors: string[];
  webhooks: string[];
  idempotency: string;
  security: string[];
  example: string | null;
  anti_patterns: string[];
}

export const RECIPES: Recipe[] = [
  {
    id: 'marketplace',
    name: 'Marketplace (buyer/seller, platform fee, split)',
    description:
      'A two-sided marketplace where a buyer funds a Transaction, a seller delivers, the platform takes a fee, and remaining proceeds may be split across multiple beneficiaries before Payout.',
    recipeStatus: 'READY',
    referenceProjectStatus: 'READY',
    referenceProject: 'marketplace-mercatto',
    use_cases: ['Goods/services marketplace', 'Multi-vendor checkout with revenue split', 'Escrow-style hold-until-delivery'],
    required_capabilities: [
      'Application/Environment/API Key setup',
      'Account creation (buyer, seller, platform)',
      'PaymentIntent + Deposit funding',
      'Transaction reserve, with per-participant splitPercentage',
      'Settlement (with PlatformFee)',
      'Payout (IMMEDIATE or MANUAL)',
      'Webhooks',
    ],
    optional_capabilities: ['Refund (full or partial)', 'Transaction freeze/unfreeze', 'CUSTOMER_RESOURCES network execution', 'ReleaseRetainedSplit (releasing a previously-retained split allocation)'],
    authentication: ['API Key (server-to-server, backend only)'],
    actors: ['Buyer (AccountHolder)', 'Seller (AccountHolder)', 'Platform Organization'],
    economic_flow: [
      'Buyer deposits into a PaymentIntent, funding a Transaction reserve.',
      'The revenue split (e.g. 90% Seller / 10% marketplace) is declared per participant via `splitPercentage` on each ParticipantInput at CreateTransaction time -- NOT passed to ExecuteSettlement, which only takes an optional partial `amount` + `idempotencyKey`.',
      'On delivery confirmation, the Organization triggers Settlement for the Transaction; it distributes according to the splitPercentages already declared on the Transaction.',
      'PlatformFee (the platform\'s own revenue cut on top of that) is applied per the Organization\'s PricingPolicy -- but PricingPolicy is configured via `AdminConfigurePricingPolicy`, a Platform-Owner-only route (POST /v1/admin/pricing-policy). An integrating developer cannot self-serve their own fee rate through the public API; it is set by/with the platform owner.',
      'Each beneficiary\'s Account balance increases; funds leave the platform later via Payout/Withdrawal, not as part of Settlement itself.',
    ],
    API_flow: [
      'POST /v1/organizations/{organizationId}/applications (CreateApplication), POST /v1/applications/{applicationId}/environments (CreateEnvironment), POST /v1/environments/{environmentId}/api-keys (GenerateApiKey)',
      'POST /v1/organizations/{organizationId}/accounts (buyer, seller)',
      'POST /v1/organizations/{organizationId}/transactions (CreateTransaction, participants:[{accountId, role, isPayer, splitPercentage}])',
      'POST /v1/organizations/{organizationId}/payment-intents',
      'GET  /v1/payment-intents/{id} (poll or await deposit.confirmed webhook)',
      'POST /v1/transactions/{transactionId}/settlements (ExecuteSettlement -- amount optional for partial settlement, no split parameter)',
      'POST /v1/organizations/{organizationId}/payout-batches (public route only ever creates a MANUAL-triggered batch -- there is no `trigger` request field)',
    ],
    SDK_flow: [
      'client.accounts.create(organizationId, externalId)',
      'client.transactions.create(organizationId, applicationId, environmentId, workflowVersionId, assetNetworkId, amount, participants, idempotencyKey?)',
      'client.deposits.createPaymentIntent(organizationId, transactionId, assetNetworkId, amount, expiresAt, idempotencyKey?)',
      'client.settlements.executeSettlement(transactionId, amount?, idempotencyKey?)',
      'client.payout.createBatch(organizationId, environmentId, assetNetworkId, explicitOwnerIds, idempotencyKey?)',
    ],
    invariants: [
      'Settlement != Payout -- Settlement is an internal Ledger movement; Payout is what moves it on-chain later.',
      'PlatformFee != NetworkExecutionFee -- fee application and network gas cost are billed to different accounts by different mechanisms.',
      'The Seller/marketplace revenue split is a per-participant `splitPercentage` declared at CreateTransaction, not a parameter of ExecuteSettlement -- ExecuteSettlement only takes an optional partial `amount`.',
      'PricingPolicy (the platform\'s own fee rate) is Platform-Owner-configured only (AdminConfigurePricingPolicy) -- never a public, integrator-facing configuration surface.',
      'Settlement multi-source (multiple participants funding one Transaction) is supported; Withdrawal multi-source (aggregating multiple source Accounts in one Withdrawal) is not.',
      'The public CreatePayoutBatch route has no `trigger` field and only ever produces a MANUAL-triggered batch.',
    ],
    errors: ['IDEMPOTENCY_KEY_CONFLICT', 'PAYOUT_BATCH_IDEMPOTENCY_KEY_CONFLICT', 'NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE', 'PAYOUT_BATCH_TRIGGER_NOT_SUPPORTED', 'VALIDATION_ERROR'],
    webhooks: ['deposit.confirmed', 'transaction.settled', 'settlement.executed', 'settlement.split_portion_released', 'withdrawal.confirmed'],
    idempotency: 'Every mutating call (PaymentIntent creation, ExecuteSettlement, CreatePayoutBatch) must carry a stable, deterministic Idempotency-Key per real business intent -- never a fresh key on blind retry.',
    security: ['API Key stays server-side only.', 'Verify every inbound webhook signature (HMAC-SHA256) before acting on it.', 'Treat webhook payloads as a notification to re-check state, not as the final source of truth.'],
    example: 'examples/marketplace-mercatto -- Alice (buyer) / Bob (seller), 90/10 platform split, MANUAL payout, full webhook-driven flow.',
    anti_patterns: [
      'Calling RequestWithdrawal directly from a mobile/browser client with an embedded API Key.',
      'Treating Settlement completion as proof funds already left the platform on-chain.',
      'Retrying a failed ExecuteSettlement with a brand-new Idempotency-Key without confirming the original truly failed.',
      'Assuming webhook delivery order matches event causal order.',
      'Passing a `trigger`/`splits` field to CreatePayoutBatch/ExecuteSettlement -- neither request schema has one; the split is declared on the Transaction\'s participants, and the public payout route is unconditionally MANUAL.',
      'Assuming your Organization can self-configure its own PlatformFee/PricingPolicy via public API -- it cannot; that route is Platform-Owner-only.',
    ],
  },
  {
    id: 'wallet-payment-app',
    name: 'Wallet / payment app (end-user balance, deposit, withdrawal)',
    description:
      'An end-user-facing wallet where each user has an Account, can deposit crypto, see a Ledger balance, and withdraw to their own external address, subject to a cooldown/approval policy.',
    recipeStatus: 'SUPPORTED_CONCEPT',
    referenceProjectStatus: 'PLANNED',
    referenceProject: null,
    use_cases: ['Consumer crypto wallet', 'Balance-holding payment app', 'Peer-funded prepaid account'],
    required_capabilities: [
      'Account creation per end user',
      'Transaction reserve (PaymentIntent is always Transaction-scoped -- there is no account-only deposit without a Transaction)',
      'PaymentIntent + Deposit funding',
      'Ledger balance query',
      'WithdrawalDestination registration',
      'RequestWithdrawal',
      'Webhooks',
    ],
    optional_capabilities: ['Withdrawal approval workflow (Member-approved)', 'CUSTOMER_RESOURCES network execution'],
    authentication: ['API Key (backend) issuing scoped AccountHolder JWTs to the end-user client -- never the API Key itself in the client'],
    actors: ['End user (AccountHolder)', 'Platform Organization (backend)'],
    economic_flow: [
      'Backend creates a single-participant Transaction for the deposit (the user\'s own Account, isPayer:true, splitPercentage 100 or omitted).',
      'User deposits into that Transaction via a PaymentIntent.',
      'Ledger balance reflects the confirmed deposit.',
      'User requests a Withdrawal to a registered external WithdrawalDestination.',
      'Withdrawal executes on-chain once approved (if the policy requires approval) and broadcasts.',
    ],
    API_flow: [
      'POST /v1/organizations/{organizationId}/accounts (per end user, backend-issued)',
      'POST /v1/organizations/{organizationId}/transactions (single-participant, funding-only)',
      'POST /v1/organizations/{organizationId}/payment-intents',
      'GET  /v1/accounts/{accountId}/balance',
      'POST /v1/organizations/{organizationId}/withdrawal-destinations',
      'POST /v1/organizations/{organizationId}/withdrawals',
    ],
    SDK_flow: [
      'client.accounts.create(organizationId, externalId)',
      'client.transactions.create(organizationId, applicationId, environmentId, workflowVersionId, assetNetworkId, amount, participants, idempotencyKey?)',
      'client.deposits.createPaymentIntent(organizationId, transactionId, assetNetworkId, amount, expiresAt, idempotencyKey?)',
      'client.ledger.getBalance(accountId, assetNetworkId)',
      'client.withdrawals.createDestination(organizationId, address, assetNetworkId)',
      'client.withdrawals.request(organizationId, environmentId, accountId, withdrawalDestinationId, assetNetworkId, amount, idempotencyKey?)',
    ],
    invariants: [
      'Payout != Withdrawal -- this pattern uses RequestWithdrawal directly (the end-user-facing primitive), not the organization-level Payout/PayoutBatch mechanism.',
      'A single Withdrawal draws from exactly one Account -- multi-source aggregation is not supported.',
      'The end-user client must only ever hold an AccountHolder JWT, never the API Key.',
    ],
    errors: ['NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE', 'VALIDATION_ERROR'],
    webhooks: ['deposit.confirmed', 'withdrawal.requested', 'withdrawal.approved', 'withdrawal.broadcast', 'withdrawal.confirmed', 'withdrawal.failed'],
    idempotency: 'RequestWithdrawal must carry a deterministic Idempotency-Key per real withdrawal intent.',
    security: ['Never embed the API Key client-side.', 'Verify webhook signatures server-side before updating any UI-facing balance state.'],
    example: null,
    anti_patterns: [
      'Shipping the API Key inside a mobile app to let it call RequestWithdrawal directly.',
      'Treating Withdrawal as multi-source-capable.',
      'Polling instead of consuming webhooks for withdrawal state changes.',
    ],
  },
  {
    id: 'service-milestone',
    name: 'Services / milestone-based release',
    description:
      'A services engagement where funds are reserved upfront and released in partial Settlements as milestones are confirmed, rather than all at once.',
    recipeStatus: 'SUPPORTED_CONCEPT',
    referenceProjectStatus: 'PLANNED',
    referenceProject: null,
    use_cases: ['Freelance/services escrow', 'Milestone-gated project payments', 'Phased delivery contracts'],
    required_capabilities: ['PaymentIntent + Deposit funding', 'Transaction reserve', 'Partial Settlement (multiple ExecuteSettlement calls against one Transaction)', 'Webhooks'],
    optional_capabilities: ['Workflow-driven conditional release', 'Refund of the unreleased remainder'],
    authentication: ['API Key (server-to-server, backend only)'],
    actors: ['Client (payer)', 'Service provider (payee)', 'Platform Organization'],
    economic_flow: [
      'Client funds the full engagement amount into one Transaction reserve.',
      'On each milestone confirmation, the Organization triggers a partial ExecuteSettlement releasing that milestone\'s share.',
      'transaction.settled fires with IsTotal=false until the final milestone, which settles the remainder with IsTotal=true.',
      'Any unreleased remainder can be refunded if the engagement is cancelled mid-way.',
    ],
    API_flow: [
      'POST /v1/organizations/{organizationId}/payment-intents (full engagement amount)',
      'POST /v1/transactions/{transactionId}/settlements (called once per milestone, partial `amount`)',
      'POST /v1/transactions/{transactionId}/refunds (ExecuteRefund -- only if cancelling with remaining balance)',
    ],
    SDK_flow: [
      'client.deposits.createPaymentIntent(organizationId, transactionId, assetNetworkId, amount, expiresAt, idempotencyKey?)',
      'client.settlements.executeSettlement(transactionId, milestoneAmount, idempotencyKey?)',
      'client.refunds.executeRefund(transactionId, amount?, reason?, idempotencyKey?)',
    ],
    invariants: [
      'A Transaction can be settled multiple times partially; transaction.settled\'s IsTotal field tells you whether the Transaction is now fully settled.',
      'Settlement != Payout -- each partial Settlement is still just a Ledger movement; provider payout timing is independent.',
    ],
    errors: ['VALIDATION_ERROR', 'NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE'],
    webhooks: ['transaction.settled', 'settlement.executed', 'refund.executed'],
    idempotency: 'Each partial ExecuteSettlement call must carry its own deterministic Idempotency-Key tied to that specific milestone, never reused across milestones.',
    security: ['Verify webhook signatures before marking a milestone paid in any client-facing UI.'],
    example: null,
    anti_patterns: [
      'Reusing the same Idempotency-Key across different milestones (this replays the first milestone\'s result instead of executing the next one).',
      'Assuming transaction.settled always means the Transaction is fully done -- check IsTotal.',
      'Settling the full amount upfront and tracking milestones only off-platform.',
    ],
  },
];
