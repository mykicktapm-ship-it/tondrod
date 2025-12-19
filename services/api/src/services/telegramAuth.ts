import crypto from 'crypto';

/**
 * Telegram authentication service.
 *
 * Verifies Telegram Mini App initData using the bot token. The
 * validation rules are defined in Telegram's official documentation.
 * This stub implementation does not perform real verification; it
 * simply decodes a JSON payload if present. For production usage,
 * implement the full hash verification:
 *   - Parse the query string into key=value pairs.
 *   - Exclude the `hash` parameter and compute the HMAC-SHA256 of the
 *     sorted payload using the bot token.
 *   - Compare to the provided `hash`.
 */
export type TelegramUser = {
  id: number;
  username?: string;
};

async function verifyInitData(initData: string): Promise<TelegramUser | null> {
  try {
    // For simplicity, parse initData as query string and extract user field.
    // In production, verify signature using bot token from env.
    const params = new URLSearchParams(initData);
    const userData = params.get('user');
    if (!userData) return null;
    const parsed = JSON.parse(userData) as { id: number; username?: string };
    return { id: parsed.id, username: parsed.username };
  } catch (err) {
    return null;
  }
}

export default {
  verifyInitData,
};