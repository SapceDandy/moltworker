import type { Sandbox } from '@cloudflare/sandbox';
import { MOLTBOT_PORT } from '../config';
import type { MoltbotEnv } from '../types';

const CRON_CODE_VERSION = 'v3-2026-03-15';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const OPENAI_MINI_MODEL = 'gpt-4o-mini';
const CRON_SYSTEM_PROMPT =
  'You are Kudjo, a concise executive assistant. Respond with bullet points. Keep under 15 lines. Be direct, no fluff.';

type ProviderCall = () => Promise<{ ok: boolean; text: string }>;

/** Call Anthropic Messages API */
async function callAnthropic(
  url: string, apiKey: string, model: string, message: string, systemPrompt?: string,
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
      model, max_tokens: 2048, system: systemPrompt || CRON_SYSTEM_PROMPT,
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
  url: string, apiKey: string, model: string, message: string, systemPrompt?: string,
): Promise<{ ok: boolean; text: string }> {
  console.log(`[rpc] Calling OpenAI-compat at ${url} model=${model}`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model, max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt || CRON_SYSTEM_PROMPT },
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
 * Build an ordered list of provider calls from the environment.
 * Each entry is a lazy thunk so we only call the provider if prior ones failed.
 */
function buildProviderChain(
  env: MoltbotEnv, message: string, systemPrompt?: string,
): Array<{ name: string; call: ProviderCall }> {
  const chain: Array<{ name: string; call: ProviderCall }> = [];

  // 1. CF AI Gateway with explicit model override (highest priority)
  if (env.CF_AI_GATEWAY_MODEL && env.CLOUDFLARE_AI_GATEWAY_API_KEY &&
      env.CF_AI_GATEWAY_ACCOUNT_ID && env.CF_AI_GATEWAY_GATEWAY_ID) {
    const raw = env.CF_AI_GATEWAY_MODEL;
    const slashIdx = raw.indexOf('/');
    const gwProvider = slashIdx > 0 ? raw.substring(0, slashIdx) : 'anthropic';
    const modelId = slashIdx > 0 ? raw.substring(slashIdx + 1) : raw;
    let gwBase = `https://gateway.ai.cloudflare.com/v1/${env.CF_AI_GATEWAY_ACCOUNT_ID}/${env.CF_AI_GATEWAY_GATEWAY_ID}/${gwProvider}`;
    if (gwProvider === 'workers-ai') gwBase += '/v1';
    if (gwProvider === 'anthropic') {
      chain.push({ name: `cf-ai-gw-override(${modelId})`, call: () => callAnthropic(`${gwBase}/v1/messages`, env.CLOUDFLARE_AI_GATEWAY_API_KEY!, modelId, message, systemPrompt) });
    } else {
      chain.push({ name: `cf-ai-gw-override(${modelId})`, call: () => callOpenAI(`${gwBase}/chat/completions`, env.CLOUDFLARE_AI_GATEWAY_API_KEY!, modelId, message, systemPrompt) });
    }
  }

  // 2. Legacy AI Gateway
  if (env.AI_GATEWAY_API_KEY && env.AI_GATEWAY_BASE_URL) {
    const baseUrl = env.AI_GATEWAY_BASE_URL.replace(/\/+$/, '');
    chain.push({ name: 'legacy-ai-gateway', call: () => callAnthropic(`${baseUrl}/v1/messages`, env.AI_GATEWAY_API_KEY!, HAIKU_MODEL, message, systemPrompt) });
  }

  // 3. Direct Anthropic
  if (env.ANTHROPIC_API_KEY) {
    const baseUrl = env.ANTHROPIC_BASE_URL?.replace(/\/+$/, '') || 'https://api.anthropic.com';
    chain.push({ name: 'direct-anthropic', call: () => callAnthropic(`${baseUrl}/v1/messages`, env.ANTHROPIC_API_KEY!, HAIKU_MODEL, message, systemPrompt) });
  }

  // 4. Native CF AI Gateway (no model override)
  if (env.CLOUDFLARE_AI_GATEWAY_API_KEY && env.CF_AI_GATEWAY_ACCOUNT_ID && env.CF_AI_GATEWAY_GATEWAY_ID) {
    const baseUrl = `https://gateway.ai.cloudflare.com/v1/${env.CF_AI_GATEWAY_ACCOUNT_ID}/${env.CF_AI_GATEWAY_GATEWAY_ID}/anthropic`;
    chain.push({ name: 'cf-ai-gw-anthropic', call: () => callAnthropic(`${baseUrl}/v1/messages`, env.CLOUDFLARE_AI_GATEWAY_API_KEY!, HAIKU_MODEL, message, systemPrompt) });
  }

  // 5. Direct OpenAI
  if (env.OPENAI_API_KEY) {
    chain.push({ name: 'direct-openai', call: () => callOpenAI('https://api.openai.com/v1/chat/completions', env.OPENAI_API_KEY!, OPENAI_MINI_MODEL, message, systemPrompt) });
  }

  return chain;
}

/**
 * Try each provider in the chain until one succeeds.
 * If all fail, return the last error.
 */
async function tryProviderChain(
  chain: Array<{ name: string; call: ProviderCall }>,
): Promise<{ ok: boolean; text: string }> {
  if (chain.length === 0) {
    console.error('[rpc] No API keys configured');
    return { ok: false, text: 'No API key configured' };
  }

  let lastResult: { ok: boolean; text: string } = { ok: false, text: 'No providers available' };
  for (const provider of chain) {
    try {
      console.log(`[rpc] Trying provider: ${provider.name}`);
      const result = await provider.call();
      if (result.ok) {
        console.log(`[rpc] Provider ${provider.name} succeeded`);
        return result;
      }
      // Provider responded but returned an error — try next
      console.warn(`[rpc] Provider ${provider.name} failed: ${result.text.slice(0, 150)}`);
      lastResult = result;
    } catch (err) {
      console.error(`[rpc] Provider ${provider.name} threw:`, err);
      lastResult = { ok: false, text: `${provider.name}: ${String(err)}` };
    }
  }

  console.error('[rpc] All providers failed');
  return lastResult;
}

/**
 * Generate a cron brief using the best available AI provider.
 * Tries each configured provider in priority order; falls through on failure.
 */
export async function generateCronBrief(
  message: string,
  env: MoltbotEnv,
): Promise<{ ok: boolean; text: string }> {
  console.log(`[rpc] generateCronBrief code_version=${CRON_CODE_VERSION} haiku_model=${HAIKU_MODEL}`);
  const chain = buildProviderChain(env, message);
  return tryProviderChain(chain);
}

/**
 * Generate an AI brief with a custom system prompt.
 * Tries each configured provider in priority order; falls through on failure.
 */
export async function generateAiBrief(
  message: string,
  env: MoltbotEnv,
  systemPrompt: string,
): Promise<{ ok: boolean; text: string }> {
  console.log(`[rpc] generateAiBrief code_version=${CRON_CODE_VERSION}`);
  const chain = buildProviderChain(env, message, systemPrompt);
  return tryProviderChain(chain);
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
