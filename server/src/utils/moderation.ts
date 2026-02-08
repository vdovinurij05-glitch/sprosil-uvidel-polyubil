const BANNED_WORDS = [
  // Russian toxic/18+ words (basic filter)
  'блять', 'сука', 'хуй', 'пизд', 'ебат', 'ёбан', 'нахуй', 'пиздец',
  'мудак', 'дебил', 'идиот', 'урод', 'шлюх', 'проститу',
  // English
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy',
];

const BANNED_PATTERNS = BANNED_WORDS.map(w => new RegExp(w, 'gi'));

export function containsToxicContent(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^\wа-яё]/gi, '');
  return BANNED_PATTERNS.some(pattern => pattern.test(normalized));
}

export function sanitizeText(text: string): string {
  return text.trim().slice(0, 500);
}
