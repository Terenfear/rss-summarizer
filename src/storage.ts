const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_SAVED_IDS = 500; // Cap to keep KV payload small

export async function getSeenIds(kv: KVNamespace, feedId: string): Promise<Set<string>> {
  if (!kv) {
    console.warn('KVNamespace not available, treating all items as unread');
    return new Set<string>();
  }

  try {
    const raw = await kv.get(`seen:${feedId}`, 'json');
    if (Array.isArray(raw)) {
      return new Set<string>(raw.map(String));
    }
  } catch (err) {
    console.warn(`Failed to read seen IDs for feed ${feedId}:`, err);
  }

  return new Set<string>();
}

export async function markIdsSeen(
  kv: KVNamespace,
  feedId: string,
  newIds: string[],
  existingSeenIds: Set<string> = new Set()
): Promise<void> {
  if (!kv || newIds.length === 0) return;

  try {
    // Combine existing and new IDs, keeping the newest at the end
    const combined = Array.from(new Set([...existingSeenIds, ...newIds]));
    // Keep at most MAX_SAVED_IDS
    const trimmed = combined.slice(-MAX_SAVED_IDS);

    await kv.put(`seen:${feedId}`, JSON.stringify(trimmed), {
      expirationTtl: DEFAULT_TTL_SECONDS,
    });
  } catch (err) {
    console.error(`Failed to update seen IDs for feed ${feedId}:`, err);
  }
}
