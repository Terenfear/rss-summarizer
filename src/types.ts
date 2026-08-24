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
  FEEDS_CONFIG?: string; // Optional JSON string override for feeds
  FEEDS_PER_RUN?: string; // Number of feeds to process per cron run (default: 1)
  MIN_FEED_INTERVAL_HOURS?: string; // Minimum hours between fetching the same feed (default: 4)
}

export interface DigestResult {
  feedId: string;
  feedName: string;
  totalFetched: number;
  unreadCount: number;
  messageSent: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}
