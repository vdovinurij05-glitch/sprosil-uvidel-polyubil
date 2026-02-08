import crypto from 'crypto';
import { config } from '../config';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface ParsedInitData {
  user: TelegramUser;
  authDate: number;
  hash: string;
  queryId?: string;
}

export function validateInitData(initData: string): ParsedInitData | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    const sortedEntries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = sortedEntries.map(([k, v]) => `${k}=${v}`).join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.BOT_TOKEN)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) return null;

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null; // expired after 24h

    const userStr = params.get('user');
    if (!userStr) return null;

    const user: TelegramUser = JSON.parse(userStr);

    return {
      user,
      authDate,
      hash,
      queryId: params.get('query_id') || undefined,
    };
  } catch {
    return null;
  }
}
