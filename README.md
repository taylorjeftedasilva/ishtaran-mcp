# Ishtaran MCP

The official knowledge, discovery, planning, and validation layer for AI agents building on
[Ishtaran](https://ishtaran.com). It **never executes financial operations** -- no deposits,
settlements, payouts, withdrawals, or refunds. Use one of the [Ishtaran SDKs](https://ishtaran.com/sdks)
to actually integrate; use this server first so your agent doesn't hallucinate an endpoint, SDK
method, error code, or webhook event that doesn't exist.

```
LLM thinks  ->  MCP teaches/plans/validates  ->  SDK executes the integration  ->  API executes the business
```

## What it is not

Not an Admin Console, not a code generator, not a deployer, not a way to touch Production, and
not a way to move money. If a tool result ever looks like it did something financial, that's a
bug -- please [open an issue](https://github.com/taylorjeftedasilva/ishtaran-mcp/issues).

## Install

No API key or environment variable is required -- every tool and resource works fully offline,
right after install, using the Knowledge Bundle shipped inside the package.

### Claude Code

Add to your project's `.mcp.json` (or run `claude mcp add`):

```json
{
  "mcpServers": {
    "ishtaran": {
      "command": "npx",
      "args": ["-y", "@ishtaran/mcp"]
    }
  }
}
```

Claude Code will prompt you to approve the new server the next time you open the project.

### Cursor

Settings -> MCP -> Add new MCP server:

```json
{
  "mcpServers": {
    "ishtaran": {
      "command": "npx",
      "args": ["-y", "@ishtaran/mcp"]
    }
  }
}
```

### VS Code (or any other stdio-based MCP client)

Point the client at the command `npx -y @ishtaran/mcp` with no arguments and no environment
variables. Any client that speaks MCP over stdio works the same way.

### Run it directly

```bash
npx -y @ishtaran/mcp
```

This starts the stdio server. It's meant to be launched by an MCP client, not used interactively.

## First questions to try

- *"How do I integrate Ishtaran?"*
- *"Build a marketplace using Ishtaran."*
- *"How do I verify an Ishtaran webhook?"*
- *"Explain NETWORK_EXECUTION_FEE_INSUFFICIENT_BALANCE."*
- *"What's the difference between Settlement and Payout?"*
- *"Can a Withdrawal pull from multiple accounts?"* -- ask directly, or hand a claim like that to
  `validate_integration_plan`; it will tell you no and why.

## The marketplace recipe

`get_recipe` with `recipeId: "marketplace"` points at `marketplace-mercatto`, a real, runnable
reference implementation (buyer/seller Accounts, PaymentIntent funding, partial/full Settlement
with PlatformFee and per-participant revenue split, MANUAL Payout, refunds, and the full
webhook lifecycle), published as its own standalone, clonable repo:
[`ishtaran-mercatto-example`](https://github.com/taylorjeftedasilva/ishtaran-mercatto-example)
(also mirrored inside the main Ishtaran monorepo for internal development).
`wallet-payment-app` is likewise real and runnable -- a self-custody wallet and payment app
(private key stays client-side, WalletBalance-driven, Send vs Pay kept structurally distinct,
app-owner-configurable monetization) -- published at
[`ishtaran-wallet-example`](https://github.com/taylorjeftedasilva/ishtaran-wallet-example),
verified live against the public Sandbox (9/9 E2E). `service-milestone` remains a real, supported
pattern (`recipeStatus: SUPPORTED_CONCEPT`) with no reference project yet
(`referenceProjectStatus: PLANNED`) -- the tools say this explicitly rather than pointing you at
code that doesn't exist.

## Resources vs Tools vs Prompts

- **Resources** (`ishtaran://...`) are for browsing/reading -- an index, a capability, an
  operation, an error, a webhook event, a recipe, a reference project, the glossary.
- **Tools** are for asking a specific question or getting a computed answer. Eleven tools cover
  the full V1 surface -- search (`search_knowledge`), capability lookup (`get_capability`),
  operation lookup (`get_operation`), SDK method lookup (`choose_sdk`), error explanation
  (`explain_error`), webhook contract (`get_webhook_contract`), integration recipes
  (`get_recipe`), integration planning (`plan_integration`), plan validation
  (`validate_integration_plan`), and knowledge freshness (`get_knowledge_status`,
  `update_knowledge`).
- **Prompts** are pre-built starting points for common tasks (`integrate_ishtaran`,
  `build_marketplace`, `build_wallet`, `build_service_marketplace`, `debug_ishtaran`,
  `implement_webhook_receiver`, `review_ishtaran_integration`).

## Staying current without reinstalling

**The Engine package (`@ishtaran/mcp`) and the Knowledge Bundle it ships with are versioned
independently.** The package version (e.g. `0.1.0`) only changes when the server's code --
resources, tools, prompts, protocol behavior -- changes. The Knowledge Bundle (its own
`knowledgeVersion`, e.g. `2026.09.09.abc123`) changes whenever public docs, the OpenAPI contract,
SDK methods, recipes, or reference projects change -- which is far more often, and does **not**
require a new package release.

On startup, the server reads its embedded Knowledge Bundle immediately (never blocks on network),
then checks a small public manifest in the background, best-effort. `get_knowledge_status` shows
whether a newer bundle is available; `update_knowledge` (with `consent: true`) downloads and
applies it. New docs, routes, capabilities, recipes, and reference projects can reach you this
way -- **you normally do not need to run `npx @ishtaran/mcp` again or reinstall anything.**

Updates are DATA only (a JSON bundle, HTTPS-fetched, SHA-256-verified, schema-validated,
atomically swapped) -- never remotely executed code, and `update_knowledge` never runs without
explicit consent. If the bundle ever requires a newer Engine than you have installed, the server
tells you so explicitly rather than silently failing or fetching arbitrary code.

## Development (working in the Ishtaran monorepo)

```bash
cd mcp
npm install
npm run build:knowledge   # generates mcp/knowledge/<version>/*.json from the current repo state
npm run typecheck
npm test                  # full suite: unit, contract, golden, anti-pattern, marketplace, update
npm run build             # bundles mcp/dist/index.js
npm run ci                # everything above, in the same order CI runs it
```

`mcp/build/` is the Knowledge Build System (reads public sources only -- OpenAPI, SDK source,
AI docs, hand-authored errors/webhooks/glossary/gaps/recipes/projects -- and writes
`mcp/knowledge/<version>/*.json`). It only runs inside the Ishtaran monorepo, since it
cross-references the live OpenAPI contract and all 4 official SDKs' source trees, none of which
exist in this standalone repo -- that's why this repo's CI does not run `build:knowledge` and
instead tests against the already-committed bundle. `mcp/src/` is the Engine
(resources/tools/prompts/search/cache/update logic) and rarely needs to change when only the
knowledge bundle changes.

To point a local MCP client at your own build instead of the published package, use
`node /absolute/path/to/mcp/dist/index.js` as the command with no arguments.

## Troubleshooting

- **"No shipped knowledge bundle found"** -- run `npm run build:knowledge` before `npm run build`
  (only relevant when building from source; the published package always ships a bundle).
- **A tool call fails with `isError: true`** -- this is a normal, recoverable "unknown id" or
  "not supported" response (e.g. an admin operationId, a nonexistent webhook event). Read the
  message; it's the answer, not a bug.
- **Everything looks stale** -- call `get_knowledge_status`; if `updateAvailable` is true, call
  `update_knowledge` with `consent: true`.

## License

Apache-2.0 -- see [LICENSE](./LICENSE).
