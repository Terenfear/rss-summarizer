export interface FeedConfig {
  id: string;
  name: string;
  url: string;
}

export interface RawFeedItem {
  id: string;
  title: string;
  link: string;
  content: string;
  publishedAt?: string;
}

export interface Env {
  // Bindings
  RSS_CACHE: KVNamespace;

  // Secrets
  OPENROUTER_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  ADMIN_KEY: string; // Required secret to authorize manual /run HTTP requests

  // Optional Vars
  OPENROUTER_MODEL?: string;
  USER_AGENT?: string;
  MAX_ITEMS_PER_FEED?: string;
  FEEDS_CONFIG?: string; // Optional JSON string override for feeds
}

export interface DigestResult {
  feedId: string;
  feedName: string;
  totalFetched: number;
  unreadCount: number;
  messageSent: boolean;
  error?: string;
}
