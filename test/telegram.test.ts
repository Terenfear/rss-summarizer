import { describe, expect, it } from 'vitest';
import { splitTelegramMessage } from '../src/telegram.js';

describe('Telegram Message Splitter', () => {
  it('does not split messages shorter than limit', () => {
    const text = 'Short message';
    const chunks = splitTelegramMessage(text, 4000);
    expect(chunks).toEqual(['Short message']);
  });

  it('splits long messages along paragraph boundaries', () => {
    const p1 = 'A'.repeat(2500);
    const p2 = 'B'.repeat(2000);
    const text = `${p1}\n\n${p2}`;

    const chunks = splitTelegramMessage(text, 3000);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(p1);
    expect(chunks[1]).toBe(p2);
  });

  it('splits long paragraphs along newline boundaries if too large', () => {
    const line1 = 'C'.repeat(1800);
    const line2 = 'D'.repeat(1800);
    const paragraph = `${line1}\n${line2}`;

    const chunks = splitTelegramMessage(paragraph, 2000);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(line1);
    expect(chunks[1]).toBe(line2);
  });

  it('splits very long strings without breaks if necessary', () => {
    const huge = 'X'.repeat(500);
    const chunks = splitTelegramMessage(huge, 200);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(200);
    expect(chunks[1].length).toBe(200);
    expect(chunks[2].length).toBe(100);
  });
});
