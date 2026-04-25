/**
 * 门禁检查器测试
 */

import { GateChecker, createGateChecker } from '../gate-checker';
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

describe('GateChecker', () => {
  let checker: GateChecker;
  let mockRedis: MockRedis;
  let mockContextSharer: ContextSharer;

  beforeEach(() => {
    mockRedis = new MockRedis();
    mockContextSharer = new ContextSharer({
      redis: mockRedis,
      executionId: 'test-execution',
    });
    
    checker = createGateChecker({
      contextSharer: mockContextSharer,
    });
  });

  describe('Single gate check', () => {
    // 测试门禁需要实际项目，跳过
    it.skip('should check test gate', async () => {
      const result = await checker.checkGate('test', {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
        testCommand: 'npm test',
      });

      expect(result).toBeDefined();
      expect(result.gate).toBe('test');
    });

    it('should check spec gate', async () => {
      const result = await checker.checkGate('spec', {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
      });

      expect(result).toBeDefined();
      expect(result.gate).toBe('spec');
    });

    it('should check checkpoint gate', async () => {
      const result = await checker.checkGate('checkpoint', {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
      });

      expect(result).toBeDefined();
      expect(result.gate).toBe('checkpoint');
    });

    it('should check review gate', async () => {
      const result = await checker.checkGate('review', {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
        minReviewers: 2,
      });

      expect(result).toBeDefined();
      expect(result.gate).toBe('review');
    });

    it('should check contract gate', async () => {
      const result = await checker.checkGate('contract', {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
      });

      expect(result).toBeDefined();
      expect(result.gate).toBe('contract');
    });

    // 安全门禁需要 npm audit，可能较慢
    it.skip('should check security gate', async () => {
      const result = await checker.checkGate('security', {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
        securityScanCommand: 'npm audit --json',
      });

      expect(result).toBeDefined();
      expect(result.gate).toBe('security');
    });

    it('should check performance gate', async () => {
      const result = await checker.checkGate('performance', {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
        performanceThresholds: {
          maxResponseTime: 500,
          minCoverage: 80,  // 恢复测试，现在有超时机制
          maxBundleSize: 1024,
        },
      });

      expect(result).toBeDefined();
      expect(result.gate).toBe('performance');
      // 注意：coverageError 会被设置因为 /tmp/project 没有测试
      expect(result.details?.thresholds).toBeDefined();
      expect(result.details?.warnings).toBeDefined();
    });
  });

  describe('Batch gate check', () => {
    it('should check multiple gates', async () => {
      const report = await checker.checkAllGates(['spec', 'checkpoint', 'review'], {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
      });

      expect(report).toBeDefined();
      expect(report.overallPassed).toBeDefined();
      expect(report.summary.total).toBe(3);
      expect(report.results.spec).toBeDefined();
      expect(report.results.checkpoint).toBeDefined();
      expect(report.results.review).toBeDefined();
    });

    it('should include duration for each gate', async () => {
      const report = await checker.checkAllGates(['spec', 'security'], {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
      });

      for (const result of Object.values(report.results)) {
        expect(result.duration).toBeDefined();
        expect(result.duration).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Config management', () => {
    it('should get effective config with defaults', async () => {
      const config = await checker.getEffectiveConfig('project-1', 'meeting-1');

      expect(config).toBeDefined();
      expect(config.test).toBeDefined();
      expect(config.test.enabled).toBe(true);
      expect(config.review).toBeDefined();
      expect(config.security).toBeDefined();
    });

    it('should merge meeting overrides', async () => {
      await mockContextSharer.set('meeting:meeting-1:gate-config', {
        meetingId: 'meeting-1',
        constraintLevel: 'L3',
        overrides: {
          review: { required: true },
          test: { enabled: false },
        },
      });

      const config = await checker.getEffectiveConfig('project-1', 'meeting-1');

      expect(config.review.required).toBe(true);
    });

    it('should merge task custom config', async () => {
      await mockContextSharer.set('task:task-1:gate-config', {
        taskId: 'task-1',
        gates: ['test', 'spec'],
        customConfig: {
          test: { timeout: 60 },
        },
      });

      const config = await checker.getEffectiveConfig('project-1', 'meeting-1', 'task-1');

      expect(config.test?.timeout).toBe(60);
    });
  });

  describe('Gate result persistence', () => {
    it('should save gate check results', async () => {
      const report = await checker.checkAllGates(['spec', 'review'], {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
      });

      await checker.saveGateResult('meeting-1', report);

      const results = await mockContextSharer.getValue<any[]>(`meeting:meeting-1:gate-results`);
      expect(results).toBeDefined();
      expect(results?.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should handle unknown gate type', async () => {
      const result = await checker.checkGate('unknown' as any, {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
      });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Unknown gate type');
    });

    it('should include timestamp in all results', async () => {
      const result = await checker.checkGate('spec', {
        meetingId: 'meeting-1',
        projectId: 'project-1',
        projectPath: '/tmp/project',
      });

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
