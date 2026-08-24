const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const MAX_MESSAGE_LENGTH = 4000;

export function splitTelegramMessage(text: string, maxLength = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;

    // If single paragraph is larger than maxLength, split by newline
    if (paragraph.length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      const lines = paragraph.split('\n');
      for (const line of lines) {
        if (line.length > maxLength) {
          // Hard split if line itself is longer than maxLength
          for (let i = 0; i < line.length; i += maxLength) {
            chunks.push(line.slice(i, i + maxLength));
          }
        } else if ((currentChunk + '\n' + line).length > maxLength) {
          chunks.push(currentChunk.trim());
          currentChunk = line;
        } else {
          currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
        }
      }
      continue;
    }

    if ((currentChunk + '\n\n' + paragraph).length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  htmlContent: string
): Promise<void> {
  if (!botToken || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing');
  }

  const chunks = splitTelegramMessage(htmlContent);

  for (const chunk of chunks) {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // If HTML parsing failed, attempt sending as plain text fallback
      if (errorText.includes("can't parse entities")) {
        console.warn('Telegram HTML parse failed, falling back to plain text send');
        const fallbackResponse = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk.replace(/<[^>]*>/g, ''),
            disable_web_page_preview: true,
          }),
        });
        if (!fallbackResponse.ok) {
          const fallbackErr = await fallbackResponse.text();
          throw new Error(`Telegram API fallback error (${fallbackResponse.status}): ${fallbackErr}`);
        }
      } else {
        throw new Error(`Telegram API error (${response.status}): ${errorText}`);
      }
    }
  }
}
