import { getFeedsConfig } from './config.js';
import { fetchFeed } from './parser.js';
import {
  getLastFetchedTime,
  getLastProcessedFeedId,
  getSeenIds,
  markIdsSeen,
  setLastFetchedTime,
  setLastProcessedFeedId,
} from './storage.js';
import { summarizeFeedItems } from './openrouter.js';
import { sendTelegramMessage } from './telegram.js';
import type { DigestResult, Env, FeedConfig } from './types.js';

export interface RunOptions {
  all?: boolean;
  feedId?: string;
  force?: boolean;
}

export async function processFeed(feed: FeedConfig, env: Env): Promise<DigestResult> {
  const result: DigestResult = {
    feedId: feed.id,
    feedName: feed.name,
    totalFetched: 0,
    unreadCount: 0,
    messageSent: false,
  };

  // Record fetch time immediately to prevent stampedes and enforce cooldown
  await setLastFetchedTime(env.RSS_CACHE, feed.id, Date.now());

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

    // 4. Generate detached summaries with OpenRouter
    const summaryList = await summarizeFeedItems(unreadItems, feed.name, env);

    // 5. Build final Telegram message
    const messageHeader = `<b>📰 ${feed.name} Digest</b> (${unreadItems.length} new)\n\n`;
    const fullMessage = `${messageHeader}${summaryList}`;

    // 6. Send to Telegram
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fullMessage);
    result.messageSent = true;

    // 7. Mark items as seen in KV
    const newIds = unreadItems.map((item) => item.id);
    await markIdsSeen(env.RSS_CACHE, feed.id, newIds, seenIds);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error processing feed ${feed.name} (${feed.id}):`, message);
    result.error = message;
  }

  return result;
}

export async function runDigest(
  env: Env,
  options: RunOptions = {}
): Promise<{ summary: string; results: DigestResult[] }> {
  const feeds = getFeedsConfig(env);
  if (feeds.length === 0) {
    return { summary: 'No feeds configured', results: [] };
  }

  const minIntervalHours = parseFloat(env.MIN_FEED_INTERVAL_HOURS || '4');
  const minIntervalMs = minIntervalHours * 60 * 60 * 1000;
  const now = Date.now();

  let targetFeeds: FeedConfig[] = [];

  if (options.feedId) {
    const matched = feeds.find((f) => f.id === options.feedId);
    if (!matched) {
      return { summary: `Feed '${options.feedId}' not found`, results: [] };
    }
    targetFeeds = [matched];
  } else if (options.all) {
    targetFeeds = feeds;
  } else {
    // Round-robin selection mode: pick next eligible feed(s)
    const feedsPerRun = Math.max(1, parseInt(env.FEEDS_PER_RUN || '1', 10));
    const lastFeedId = await getLastProcessedFeedId(env.RSS_CACHE);

    let startIndex = 0;
    if (lastFeedId) {
      const idx = feeds.findIndex((f) => f.id === lastFeedId);
      if (idx !== -1) {
        startIndex = (idx + 1) % feeds.length;
      }
    }

    for (let offset = 0; offset < feeds.length && targetFeeds.length < feedsPerRun; offset++) {
      const candidateIndex = (startIndex + offset) % feeds.length;
      const candidate = feeds[candidateIndex];

      if (options.force) {
        targetFeeds.push(candidate);
      } else {
        const lastFetched = await getLastFetchedTime(env.RSS_CACHE, candidate.id);
        if (!lastFetched || now - lastFetched >= minIntervalMs) {
          targetFeeds.push(candidate);
        }
      }
    }

    if (targetFeeds.length > 0) {
      const lastChosen = targetFeeds[targetFeeds.length - 1];
      await setLastProcessedFeedId(env.RSS_CACHE, lastChosen.id);
    }
  }

  if (targetFeeds.length === 0) {
    return {
      summary: `All ${feeds.length} feeds are on cooldown (< ${minIntervalHours}h since last fetch). Nothing to do.`,
      results: [],
    };
  }

  const results: DigestResult[] = [];

  for (let i = 0; i < targetFeeds.length; i++) {
    const feed = targetFeeds[i];

    if (i > 0) {
      // 2-second polite delay between feeds if processing multiple
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // For explicit --all or --feed runs, check cooldown unless forced
    if (!options.force && (options.all || options.feedId)) {
      const lastFetched = await getLastFetchedTime(env.RSS_CACHE, feed.id);
      if (lastFetched && now - lastFetched < minIntervalMs) {
        const minsAgo = Math.round((now - lastFetched) / 60000);
        results.push({
          feedId: feed.id,
          feedName: feed.name,
          totalFetched: 0,
          unreadCount: 0,
          messageSent: false,
          skipped: true,
          skipReason: `Cooldown active (fetched ${minsAgo}m ago, min interval is ${minIntervalHours}h)`,
        });
        continue;
      }
    }

    const feedResult = await processFeed(feed, env);
    results.push(feedResult);
  }

  const sentCount = results.filter((r) => r.messageSent).length;
  const errorCount = results.filter((r) => r.error).length;
  const skippedCount = results.filter(
    (r) => r.skipped || (!r.messageSent && !r.error && r.unreadCount === 0)
  ).length;

  const summary = `Processed ${results.length} feeds: ${sentCount} sent, ${skippedCount} skipped/no unread, ${errorCount} errors.`;

  return { summary, results };
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_KEY) {
    return false;
  }

  // 1. Check Authorization header: Bearer <key>
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === env.ADMIN_KEY) return true;
  }

  // 2. Check X-Admin-Key header
  const customHeader = request.headers.get('X-Admin-Key');
  if (customHeader && customHeader.trim() === env.ADMIN_KEY) {
    return true;
  }

  return false;
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

    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'rss-summarizer',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (url.pathname === '/run') {
      if (!isAuthorized(request, env)) {
        return new Response(
          JSON.stringify({
            error: 'Unauthorized. Provide valid Authorization: Bearer <ADMIN_KEY> header.',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      try {
        const all = url.searchParams.get('all') === 'true' || url.searchParams.get('all') === '1';
        const force =
          url.searchParams.get('force') === 'true' || url.searchParams.get('force') === '1';
        const feedId = url.searchParams.get('feed') || undefined;

        const result = await runDigest(env, { all, force, feedId });
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
