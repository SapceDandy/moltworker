import type { Sandbox } from '@cloudflare/sandbox';
import { MOLTBOT_PORT } from '../config';
import type { MoltbotEnv } from '../types';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const OPENAI_MINI_MODEL = 'gpt-4o-mini';
const CRON_SYSTEM_PROMPT =
  'You are Kudjo, a concise executive assistant. Respond with bullet points. Keep under 15 lines. Be direct, no fluff.';

/** Call Anthropic Messages API */
async function callAnthropic(
  url: string, apiKey: string, model: string, message: string,
): Promise<{ ok: boolean; text: string }> {
  console.log(`[rpc] Calling Anthropic at ${url} model=${model}`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model, max_tokens: 1024, system: CRON_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    console.error(`[rpc] Anthropic API error ${resp.status}:`, err.slice(0, 500));
    return { ok: false, text: `Anthropic API error ${resp.status}: ${err.slice(0, 200)}` };
  }
  const data = (await resp.json()) as { content?: Array<{ text?: string }> };
  return { ok: true, text: data.content?.[0]?.text || '' };
}

/** Call OpenAI-compatible Chat Completions API (works with OpenAI, Workers AI, etc.) */
async function callOpenAI(
  url: string, apiKey: string, model: string, message: string,
): Promise<{ ok: boolean; text: string }> {
  console.log(`[rpc] Calling OpenAI-compat at ${url} model=${model}`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model, max_tokens: 1024,
      messages: [
        { role: 'system', content: CRON_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    console.error(`[rpc] OpenAI-compat API error ${resp.status}:`, err.slice(0, 500));
    return { ok: false, text: `OpenAI API error ${resp.status}: ${err.slice(0, 200)}` };
  }
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return { ok: true, text: data.choices?.[0]?.message?.content || '' };
}

/**
 * Generate a cron brief using the best available AI provider.
 * Supports: CF AI Gateway (with model override), legacy AI Gateway,
 * direct Anthropic, native CF AI Gateway, and direct OpenAI.
 */
export async function generateCronBrief(
  message: string,
  env: MoltbotEnv,
): Promise<{ ok: boolean; text: string }> {
  try {
    // 1. CF AI Gateway with explicit model override (highest priority — matches container config)
    if (env.CF_AI_GATEWAY_MODEL && env.CLOUDFLARE_AI_GATEWAY_API_KEY &&
        env.CF_AI_GATEWAY_ACCOUNT_ID && env.CF_AI_GATEWAY_GATEWAY_ID) {
      const raw = env.CF_AI_GATEWAY_MODEL;
      const slashIdx = raw.indexOf('/');
      const gwProvider = slashIdx > 0 ? raw.substring(0, slashIdx) : 'anthropic';
      const modelId = slashIdx > 0 ? raw.substring(slashIdx + 1) : raw;
      let gwBase = `https://gateway.ai.cloudflare.com/v1/${env.CF_AI_GATEWAY_ACCOUNT_ID}/${env.CF_AI_GATEWAY_GATEWAY_ID}/${gwProvider}`;
      if (gwProvider === 'workers-ai') gwBase += '/v1';

      console.log(`[rpc] Using CF AI Gateway model override: provider=${gwProvider} model=${modelId}`);
      if (gwProvider === 'anthropic') {
        return await callAnthropic(`${gwBase}/v1/messages`, env.CLOUDFLARE_AI_GATEWAY_API_KEY, modelId, message);
      }
      return await callOpenAI(`${gwBase}/chat/completions`, env.CLOUDFLARE_AI_GATEWAY_API_KEY, modelId, message);
    }

    // 2. Legacy AI Gateway (routes through Anthropic base URL)
    if (env.AI_GATEWAY_API_KEY && env.AI_GATEWAY_BASE_URL) {
      const baseUrl = env.AI_GATEWAY_BASE_URL.replace(/\/+$/, '');
      console.log('[rpc] Using legacy AI Gateway');
      return await callAnthropic(`${baseUrl}/v1/messages`, env.AI_GATEWAY_API_KEY, HAIKU_MODEL, message);
    }

    // 3. Direct Anthropic
    if (env.ANTHROPIC_API_KEY) {
      const baseUrl = env.ANTHROPIC_BASE_URL?.replace(/\/+$/, '') || 'https://api.anthropic.com';
      console.log('[rpc] Using direct Anthropic');
      return await callAnthropic(`${baseUrl}/v1/messages`, env.ANTHROPIC_API_KEY, HAIKU_MODEL, message);
    }

    // 4. Native CF AI Gateway (no model override — default to Anthropic Haiku)
    if (env.CLOUDFLARE_AI_GATEWAY_API_KEY && env.CF_AI_GATEWAY_ACCOUNT_ID && env.CF_AI_GATEWAY_GATEWAY_ID) {
      const baseUrl = `https://gateway.ai.cloudflare.com/v1/${env.CF_AI_GATEWAY_ACCOUNT_ID}/${env.CF_AI_GATEWAY_GATEWAY_ID}/anthropic`;
      console.log('[rpc] Using native CF AI Gateway (Anthropic)');
      return await callAnthropic(`${baseUrl}/v1/messages`, env.CLOUDFLARE_AI_GATEWAY_API_KEY, HAIKU_MODEL, message);
    }

    // 5. Direct OpenAI
    if (env.OPENAI_API_KEY) {
      console.log('[rpc] Using direct OpenAI');
      return await callOpenAI('https://api.openai.com/v1/chat/completions', env.OPENAI_API_KEY, OPENAI_MINI_MODEL, message);
    }

    console.error('[rpc] No API key configured for cron briefs');
    return { ok: false, text: 'No API key configured for cron briefs' };
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
