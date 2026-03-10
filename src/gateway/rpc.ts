import type { Sandbox } from '@cloudflare/sandbox';
import { MOLTBOT_PORT } from '../config';
import type { MoltbotEnv } from '../types';

const HAIKU_MODEL = 'claude-3-5-haiku-20241022';
const CRON_SYSTEM_PROMPT =
  'You are Kudjo, a concise executive assistant. Respond with bullet points. Keep under 15 lines. Be direct, no fluff.';

/**
 * Call Anthropic Messages API directly with Haiku for cost-efficient cron briefs.
 * Bypasses OpenClaw gateway (saves ~14,700 system prompt tokens per call).
 * Falls back gracefully if no API key is configured.
 */
export async function generateCronBrief(
  message: string,
  env: MoltbotEnv,
): Promise<{ ok: boolean; text: string }> {
  let apiKey: string | undefined;
  let baseUrl = 'https://api.anthropic.com';

  // Determine API key and base URL from available env vars
  if (env.AI_GATEWAY_API_KEY && env.AI_GATEWAY_BASE_URL) {
    apiKey = env.AI_GATEWAY_API_KEY;
    baseUrl = env.AI_GATEWAY_BASE_URL.replace(/\/+$/, '');
  } else if (env.ANTHROPIC_API_KEY) {
    apiKey = env.ANTHROPIC_API_KEY;
    if (env.ANTHROPIC_BASE_URL) baseUrl = env.ANTHROPIC_BASE_URL.replace(/\/+$/, '');
  }

  if (!apiKey && env.CLOUDFLARE_AI_GATEWAY_API_KEY && env.CF_AI_GATEWAY_ACCOUNT_ID && env.CF_AI_GATEWAY_GATEWAY_ID) {
    apiKey = env.CLOUDFLARE_AI_GATEWAY_API_KEY;
    baseUrl = `https://gateway.ai.cloudflare.com/v1/${env.CF_AI_GATEWAY_ACCOUNT_ID}/${env.CF_AI_GATEWAY_GATEWAY_ID}/anthropic`;
  }

  if (!apiKey) {
    return { ok: false, text: 'No Anthropic API key configured for direct cron calls' };
  }

  try {
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 1024,
        system: CRON_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error(`[rpc] Anthropic API error ${resp.status}:`, err);
      return { ok: false, text: `API error ${resp.status}` };
    }

    const data = (await resp.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text || '';
    return { ok: true, text };
  } catch (err) {
    console.error('[rpc] generateCronBrief failed:', err);
    return { ok: false, text: String(err) };
  }
}

/**
 * Send a chat message to the OpenClaw gateway session via the
 * OpenAI-compatible /v1/chat/completions HTTP API.
 *
 * Requires gateway.http.endpoints.chatCompletions.enabled = true in config.
 * Uses a fixed session key ("cron-system") so all cron messages share one session.
 */
export async function sendSessionMessage(
  sandbox: Sandbox,
  message: string,
  token?: string,
): Promise<{ ok: boolean; status: number; body?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-openclaw-agent-id': 'main',
    'x-openclaw-session-key': 'cron-system',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const resp = await sandbox.containerFetch(
      new Request(`http://localhost:${MOLTBOT_PORT}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'openclaw:main',
          messages: [{ role: 'user', content: message }],
          max_tokens: 1024,
        }),
      }),
      MOLTBOT_PORT,
    );

    const body = await resp.text().catch(() => '');
    return { ok: resp.ok, status: resp.status, body };
  } catch (err) {
    console.error('[rpc] sendSessionMessage failed:', err);
    return { ok: false, status: 0, body: String(err) };
  }
}
