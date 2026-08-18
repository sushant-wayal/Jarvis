export interface WorkingMemorySlot {
  key: string;
  value: unknown;
  expiresAt: number; // timestamp in ms
}

export class WorkingMemoryService {
  private memoryStore = new Map<string, Map<string, WorkingMemorySlot>>();
  private defaultTtlMs = 15 * 60 * 1000; // 15 minutes default TTL for task state

  private getUserMap(userId: string): Map<string, WorkingMemorySlot> {
    if (!this.memoryStore.has(userId)) {
      this.memoryStore.set(userId, new Map());
    }
    return this.memoryStore.get(userId)!;
  }

  set(userId: string, key: string, value: unknown, ttlMs = this.defaultTtlMs): void {
    const userMap = this.getUserMap(userId);
    userMap.set(key, {
      key,
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get<T = unknown>(userId: string, key: string): T | null {
    const userMap = this.getUserMap(userId);
    const item = userMap.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      userMap.delete(key);
      return null;
    }

    return item.value as T;
  }

  getAll(userId: string): Record<string, unknown> {
    const userMap = this.getUserMap(userId);
    const result: Record<string, unknown> = {};
    const now = Date.now();

    for (const [k, item] of userMap.entries()) {
      if (now > item.expiresAt) {
        userMap.delete(k);
      } else {
        result[k] = item.value;
      }
    }

    return result;
  }

  delete(userId: string, key: string): boolean {
    const userMap = this.getUserMap(userId);
    return userMap.delete(key);
  }

  clear(userId: string): void {
    this.memoryStore.delete(userId);
  }
}

export const workingMemoryService = new WorkingMemoryService();
