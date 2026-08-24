import { XMLParser } from 'fast-xml-parser';
import type { RawFeedItem } from './types.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false, // Keep raw strings to avoid accidental type conversion
  processEntities: {
    maxTotalExpansions: 500000,
    maxExpandedLength: 10000000,
  },
});

function extractText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node && typeof node === 'object') {
    if ('#text' in node && typeof (node as Record<string, unknown>)['#text'] === 'string') {
      return (node as Record<string, unknown>)['#text'] as string;
    }
  }
  return '';
}

function extractLink(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;

  if (Array.isArray(node)) {
    // Look for alternate link or fallback to first href
    const alt = node.find((item) => item?.['@_rel'] === 'alternate');
    if (alt && alt['@_href']) return alt['@_href'];
    const firstWithHref = node.find((item) => item?.['@_href']);
    if (firstWithHref) return firstWithHref['@_href'];
    return extractText(node[0]);
  }

  if (typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record['@_href'] === 'string') return record['@_href'];
    if (typeof record['#text'] === 'string') return record['#text'];
  }

  return '';
}

export function parseFeedXml(xmlContent: string): RawFeedItem[] {
  const parsed = xmlParser.parse(xmlContent);
  const items: RawFeedItem[] = [];

  // 1. RSS 2.0 / RSS 1.0 format (<rss><channel><item> or <rdf:RDF><item>)
  const rssChannel = parsed?.rss?.channel || parsed?.['rdf:RDF'];
  if (rssChannel) {
    const rawItems = rssChannel.item;
    const itemList = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    for (const item of itemList) {
      const title = extractText(item.title);
      const link = extractLink(item.link);
      const id = extractText(item.guid) || link || title;
      const content = extractText(item['content:encoded']) || extractText(item.description) || '';
      const publishedAt = extractText(item.pubDate) || extractText(item['dc:date']);

      if (id && title) {
        items.push({ id, title, link: link || id, content, publishedAt });
      }
    }
    return items;
  }

  // 2. Atom format (<feed><entry>) - used by Reddit and modern blogs
  const atomFeed = parsed?.feed;
  if (atomFeed) {
    const rawEntries = atomFeed.entry;
    const entryList = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];

    for (const entry of entryList) {
      const title = extractText(entry.title);
      const link = extractLink(entry.link);
      const id = extractText(entry.id) || link || title;
      const content = extractText(entry.content) || extractText(entry.summary) || '';
      const publishedAt = extractText(entry.updated) || extractText(entry.published);

      if (id && title) {
        items.push({ id, title, link: link || id, content, publishedAt });
      }
    }
    return items;
  }

  return items;
}

export async function fetchFeed(
  url: string,
  userAgent?: string,
  maxRetries = 2
): Promise<RawFeedItem[]> {
  const isReddit = url.includes('reddit.com');
  const defaultUA = isReddit
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 (RSS Summarizer Digest)'
    : 'rss-summarizer:v1.0 (feed reader)';

  const headers: Record<string, string> = {
    'Accept': 'application/atom+xml, application/rss+xml, text/xml, application/xml, text/html;q=0.9, */*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': userAgent || defaultUA,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Wait 2s on 1st retry, 4s on 2nd retry
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Feed HTTP ${response.status} ${response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch feed ${url}: ${response.status} ${response.statusText}`);
      }

      const xmlContent = await response.text();
      return parseFeedXml(xmlContent);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry client errors other than 429
      if (lastError.message.includes('HTTP 404') || lastError.message.includes('HTTP 403')) {
        break;
      }
    }
  }

  throw lastError || new Error(`Failed to fetch feed ${url}`);
}
