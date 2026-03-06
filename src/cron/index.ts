import type { MoltbotEnv } from '../types';
import { morningBrief } from './morning-brief';
import { eveningRecap } from './evening-recap';
import { weeklyReview } from './weekly-review';
import { keepWarm } from './keep-warm';

/**
 * Dispatch scheduled events to the appropriate handler based on cron expression.
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: MoltbotEnv,
): Promise<void> {
  console.log('[CRON] Triggered:', event.cron, 'at', new Date(event.scheduledTime).toISOString());

  try {
    switch (event.cron) {
      case '*/5 * * * *':
        return keepWarm(env);
      case '0 13 * * 1-5':
        return morningBrief(env);
      case '0 23 * * 1-5':
        return eveningRecap(env);
      case '0 23 * * 7':
        return weeklyReview(env);
      default:
        console.log('[CRON] Unknown cron expression:', event.cron);
    }
  } catch (err) {
    console.error('[CRON] Handler failed:', event.cron, err);
  }
}
