import { describe, expect, it } from 'vitest';
import { parseFeedXml } from '../src/parser.js';

describe('Feed Parser', () => {
  it('parses RSS 2.0 XML correctly', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Tech News</title>
        <link>https://example.com</link>
        <description>Sample feed</description>
        <item>
          <title>Open Source AI Release</title>
          <link>https://example.com/ai-release</link>
          <guid>guid-12345</guid>
          <description>A new model was released today with 70B parameters.</description>
          <pubDate>Mon, 24 Aug 2026 12:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Second Item Without Guid</title>
          <link>https://example.com/second-item</link>
          <description>Description of the second item.</description>
        </item>
      </channel>
    </rss>`;

    const items = parseFeedXml(rssXml);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: 'guid-12345',
      title: 'Open Source AI Release',
      link: 'https://example.com/ai-release',
      content: 'A new model was released today with 70B parameters.',
      publishedAt: 'Mon, 24 Aug 2026 12:00:00 GMT',
    });
    expect(items[1].id).toBe('https://example.com/second-item');
    expect(items[1].title).toBe('Second Item Without Guid');
  });

  it('parses Reddit Atom XML correctly', () => {
    const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>r/LocalLLaMA</title>
      <link rel="self" href="https://www.reddit.com/r/LocalLLaMA/hot.rss" />
      <entry>
        <title>How to run llama.cpp in WebAssembly</title>
        <link href="https://www.reddit.com/r/LocalLLaMA/comments/12345/how_to_run/" />
        <id>t3_12345</id>
        <updated>2026-08-24T10:00:00+00:00</updated>
        <content type="html">&lt;p&gt;Here is a guide on running llama.cpp in the browser...&lt;/p&gt;</content>
      </entry>
    </feed>`;

    const items = parseFeedXml(atomXml);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: 't3_12345',
      title: 'How to run llama.cpp in WebAssembly',
      link: 'https://www.reddit.com/r/LocalLLaMA/comments/12345/how_to_run/',
      content: '<p>Here is a guide on running llama.cpp in the browser...</p>',
      publishedAt: '2026-08-24T10:00:00+00:00',
    });
  });

  it('handles feeds with thousands of XML entities without error', () => {
    const manyEntities = '&lt;b&gt;text&lt;/b&gt;&amp;nbsp;'.repeat(600); // 1800+ entities
    const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>High Entity Feed</title>
      <entry>
        <title>Lots of entities</title>
        <link href="https://example.com/post" />
        <id>t3_entities</id>
        <content type="html">${manyEntities}</content>
      </entry>
    </feed>`;

    const items = parseFeedXml(atomXml);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('t3_entities');
  });

  it('handles empty or malformed XML gracefully', () => {
    expect(parseFeedXml('')).toEqual([]);
    expect(parseFeedXml('<invalid></invalid>')).toEqual([]);
  });
});
