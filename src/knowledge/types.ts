// Shapes of the 14 Knowledge Bundle JSON files, as written by build/index.ts. This is the
// ONLY contract between the Engine (this src/ tree) and the Bundle -- the Engine never imports
// build/ code at runtime, only these types (which describe data, not logic).
export interface Manifest {
  schemaVersion: string;
  knowledgeVersion: string;
  generatedAt: string;
  sourceCommit: string;
  openApiVersion: string;
  openApiHash: string;
  bundleHash: string;
  supportedSdkVersions: { language: string; version: string }[];
  minimumCompatibleMcpVersion: string;
  environmentStatus: Record<string, string>;
  signature: string | null;
  signatureAlgorithm: string | null;
}

export interface IndexFile {
  capabilities: string[];
  concepts: string[];
  recipes: { id: string; recipeStatus: string; referenceProjectStatus: string }[];
  errorCodes: string[];
  webhookEvents: string[];
  projects: { id: string; status: string; pattern: string }[];
  counts: Record<string, number>;
}

export interface Capability {
  id: string;
  operations: string[];
  relatedErrors: string[];
  relatedWebhooks: string[];
  relatedRecipes: string[];
  sources: string[];
}

export interface Operation {
  operationId: string;
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  tags: string[];
  capability: string;
  sdk: Record<string, { method: string; resource: string; signature: string } | undefined>;
  matrixStatus: string | null;
  sources: string[];
}

export interface SdkMapEntry {
  language: string;
  resourceFile: string;
  resourceAccessor: string;
  methodName: string;
  httpVerb: string;
  pathShape: string;
  signature: string;
}

export interface ErrorEntry {
  code: string;
  httpStatus: number;
  meaning: string;
  remediation: string;
  retryable: boolean;
  relatedOperations: string[];
  extensions?: string[];
}

export interface WebhookEventEntry {
  event: string;
  when: string;
  keyFields: string[];
  aggregateIdField: string;
  category: string;
}

export interface WebhooksFile {
  contract: Record<string, unknown>;
  events: WebhookEventEntry[];
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  recipeStatus: 'READY' | 'SUPPORTED_CONCEPT';
  referenceProjectStatus: 'READY' | 'PLANNED';
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

export interface GlossaryEntry {
  term: string;
  contrastsWith?: string;
  definition: string;
  commonConfusion?: string;
  sources: string[];
}

export interface GapEntry {
  id: string;
  status: 'SUPPORTED' | 'NOT_SUPPORTED' | 'DEPRECATED' | 'FUTURE' | 'KNOWN_GAP';
  capability: string;
  description: string;
  evidence: string;
  affects: string[];
}

export interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  status: 'READY' | 'PLANNED' | 'EXPERIMENTAL' | 'DEPRECATED';
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
  difficulty: string;
  tags: string[];
  docs: string[];
  entryPoints: string[];
  minimumKnowledgeVersion: string;
  knownLimitations: string[];
  lastValidatedAt: string;
}

export interface ConflictEntry {
  type: string;
  source: string;
  description: string;
  [key: string]: unknown;
}

export interface GraphFile {
  conceptToCapabilities: Record<string, string[]>;
  capabilityToOperations: Record<string, string[]>;
  operationToErrors: Record<string, string[]>;
  errorToOperations: Record<string, string[]>;
  recipeToCapabilities: Record<string, string[]>;
  recipeToOperations: Record<string, string[]>;
  webhookEventToCategory: Record<string, string>;
}

export interface SourceEntry {
  path: string;
  contentHash: string;
}

export interface KnowledgeBundle {
  manifest: Manifest;
  index: IndexFile;
  capabilities: Record<string, Capability>;
  operations: Record<string, Operation>;
  sdkMap: SdkMapEntry[];
  errors: ErrorEntry[];
  webhooks: WebhooksFile;
  recipes: Recipe[];
  glossary: GlossaryEntry[];
  gaps: GapEntry[];
  projects: ProjectEntry[];
  conflicts: ConflictEntry[];
  graph: GraphFile;
  sources: SourceEntry[];
}
