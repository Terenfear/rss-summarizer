import { describe, expect, it, vi } from 'vitest';
import {
  getLastFetchedTime,
  getLastProcessedFeedId,
  getSeenIds,
  markIdsSeen,
  setLastFetchedTime,
  setLastProcessedFeedId,
} from '../src/storage.js';

describe('Storage Helpers', () => {
  it('reads seen IDs from KV namespace', async () => {
    const mockKv = {
      get: vi.fn().mockResolvedValue(['id1', 'id2']),
      put: vi.fn(),
    } as unknown as KVNamespace;

    const seen = await getSeenIds(mockKv, 'my-feed');
    expect(seen.has('id1')).toBe(true);
    expect(seen.has('id2')).toBe(true);
    expect(mockKv.get).toHaveBeenCalledWith('seen:my-feed', 'json');
  });

  it('marks new IDs as seen and caps total stored entries', async () => {
    const mockKv = {
      get: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    const existing = new Set(['id1']);
    await markIdsSeen(mockKv, 'my-feed', ['id2', 'id3'], existing);

    expect(mockKv.put).toHaveBeenCalledWith(
      'seen:my-feed',
      JSON.stringify(['id1', 'id2', 'id3']),
      expect.objectContaining({ expirationTtl: 30 * 24 * 60 * 60 })
    );
  });

  it('reads and writes last fetched timestamp', async () => {
    const mockKv = {
      get: vi.fn().mockResolvedValue('1700000000000'),
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    const time = await getLastFetchedTime(mockKv, 'feed-1');
    expect(time).toBe(1700000000000);

    await setLastFetchedTime(mockKv, 'feed-1', 1700000050000);
    expect(mockKv.put).toHaveBeenCalledWith('last_fetched:feed-1', '1700000050000', expect.any(Object));
  });

  it('reads and writes round robin feed cursor', async () => {
    const mockKv = {
      get: vi.fn().mockResolvedValue('feed-alpha'),
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    const lastId = await getLastProcessedFeedId(mockKv);
    expect(lastId).toBe('feed-alpha');

    await setLastProcessedFeedId(mockKv, 'feed-beta');
    expect(mockKv.put).toHaveBeenCalledWith('cursor:last_feed_id', 'feed-beta');
  });
});
