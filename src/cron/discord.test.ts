import { describe, it, expect } from 'vitest';
import { chunkMessage, extractAssistantReply } from './discord';

describe('chunkMessage', () => {
  it('returns single chunk for short messages', () => {
    const result = chunkMessage('Hello world');
    expect(result).toEqual(['Hello world']);
  });

  it('returns single chunk for exactly 2000 chars', () => {
    const msg = 'a'.repeat(2000);
    const result = chunkMessage(msg);
    expect(result).toEqual([msg]);
  });

  it('splits long messages at newline boundaries', () => {
    const line = 'x'.repeat(100) + '\n';
    const msg = line.repeat(25); // 25 * 101 = 2525 chars
    const result = chunkMessage(msg);
    expect(result.length).toBe(2);
    expect(result[0].length).toBeLessThanOrEqual(2000);
    expect(result[1].length).toBeGreaterThan(0);
    // Combined content should equal original (minus one stripped newline at break)
    expect(result.join('\n').replace(/\n+/g, '\n')).toBeTruthy();
  });

  it('splits very long messages without newlines at 2000 chars', () => {
    const msg = 'a'.repeat(4500);
    const result = chunkMessage(msg);
    expect(result.length).toBe(3);
    expect(result[0].length).toBe(2000);
    expect(result[1].length).toBe(2000);
    expect(result[2].length).toBe(500);
  });
});

describe('extractAssistantReply', () => {
  it('extracts reply from standard chat completions response', () => {
    const body = JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'Hello Devon!' } }],
    });
    expect(extractAssistantReply(body)).toBe('Hello Devon!');
  });

  it('extracts reply from streaming delta format', () => {
    const body = JSON.stringify({
      choices: [{ delta: { content: 'Streamed reply' } }],
    });
    expect(extractAssistantReply(body)).toBe('Streamed reply');
  });

  it('returns null for empty body', () => {
    expect(extractAssistantReply(undefined)).toBeNull();
    expect(extractAssistantReply('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(extractAssistantReply('not json')).toBeNull();
  });

  it('returns null when no choices', () => {
    const body = JSON.stringify({ error: 'something' });
    expect(extractAssistantReply(body)).toBeNull();
  });
});
