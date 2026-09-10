// Fetches the public remote manifest -- DATA only, never executed. HTTPS required. Never
// blocks the MCP's startup or any exact-lookup tool/resource: every call site here is either
// explicitly triggered by get_knowledge_status/update_knowledge, or a fire-and-forget background
// check whose result is only consulted later. Any network failure is swallowed into a typed
// result so callers can keep the MCP fully functional offline.
export const DEFAULT_REMOTE_MANIFEST_URL = 'https://ishtaran.com/mcp/manifest.json';
// Overridable for staging/local testing only (e.g. validating the update flow against a local
// test server without a live deployment) -- isHttpsOrLoopback() below still refuses anything
// that isn't HTTPS or explicitly loopback, so this can never be used to silently downgrade a
// real production endpoint to plaintext.
export const REMOTE_MANIFEST_URL = process.env.ISHTARAN_MCP_MANIFEST_URL ?? DEFAULT_REMOTE_MANIFEST_URL;
const FETCH_TIMEOUT_MS = 5000;

function isHttpsOrLoopback(url: string): boolean {
  if (url.startsWith('https://')) return true;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' && (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1');
  } catch {
    return false;
  }
}

export interface RemoteManifest {
  schemaVersion: string;
  knowledgeVersion: string;
  generatedAt: string;
  sourceCommit: string;
  openApiHash: string;
  openApiVersion: string;
  bundleUrl: string;
  bundleHash: string;
  projectsRegistryUrl?: string;
  environmentStatus?: Record<string, string>;
  supportedSdkVersions?: { language: string; version: string }[];
  latestMcpVersion: string;
  minimumCompatibleMcpVersion: string;
  signature: string | null;
  signatureAlgorithm: string | null;
}

export type ManifestCheckResult =
  | { ok: true; manifest: RemoteManifest }
  | { ok: false; reason: 'network_error' | 'non_https' | 'invalid_json' | 'invalid_schema' | 'timeout'; detail: string };

function isValidRemoteManifest(value: unknown): value is RemoteManifest {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.schemaVersion === 'string' &&
    typeof m.knowledgeVersion === 'string' &&
    typeof m.bundleUrl === 'string' &&
    typeof m.bundleHash === 'string' &&
    typeof m.minimumCompatibleMcpVersion === 'string'
  );
}

export async function fetchRemoteManifest(url: string = REMOTE_MANIFEST_URL): Promise<ManifestCheckResult> {
  if (!isHttpsOrLoopback(url)) {
    return { ok: false, reason: 'non_https', detail: `Refusing non-HTTPS manifest URL: ${url}` };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) {
      return { ok: false, reason: 'network_error', detail: `HTTP ${res.status} fetching ${url}` };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      return { ok: false, reason: 'invalid_json', detail: (err as Error).message };
    }
    if (!isValidRemoteManifest(json)) {
      return { ok: false, reason: 'invalid_schema', detail: 'Remote manifest is missing required fields.' };
    }
    if (!isHttpsOrLoopback(json.bundleUrl)) {
      return { ok: false, reason: 'non_https', detail: `Refusing non-HTTPS bundleUrl: ${json.bundleUrl}` };
    }
    return { ok: true, manifest: json };
  } catch (err) {
    const isAbort = (err as Error).name === 'AbortError';
    return { ok: false, reason: isAbort ? 'timeout' : 'network_error', detail: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
