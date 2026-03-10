import type { Sandbox } from '@cloudflare/sandbox';
import { MOLTBOT_PORT } from '../config';

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
