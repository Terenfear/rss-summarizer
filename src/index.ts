import { getFeedsConfig } from './config.js';
import { fetchFeed } from './parser.js';
import { getSeenIds, markIdsSeen } from './storage.js';
import { summarizeFeedItems } from './openrouter.js';
import { sendTelegramMessage } from './telegram.js';
import type { DigestResult, Env, FeedConfig } from './types.js';

export async function processFeed(feed: FeedConfig, env: Env): Promise<DigestResult> {
  const result: DigestResult = {
    feedId: feed.id,
    feedName: feed.name,
    totalFetched: 0,
    unreadCount: 0,
    messageSent: false,
  };

  try {
    // 1. Fetch feed items
    const items = await fetchFeed(feed.url, env.USER_AGENT);
    result.totalFetched = items.length;

    if (items.length === 0) {
      return result;
    }

    // 2. Query KV for seen item IDs
    const seenIds = await getSeenIds(env.RSS_CACHE, feed.id);

    // 3. Filter unread items
    const unreadItems = items.filter((item) => !seenIds.has(item.id));
    result.unreadCount = unreadItems.length;

    // If no new items, do not send any message
    if (unreadItems.length === 0) {
      return result;
    }

    // 4. Cap items to MAX_ITEMS_PER_FEED
    const maxItems = parseInt(env.MAX_ITEMS_PER_FEED || '15', 10);
    const itemsToProcess = unreadItems.slice(0, maxItems);

    // 5. Generate detached summaries with OpenRouter
    const summaryList = await summarizeFeedItems(itemsToProcess, feed.name, env);

    // 6. Build final Telegram message
    const messageHeader = `<b>📰 ${feed.name} Digest</b> (${itemsToProcess.length} new)\n\n`;
    const fullMessage = `${messageHeader}${summaryList}`;

    // 7. Send to Telegram
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fullMessage);
    result.messageSent = true;

    // 8. Mark items as seen in KV
    const newIds = itemsToProcess.map((item) => item.id);
    await markIdsSeen(env.RSS_CACHE, feed.id, newIds, seenIds);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error processing feed ${feed.name} (${feed.id}):`, message);
    result.error = message;
  }

  return result;
}

export async function runDigest(env: Env): Promise<{ summary: string; results: DigestResult[] }> {
  const feeds = getFeedsConfig(env);
  const results: DigestResult[] = [];

  for (let i = 0; i < feeds.length; i++) {
    const feed = feeds[i];
    // Add small polite delay between feeds to prevent burst rate limits
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const feedResult = await processFeed(feed, env);
    results.push(feedResult);
  }

  const sentCount = results.filter((r) => r.messageSent).length;
  const errorCount = results.filter((r) => r.error).length;
  const summary = `Processed ${feeds.length} feeds: ${sentCount} sent, ${feeds.length - sentCount - errorCount} skipped (no unread), ${errorCount} errors.`;

  return { summary, results };
}

export default {
  // Cloudflare Cron Trigger Handler
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runDigest(env).then(({ summary }) => {
        console.log(`[Scheduled Cron] ${summary}`);
      })
    );
  },

  // HTTP Handler (for health checks and manual testing)
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/run' || url.pathname === '/') {
      try {
        const result = await runDigest(env);
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
