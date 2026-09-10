// Hand-authored from website/docs/webhooks.md (public, written and verified this session
// directly against WebhookSignatureCalculator.cs/HttpWebhookDeliveryPort.cs/
// CreateWebhookDeliveriesForEventCommandHandler.cs -- the 36 events below were each traced
// 1:1 through the real delivery handler, not assumed from the event-type registry alone).
export interface WebhookEventEntry {
  event: string;
  when: string;
  keyFields: string[];
  aggregateIdField: string;
  category: 'Transaction' | 'PaymentIntent' | 'Deposit' | 'Settlement' | 'Refund' | 'Withdrawal';
}

export const WEBHOOK_CONTRACT = {
  headers: {
    'X-Webhook-Signature': 'HMAC-SHA256 signature, lowercase hex.',
    'X-Webhook-Timestamp': 'Unix time in seconds, as a string, at the moment the delivery was signed.',
    'X-Webhook-Delivery-Id': 'The unique ID of this delivery attempt -- use for dedup.',
  },
  signature: {
    algorithm: 'HMAC-SHA256',
    signedContent: '{unixTimestampSeconds}.{rawBody}',
    encoding: 'lowercase hex (not base64)',
    versioning: 'none today -- no v1=/t= prefix scheme',
    comparison: 'MUST be constant-time',
  },
  timestamp: {
    format: 'Unix seconds',
    serverEnforcedTolerance: null,
    note:
      'Ishtaran does not enforce a tolerance window on the sending side (it is the sender, not a consumer) -- freshness/replay-window enforcement is the receiver\'s responsibility. All 4 official SDKs default to a 300-second (5 minute) tolerance when verifying.',
  },
  payload: {
    envelope: false,
    casing: 'PascalCase',
    hasTypeField: false,
    hasCreatedAtField: false,
    note:
      'The HTTP body is the raw event record serialized directly -- no {id,type,data} wrapper, no type field, no created_at field. Casing differs from the camelCase used elsewhere in the public REST API JSON responses.',
  },
  eventTypeGap: {
    contract: 'CURRENT_CONTRACT',
    status: 'PRODUCT_DX_GAP',
    description:
      'The event type string is not included anywhere in the delivery itself (no header, no body field). Fetch GET /v1/webhook-deliveries/{id} for the real EventType, or filter GET /v1/webhook-endpoints/{id}/deliveries?eventType=.',
    suggestedFutureFix: 'X-Ishtaran-Event-Type header or a versioned envelope carrying `type` -- not implemented.',
  },
  delivery: {
    atLeastOnce: true,
    exactlyOnce: false,
    successCriteria: 'any 2xx response',
    retry: { baseDelaySeconds: 30, backoff: 'doubling per attempt', maxDelaySeconds: 86400, jitter: '+/-20%' },
    maxAttempts: 10,
    deadLetterAfterMaxAttempts: true,
    manualRedeliveryRoute: 'POST /v1/webhook-deliveries/{webhookDeliveryId}/redeliver',
  },
  ordering: {
    guaranteed: false,
    sequenceNumberIsHintOnly: true,
    recommendation: "Treat every webhook as a notification to re-check state; GET the Aggregate as source of truth when current state matters, not the webhook payload's snapshot.",
  },
  secretLifecycle: {
    shownOnce: true,
    rotationInvalidatesImmediately: true,
    gracePeriod: false,
  },
  selfCustodyNote:
    'SigningRequest signing is request/response (POST/GET), never webhook-driven. What IS webhook-driven is the outcome once execution confirms (e.g. withdrawal.broadcast/withdrawal.confirmed, settlement.executed). There is no signing_request.* event and no settlement.confirming event.',
} as const;

