const USER_ID_STORAGE_KEY = 'talky_user_id';

function generateUserId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `talky-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateUserId(): string {
  const existingUserId = localStorage.getItem(USER_ID_STORAGE_KEY);
  if (existingUserId) {
    return existingUserId;
  }

  const nextUserId = generateUserId();
  localStorage.setItem(USER_ID_STORAGE_KEY, nextUserId);
  return nextUserId;
}

export function normalizeUserId(userId: string | number | null | undefined): string {
  if (userId === null || userId === undefined) {
    return '';
  }

  return String(userId).trim();
}