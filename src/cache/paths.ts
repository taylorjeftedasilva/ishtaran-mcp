// Cross-platform local cache location for downloaded knowledge bundles. Never hardcoded to a
// Unix path -- os.homedir() resolves correctly on macOS/Linux/Windows. Overridable via
// ISHTARAN_MCP_HOME for tests and for users who want a non-default location.
import os from 'node:os';
import path from 'node:path';

export function cacheRoot(): string {
  return process.env.ISHTARAN_MCP_HOME ?? path.join(os.homedir(), '.ishtaran', 'mcp');
}

export function cacheKnowledgeDir(version: string): string {
  return path.join(cacheRoot(), 'knowledge', version);
}

export function cacheActivePointerPath(): string {
  return path.join(cacheRoot(), 'active.json');
}

export function cacheManifestPath(): string {
  return path.join(cacheRoot(), 'manifest-cache.json');
}