export const WEBHOOK_EVENTS: WebhookEventEntry[] = [
  { event: 'transaction.created', when: 'A Transaction is created.', keyFields: ['ApplicationId', 'ParticipantAccountIds'], aggregateIdField: 'TransactionId', category: 'Transaction' },
  { event: 'transaction.funded', when: 'A Transaction becomes fully funded.', keyFields: [], aggregateIdField: 'TransactionId', category: 'Transaction' },
  { event: 'transaction.reserved', when: 'Balance is reserved for a Transaction.', keyFields: ['Amount'], aggregateIdField: 'TransactionId', category: 'Transaction' },
  { event: 'transaction.cancelled', when: 'A Transaction is cancelled.', keyFields: ['Reason'], aggregateIdField: 'TransactionId', category: 'Transaction' },
  { event: 'transaction.frozen', when: 'A Transaction is frozen (Member action).', keyFields: ['Reason', 'ActorMemberId'], aggregateIdField: 'TransactionId', category: 'Transaction' },
  { event: 'transaction.unfrozen', when: 'A frozen Transaction is unfrozen.', keyFields: ['ActorMemberId'], aggregateIdField: 'TransactionId', category: 'Transaction' },
  { event: 'transaction.settled', when: 'A Transaction reaches a Settlement (full or partial).', keyFields: ['SettlementId', 'IsTotal'], aggregateIdField: 'TransactionId', category: 'Transaction' },
  { event: 'transaction.refunded', when: 'A Transaction is refunded (full or partial).', keyFields: ['RefundId', 'IsTotal'], aggregateIdField: 'TransactionId', category: 'Transaction' },

  { event: 'payment_intent.created', when: 'A PaymentIntent is created.', keyFields: ['TransactionId', 'Amount', 'ExpiresAt'], aggregateIdField: 'PaymentIntentId', category: 'PaymentIntent' },
  { event: 'payment_intent.cancelled', when: 'A PaymentIntent is cancelled.', keyFields: [], aggregateIdField: 'PaymentIntentId', category: 'PaymentIntent' },
  { event: 'payment_intent.expired', when: 'A PaymentIntent expires unfunded.', keyFields: [], aggregateIdField: 'PaymentIntentId', category: 'PaymentIntent' },
  { event: 'payment_intent.late_deposit_received', when: 'A deposit arrives after the PaymentIntent already expired.', keyFields: ['TransactionId', 'DepositId', 'Amount', 'ExpiredAt', 'ReceivedAt'], aggregateIdField: 'PaymentIntentId', category: 'PaymentIntent' },

  { event: 'deposit.address_generated', when: 'A deposit address is allocated for a PaymentIntent.', keyFields: ['Address', 'AssetNetworkId'], aggregateIdField: 'PaymentIntentId', category: 'Deposit' },
  { event: 'deposit.detected', when: 'An on-chain deposit is first seen, unconfirmed.', keyFields: ['PaymentIntentId', 'Amount'], aggregateIdField: 'DepositId', category: 'Deposit' },
  { event: 'deposit.confirming', when: 'Confirmation count is progressing.', keyFields: ['ConfirmationCount'], aggregateIdField: 'DepositId', category: 'Deposit' },
  { event: 'deposit.confirmed', when: 'The deposit reaches the required confirmation depth.', keyFields: ['PaymentIntentId', 'TransactionId', 'Amount'], aggregateIdField: 'DepositId', category: 'Deposit' },
  { event: 'deposit.rejected', when: 'The deposit is rejected.', keyFields: ['Reason'], aggregateIdField: 'DepositId', category: 'Deposit' },
  { event: 'deposit.reorg_frozen', when: 'A chain reorg puts a previously-seen deposit in doubt.', keyFields: ['PaymentIntentId', 'Amount'], aggregateIdField: 'DepositId', category: 'Deposit' },
  { event: 'deposit.under_review', when: 'The deposit is flagged for manual review.', keyFields: ['Reason'], aggregateIdField: 'DepositId', category: 'Deposit' },

  { event: 'settlement.executed', when: 'A Settlement (full or partial) completes successfully, even when some allocations are retained.', keyFields: ['TransactionId', 'AssetNetworkId', 'GrossAmount', 'DistributableAmount', 'PlatformFeeAmount', 'ExecutedAt'], aggregateIdField: 'SettlementId', category: 'Settlement' },
  { event: 'settlement.failed', when: 'A Settlement attempt fails.', keyFields: ['TransactionId', 'Reason', 'FailedAt'], aggregateIdField: 'SettlementId', category: 'Settlement' },
  { event: 'settlement.fee_applied', when: 'The Platform Fee is applied for a Settlement.', keyFields: ['PricingPolicyId', 'FeeAmount', 'FeePercentageApplied'], aggregateIdField: 'SettlementId', category: 'Settlement' },
  { event: 'settlement.split_portion_retained', when: 'A Split allocation is retained instead of released.', keyFields: ['AllocationId', 'ParticipantId', 'AccountId', 'Amount', 'Reason'], aggregateIdField: 'SettlementId', category: 'Settlement' },
  { event: 'settlement.split_portion_released', when: 'A Split allocation is released to its beneficiary Account.', keyFields: ['AllocationId', 'AccountId', 'Amount'], aggregateIdField: 'SettlementId', category: 'Settlement' },
  { event: 'refund.executed', when: 'A Refund completes.', keyFields: ['TransactionId', 'Amount', 'ExecutedAt'], aggregateIdField: 'RefundId', category: 'Refund' },
  { event: 'refund.rejected', when: 'A Refund attempt is rejected.', keyFields: ['TransactionId', 'Reason'], aggregateIdField: 'RefundId', category: 'Refund' },

  { event: 'withdrawal.requested', when: 'A Withdrawal is requested.', keyFields: ['AccountId', 'Amount', 'WithdrawalDestinationId'], aggregateIdField: 'WithdrawalId', category: 'Withdrawal' },
  { event: 'withdrawal.approved', when: 'A Withdrawal is approved.', keyFields: ['ActorMemberId'], aggregateIdField: 'WithdrawalId', category: 'Withdrawal' },
  { event: 'withdrawal.rejected', when: 'A Withdrawal is rejected.', keyFields: ['Reason'], aggregateIdField: 'WithdrawalId', category: 'Withdrawal' },
  { event: 'withdrawal.cancelled', when: 'A Withdrawal is cancelled.', keyFields: [], aggregateIdField: 'WithdrawalId', category: 'Withdrawal' },
  { event: 'withdrawal.broadcast', when: 'The withdrawal transaction is broadcast on-chain.', keyFields: ['TechnicalReference'], aggregateIdField: 'WithdrawalId', category: 'Withdrawal' },
  { event: 'withdrawal.broadcast_failed', when: 'The broadcast attempt fails.', keyFields: ['Reason'], aggregateIdField: 'WithdrawalId', category: 'Withdrawal' },
  { event: 'withdrawal.confirmed', when: 'The broadcast transaction reaches the required confirmations.', keyFields: ['TechnicalReference'], aggregateIdField: 'WithdrawalId', category: 'Withdrawal' },
  { event: 'withdrawal.failed', when: 'The Withdrawal fails terminally.', keyFields: ['Reason'], aggregateIdField: 'WithdrawalId', category: 'Withdrawal' },
  { event: 'withdrawal.requires_reconciliation', when: 'The Withdrawal needs manual reconciliation.', keyFields: [], aggregateIdField: 'WithdrawalId', category: 'Withdrawal' },
  { event: 'withdrawal_destination.registered', when: 'A WithdrawalDestination is registered for an Organization.', keyFields: ['OrganizationId', 'Address'], aggregateIdField: 'WithdrawalDestinationId', category: 'Withdrawal' },
];
