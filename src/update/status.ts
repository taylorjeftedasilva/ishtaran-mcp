// Session-level freshness state. Startup triggers one background, non-blocking remote check;
// `get_knowledge_status` and tool/resource metadata read this state without ever re-checking
// on every call (no nagging) -- a fresh check only happens if the cached one is stale (>60s) or
// never ran. `update_knowledge` is the explicit, host-agnostic fallback action (works whether or
// not the connected client supports MRTR/elicitation).
import { fetchRemoteManifest, type ManifestCheckResult } from './manifestClient.js';
import type { Manifest } from '../knowledge/types.js';

const RECHECK_INTERVAL_MS = 60_000;

interface SessionUpdateState {
  lastCheck: ManifestCheckResult | null;
  lastCheckedAt: string | null;
  acknowledgedVersions: Set<string>;
}

const state: SessionUpdateState = { lastCheck: null, lastCheckedAt: null, acknowledgedVersions: new Set() };

async function refreshIfStale(): Promise<void> {
  const now = Date.now();
  const staleOrMissing = !state.lastCheckedAt || now - Date.parse(state.lastCheckedAt) > RECHECK_INTERVAL_MS;
  if (!staleOrMissing) return;
  state.lastCheck = await fetchRemoteManifest();
  state.lastCheckedAt = new Date().toISOString();
}

/** Fire-and-forget: call once at startup so the first tool call already has a cached result. */
export function kickOffBackgroundCheck(): void {
  void refreshIfStale();
}

export interface KnowledgeStatus {
  localKnowledgeVersion: string;
  remoteKnowledgeVersion: string | null;
  updateAvailable: boolean;
  generatedAt: string;
  sourceCommit: string;
  openApiHash: string;
  projectRegistryVersion: string | null;
  lastCheckedAt: string | null;
  remoteCheckError: string | null;
}

export async function getKnowledgeStatus(localManifest: Manifest): Promise<KnowledgeStatus> {
  await refreshIfStale();
  const remoteOk = state.lastCheck?.ok === true;
  const remoteVersion = remoteOk ? (state.lastCheck as Extract<ManifestCheckResult, { ok: true }>).manifest.knowledgeVersion : null;
  return {
    localKnowledgeVersion: localManifest.knowledgeVersion,
    remoteKnowledgeVersion: remoteVersion,
    updateAvailable: remoteOk && remoteVersion !== localManifest.knowledgeVersion,
    generatedAt: localManifest.generatedAt,
    sourceCommit: localManifest.sourceCommit,
    openApiHash: localManifest.openApiHash,
    projectRegistryVersion: remoteOk ? (state.lastCheck as any).manifest.projectsRegistryUrl ?? null : null,
    lastCheckedAt: state.lastCheckedAt,
    remoteCheckError: state.lastCheck && !state.lastCheck.ok ? `${state.lastCheck.reason}: ${state.lastCheck.detail}` : null,
  };
}

/** A short, non-nagging notice safe to attach to any tool/resource response's metadata. */
export function updateNoticeForMetadata(localManifest: Manifest): { knowledgeUpdateAvailable: boolean; note?: string } | undefined {
  if (state.lastCheck?.ok !== true) return undefined;
  const remoteVersion = state.lastCheck.manifest.knowledgeVersion;
  if (remoteVersion === localManifest.knowledgeVersion) return undefined;
  if (state.acknowledgedVersions.has(remoteVersion)) return { knowledgeUpdateAvailable: true };
  return { knowledgeUpdateAvailable: true, note: `Knowledge ${remoteVersion} is available (local: ${localManifest.knowledgeVersion}). Call update_knowledge to refresh.` };
}

/** Called once a caller has seen the notice (e.g. after calling get_knowledge_status or update_knowledge), so later tool calls in the same session stay quiet about the same version. */
export function acknowledgeUpdateNotice(knowledgeVersion: string): void {
  state.acknowledgedVersions.add(knowledgeVersion);
}

export function getLastRemoteManifest() {
  return state.lastCheck?.ok === true ? state.lastCheck.manifest : null;
}
