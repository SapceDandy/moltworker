import type { MoltbotEnv } from '../types';
import { decrypt, encrypt } from '../lib/crypto';

/**
 * Fetch today's (or a specific date's) calendar events from all connected Google accounts.
 * Used by cron handlers to include calendar context in briefs/recaps.
 * Returns an empty array if no accounts are connected or if Google is not configured.
 */
export async function fetchCalendarEventsForCron(
  env: MoltbotEnv,
  date: string,
): Promise<Array<Record<string, unknown>>> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKEN_ENCRYPTION_KEY) {
    return [];
  }

  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM integrations WHERE provider = 'google'",
    ).all();

    if (!results || results.length === 0) return [];

    const allEvents: Array<Record<string, unknown>> = [];

    for (const integration of results as Array<Record<string, unknown>>) {
      try {
        const token = await getValidToken(integration, env);
        if (!token) continue;

        const timeMin = `${date}T00:00:00Z`;
        const timeMax = `${date}T23:59:59Z`;
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '50',
        });

        const resp = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (resp.ok) {
          const data = (await resp.json()) as { items?: Array<Record<string, unknown>> };
          for (const item of data.items ?? []) {
            allEvents.push({
              summary: item.summary,
              start: item.start,
              end: item.end,
              location: item.location,
              account_email: integration.account_email,
              account_label: integration.account_label,
            });
          }
        }
      } catch (err) {
        console.error('[CRON] Calendar fetch failed for account:', integration.account_email, err);
      }
    }

    return allEvents;
  } catch (err) {
    console.error('[CRON] Calendar events query failed:', err);
    return [];
  }
}

async function getValidToken(
  integration: Record<string, unknown>,
  env: MoltbotEnv,
): Promise<string | null> {
  const expiry = integration.token_expiry as string | null;
  const now = new Date().toISOString();

  if (expiry && expiry > now) {
    return decrypt(integration.access_token_enc as string, env.TOKEN_ENCRYPTION_KEY!);
  }

  // Try refresh
  const refreshEnc = integration.refresh_token_enc as string | null;
  if (!refreshEnc) return null;

  const refreshToken = await decrypt(refreshEnc, env.TOKEN_ENCRYPTION_KEY!);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) return null;

  const tokens = (await resp.json()) as { access_token: string; expires_in: number };
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const newAccessEnc = await encrypt(tokens.access_token, env.TOKEN_ENCRYPTION_KEY!);

  await env.DB.prepare(
    'UPDATE integrations SET access_token_enc = ?, token_expiry = ?, updated_at = ? WHERE id = ?',
  )
    .bind(newAccessEnc, newExpiry, now, integration.id)
    .run();

  return tokens.access_token;
}
