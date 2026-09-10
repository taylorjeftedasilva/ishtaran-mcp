// The capability-awareness scenarios: remote check never blocks startup, a detected update is
// surfaced without nagging on every subsequent tool call, and a failed/offline check keeps the
// MCP fully functional. status.ts holds module-level session state, so each test resets modules
// and re-imports fresh.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function manifestResponse(knowledgeVersion: string) {
  return new Response(
    JSON.stringify({
      schemaVersion: '1.0.0',
      knowledgeVersion,
      generatedAt: new Date().toISOString(),
      sourceCommit: 'x',
      openApiHash: 'x',
      openApiVersion: 'v1',
      bundleUrl: 'https://ishtaran.com/mcp/knowledge/x.json',
      bundleHash: 'x'.repeat(64),
      latestMcpVersion: '0.1.0',
      minimumCompatibleMcpVersion: '0.1.0',
      signature: null,
      signatureAlgorithm: null,
    }),
    { status: 200 },
  );
}

const LOCAL_MANIFEST = { knowledgeVersion: '0.1.0+local', generatedAt: 'x', sourceCommit: 'x', openApiHash: 'x' } as any;

describe('get_knowledge_status', () => {
  it('reports updateAvailable:false when remote equals local', async () => {
    global.fetch = vi.fn().mockResolvedValue(manifestResponse('0.1.0+local'));
    const { getKnowledgeStatus } = await import('../../src/update/status.js');
    const status = await getKnowledgeStatus(LOCAL_MANIFEST);
    expect(status.updateAvailable).toBe(false);
  });

  it('reports updateAvailable:true when remote is newer', async () => {
    global.fetch = vi.fn().mockResolvedValue(manifestResponse('0.2.0+newer'));
    const { getKnowledgeStatus } = await import('../../src/update/status.js');
    const status = await getKnowledgeStatus(LOCAL_MANIFEST);
    expect(status.updateAvailable).toBe(true);
    expect(status.remoteKnowledgeVersion).toBe('0.2.0+newer');
  });

  it('stays fully functional when the remote check fails (offline)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const { getKnowledgeStatus } = await import('../../src/update/status.js');
    const status = await getKnowledgeStatus(LOCAL_MANIFEST);
    expect(status.updateAvailable).toBe(false);
    expect(status.remoteCheckError).toMatch(/network_error/);
    expect(status.localKnowledgeVersion).toBe('0.1.0+local');
  });

  it('does not re-fetch within the staleness window (no nagging / no request storm)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(manifestResponse('0.2.0+newer'));
    global.fetch = fetchMock;
    const { getKnowledgeStatus } = await import('../../src/update/status.js');
    await getKnowledgeStatus(LOCAL_MANIFEST);
    await getKnowledgeStatus(LOCAL_MANIFEST);
    await getKnowledgeStatus(LOCAL_MANIFEST);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('updateNoticeForMetadata', () => {
  it('includes a note the first time, then stays quiet (note omitted) after acknowledged', async () => {
    global.fetch = vi.fn().mockResolvedValue(manifestResponse('0.2.0+newer'));
    const { getKnowledgeStatus, updateNoticeForMetadata, acknowledgeUpdateNotice } = await import('../../src/update/status.js');
    await getKnowledgeStatus(LOCAL_MANIFEST);

    const firstNotice = updateNoticeForMetadata(LOCAL_MANIFEST);
    expect(firstNotice?.knowledgeUpdateAvailable).toBe(true);
    expect(firstNotice?.note).toBeDefined();

    acknowledgeUpdateNotice('0.2.0+newer');
    const secondNotice = updateNoticeForMetadata(LOCAL_MANIFEST);
    expect(secondNotice?.knowledgeUpdateAvailable).toBe(true);
    expect(secondNotice?.note).toBeUndefined();
  });

  it('returns undefined when there is no update', async () => {
    global.fetch = vi.fn().mockResolvedValue(manifestResponse('0.1.0+local'));
    const { getKnowledgeStatus, updateNoticeForMetadata } = await import('../../src/update/status.js');
    await getKnowledgeStatus(LOCAL_MANIFEST);
    expect(updateNoticeForMetadata(LOCAL_MANIFEST)).toBeUndefined();
  });
});
