const DISCORD_API = 'https://discord.com/api/v10';
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Send a DM to a Discord user via the Discord REST API.
 * Handles message chunking for content > 2000 chars.
 *
 * Returns true if at least one message was sent successfully.
 */
export async function sendDiscordDM(
  botToken: string,
  userId: string,
  content: string,
): Promise<boolean> {
  const headers = {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
  };

  // Step 1: Create/get DM channel
  const channelResp = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipient_id: userId }),
  });

  if (!channelResp.ok) {
    const errText = await channelResp.text().catch(() => '');
    console.error('[discord] Failed to create DM channel:', channelResp.status, errText);
    return false;
  }

  const channel = (await channelResp.json()) as { id: string };
  const channelId = channel.id;

  // Step 2: Send message(s), chunking if necessary
  const chunks = chunkMessage(content);
  let success = false;

  for (const chunk of chunks) {
    const msgResp = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: chunk }),
    });

    if (msgResp.ok) {
      success = true;
    } else {
      const errText = await msgResp.text().catch(() => '');
      console.error('[discord] Failed to send message:', msgResp.status, errText);
    }
  }

  return success;
}

/**
 * Split a message into chunks that fit within Discord's 2000-char limit.
 * Tries to break at newlines for readability.
 */
export function chunkMessage(content: string): string[] {
  if (content.length <= MAX_MESSAGE_LENGTH) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to break at a newline near the limit
    let breakAt = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    if (breakAt < MAX_MESSAGE_LENGTH * 0.5) {
      // No good newline break, just break at the limit
      breakAt = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt).replace(/^\n/, '');
  }

  return chunks;
}

/**
 * Extract the assistant's reply from an OpenAI-compatible chat completions response body.
 */
export function extractAssistantReply(responseBody: string | undefined): string | null {
  if (!responseBody) return null;
  try {
    const data = JSON.parse(responseBody);
    return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}
