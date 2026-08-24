import { describe, expect, it } from 'vitest';
import { getFeedsConfig } from '../src/config.js';
import type { Env } from '../src/types.js';

describe('Config Loader', () => {
  it('returns fallback example feeds when no custom config exists', () => {
    const feeds = getFeedsConfig();
    expect(Array.isArray(feeds)).toBe(true);
    expect(feeds.length).toBeGreaterThan(0);
    expect(feeds[0]).toHaveProperty('id');
    expect(feeds[0]).toHaveProperty('name');
    expect(feeds[0]).toHaveProperty('url');
  });

  it('honors FEEDS_CONFIG environment variable override', () => {
    const custom = [
      { id: 'custom-feed', name: 'Custom Feed', url: 'https://example.com/custom.rss' },
    ];
    const mockEnv = {
      FEEDS_CONFIG: JSON.stringify(custom),
    } as unknown as Env;

    const feeds = getFeedsConfig(mockEnv);
    expect(feeds).toEqual(custom);
  });
});
