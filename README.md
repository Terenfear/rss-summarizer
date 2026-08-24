# RSS Summarizer (Cloudflare Worker + OpenRouter + Telegram)

A lightweight, serverless RSS/Atom & Subreddit digest engine running on Cloudflare Workers. It periodically fetches your favorite feeds, deduplicates seen posts using Cloudflare KV, generates concise, detached 1–2 sentence factual summaries via OpenRouter, and delivers formatted digests directly to your Telegram chat or channel.

---

## ✨ Features

- **No New Items = No Noise:** Only sends a Telegram message for a feed if there are new unread posts.
- **Feed Separation:** Sends an individual digest post per feed/subreddit with clickable HTML links and detached bullet points.
- **Detached, Factual Descriptions:** Prompted to produce objective summaries of what each post discusses or announces (no conversational fluff or shallow paraphrasing).
- **Subreddit & RSS/Atom Support:** Out-of-the-box support for standard RSS 2.0, RSS 1.0, and Atom (including Reddit `/r/.../hot.rss` with custom `User-Agent`).
- **Flexible LLM Models:** Uses OpenRouter API with switchable models via environment variable (default: `deepseek/deepseek-chat`).
- **Zero Heavy Dependencies:** Lightweight native `fetch` requests with `fast-xml-parser`.
- **Message Chunking:** Automatically splits digests across multiple messages if content exceeds Telegram's 4096-character limit.
- **Private Feed Configuration:** Keep your personal feed list in an uncommitted `feeds.json` file.

---

## 📁 Project Structure

```text
rss-summarizer/
├── .gitignore              # Ignores feeds.json, .dev.vars, .wrangler, node_modules
├── feeds.example.json      # Committed template for feed list
├── feeds.json              # (Optional) Your local, uncommitted feed list
├── wrangler.toml           # Worker configuration, KV binding, Cron trigger
├── src/
│   ├── index.ts            # Cron handler + HTTP endpoints (/run, /health)
│   ├── config.ts           # Config loader (feeds.json with fallback to feeds.example.json)
│   ├── parser.ts           # Minimal RSS 2.0 and Atom XML parser
│   ├── storage.ts          # Cloudflare Workers KV state manager with 30-day TTL
│   ├── openrouter.ts       # OpenRouter client & objective prompt builder
│   ├── telegram.ts         # Telegram Bot client (HTML parse mode & chunker)
│   └── types.ts            # TypeScript interfaces
└── test/                   # Unit test suite (Vitest)
```

---

## 🚀 Getting Started

### 1. Prerequisites

1. **Telegram Bot Token:**
   - Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot (`/newbot`).
   - Copy the API token.
2. **Telegram Chat ID:**
   - Send a message to your bot or add it to your channel/group.
   - Forward a message to [@userinfobot](https://t.me/userinfobot) or visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` to get your `chat_id`.
3. **OpenRouter API Key:**
   - Get an API key from [OpenRouter.ai](https://openrouter.ai/keys).
4. **Cloudflare Account & Wrangler CLI:**
   - Make sure you are logged in to Cloudflare CLI:
     ```bash
     npx wrangler login
     ```

---

### 2. Configure Feeds

Create your private `feeds.json` from the example template:

```bash
cp feeds.example.json feeds.json
```

Edit `feeds.json` to include any subreddits or RSS/Atom feeds:

```json
[
  {
    "id": "r-localllama",
    "name": "r/LocalLLaMA",
    "url": "https://www.reddit.com/r/LocalLLaMA/hot.rss"
  },
  {
    "id": "hn-frontpage",
    "name": "Hacker News",
    "url": "https://news.ycombinator.com/rss"
  }
]
```

> **Note:** `feeds.json` is in `.gitignore` so your private feeds are not committed to git.

---

### 3. Local Development & Testing

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up local secrets in `.dev.vars`:**
   Create a `.dev.vars` file in the root directory:
   ```ini
   OPENROUTER_API_KEY=sk-or-v1-...
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   TELEGRAM_CHAT_ID=your_chat_id
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Trigger a test digest run:**
   Open a browser or run:
   ```bash
   curl http://localhost:8787/run
   ```
   You should see JSON output describing the processed feeds and receive a Telegram message if unread items exist.

---

### 4. Running Unit Tests & Typechecks

```bash
# Run unit tests
npm test

# Run TypeScript type check
npm run typecheck
```

---

### 5. Deploying to Cloudflare

1. **Create the Cloudflare Workers KV Namespace:**
   ```bash
   npx wrangler kv namespace create RSS_CACHE
   ```
   Copy the generated namespace `id` and update `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "RSS_CACHE"
   id = "YOUR_KV_NAMESPACE_ID"
   ```

2. **Set Secret Environment Variables in Cloudflare:**
   ```bash
   npx wrangler secret put OPENROUTER_API_KEY
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```

3. **Deploy the Worker:**
   ```bash
   npm run deploy
   ```

---

## ⚙️ Configuration & Environment Variables

| Variable | Location | Default / Example | Description |
| :--- | :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | Secret (`wrangler secret put`) | `sk-or-...` | OpenRouter authentication key |
| `TELEGRAM_BOT_TOKEN` | Secret (`wrangler secret put`) | `123456:ABC...` | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Secret / Var | `123456789` | Target Telegram chat or channel ID |
| `OPENROUTER_MODEL` | `wrangler.toml` (`[vars]`) | `deepseek/deepseek-chat` | LLM model identifier on OpenRouter |
| `USER_AGENT` | `wrangler.toml` (`[vars]`) | `rss-summarizer:v1.0...` | Custom User-Agent (crucial for Reddit RSS) |
| `MAX_ITEMS_PER_FEED` | `wrangler.toml` (`[vars]`) | `15` | Max unread items to summarize per feed run |
| `FEEDS_CONFIG` | Secret / Var (Optional) | `[{"id":"...","name":"...","url":"..."}]` | JSON string override for feed list |

---

## ⏰ Cron Schedule

By default, the worker runs every 4 hours (`0 */4 * * *`). You can change this schedule in `wrangler.toml`:

```toml
[triggers]
crons = ["0 */4 * * *"]
```

---

## 📄 License

MIT
