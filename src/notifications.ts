import type { MoltbotEnv } from './types';
import { sendDiscordDM } from './cron/discord';

/**
 * Send a Discord DM notification to the owner. Best-effort, never throws.
 */
async function notifyOwner(env: MoltbotEnv, message: string): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_OWNER_USER_ID) return;
  try {
    await sendDiscordDM(env.DISCORD_BOT_TOKEN, env.DISCORD_OWNER_USER_ID, message);
  } catch (err) {
    console.error('[notify] Discord DM failed:', err);
  }
}

/**
 * Notify owner that a task was completed.
 */
export function notifyTaskDone(
  env: MoltbotEnv,
  task: { title: string; project_name?: string | null },
  actor: string,
): Promise<void> {
  const project = task.project_name ? ` (${task.project_name})` : '';
  const by = actor === 'agent@internal' ? 'Kudjo' : actor;
  return notifyOwner(env, `✅ **Task completed** by ${by}\n${task.title}${project}`);
}

/**
 * Notify owner that a blocking comment was added to a task.
 */
export function notifyBlockingComment(
  env: MoltbotEnv,
  task: { title: string },
  content: string,
  actor: string,
): Promise<void> {
  const by = actor === 'agent@internal' ? 'Kudjo' : actor;
  return notifyOwner(env, `⚠️ **Blocking comment** added by ${by}\nTask: ${task.title}\n> ${content}`);
}

/**
 * Notify owner that a blocking comment was resolved.
 */
export function notifyBlockingResolved(
  env: MoltbotEnv,
  task: { title: string },
  content: string,
  actor: string,
): Promise<void> {
  const by = actor === 'agent@internal' ? 'Kudjo' : actor;
  return notifyOwner(env, `✅ **Blocking comment resolved** by ${by}\nTask: ${task.title}\n> ${content}`);
}
