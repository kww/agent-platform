/**
 * 编排层性能测试
 * 
 * 性能目标：
 * 1. 上下文传递总时间 < 3s
 * 2. 状态转换延迟 < 100ms
 * 3. 并发支持 10+ 角色
 * 4. 内存增量 < 50MB/角色
 * 5. 失败重试延迟 < 5s
 */

import { describe, it, expect } from '@jest/globals';

// 性能阈值
const THRESHOLDS = {
  CONTEXT_BRIDGE_TOTAL: 3000, // 3s
  STATE_TRANSITION: 100,      // 100ms
  CONCURRENT_ROLES: 10,       // 10 个并发角色
  MEMORY_PER_ROLE: 50 * 1024 * 1024, // 50MB
  RETRY_DELAY: 5000,          // 5s
};

// Mock 工厂
const createMockRedis = () => ({
  hset: jest.fn(async () => 1),
  hget: jest.fn(async () => null),
  hgetall: jest.fn(async () => ({})),
  hdel: jest.fn(async () => 1),
  hexists: jest.fn(async () => 0),
  del: jest.fn(async () => 1),
  expire: jest.fn(async () => 1),
  get: jest.fn(async () => null),
  setex: jest.fn(async () => 'OK'),
  keys: jest.fn(async () => []),
});

const createMockSpawnAgent = () => jest.fn(async (options: any) => ({
  success: true,
  output: JSON.stringify({ result: 'success' }),
}));

