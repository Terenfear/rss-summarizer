import { describe, expect, it, vi } from 'vitest';
import worker, { runDigest } from '../src/index.js';
import type { Env } from '../src/types.js';

describe('Worker HTTP Endpoints & Auth', () => {
  const mockCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;

  it('returns 200 OK for /health without auth', async () => {
    const req = new Request('http://localhost/health');
    const env = { ADMIN_KEY: 'secret123' } as unknown as Env;
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe('ok');
  });

  it('returns 200 OK for root / without auth', async () => {
    const req = new Request('http://localhost/');
    const env = { ADMIN_KEY: 'secret123' } as unknown as Env;
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
  });

  it('rejects /run with 401 if ADMIN_KEY is not set in env', async () => {
    const req = new Request('http://localhost/run');
    const env = {} as unknown as Env;
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });

  it('rejects /run with 401 if query param ?key= is used instead of header', async () => {
    const req = new Request('http://localhost/run?key=secret123');
    const env = { ADMIN_KEY: 'secret123' } as unknown as Env;
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });

  it('rejects /run with 401 if invalid Bearer token provided', async () => {
    const req = new Request('http://localhost/run', {
      headers: { Authorization: 'Bearer wrongtoken' },
    });
    const env = { ADMIN_KEY: 'secret123' } as unknown as Env;
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });

  it('accepts /run with Authorization Bearer header', async () => {
    const req = new Request('http://localhost/run', {
      headers: { Authorization: 'Bearer secret123' },
    });
    const env = {
      ADMIN_KEY: 'secret123',
      FEEDS_CONFIG: '[]',
      RSS_CACHE: { get: vi.fn().mockResolvedValue([]), put: vi.fn() },
      OPENROUTER_API_KEY: 'test',
      TELEGRAM_BOT_TOKEN: 'test',
      TELEGRAM_CHAT_ID: 'test',
    } as unknown as Env;

    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
  });

  it('accepts /run with X-Admin-Key header', async () => {
    const req = new Request('http://localhost/run', {
      headers: { 'X-Admin-Key': 'secret123' },
    });
    const env = {
      ADMIN_KEY: 'secret123',
      FEEDS_CONFIG: '[]',
      RSS_CACHE: { get: vi.fn().mockResolvedValue([]), put: vi.fn() },
      OPENROUTER_API_KEY: 'test',
      TELEGRAM_BOT_TOKEN: 'test',
      TELEGRAM_CHAT_ID: 'test',
    } as unknown as Env;

    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
  });
});

