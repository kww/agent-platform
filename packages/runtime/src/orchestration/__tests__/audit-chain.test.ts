/**
 * 审计链测试
 */

import { AuditChain, createAuditChain } from '../audit-chain';
import { ContextSharer } from '../context-sharer';
import type { RedisClient } from '../context-sharer';

// Mock Redis
class MockRedis implements RedisClient {
  private data: Record<string, string> = {};

  async hset(key: string, field: string, value: string): Promise<number> {
    this.data[`${key}:${field}`] = value;
    return 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.data[`${key}:${field}`] ?? null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const k of Object.keys(this.data)) {
      if (k.startsWith(key + ':')) {
        result[k.slice(key.length + 1)] = this.data[k];
      }
    }
    return result;
  }

  async hdel(): Promise<number> { return 0; }
  async hexists(): Promise<number> { return 0; }
  async del(): Promise<number> { return 0; }
  async expire(): Promise<number> { return 0; }

  async set(key: string, value: string) {
    this.data[key] = value;
  }

  async get(key: string): Promise<string | null> {
    return this.data[key] ?? null;
  }
}

describe('AuditChain', () => {
  let chain: AuditChain;
  let mockRedis: MockRedis;
  let mockContextSharer: ContextSharer;

  beforeEach(() => {
    mockRedis = new MockRedis();
    mockContextSharer = new ContextSharer({
      redis: mockRedis,
      executionId: 'test-execution',
    });
    
    chain = createAuditChain({
      contextSharer: mockContextSharer,
      signingKey: 'test-key',
    });
  });

  describe('Record audit', () => {
    it('should record first entry with genesis hash', async () => {
      const entry = await chain.record('task_created', {
        taskId: 'task-1',
        name: 'Test task',
      });

      expect(entry).toBeDefined();
      expect(entry.id).toMatch(/^audit-/);
      expect(entry.previousHash).toBe('genesis');
      expect(entry.currentHash).toMatch(/^sha256:/);
      expect(entry.signature).toMatch(/^sig:/);
    });

    it('should chain entries with previous hash', async () => {
      const entry1 = await chain.record('task_created', { taskId: 'task-1' });
      const entry2 = await chain.record('task_transitioned', { taskId: 'task-1', from: 'pending', to: 'running' });

      expect(entry2.previousHash).toBe(entry1.currentHash);
      expect(entry2.previousHash).not.toBe('genesis');
    });

    it('should include signer in entry', async () => {
      const entry = await chain.record('message_sent', {
        meetingId: 'meeting-1',
        content: 'Hello',
      }, 'role-developer');

      expect(entry.signer).toBe('role-developer');
    });

    it('should record batch entries', async () => {
      const entries = await chain.recordBatch([
        { action: 'task_created', data: { taskId: 'task-1' } },
        { action: 'task_transitioned', data: { taskId: 'task-1', from: 'pending', to: 'running' } },
        { action: 'task_completed', data: { taskId: 'task-1' } },
      ]);

      expect(entries).toHaveLength(3);
      expect(entries[0].previousHash).toBe('genesis');
      expect(entries[1].previousHash).toBe(entries[0].currentHash);
      expect(entries[2].previousHash).toBe(entries[1].currentHash);
    });
  });

  describe('Validate chain', () => {
    it('should validate a valid chain', async () => {
      await chain.record('task_created', { taskId: 'task-1' });
      await chain.record('task_transitioned', { taskId: 'task-1' });
      await chain.record('task_completed', { taskId: 'task-1' });

      const result = await chain.validateChain();

      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(3);
      expect(result.invalidEntries).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid hash', async () => {
      await chain.record('task_created', { taskId: 'task-1' });
      
      // 手动篡改数据
      const entries = await chain.getAllEntries();
      entries[0].data.taskId = 'tampered';
      await mockContextSharer.set('audit-chain:default', entries);

      const result = await chain.validateChain();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('currentHash mismatch');
    });

    it('should validate single entry', async () => {
      const entry1 = await chain.record('task_created', { taskId: 'task-1' });
      const entry2 = await chain.record('task_transitioned', { taskId: 'task-1' });

      const valid = chain.validateEntry(entry2, entry1);
      expect(valid).toBe(true);
    });

    it('should detect invalid previousHash', async () => {
      const entry = await chain.record('task_created', { taskId: 'task-1' });
      
      // 创建一个错误链接的条目
      const invalidEntry = {
        ...entry,
        previousHash: 'wrong-hash',
      };

      const valid = chain.validateEntry(invalidEntry, entry);
      expect(valid).toBe(false);
    });
  });

  describe('Query audit', () => {
    it('should get all entries', async () => {
      await chain.record('task_created', { taskId: 'task-1' });
      await chain.record('task_transitioned', { taskId: 'task-1' });
      await chain.record('message_sent', { meetingId: 'meeting-1' });

      const entries = await chain.getAllEntries();
      expect(entries).toHaveLength(3);
    });

    it('should get recent entries', async () => {
      for (let i = 0; i < 150; i++) {
        await chain.record('task_created', { taskId: `task-${i}` });
      }

      const entries = await chain.getRecentEntries(100);
      expect(entries.length).toBeLessThanOrEqual(100);
    });

    it('should filter by action', async () => {
      await chain.record('task_created', { taskId: 'task-1' });
      await chain.record('task_created', { taskId: 'task-2' });
      await chain.record('task_completed', { taskId: 'task-1' });

      const created = await chain.getEntriesByAction('task_created');
      expect(created).toHaveLength(2);

      const completed = await chain.getEntriesByAction('task_completed');
      expect(completed).toHaveLength(1);
    });

    it('should filter by time range', async () => {
      await chain.record('task_created', { taskId: 'task-1' });
      
      const start = new Date().toISOString();
      await new Promise(r => setTimeout(r, 10));
      await chain.record('task_created', { taskId: 'task-2' });
      const end = new Date().toISOString();

      const entries = await chain.getEntriesByTimeRange(start, end);
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by signer', async () => {
      await chain.record('task_created', { taskId: 'task-1' }, 'role-dev');
      await chain.record('task_created', { taskId: 'task-2' }, 'role-dev');
      await chain.record('task_created', { taskId: 'task-3' }, 'role-tester');

      const devEntries = await chain.getEntriesBySigner('role-dev');
      expect(devEntries).toHaveLength(2);

      const testerEntries = await chain.getEntriesBySigner('role-tester');
      expect(testerEntries).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    it('should return stats', async () => {
      await chain.record('task_created', { taskId: 'task-1' }, 'role-dev');
      await chain.record('task_created', { taskId: 'task-2' }, 'role-dev');
      await chain.record('task_completed', { taskId: 'task-1' }, 'role-tester');

      const stats = await chain.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.actionsByType['task_created']).toBe(2);
      expect(stats.actionsByType['task_completed']).toBe(1);
      expect(stats.signers).toContain('role-dev');
      expect(stats.signers).toContain('role-tester');
    });
  });

  describe('Export/Import', () => {
    it('should export chain', async () => {
      await chain.record('task_created', { taskId: 'task-1' });
      await chain.record('task_completed', { taskId: 'task-1' });

      const exported = await chain.export();
      const parsed = JSON.parse(exported);

      expect(parsed).toHaveLength(2);
    });

    it('should import chain', async () => {
      const data = JSON.stringify([
        {
          id: 'audit-1',
          previousHash: 'genesis',
          currentHash: 'sha256:abc',
          timestamp: new Date().toISOString(),
          action: 'task_created',
          data: { taskId: 'task-1' },
          signature: 'sig:xyz',
        },
      ]);

      await chain.import(data);

      const entries = await chain.getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('audit-1');
    });
  });
});
