// Loads the AI-Ready layer (business rules / capability index / anti-patterns) -- precedence
// #3. Only marketplace-mercatto exists today (confirmed this session's audit).
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { repoPath } from '../lib/paths.js';

export interface AiDocsSource {
  manifest: any;
  capabilityIndex: any[];
  antiPatterns: any;
  scenarioManifest: any;
  operationCards: Record<string, any>;
}

function loadYaml(...segments: string[]): any {
  const absPath = repoPath(...segments);
  return yaml.load(readFileSync(absPath, 'utf-8'));
}

export function loadAiDocs(): AiDocsSource {
  const base = ['website', 'static', 'ai', 'marketplace-mercatto'];
  return {
    manifest: loadYaml(...base, 'manifest.yaml'),
    capabilityIndex: loadYaml(...base, 'capability-index.yaml') ?? [],
    antiPatterns: loadYaml(...base, 'anti-patterns.yaml'),
    scenarioManifest: loadYaml(...base, 'scenario-manifest.yaml'),
    operationCards: {
      'execute-settlement': loadYaml(...base, 'operation-cards', 'execute-settlement.yaml'),
    },
  };
}
