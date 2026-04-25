/**
 * Mock Redis Client for Testing
 */

export class MockRedisClient {
  private data: Map<string, string> = new Map();
  private hashes: Map<string, Map<string, string>> = new Map();
  private lists: Map<string, string[]> = new Map();
  private sets: Map<string, Set<string>> = new Map();
  private expirations: Map<string, number> = new Map();

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const isNew = !this.hashes.get(key)!.has(field);
    this.hashes.get(key)!.set(field, value);
    return isNew ? 1 : 0;
  }

  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashes.get(key);
    return hash?.get(field) ?? null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries(hash.entries());
  }

  async hdel(key: string, field: string): Promise<number> {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    return hash.delete(field) ? 1 : 0;
  }

  async hexists(key: string, field: string): Promise<number> {
    const hash = this.hashes.get(key);
    return hash?.has(field) ? 1 : 0;
  }

  // String operations
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.data.set(key, value);
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.data.set(key, value);
    this.expirations.set(key, Date.now() + seconds * 1000);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.data.has(key) || this.hashes.has(key) || this.lists.has(key);
    this.data.delete(key);
    this.hashes.delete(key);
    this.lists.delete(key);
    this.expirations.delete(key);
    return existed ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const existed = this.data.has(key) || this.hashes.has(key) || this.lists.has(key);
    if (existed) {
      this.expirations.set(key, Date.now() + seconds * 1000);
    }
    return existed ? 1 : 0;
  }

  // List operations
  async lpush(key: string, value: string): Promise<number> {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    this.lists.get(key)!.unshift(value);
    return this.lists.get(key)!.length;
  }

  async rpush(key: string, value: string): Promise<number> {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    this.lists.get(key)!.push(value);
    return this.lists.get(key)!.length;
  }

  async lpop(key: string): Promise<string | null> {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    return list.shift() ?? null;
  }

  async rpop(key: string): Promise<string | null> {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    return list.pop() ?? null;
  }

  async llen(key: string): Promise<number> {
    return this.lists.get(key)?.length ?? 0;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key);
    if (!list) return [];
    
    // Redis lrange stop is inclusive, JS slice stop is exclusive
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    const list = this.lists.get(key);
    if (!list) return 0;
    
    let removed = 0;
    if (count > 0) {
      // Remove from head
      for (let i = 0; i < list.length && removed < count; i++) {
        if (list[i] === value) {
          list.splice(i, 1);
          removed++;
          i--; // Adjust index after removal
        }
      }
    } else if (count < 0) {
      // Remove from tail
      for (let i = list.length - 1; i >= 0 && removed < Math.abs(count); i--) {
        if (list[i] === value) {
          list.splice(i, 1);
          removed++;
        }
      }
    } else {
      // Remove all
      removed = list.filter(v => v === value).length;
      this.lists.set(key, list.filter(v => v !== value));
    }
    
    return removed;
  }

  async lpos(key: string, value: string): Promise<number | null> {
    const list = this.lists.get(key);
    if (!list) return null;
    const index = list.indexOf(value);
    return index === -1 ? null : index;
  }

  // Set operations
  async sadd(key: string, member: string): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const isNew = !this.sets.get(key)!.has(member);
    this.sets.get(key)!.add(member);
    return isNew ? 1 : 0;
  }

  async srem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    return set.delete(member) ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  async sismember(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    return set?.has(member) ? 1 : 0;
  }

  // Incr/Decr
  async incr(key: string): Promise<number> {
    const current = parseInt(this.data.get(key) ?? '0', 10);
    const newValue = current + 1;
    this.data.set(key, String(newValue));
    return newValue;
  }

  async decr(key: string): Promise<number> {
    const current = parseInt(this.data.get(key) ?? '0', 10);
    const newValue = current - 1;
    this.data.set(key, String(newValue));
    return newValue;
  }

  // Utility
  clear(): void {
    this.data.clear();
    this.hashes.clear();
    this.lists.clear();
    this.sets.clear();
    this.expirations.clear();
  }

  // Debug
  dump(): { data: Record<string, string>; lists: Record<string, string[]> } {
    return {
      data: Object.fromEntries(this.data.entries()),
      lists: Object.fromEntries(
        Array.from(this.lists.entries()).map(([k, v]) => [k, v])
      ),
    };
  }
}