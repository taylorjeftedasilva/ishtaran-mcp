import { fileURLToPath } from 'node:url';
import path from 'node:path';

// mcp/build/lib/paths.ts -> monorepo root is three levels up.
export const MCP_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const REPO_ROOT = path.resolve(MCP_ROOT, '..');

export function repoPath(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}

export function mcpPath(...segments: string[]): string {
  return path.join(MCP_ROOT, ...segments);
}
