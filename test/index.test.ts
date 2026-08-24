import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
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
