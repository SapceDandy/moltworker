import { getSandbox, type SandboxOptions } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import { MOLTBOT_PORT } from '../config';
import { ensureMoltbotGateway } from '../gateway';

/**
 * Keep-warm ping: ensure sandbox and gateway are alive.
 */
export async function keepWarm(env: MoltbotEnv): Promise<void> {
  try {
    const sleepAfter = env.SANDBOX_SLEEP_AFTER?.toLowerCase() || 'never';
    const options: SandboxOptions =
      sleepAfter === 'never' ? { keepAlive: true } : { sleepAfter };

    const sandbox = getSandbox(env.Sandbox, 'moltbot', options);
    await ensureMoltbotGateway(sandbox, env);

    const healthResp = await sandbox.containerFetch(
      new Request('http://localhost/health'),
      MOLTBOT_PORT,
    );
    if (healthResp.status === 200) {
      console.log('[CRON] Keep-warm health: OK');
    } else {
      console.error('[CRON] Keep-warm health: UNHEALTHY status', healthResp.status, '— gateway may need restart');
    }
  } catch (err) {
    console.error('[CRON] Keep-warm failed:', err);
  }
}