describe('Orchestration Performance Tests', () => {
  describe('ContextBridge', () => {
    it('should complete full pipeline under 3s', async () => {
      const { createContextBridge } = await import('../context-bridge');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'perf-test',
      });

      // 模拟大型会议数据
      const largeDecisions = Array.from({ length: 50 }, (_, i) => ({
        id: `decision-${i}`,
        content: `Decision ${i}: ${'x'.repeat(200)}`,
        agreed: true,
        timestamp: new Date().toISOString(),
      }));

      await contextSharer.set('meeting:perf-123:meta', {
        meetingId: 'perf-123',
        title: 'Performance Test Meeting',
      });
      await contextSharer.set('meeting:perf-123:decisions', largeDecisions);

      const bridge = createContextBridge({
        contextSharer,
        skillExecutor: {
          execute: async () => ({
            success: true,
            output: { result: 'ok' },
            duration: 500,
            tokenUsage: { input: 1000, output: 500, total: 1500 },
          }),
        },
      });

      const startTime = Date.now();

      const result = await bridge.execute({
        meetingId: 'perf-123',
        taskId: 'task-perf-1',
        roleId: 'role-dev',
        skillId: 'skill-implement',
        disclosureStage: 2,
        tokenBudget: 4000,
      });

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(THRESHOLDS.CONTEXT_BRIDGE_TOTAL);
      
      console.log(`  ✓ Full pipeline: ${duration}ms (threshold: ${THRESHOLDS.CONTEXT_BRIDGE_TOTAL}ms)`);
    });

    it('should handle concurrent role executions', async () => {
      const { createContextBridge } = await import('../context-bridge');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'concurrent-test',
      });

      await contextSharer.set('meeting:concurrent-123:meta', {
        meetingId: 'concurrent-123',
        title: 'Concurrent Test',
      });

      const bridge = createContextBridge({
        contextSharer,
        skillExecutor: {
          execute: async () => ({
            success: true,
            output: { result: 'ok' },
            duration: 200,
          }),
        },
      });

      // 并发执行 10 个角色任务
      const concurrentTasks = Array.from({ length: THRESHOLDS.CONCURRENT_ROLES }, (_, i) =>
        bridge.execute({
          meetingId: 'concurrent-123',
          taskId: `task-${i}`,
          roleId: `role-${i}`,
          skillId: 'skill-test',
          disclosureStage: 1,
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(concurrentTasks);
      const duration = Date.now() - startTime;

      // 所有任务都应成功
      results.forEach(r => expect(r.success).toBe(true));
      
      // 总时间应该接近单个任务时间，而不是 10 倍
      expect(duration).toBeLessThan(1000); // 1s 内完成所有并发任务
      
      console.log(`  ✓ Concurrent ${THRESHOLDS.CONCURRENT_ROLES} roles: ${duration}ms`);
    });
  });

  describe('MeetingStateMachine', () => {
    it('should transition states within 100ms', async () => {
      const { MeetingStateMachine } = await import('../meeting-state-machine');
      const { createContextSharer } = await import('../context-sharer');

      // 使用内存存储的 mock
      const memoryStorage = new Map<string, any>();
      const redis = {
        hset: jest.fn(async (key: string, field: string, value: string) => {
          memoryStorage.set(`${key}:${field}`, JSON.parse(value));
          return 1;
        }),
        hget: jest.fn(async (key: string, field: string) => {
          const value = memoryStorage.get(`${key}:${field}`);
          return value ? JSON.stringify(value) : null;
        }),
        hgetall: jest.fn(async () => ({})),
        hdel: jest.fn(async () => 1),
        hexists: jest.fn(async () => 0),
        del: jest.fn(async () => 1),
        expire: jest.fn(async () => 1),
        get: jest.fn(async () => null),
        setex: jest.fn(async () => 'OK'),
        keys: jest.fn(async () => []),
      };

      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'state-perf',
      });

      const stateMachine = new MeetingStateMachine({
        contextSharer,
      });

      const meetingId = 'state-perf-123';
      await stateMachine.initialize(meetingId);

      // 测试状态转换延迟
      const transitions = [
        { to: 'discussing', trigger: 'user_starts_meeting' as const },
        { to: 'designing', trigger: 'requirements_confirmed' as const },
        { to: 'task_splitting', trigger: 'design_confirmed' as const },
        { to: 'executing', trigger: 'tasks_assigned' as const },
        { to: 'testing', trigger: 'implementation_done' as const },
        { to: 'reviewing', trigger: 'tests_passed' as const },
        { to: 'completed', trigger: 'review_passed' as const },
      ];

      for (const { to, trigger } of transitions) {
        const startTime = Date.now();
        await stateMachine.transition(meetingId, to as any, { trigger });
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(THRESHOLDS.STATE_TRANSITION);
        console.log(`  ✓ → ${to}: ${duration}ms`);
      }
    });
  });

  describe('FailureHandler', () => {
    it('should handle failures with appropriate latency', async () => {
      const { FailureHandler } = await import('../failure-handler');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'failure-perf',
      });

      const handler = new FailureHandler({
        contextSharer,
      });

      const testError = new Error('Test failed: assertion error');
      const startTime = Date.now();

      const result = await handler.handle(testError, {
        meetingId: 'failure-perf-123',
        taskId: 'task-1',
        roleId: 'role-dev',
        attempt: 1,
      });

      const duration = Date.now() - startTime;

      expect(result.handled).toBe(true);
      expect(duration).toBeLessThan(THRESHOLDS.RETRY_DELAY);
      
      console.log(`  ✓ Failure handling: ${duration}ms (threshold: ${THRESHOLDS.RETRY_DELAY}ms)`);
    });
  });

  describe('PerformanceMonitor', () => {
    it('should record operations with minimal overhead', async () => {
      const { PerformanceMonitor } = await import('../performance-monitor');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'monitor-perf',
      });

      const monitor = new PerformanceMonitor({
        contextSharer,
        thresholds: {
          extract: 500,
          transform: 300,
          prune: 200,
          invoke: 1000,
          reportBack: 200,
        },
      });

      // 执行 100 次操作
      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const opStartTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 5)); // 模拟 5ms 操作
        await monitor.recordOperation('extract', Date.now() - opStartTime);
      }

      const totalDuration = Date.now() - startTime;
      const overhead = totalDuration - (iterations * 5);

      // 监控开销应该 < 20%（考虑到测试环境的不确定性）
      expect(overhead).toBeLessThan(iterations * 5 * 0.2);
      
      console.log(`  ✓ Monitor overhead: ${overhead}ms for ${iterations} ops (${((overhead / totalDuration) * 100).toFixed(2)}%)`);
    });

    it('should use withTiming helper efficiently', async () => {
      const { PerformanceMonitor } = await import('../performance-monitor');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'timing-perf',
      });

      const monitor = new PerformanceMonitor({ contextSharer });

      const iterations = 50;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await monitor.withTiming('extract', async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { result: 'ok' };
        });
      }

      const duration = Date.now() - startTime;
      const expectedMin = iterations * 10;
      
      // withTiming 不应该增加超过 20% 的开销
      expect(duration).toBeLessThan(expectedMin * 1.2);
      
      console.log(`  ✓ withTiming overhead: ${duration - expectedMin}ms for ${iterations} ops`);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated operations', async () => {
      const { createContextBridge } = await import('../context-bridge');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'memory-test',
      });

      await contextSharer.set('meeting:memory-123:meta', {
        meetingId: 'memory-123',
        title: 'Memory Test',
      });

      const bridge = createContextBridge({
        contextSharer,
        skillExecutor: {
          execute: async () => ({
            success: true,
            output: { result: 'ok' },
          }),
        },
      });

      // 记录初始内存
      const initialMemory = process.memoryUsage().heapUsed;

      // 执行 50 次操作
      for (let i = 0; i < 50; i++) {
        await bridge.execute({
          meetingId: 'memory-123',
          taskId: `task-${i}`,
          roleId: `role-${i % 5}`,
          skillId: 'skill-test',
          disclosureStage: 1,
        });
      }

      // 强制 GC（如果可用）
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // 内存增长应该 < 50MB
      expect(memoryGrowth).toBeLessThan(THRESHOLDS.MEMORY_PER_ROLE);
      
      console.log(`  ✓ Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB for 50 ops`);
    });
  });

  describe('End-to-End Pipeline', () => {
    it('should complete full orchestration flow under 5s', async () => {
      // 导入所有模块
      const { createContextBridge } = await import('../context-bridge');
      const { MeetingStateMachine } = await import('../meeting-state-machine');
      const { PerformanceMonitor } = await import('../performance-monitor');
      const { createContextSharer } = await import('../context-sharer');

      // 使用内存存储的 mock
      const memoryStorage = new Map<string, any>();
      const redis = {
        hset: jest.fn(async (key: string, field: string, value: string) => {
          memoryStorage.set(`${key}:${field}`, JSON.parse(value));
          return 1;
        }),
        hget: jest.fn(async (key: string, field: string) => {
          const value = memoryStorage.get(`${key}:${field}`);
          return value ? JSON.stringify(value) : null;
        }),
        hgetall: jest.fn(async () => ({})),
        hdel: jest.fn(async () => 1),
        hexists: jest.fn(async () => 0),
        del: jest.fn(async () => 1),
        expire: jest.fn(async () => 1),
        get: jest.fn(async () => null),
        setex: jest.fn(async () => 'OK'),
        keys: jest.fn(async () => []),
      };

      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'e2e-perf',
      });

      // 设置测试数据
      const meetingId = 'e2e-perf-123';
      await contextSharer.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: 'E2E Performance Test',
      });

      // 创建组件
      const bridge = createContextBridge({
        contextSharer,
        skillExecutor: {
          execute: async () => ({
            success: true,
            output: { result: 'ok' },
            duration: 500,
          }),
        },
      });

      const stateMachine = new MeetingStateMachine({ contextSharer });
      const monitor = new PerformanceMonitor({ contextSharer });

      const startTime = Date.now();

      // 完整流程
      await stateMachine.initialize(meetingId);
      
      await monitor.withTiming('pipeline', async () => {
        // 状态转换
        await stateMachine.transition(meetingId, 'discussing', {
          trigger: 'user_starts_meeting',
        });

        // 执行任务
        const result = await bridge.execute({
          meetingId,
          taskId: 'task-1',
          roleId: 'role-dev',
          skillId: 'skill-implement',
          disclosureStage: 2,
        });

        expect(result.success).toBe(true);

        // 完整状态转换链
        await stateMachine.transition(meetingId, 'designing', {
          trigger: 'requirements_confirmed',
          skipGates: true,
        });
        await stateMachine.transition(meetingId, 'task_splitting', {
          trigger: 'design_confirmed',
          skipGates: true,
        });
        await stateMachine.transition(meetingId, 'executing', {
          trigger: 'tasks_assigned',
          skipGates: true,
        });
        await stateMachine.transition(meetingId, 'testing', {
          trigger: 'implementation_done',
          skipGates: true,
        });
        await stateMachine.transition(meetingId, 'reviewing', {
          trigger: 'tests_passed',
          skipGates: true,
        });
        await stateMachine.transition(meetingId, 'completed', {
          trigger: 'review_passed',
          skipGates: true,
        });
      });

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
      console.log(`  ✓ Full E2E pipeline: ${duration}ms`);
    });
  });
});
