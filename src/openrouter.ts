import type { Env, RawFeedItem } from './types.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-chat';
const MAX_ITEM_CONTENT_LENGTH = 1500;

function cleanHtmlTags(str: string): string {
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function summarizeFeedItems(
  items: RawFeedItem[],
  feedName: string,
  env: Env
): Promise<string> {
  if (items.length === 0) {
    return '';
  }

  const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not configured');
  }

  const formattedItems = items
    .map((item, index) => {
      const cleaned = cleanHtmlTags(item.content).slice(0, MAX_ITEM_CONTENT_LENGTH);
      return `Item ${index + 1}:
Title: ${item.title}
Link: ${item.link}
Content/Preview: ${cleaned || 'No content preview available'}`;
    })
    .join('\n\n---\n\n');

  const systemPrompt = `You are an objective news digest summarizer.
For each item in the feed, produce a concise, detached 1-2 sentence factual description of what the post discusses, announces, or asks.
Strict requirements:
- Be strictly objective, detached, and concise. No conversational filler, superficial paraphrasing, or hype.
- Output ONLY valid Telegram HTML formatting (allowed tags: <b>, <i>, <a>, <code>). Do NOT use Markdown (no asterisks, no markdown links).
- Format each item exactly like this:
• <a href="EXACT_ITEM_LINK"><b>EXACT_ITEM_TITLE</b></a>
1-2 sentence detached description.

Leave an empty blank line between items.`;

  const userPrompt = `Source: ${feedName}
Here are ${items.length} unread posts to summarize:

${formattedItems}`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/rss-summarizer',
      'X-Title': 'RSS Digest Summarizer',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const output = data.choices?.[0]?.message?.content?.trim();
  if (!output) {
    throw new Error('OpenRouter returned an empty response');
  }

  return output;
}