describe('Round-Robin and 4-Hour Cooldown Logic', () => {
  const feeds = [
    { id: 'feed-1', name: 'Feed One', url: 'https://example.com/1.rss' },
    { id: 'feed-2', name: 'Feed Two', url: 'https://example.com/2.rss' },
    { id: 'feed-3', name: 'Feed Three', url: 'https://example.com/3.rss' },
  ];

  it('does nothing when all feeds were fetched less than 4 hours ago', async () => {
    const now = Date.now();
    const kvStore: Record<string, string> = {
      'last_fetched:feed-1': String(now - 10 * 60 * 1000), // 10 mins ago
      'last_fetched:feed-2': String(now - 30 * 60 * 1000), // 30 mins ago
      'last_fetched:feed-3': String(now - 60 * 60 * 1000), // 1 hour ago
      'cursor:last_feed_id': 'feed-1',
    };

    const mockKv = {
      get: vi.fn().mockImplementation((key: string) => Promise.resolve(kvStore[key] ?? null)),
      put: vi.fn().mockImplementation((key: string, val: string) => {
        kvStore[key] = val;
        return Promise.resolve();
      }),
    } as unknown as KVNamespace;

    const env = {
      FEEDS_CONFIG: JSON.stringify(feeds),
      RSS_CACHE: mockKv,
      MIN_FEED_INTERVAL_HOURS: '4',
    } as unknown as Env;

    const result = await runDigest(env);
    expect(result.results.length).toBe(0);
    expect(result.summary).toContain('on cooldown (< 4h');
  });

  it('picks the next feed in round-robin order when eligible', async () => {
    const now = Date.now();
    const kvStore: Record<string, string> = {
      'last_fetched:feed-1': String(now - 5 * 60 * 60 * 1000), // 5 hours ago (eligible)
      'last_fetched:feed-2': String(now - 5 * 60 * 60 * 1000), // 5 hours ago (eligible)
      'last_fetched:feed-3': String(now - 1 * 60 * 60 * 1000), // 1 hour ago (on cooldown)
      'cursor:last_feed_id': 'feed-1',
    };

    const mockKv = {
      get: vi.fn().mockImplementation((key: string) => Promise.resolve(kvStore[key] ?? null)),
      put: vi.fn().mockImplementation((key: string, val: string) => {
        kvStore[key] = val;
        return Promise.resolve();
      }),
    } as unknown as KVNamespace;

    const env = {
      FEEDS_CONFIG: JSON.stringify(feeds),
      RSS_CACHE: mockKv,
      MIN_FEED_INTERVAL_HOURS: '4',
      FEEDS_PER_RUN: '1',
      USER_AGENT: 'test-agent',
    } as unknown as Env;

    // Mock fetch for feed XML
    const mockXml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Item 1</title><link>https://example.com/item1</link><guid>item-1</guid></item></channel></rss>`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockXml),
    });

    const result = await runDigest(env);
    // After feed-1, feed-2 should be chosen
    expect(result.results.length).toBe(1);
    expect(result.results[0].feedId).toBe('feed-2');
    expect(kvStore['cursor:last_feed_id']).toBe('feed-2');
  });

  it('recovers gracefully if feed list is changed/reordered after redeploy', async () => {
    const now = Date.now();
    // Saved cursor is for an old feed that was removed
    const kvStore: Record<string, string> = {
      'cursor:last_feed_id': 'old-deleted-feed',
      'last_fetched:feed-1': String(now - 5 * 60 * 60 * 1000),
    };

    const mockKv = {
      get: vi.fn().mockImplementation((key: string) => Promise.resolve(kvStore[key] ?? null)),
      put: vi.fn().mockImplementation((key: string, val: string) => {
        kvStore[key] = val;
        return Promise.resolve();
      }),
    } as unknown as KVNamespace;

    const env = {
      FEEDS_CONFIG: JSON.stringify(feeds),
      RSS_CACHE: mockKv,
      MIN_FEED_INTERVAL_HOURS: '4',
      FEEDS_PER_RUN: '1',
    } as unknown as Env;

    const mockXml = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockXml),
    });

    const result = await runDigest(env);
    // Should fallback to index 0 (feed-1)
    expect(result.results.length).toBe(1);
    expect(result.results[0].feedId).toBe('feed-1');
    expect(kvStore['cursor:last_feed_id']).toBe('feed-1');
  });

  it('processes all unread items without capping by default', async () => {
    const kvStore: Record<string, string> = {};
    const mockKv = {
      get: vi.fn().mockImplementation((key: string) => Promise.resolve(kvStore[key] ?? null)),
      put: vi.fn().mockImplementation((key: string, val: string) => {
        kvStore[key] = val;
        return Promise.resolve();
      }),
    } as unknown as KVNamespace;

    const env = {
      FEEDS_CONFIG: JSON.stringify([feeds[0]]),
      RSS_CACHE: mockKv,
      OPENROUTER_API_KEY: 'test-key',
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_CHAT_ID: 'test-chat',
    } as unknown as Env;

    // Generate 25 items in XML
    const itemsXml = Array.from({ length: 25 }, (_, i) => `<item><title>Item ${i + 1}</title><link>https://example.com/item${i + 1}</link><guid>item-${i + 1}</guid></item>`).join('');
    const mockXml = `<?xml version="1.0"?><rss version="2.0"><channel>${itemsXml}</channel></rss>`;

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('openrouter.ai')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            choices: [{ message: { content: 'Summary of 25 items' } }],
          }),
        });
      }
      if (urlStr.includes('api.telegram.org')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockXml),
      });
    });

    const result = await runDigest(env, { force: true });
    expect(result.results.length).toBe(1);
    expect(result.results[0].totalFetched).toBe(25);
    expect(result.results[0].unreadCount).toBe(25);
    expect(result.results[0].messageSent).toBe(true);

    // Verify all 25 IDs were marked seen in KV
    const savedSeen = JSON.parse(kvStore['seen:feed-1']);
    expect(savedSeen.length).toBe(25);
  });
});
