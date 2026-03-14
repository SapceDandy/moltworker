import type { MoltbotEnv } from '../types';
import { getIntegration, getValidAccessToken } from '../routes/google';

/**
 * Check Gmail threads for replies on sent email touches.
 * For each touch with a gmail_thread_id, fetch the thread and check if
 * there are new messages (replies) since the touch was sent.
 * Auto-updates email_metrics and optionally advances the cadence.
 *
 * Designed to run every 15 minutes via cron.
 */
export async function checkReplies(env: MoltbotEnv): Promise<void> {
  console.log('[check-replies] Starting Gmail reply check');

  try {
    // Get Google integration
    const integration = await getIntegration(env.DB);
    if (!integration) {
      console.log('[check-replies] No Google integration found, skipping');
      return;
    }

    const accessToken = await getValidAccessToken(integration, env);
    if (!accessToken) {
      console.log('[check-replies] Could not get valid access token, skipping');
      return;
    }

    // Find sent email touches with gmail_thread_id that haven't been marked as replied
    const { results: pendingTouches } = await env.DB.prepare(
      `SELECT tl.id, tl.cadence_id, tl.gmail_thread_id, tl.gmail_message_id, tl.email_metrics, tl.completed_at
       FROM touch_log tl
       JOIN sales_cadences sc ON tl.cadence_id = sc.id
       WHERE tl.gmail_thread_id IS NOT NULL
         AND tl.status = 'completed'
         AND sc.status = 'active'
         AND (tl.email_metrics IS NULL OR tl.email_metrics NOT LIKE '%"replied":true%')
       ORDER BY tl.completed_at DESC
       LIMIT 50`,
    ).all();

    if (pendingTouches.length === 0) {
      console.log('[check-replies] No pending threads to check');
      return;
    }

    console.log(`[check-replies] Checking ${pendingTouches.length} threads`);
    let repliesFound = 0;
    let bouncesFound = 0;

    for (const touch of pendingTouches) {
      try {
        const threadId = touch.gmail_thread_id as string;
        const ourMessageId = touch.gmail_message_id as string;

        // Fetch the Gmail thread
        const resp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!resp.ok) {
          if (resp.status === 404) {
            // Thread deleted or not found — possibly bounced
            await markBounced(env.DB, touch);
            bouncesFound++;
          }
          continue;
        }

        const thread = (await resp.json()) as {
          messages?: Array<{
            id: string;
            labelIds?: string[];
            payload?: { headers?: Array<{ name: string; value: string }> };
          }>;
        };

        if (!thread.messages || thread.messages.length <= 1) {
          // Only our original message — no reply yet
          continue;
        }

        // Check if any message in thread is NOT from us (i.e., a reply)
        const hasReply = thread.messages.some((msg) => {
          if (msg.id === ourMessageId) return false;
          // Check if it's a bounce/delivery failure
          const labels = msg.labelIds || [];
          if (labels.includes('CATEGORY_UPDATES') || labels.includes('SPAM')) return false;
          return true;
        });

        if (hasReply) {
          await markReplied(env.DB, touch);
          repliesFound++;
        }

        // Check for bounce indicators
        const hasBounce = thread.messages.some((msg) => {
          const labels = msg.labelIds || [];
          const fromHeader = msg.payload?.headers?.find((h) => h.name.toLowerCase() === 'from')?.value || '';
          return (
            labels.includes('CATEGORY_UPDATES') &&
            (fromHeader.includes('mailer-daemon') || fromHeader.includes('postmaster'))
          );
        });

        if (hasBounce) {
          await markBounced(env.DB, touch);
          bouncesFound++;
        }
      } catch (err) {
        console.error(`[check-replies] Error checking thread for touch ${touch.id}:`, err);
      }
    }

    console.log(`[check-replies] Done. Replies: ${repliesFound}, Bounces: ${bouncesFound}`);
  } catch (err) {
    console.error('[check-replies] Fatal error:', err);
  }
}

async function markReplied(db: D1Database, touch: Record<string, unknown>): Promise<void> {
  const existing = touch.email_metrics ? JSON.parse(touch.email_metrics as string) : {};
  existing.replied = true;
  existing.replied_at = new Date().toISOString();

  await db.prepare(
    'UPDATE touch_log SET email_metrics = ? WHERE id = ?',
  ).bind(JSON.stringify(existing), touch.id as string).run();

  // Update cadence health to signal positive engagement
  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE sales_cadences SET health = 'on_track', updated_at = ? WHERE id = ?",
  ).bind(now, touch.cadence_id as string).run();

  console.log(`[check-replies] Marked replied: touch=${touch.id} cadence=${touch.cadence_id}`);
}

async function markBounced(db: D1Database, touch: Record<string, unknown>): Promise<void> {
  const existing = touch.email_metrics ? JSON.parse(touch.email_metrics as string) : {};
  if (existing.bounced) return; // Already marked

  existing.bounced = true;
  existing.bounced_at = new Date().toISOString();

  await db.prepare(
    'UPDATE touch_log SET email_metrics = ? WHERE id = ?',
  ).bind(JSON.stringify(existing), touch.id as string).run();

  // Mark cadence as at_risk if email bounced
  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE sales_cadences SET health = 'at_risk', updated_at = ? WHERE id = ?",
  ).bind(now, touch.cadence_id as string).run();

  console.log(`[check-replies] Marked bounced: touch=${touch.id} cadence=${touch.cadence_id}`);
}
