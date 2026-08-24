import type { Env, FeedConfig } from './types.js';
import exampleFeeds from '../feeds.example.json';

// feeds.json is user-local and ignored in git
let localFeeds: FeedConfig[] | null = null;
try {
  // @ts-ignore - feeds.json is optional and gitignored
  const imported = await import('../feeds.json');
  localFeeds = imported.default || imported;
} catch {
  // feeds.json does not exist, will fallback to feeds.example.json
  localFeeds = null;
}

export function getFeedsConfig(env?: Env): FeedConfig[] {
  // 1. Check if environment variable contains feed config JSON override
  if (env?.FEEDS_CONFIG) {
    try {
      const parsed = JSON.parse(env.FEEDS_CONFIG);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      console.warn('Failed to parse FEEDS_CONFIG environment variable, falling back to file config', err);
    }
  }

  // 2. Use local feeds.json if present
  if (localFeeds && Array.isArray(localFeeds) && localFeeds.length > 0) {
    return localFeeds;
  }

  // 3. Fall back to committed feeds.example.json
  return exampleFeeds as FeedConfig[];
}
