// Loads sdk-feature-matrix.json -- the canonical, hand-maintained cross-SDK capability matrix
// (rebuilt this session, 140 entries). Precedence #2 (SDK method/sintaxe), joined against the
// OpenAPI operationId. `method` in this file is the HTTP verb, not the SDK method name -- SDK
// method names come from sdkExtract.ts (real source code), never invented here.
import { readFileSync } from 'node:fs';
import { repoPath } from '../lib/paths.js';

export interface SdkMatrixFeature {
  id: string;
  module: string;
  method: string;
  path: string;
  operationId: string;
  status: Record<string, string>;
}

export interface SdkMatrixSource {
  generatedFrom: string;
  generatedAt: string;
  referenceSdk: string;
  features: SdkMatrixFeature[];
  byOperationId: Map<string, SdkMatrixFeature>;
}

export function loadSdkMatrix(): SdkMatrixSource {
  const absPath = repoPath('sdk-feature-matrix.json');
  const raw = JSON.parse(readFileSync(absPath, 'utf-8'));
  const features: SdkMatrixFeature[] = raw.features ?? [];
  const byOperationId = new Map<string, SdkMatrixFeature>();
  for (const f of features) {
    if (f.operationId) byOperationId.set(f.operationId, f);
  }
  return {
    generatedFrom: raw.generatedFrom,
    generatedAt: raw.generatedAt,
    referenceSdk: raw.referenceSdk,
    features,
    byOperationId,
  };
}
