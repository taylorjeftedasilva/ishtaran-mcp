// Ishtaran MCP -- the official AI-agent knowledge/discovery/planning/validation layer.
// Never executes financial operations; that's the SDK's job. Startup reads the local Knowledge
// Bundle synchronously (never blocks on network) and only then kicks off a background,
// best-effort remote-freshness check.
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { getContext } from './context.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';
import { registerPrompts } from './prompts.js';
import { kickOffBackgroundCheck } from './update/status.js';

async function main() {
  const { bundle, engineVersion, origin } = getContext();

  const server = new McpServer(
    { name: 'ishtaran-mcp', version: engineVersion },
    {
      instructions:
        'Knowledge, discovery, planning, and validation layer for the Ishtaran platform. ' +
        'This server NEVER executes financial operations (no deposits, settlements, payouts, withdrawals, refunds) -- ' +
        'it only teaches, plans, and validates. Use the Ishtaran SDK to actually integrate; use this server first to ' +
        'avoid hallucinating an endpoint, SDK method, error code, or webhook event that does not exist. ' +
        'Start with search_knowledge or the ishtaran://index resource.',
    },
  );

  registerResources(server);
  registerTools(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[ishtaran-mcp] ready. engine=${engineVersion} knowledge=${bundle.manifest.knowledgeVersion} origin=${origin} publicOperations=${bundle.index.counts.publicOperations}`);

  kickOffBackgroundCheck();
}

main().catch((err) => {
  console.error('[ishtaran-mcp] fatal startup error:', err);
  process.exit(1);
});
