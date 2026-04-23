type MessageLike = {
  id?: number | string | null;
  username?: string | null;
  content?: string | null;
  createdAt?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
};

export function getMessageKey(message: MessageLike): string {
  if (message.id !== undefined && message.id !== null) {
    return `id:${message.id}`;
  }

  const username = (message.username || '').trim().toLowerCase();
  const content = (message.content || '').trim();
  const createdAt = message.createdAt || '';
  const fileUrl = message.fileUrl || '';
  const fileName = message.fileName || '';

  return `sig:${username}|${content}|${createdAt}|${fileUrl}|${fileName}`;
}

export function dedupeMessages<T extends MessageLike>(messages: T[]): T[] {
  const seen = new Set<string>();

  return messages.filter((message) => {
    const key = getMessageKey(message);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function appendUniqueMessage<T extends MessageLike>(messages: T[], message: T): T[] {
  const nextKey = getMessageKey(message);
  if (messages.some((existingMessage) => getMessageKey(existingMessage) === nextKey)) {
    return messages;
  }

  return [...messages, message];
}